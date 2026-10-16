-- Server collaboration schema migration; separate from diagram permission hardening.
-- Server-only RPCs. The backend still must authorize every room admission/write.
begin;
create schema if not exists vizly_collaboration;
revoke all on schema vizly_collaboration from public, anon, authenticated;
grant usage on schema vizly_collaboration to service_role;
create table if not exists vizly_collaboration.room_state (
  diagram_id uuid primary key references public.diagrams(id) on delete cascade,
  generation uuid not null,
  version bigint not null check (version > 0 and version < 9223372036854775807),
  record bytea not null check (octet_length(record) between 1 and 4194410)
);
alter table vizly_collaboration.room_state enable row level security;
revoke all on vizly_collaboration.room_state from public, anon, authenticated;
grant select, insert, update on vizly_collaboration.room_state to service_role;

create table if not exists vizly_collaboration.room_lease (
  lease_id uuid primary key,
  diagram_id uuid not null references public.diagrams(id) on delete cascade,
  generation uuid not null,
  kind text not null check (kind in ('edit', 'recovery')),
  expires_at timestamptz not null
);
create index if not exists room_lease_diagram_expiry on vizly_collaboration.room_lease(diagram_id, expires_at);
alter table vizly_collaboration.room_lease enable row level security;
revoke all on vizly_collaboration.room_lease from public, anon, authenticated;
grant select, insert, update, delete on vizly_collaboration.room_lease to service_role;

create table if not exists vizly_collaboration.recovery_backup (
  diagram_id uuid not null references public.diagrams(id) on delete cascade,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  generation uuid not null,
  record bytea not null check (octet_length(record) between 1 and 4194410),
  primary key (diagram_id, sha256),
  check (sha256 = encode(pg_catalog.sha256(record), 'hex'))
);
alter table vizly_collaboration.recovery_backup enable row level security;
revoke all on vizly_collaboration.recovery_backup from public, anon, authenticated;
grant select, insert on vizly_collaboration.recovery_backup to service_role;

create or replace function public.vizly_claim_room_lease(p_diagram_id uuid, p_lease_id uuid, p_generation uuid, p_kind text)
returns jsonb language plpgsql security invoker set search_path = '' set lock_timeout = '5s' as $$
declare accepted_generation uuid; existing vizly_collaboration.room_lease%rowtype; expiration timestamptz;
begin
  if p_diagram_id is null or p_lease_id is null or p_generation is null or p_kind is null or p_kind not in ('edit', 'recovery') then
    raise exception using errcode = '22023', message = 'Invalid room lease request';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_diagram_id::text, 0));
  delete from vizly_collaboration.room_lease where diagram_id = p_diagram_id and expires_at <= clock_timestamp();
  select * into existing from vizly_collaboration.room_lease where lease_id = p_lease_id;
  if found then
    if existing.diagram_id <> p_diagram_id or existing.kind <> p_kind then
      raise exception using errcode = '22023', message = 'Room lease identity reused';
    end if;
    return jsonb_build_object('generation', existing.generation, 'expiresAt', existing.expires_at);
  end if;
  if exists(select 1 from vizly_collaboration.room_lease where diagram_id = p_diagram_id and kind = 'recovery')
    or (p_kind = 'recovery' and exists(select 1 from vizly_collaboration.room_lease where diagram_id = p_diagram_id))
    or (select count(*) from vizly_collaboration.room_lease where diagram_id = p_diagram_id) >= 128 then return null; end if;
  select generation into accepted_generation from vizly_collaboration.room_state where diagram_id = p_diagram_id;
  if accepted_generation is null then
    select generation into accepted_generation from vizly_collaboration.room_lease where diagram_id = p_diagram_id order by lease_id limit 1;
  end if;
  if p_kind = 'recovery' and accepted_generation is null then return null; end if;
  accepted_generation := coalesce(accepted_generation, p_generation);
  expiration := clock_timestamp() + interval '30 seconds';
  insert into vizly_collaboration.room_lease(lease_id, diagram_id, generation, kind, expires_at)
    values(p_lease_id, p_diagram_id, accepted_generation, p_kind, expiration);
  return jsonb_build_object('generation', accepted_generation, 'expiresAt', expiration);
end;
$$;
create or replace function public.vizly_inspect_room_recovery(p_diagram_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('sha256', encode(sha256(record), 'hex'), 'bytes', octet_length(record))
    from vizly_collaboration.room_state where diagram_id = p_diagram_id;
$$;

create or replace function public.vizly_recover_atomic_room(
  p_diagram_id uuid, p_lease_id uuid, p_generation uuid, p_new_generation uuid, p_sha256 text, p_record text
) returns jsonb language plpgsql security invoker set search_path = '' set lock_timeout = '5s' as $$
declare previous vizly_collaboration.room_state%rowtype; decoded bytea; backup bytea;
begin
  if p_diagram_id is null or p_lease_id is null or p_generation is null or p_new_generation is null
    or p_generation = p_new_generation or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
    or p_record is null or length(p_record) > 5592548
    or p_record !~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' then
    raise exception using errcode = '22023', message = 'Invalid room recovery request';
  end if;
  decoded := decode(p_record, 'base64');
  if octet_length(decoded) not between 1 and 4194410 or replace(encode(decoded, 'base64'), E'\n', '') <> p_record then
    raise exception using errcode = '22023', message = 'Invalid room recovery record';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_diagram_id::text, 0));
  if not exists(select 1 from vizly_collaboration.room_lease where diagram_id = p_diagram_id and lease_id = p_lease_id
      and generation = p_generation and kind = 'recovery' and expires_at > clock_timestamp())
    or exists(select 1 from vizly_collaboration.room_lease where diagram_id = p_diagram_id and lease_id <> p_lease_id
      and expires_at > clock_timestamp()) then
    raise exception using errcode = '55000', message = 'Room recovery lease inactive';
  end if;
  select * into previous from vizly_collaboration.room_state where diagram_id = p_diagram_id for update;
  if not found or previous.generation <> p_generation or encode(sha256(previous.record), 'hex') <> p_sha256
    or previous.version >= 9223372036854775806 then
    raise exception using errcode = '55000', message = 'Room recovery record changed';
  end if;
  select record into backup from vizly_collaboration.recovery_backup where diagram_id = p_diagram_id and sha256 = p_sha256;
  if found then
    if backup <> previous.record then raise exception using errcode = '55000', message = 'Room backup changed'; end if;
  else
    if (select count(*) from vizly_collaboration.recovery_backup where diagram_id = p_diagram_id) >= 32 then
      raise exception using errcode = '54000', message = 'Room backup capacity reached';
    end if;
    insert into vizly_collaboration.recovery_backup(diagram_id, sha256, generation, record)
      values(p_diagram_id, p_sha256, previous.generation, previous.record);
  end if;
  update vizly_collaboration.room_state set generation = p_new_generation, version = version + 1, record = decoded
    where diagram_id = p_diagram_id;
  if not exists(select 1 from vizly_collaboration.room_lease where diagram_id = p_diagram_id and lease_id = p_lease_id
    and generation = p_generation and kind = 'recovery' and expires_at > clock_timestamp()) then
    raise exception using errcode = '55000', message = 'Room recovery lease expired';
  end if;
  delete from vizly_collaboration.room_lease where diagram_id = p_diagram_id;
  return jsonb_build_object('backupId', p_diagram_id::text || '.' || p_sha256 || '.yjs', 'previousSha256', p_sha256,
    'generation', p_new_generation);
end;
$$;

create or replace function public.vizly_renew_room_lease(p_diagram_id uuid, p_lease_id uuid, p_generation uuid)
returns boolean language plpgsql security invoker set search_path = '' set lock_timeout = '5s' as $$
declare affected integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_diagram_id::text, 0));
  update vizly_collaboration.room_lease set expires_at = clock_timestamp() + interval '30 seconds'
    where diagram_id = p_diagram_id and lease_id = p_lease_id and generation = p_generation and expires_at > clock_timestamp()
      and not exists(select 1 from vizly_collaboration.room_state where diagram_id = p_diagram_id and generation <> p_generation);
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.vizly_release_room_lease(p_diagram_id uuid, p_lease_id uuid, p_generation uuid)
returns boolean language plpgsql security invoker set search_path = '' set lock_timeout = '5s' as $$
declare affected integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_diagram_id::text, 0));
  delete from vizly_collaboration.room_lease where diagram_id = p_diagram_id and lease_id = p_lease_id and generation = p_generation;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.vizly_read_atomic_room(p_diagram_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('generation', r.generation, 'version', r.version::text,
    'record', replace(encode(r.record, 'base64'), E'\n', ''))
  from vizly_collaboration.room_state r where r.diagram_id = p_diagram_id;
$$;

-- Remove the old unleased signature; leaving it callable would bypass fencing.
drop function if exists public.vizly_exchange_atomic_room(uuid, uuid, text, text);
create or replace function public.vizly_exchange_atomic_room(
  p_diagram_id uuid, p_generation uuid, p_version text, p_record text, p_lease_id uuid
) returns boolean language plpgsql security invoker set search_path = '' set lock_timeout = '5s' as $$
declare
  decoded bytea;
  affected integer;
begin
  if p_diagram_id is null or p_generation is null or p_record is null
     or length(p_record) > 5592548
     or p_record !~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
     or (p_version is not null and p_version !~ '^[1-9][0-9]{0,18}$') then
    raise exception using errcode = '22023', message = 'Invalid atomic room request';
  end if;
  if p_version is not null and p_version::numeric >= 9223372036854775806 then
    raise exception using errcode = '22023', message = 'Invalid atomic room version';
  end if;
  decoded := decode(p_record, 'base64');
  if octet_length(decoded) not between 1 and 4194410
     or replace(encode(decoded, 'base64'), E'\n', '') <> p_record then
    raise exception using errcode = '22023', message = 'Invalid atomic room record';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_diagram_id::text, 0));
  if not exists(select 1 from vizly_collaboration.room_lease where diagram_id = p_diagram_id and lease_id = p_lease_id
    and kind = 'edit' and expires_at > clock_timestamp()) then
    raise exception using errcode = '55000', message = 'Room lease inactive';
  end if;
  if not exists(select 1 from vizly_collaboration.room_lease where diagram_id = p_diagram_id and lease_id = p_lease_id
    and generation = p_generation) then return false; end if;
  if p_version is null then
    insert into vizly_collaboration.room_state(diagram_id, generation, version, record)
      values (p_diagram_id, p_generation, 1, decoded) on conflict (diagram_id) do nothing;
  else
    update vizly_collaboration.room_state set version = version + 1, record = decoded
      where diagram_id = p_diagram_id and generation = p_generation and version = p_version::bigint;
  end if;
  get diagnostics affected = row_count;
  if not exists(select 1 from vizly_collaboration.room_lease where diagram_id = p_diagram_id and lease_id = p_lease_id
    and generation = p_generation and kind = 'edit' and expires_at > clock_timestamp()) then
    raise exception using errcode = '55000', message = 'Room lease expired during commit';
  end if;
  return affected = 1;
end;
$$;
revoke all on function public.vizly_read_atomic_room(uuid) from public, anon, authenticated;
revoke all on function public.vizly_exchange_atomic_room(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.vizly_read_atomic_room(uuid) to service_role;
grant execute on function public.vizly_exchange_atomic_room(uuid, uuid, text, text, uuid) to service_role;
revoke all on function public.vizly_claim_room_lease(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.vizly_renew_room_lease(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.vizly_release_room_lease(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.vizly_claim_room_lease(uuid, uuid, uuid, text) to service_role;
grant execute on function public.vizly_renew_room_lease(uuid, uuid, uuid) to service_role;
grant execute on function public.vizly_release_room_lease(uuid, uuid, uuid) to service_role;
revoke all on function public.vizly_inspect_room_recovery(uuid) from public, anon, authenticated;
revoke all on function public.vizly_recover_atomic_room(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.vizly_inspect_room_recovery(uuid) to service_role;
grant execute on function public.vizly_recover_atomic_room(uuid, uuid, uuid, uuid, text, text) to service_role;
commit;
