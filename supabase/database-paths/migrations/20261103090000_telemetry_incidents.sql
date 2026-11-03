-- Generated from reviewed components and hash-pinned historical definitions.
-- Apply only through scripts/database-path.mjs inside its single transaction.
DO $extension_guard$ BEGIN
    IF to_regclass('vizly_telemetry.incidents') IS NOT NULL THEN
      RAISE EXCEPTION 'Telemetry incidents table exists without a matching path receipt; reconcile inventory';
    END IF;
  END $extension_guard$;
-- Track incident state in the same transaction as diagnostic ingestion.
create table vizly_telemetry.incidents (
  source text not null check (source in ('server', 'browser', 'preview-server', 'preview-browser')),
  operation text not null check (operation in ('startup','save','connect','reconnect','permission','cas','lease','export','route')),
  code text not null check (code in ('unknown','initialization','readiness','mount','timeout','network','denied','conflict','unavailable','invalid','cancelled')),
  last_failure_at timestamptz not null,
  notified_at timestamptz,
  notified boolean not null default false,
  last_notification_id uuid,
  resolved_at timestamptz,
  primary key (source, operation, code)
);
alter table vizly_telemetry.incidents enable row level security;
revoke all on vizly_telemetry.incidents from public, anon, authenticated;
grant select, insert, update on vizly_telemetry.incidents to service_role;

create function public.vizly_record_incident_telemetry(p_batch jsonb, p_source text)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='250ms' as $$
declare
  receipt jsonb;
  projected jsonb;
  observed_at timestamptz;
  failure jsonb;
  incident vizly_telemetry.incidents%rowtype;
  notifications jsonb := '[]'::jsonb;
begin
  if p_source is null or p_source not in ('server', 'browser', 'preview-server', 'preview-browser') then
    raise exception 'Invalid telemetry source' using errcode='22023';
  end if;
  projected := vizly_telemetry.project_batch(p_batch);
  receipt := public.vizly_record_telemetry(projected);
  if not (receipt->>'stored')::boolean or exists (
    select 1 from vizly_telemetry.journal
    where release_id = projected->>'releaseId' and stream_id = (projected->>'streamId')::uuid
      and sequence > (projected->>'sequence')::bigint
  ) then
    return receipt || jsonb_build_object('notifications', notifications);
  end if;
  -- The journal advisory lock remains held for this transaction. Replays
  -- cannot advance recovery or claim a notification a second time.
  observed_at := clock_timestamp();
  for failure in select distinct on (e->>'operation', e->>'code') e
    from jsonb_array_elements(projected->'events') with ordinality as event(e, position)
    where e->>'outcome' = 'failure'
    order by e->>'operation', e->>'code', position
  loop
    insert into vizly_telemetry.incidents
      (source, operation, code, last_failure_at)
    values (p_source, failure->>'operation', failure->>'code', observed_at)
    on conflict (source, operation, code) do update set
      last_failure_at = excluded.last_failure_at, resolved_at = null
    returning * into incident;
    if not incident.notified and incident.last_notification_id is distinct from (failure->>'requestId')::uuid then
      -- Global rate limit applies to newly opened incidents across instances.
      if (select count(*) from vizly_telemetry.incidents
          where notified_at > observed_at - interval '1 minute'
            and (source like 'preview-%') = (p_source like 'preview-%')) < 6 then
        update vizly_telemetry.incidents set notified_at = observed_at, notified = true, last_notification_id = (failure->>'requestId')::uuid
        where source = p_source and operation = incident.operation and code = incident.code;
        notifications := notifications || jsonb_build_array(failure);
      end if;
    end if;
  end loop;
  -- A success only resolves the same operation and producer class, after a
  -- full quiet window. A failure in the same batch always wins.
  update vizly_telemetry.incidents as active
  set resolved_at = observed_at, notified = false
  where active.source = p_source and active.resolved_at is null
    and active.last_failure_at <= observed_at - interval '1 minute'
    and exists (select 1 from jsonb_array_elements(projected->'events') e
      where e->>'operation' = active.operation and e->>'outcome' = 'success')
    and not exists (select 1 from jsonb_array_elements(projected->'events') e
      where e->>'operation' = active.operation and e->>'outcome' = 'failure');
  return receipt || jsonb_build_object('notifications', notifications);
end;
$$;
revoke all on function public.vizly_record_incident_telemetry(jsonb,text) from public, anon, authenticated;
grant execute on function public.vizly_record_incident_telemetry(jsonb,text) to service_role;
