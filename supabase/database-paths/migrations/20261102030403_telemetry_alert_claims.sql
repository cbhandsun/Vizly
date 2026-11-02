-- Generated from reviewed components and hash-pinned historical definitions.
-- Apply only through scripts/database-path.mjs inside its single transaction.
DO $extension_guard$ BEGIN
    IF to_regclass('vizly_telemetry.alert_claims') IS NOT NULL THEN
      RAISE EXCEPTION 'Telemetry alert claims table exists without a matching path receipt; reconcile inventory';
    END IF;
  END $extension_guard$;
-- Backend-only, cross-instance notification admission. No customer document data.
create table vizly_telemetry.alert_claims (
  operation text not null check (operation in ('startup','save','connect','reconnect','permission','cas','lease','export','route')),
  code text not null check (code in ('unknown','initialization','readiness','mount','timeout','network','denied','conflict','unavailable','invalid','cancelled')),
  release_id text not null check (release_id ~ '^[a-f0-9]{40}([a-f0-9]{24})?$'),
  request_id uuid not null,
  claimed_at timestamptz not null,
  primary key (operation,code)
);
alter table vizly_telemetry.alert_claims enable row level security;
revoke all on vizly_telemetry.alert_claims from public, anon, authenticated;
grant select,insert,update on vizly_telemetry.alert_claims to service_role;

create function public.vizly_claim_telemetry_alert(p_release_id text,p_operation text,p_code text,p_request_id uuid)
returns boolean language plpgsql security invoker set search_path='' set lock_timeout='250ms' as $$
declare
  observed_at timestamptz;
  previous vizly_telemetry.alert_claims%rowtype;
begin
  -- Fixed operation/code keys bound the table to 99 rows across all releases.
  if p_release_id is null or p_release_id !~ '^[a-f0-9]{40}([a-f0-9]{24})?$'
    or p_request_id is null
    or p_operation is null or p_operation not in ('startup','save','connect','reconnect','permission','cas','lease','export','route')
    or p_code is null or p_code not in ('unknown','initialization','readiness','mount','timeout','network','denied','conflict','unavailable','invalid','cancelled') then
    raise exception 'Invalid alert' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('vizly-telemetry-alerts-v1',0));
  observed_at:=clock_timestamp();
  select * into previous from vizly_telemetry.alert_claims where operation=p_operation and code=p_code;
  if found and (previous.request_id=p_request_id or previous.claimed_at>observed_at-interval '10 minutes') then
    return false;
  end if;
  if (select count(*) from vizly_telemetry.alert_claims where claimed_at>observed_at-interval '1 minute')>=6 then
    return false;
  end if;
  insert into vizly_telemetry.alert_claims(operation,code,release_id,request_id,claimed_at)
    values(p_operation,p_code,p_release_id,p_request_id,observed_at)
    on conflict(operation,code) do update set release_id=excluded.release_id,
      request_id=excluded.request_id,claimed_at=excluded.claimed_at;
  return true;
end;
$$;
revoke all on function public.vizly_claim_telemetry_alert(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.vizly_claim_telemetry_alert(text,text,text,uuid) to service_role;
