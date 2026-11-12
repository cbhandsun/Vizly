-- Backend-only diagnostic snapshots. No user content or credentials are retained.
begin;
create schema vizly_telemetry;
revoke all on schema vizly_telemetry from public, anon, authenticated;
grant usage on schema vizly_telemetry to service_role;

create function vizly_telemetry.valid_counter(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if jsonb_typeof(value) is distinct from 'number' then return false; end if;
  return value::numeric between 0 and 9007199254740991 and trunc(value::numeric) = value::numeric;
end;
$$;

create function vizly_telemetry.project_batch(p_batch jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare
  operations constant text[] := array['startup','save','connect','reconnect','permission','cas','lease','export','route'];
  codes constant text[] := array['unknown','initialization','readiness','mount','timeout','network','denied','conflict','unavailable','invalid','cancelled'];
  uuid_pattern constant text := '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$';
  operation text;
  counter text;
  metric jsonb;
  event jsonb;
  metrics jsonb := '{}'::jsonb;
  events jsonb := '[]'::jsonb;
  release_id text;
begin
  if jsonb_typeof(p_batch) is distinct from 'object'
    or p_batch->>'schema' is distinct from 'vizly-telemetry-v1'
    or (p_batch->>'releaseId' ~ '^[a-f0-9]{40}([a-f0-9]{24})?$') is not true
    or (p_batch->>'streamId' ~ uuid_pattern) is not true
    or not vizly_telemetry.valid_counter(p_batch->'sequence')
    or (p_batch->>'sequence')::numeric < 1
    or not vizly_telemetry.valid_counter(p_batch->'dropped')
    or jsonb_typeof(p_batch->'metrics') is distinct from 'object'
    or jsonb_typeof(p_batch->'events') is distinct from 'array'
    or octet_length(p_batch::text) > 32768 then
    raise exception 'Invalid telemetry' using errcode = '22023';
  end if;
  if jsonb_array_length(p_batch->'events') > 64 then
    raise exception 'Invalid telemetry' using errcode = '22023';
  end if;
  release_id := p_batch->>'releaseId';
  foreach operation in array operations loop
    metric := p_batch->'metrics'->operation;
    if jsonb_typeof(metric) is distinct from 'object' then
      raise exception 'Invalid telemetry' using errcode = '22023';
    end if;
    foreach counter in array array['started','success','failure','cancelled'] loop
      if not vizly_telemetry.valid_counter(metric->counter) then
        raise exception 'Invalid telemetry' using errcode = '22023';
      end if;
    end loop;
    if (metric->>'success')::numeric + (metric->>'failure')::numeric + (metric->>'cancelled')::numeric
      > (metric->>'started')::numeric then
      raise exception 'Invalid telemetry' using errcode = '22023';
    end if;
    metrics := metrics || jsonb_build_object(operation, jsonb_build_object(
      'started',metric->'started','success',metric->'success','failure',metric->'failure','cancelled',metric->'cancelled'));
  end loop;
  for event in select value from jsonb_array_elements(p_batch->'events') loop
    if jsonb_typeof(event) is distinct from 'object'
      or event->>'schema' is distinct from 'vizly-operation-v1'
      or event->>'releaseId' is distinct from release_id
      or (event->>'requestId' ~ uuid_pattern) is not true
      or (event->>'operation' = any(operations)) is not true
      or (event->>'outcome' = any(array['success','failure','cancelled'])) is not true then
      raise exception 'Invalid telemetry' using errcode = '22023';
    end if;
    if (event->>'outcome' = 'success' and event->'code' is distinct from 'null'::jsonb)
      or (event->>'outcome' <> 'success' and (event->>'code' = any(codes)) is not true)
      or (event->'durationMs' is distinct from 'null'::jsonb
        and (not vizly_telemetry.valid_counter(event->'durationMs') or (event->>'durationMs')::numeric > 86400000)) then
      raise exception 'Invalid telemetry' using errcode = '22023';
    end if;
    events := events || jsonb_build_array(jsonb_build_object('schema','vizly-operation-v1',
      'releaseId',release_id,'requestId',event->'requestId','operation',event->'operation',
      'outcome',event->'outcome','code',event->'code','durationMs',event->'durationMs'));
  end loop;
  return jsonb_build_object('schema','vizly-telemetry-v1','releaseId',release_id,'streamId',p_batch->'streamId',
    'sequence',p_batch->'sequence','dropped',p_batch->'dropped','metrics',metrics,'events',events);
exception when data_exception then
  raise exception 'Invalid telemetry' using errcode = '22023';
end;
$$;

create table vizly_telemetry.journal (
  release_id text not null check (release_id ~ '^[a-f0-9]{40}([a-f0-9]{24})?$'),
  stream_id uuid not null,
  sequence bigint not null check (sequence between 1 and 9007199254740991),
  received_at timestamptz not null default clock_timestamp(),
  batch jsonb not null,
  payload_bytes integer generated always as (octet_length(batch::text)) stored,
  primary key (release_id, stream_id, sequence),
  check (payload_bytes between 1 and 32768),
  check (batch = vizly_telemetry.project_batch(batch)),
  check (batch->>'releaseId' = release_id and batch->>'streamId' = stream_id::text
    and (batch->>'sequence')::numeric = sequence)
);
create index telemetry_journal_release_received on vizly_telemetry.journal(release_id, received_at desc);
create index telemetry_journal_received on vizly_telemetry.journal(received_at desc);
alter table vizly_telemetry.journal enable row level security;
revoke all on vizly_telemetry.journal from public, anon, authenticated;
grant select, insert, delete on vizly_telemetry.journal to service_role;

create function public.vizly_record_telemetry(p_batch jsonb)
returns jsonb language plpgsql security invoker set search_path = '' set lock_timeout = '250ms' as $$
declare
  projected jsonb;
  previous jsonb;
  observed_at timestamptz;
  stored_at timestamptz;
begin
  projected := vizly_telemetry.project_batch(p_batch);
  -- Serialize the bounded budget across instances; contention waits at most 250ms.
  perform pg_advisory_xact_lock(hashtextextended('vizly-telemetry-journal-v1', 0));
  observed_at := clock_timestamp();
  delete from vizly_telemetry.journal where received_at < observed_at - interval '7 days';
  select batch into previous from vizly_telemetry.journal
    where release_id = projected->>'releaseId' and stream_id = (projected->>'streamId')::uuid
      and sequence = (projected->>'sequence')::bigint;
  if found then
    if previous <> projected then raise exception 'Conflicting telemetry snapshot' using errcode = '22023'; end if;
    return jsonb_build_object('accepted',true,'stored',false);
  end if;
  -- The newly acknowledged snapshot stays newest even if the wall clock moves backwards.
  select greatest(observed_at, coalesce(max(received_at) + interval '1 microsecond', observed_at))
    into stored_at from vizly_telemetry.journal;
  insert into vizly_telemetry.journal(release_id,stream_id,sequence,received_at,batch)
    values(projected->>'releaseId',(projected->>'streamId')::uuid,(projected->>'sequence')::bigint,stored_at,projected);
  delete from vizly_telemetry.journal as target using (
    select release_id,stream_id,sequence,
      sum(payload_bytes) over (order by received_at desc,release_id,stream_id,sequence) as retained_bytes,
      row_number() over (order by received_at desc,release_id,stream_id,sequence) as retained_count
    from vizly_telemetry.journal
  ) as budget
  where target.release_id = budget.release_id and target.stream_id = budget.stream_id and target.sequence = budget.sequence
    and (budget.retained_bytes > 4194304 or budget.retained_count > 1000);
  return jsonb_build_object('accepted',true,'stored',true);
end;
$$;

create function public.vizly_query_telemetry(p_release_id text, p_request_id uuid default null)
returns setof jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_release_id is null or p_release_id !~ '^[a-f0-9]{40}([a-f0-9]{24})?$' then
    raise exception 'Invalid telemetry query' using errcode = '22023';
  end if;
  return query select batch from vizly_telemetry.journal
    where release_id = p_release_id and received_at >= now() - interval '7 days'
      and (p_request_id is null or batch->'events' @> jsonb_build_array(jsonb_build_object('requestId',p_request_id::text)))
    order by received_at desc limit 1000;
end;
$$;

revoke all on function vizly_telemetry.valid_counter(jsonb) from public, anon, authenticated;
revoke all on function vizly_telemetry.project_batch(jsonb) from public, anon, authenticated;
revoke all on function public.vizly_record_telemetry(jsonb) from public, anon, authenticated;
revoke all on function public.vizly_query_telemetry(text,uuid) from public, anon, authenticated;
grant execute on function vizly_telemetry.valid_counter(jsonb), vizly_telemetry.project_batch(jsonb) to service_role;
grant execute on function public.vizly_record_telemetry(jsonb), public.vizly_query_telemetry(text,uuid) to service_role;
commit;
