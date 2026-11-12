-- Generated from reviewed components and hash-pinned historical definitions.
-- Apply only through scripts/database-path.mjs inside its single transaction.
DO $extension_guard$ BEGIN
    IF to_regnamespace('vizly_ai') IS NOT NULL THEN
      RAISE EXCEPTION 'AI resource schema exists without a matching path receipt; reconcile inventory';
    END IF;
  END $extension_guard$;
-- Backend-only shared admission. No prompts, provider keys or bearer tokens.

create schema if not exists vizly_ai;
revoke all on schema vizly_ai from public, anon, authenticated;
grant usage on schema vizly_ai to service_role;

create table vizly_ai.resource_policy (
  singleton boolean primary key default true check (singleton),
  requests_per_minute integer not null check (requests_per_minute between 1 and 1000),
  concurrent_requests integer not null check (concurrent_requests between 1 and 64)
);
-- Provisional defaults: validate representative workload before production.
insert into vizly_ai.resource_policy values (true, 20, 2);
create table vizly_ai.user_window (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  admitted_requests integer not null check (admitted_requests >= 0)
);
create table vizly_ai.request_lease (
  lease_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
create index ai_request_lease_user_expiry on vizly_ai.request_lease(user_id, expires_at);
alter table vizly_ai.resource_policy enable row level security;
alter table vizly_ai.user_window enable row level security;
alter table vizly_ai.request_lease enable row level security;
revoke all on all tables in schema vizly_ai from public, anon, authenticated;
grant select on vizly_ai.resource_policy to service_role;
grant select, insert, update, delete on vizly_ai.user_window, vizly_ai.request_lease to service_role;

create function public.vizly_acquire_ai_lease(p_user_id uuid, p_lease_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' set lock_timeout = '5s' as $$
declare
  policy vizly_ai.resource_policy%rowtype;
  account vizly_ai.user_window%rowtype;
  existing vizly_ai.request_lease%rowtype;
  observed_at timestamptz;
  first_expiry timestamptz;
  active_count integer;
begin
  if p_user_id is null or p_lease_id is null then raise exception 'Invalid admission identity'; end if;
  select * into strict policy from vizly_ai.resource_policy where singleton;
  insert into vizly_ai.user_window values (p_user_id, clock_timestamp(), 0)
    on conflict (user_id) do nothing;
  -- All instances serialize admission for one user; unrelated users do not wait.
  select * into strict account from vizly_ai.user_window where user_id = p_user_id for update;
  observed_at := clock_timestamp();
  delete from vizly_ai.request_lease where user_id = p_user_id and expires_at <= observed_at;
  select * into existing from vizly_ai.request_lease where lease_id = p_lease_id;
  if found then
    if existing.user_id <> p_user_id then raise exception 'Invalid admission identity'; end if;
    return jsonb_build_object('admitted', true, 'lease_id', existing.lease_id, 'expires_at', existing.expires_at);
  end if;
  if observed_at >= account.window_started_at + interval '60 seconds' then
    account.window_started_at := observed_at;
    account.admitted_requests := 0;
  end if;
  if account.admitted_requests >= policy.requests_per_minute then
    return jsonb_build_object('admitted', false, 'reason', 'rate', 'retry_after_seconds',
      greatest(1, ceil(extract(epoch from account.window_started_at + interval '60 seconds' - observed_at))::integer));
  end if;
  select count(*), min(expires_at) into active_count, first_expiry
    from vizly_ai.request_lease where user_id = p_user_id;
  if active_count >= policy.concurrent_requests then
    return jsonb_build_object('admitted', false, 'reason', 'concurrency', 'retry_after_seconds',
      greatest(1, ceil(extract(epoch from first_expiry - observed_at))::integer));
  end if;
  update vizly_ai.user_window set window_started_at = account.window_started_at,
    admitted_requests = account.admitted_requests + 1 where user_id = p_user_id;
  -- Gateway generation has a 120s deadline. The extra 30s bounds cleanup/crash recovery.
  insert into vizly_ai.request_lease values (p_lease_id, p_user_id, observed_at + interval '150 seconds');
  return jsonb_build_object('admitted', true, 'lease_id', p_lease_id, 'expires_at', observed_at + interval '150 seconds');
end;
$$;

create function public.vizly_release_ai_lease(p_user_id uuid, p_lease_id uuid)
returns boolean language plpgsql security invoker set search_path = '' set lock_timeout = '5s' as $$
begin
  if p_user_id is null or p_lease_id is null then raise exception 'Invalid release identity'; end if;
  delete from vizly_ai.request_lease where user_id = p_user_id and lease_id = p_lease_id;
  return found;
end;
$$;
revoke all on function public.vizly_acquire_ai_lease(uuid, uuid) from public, anon, authenticated;
revoke all on function public.vizly_release_ai_lease(uuid, uuid) from public, anon, authenticated;
grant execute on function public.vizly_acquire_ai_lease(uuid, uuid) to service_role;
grant execute on function public.vizly_release_ai_lease(uuid, uuid) to service_role;
