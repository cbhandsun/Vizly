set role service_role;
do $$
declare room constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  lease constant uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  next_lease constant uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  recovery constant uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  old_gen constant uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
begin
  if to_regprocedure('public.vizly_exchange_atomic_room(uuid,uuid,text,text)') is not null then raise exception 'Unleased write path retained'; end if;
  if not public.vizly_renew_room_lease(room, lease, old_gen) then raise exception 'Active renewal failed'; end if;
  if public.vizly_claim_room_lease(room, recovery, old_gen, 'recovery') is not null then raise exception 'Recovery admitted during active editing'; end if;
  if public.vizly_claim_room_lease(room, next_lease, next_lease, 'edit')->>'generation' is distinct from old_gen::text then raise exception 'Concurrent admission changed generation'; end if;
  if not public.vizly_release_room_lease(room, next_lease, old_gen) then raise exception 'Release failed'; end if;
  if public.vizly_release_room_lease(room, next_lease, old_gen) then raise exception 'Duplicate release changed a lease'; end if;
end; $$;
reset role;
update vizly_collaboration.room_lease set expires_at = clock_timestamp() - interval '1 second'
  where lease_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
set role service_role;
do $$
declare room constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  lease constant uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  recovery constant uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  old_gen constant uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  new_gen constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  expected text; receipt jsonb; saved bytea;
begin
  if public.vizly_renew_room_lease(room, lease, old_gen) then raise exception 'Expired lease revived'; end if;
  begin
    perform public.vizly_exchange_atomic_room(room, old_gen, '3', 'AQI=', lease);
    raise exception 'Expired writer accepted';
  exception when object_not_in_prerequisite_state then null; end;
  if public.vizly_claim_room_lease(room, recovery, old_gen, 'recovery') is null then raise exception 'Idle recovery rejected'; end if;
  if public.vizly_claim_room_lease(room, lease, old_gen, 'edit') is not null then raise exception 'Editor admitted during recovery'; end if;
  expected := public.vizly_inspect_room_recovery(room)->>'sha256';
  begin
    perform public.vizly_recover_atomic_room(room, recovery, old_gen, new_gen, repeat('0', 64), 'Bwg=');
    raise exception 'Changed recovery confirmation accepted';
  exception when object_not_in_prerequisite_state then null; end;
  receipt := public.vizly_recover_atomic_room(room, recovery, old_gen, new_gen, expected, 'Bwg=');
  if receipt->>'previousSha256' is distinct from expected or receipt->>'generation' is distinct from new_gen::text then raise exception 'Invalid recovery receipt'; end if;
  select record into saved from vizly_collaboration.recovery_backup where diagram_id = room and sha256 = expected;
  if saved is distinct from decode('BQY=', 'base64') then raise exception 'Previous record backup lost'; end if;
  if public.vizly_renew_room_lease(room, lease, old_gen) then raise exception 'Old writer renewed after recovery'; end if;
  if public.vizly_claim_room_lease(room, lease, old_gen, 'edit')->>'generation' is distinct from new_gen::text then raise exception 'Recovered admission used old generation'; end if;
  if public.vizly_exchange_atomic_room(room, old_gen, '4', 'AQI=', lease) then raise exception 'Old generation wrote recovered room'; end if;
  if not public.vizly_exchange_atomic_room(room, new_gen, '4', 'CQo=', lease) then raise exception 'Recovered writer failed'; end if;
end; $$;
reset role;
-- A full backup budget must fail atomically, retaining the room and all backups.
create function public.fixture_expire_room_lease() returns trigger language plpgsql as $$
begin
  update vizly_collaboration.room_lease set expires_at = clock_timestamp() - interval '1 second' where diagram_id = new.diagram_id;
  return new;
end; $$;
create trigger fixture_expire_during_write before update on vizly_collaboration.room_state
  for each row execute function public.fixture_expire_room_lease();
set role service_role;
do $$
declare room constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  edit constant uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  recovery constant uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  current_gen constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  expected text;
begin
  expected := public.vizly_inspect_room_recovery(room)->>'sha256';
  begin
    perform public.vizly_exchange_atomic_room(room, current_gen, '5', 'Cww=', edit);
    raise exception 'Commit continued after mid-write lease expiry';
  exception when object_not_in_prerequisite_state then null; end;
  if public.vizly_inspect_room_recovery(room)->>'sha256' is distinct from expected then raise exception 'Expired commit changed state'; end if;
  if not public.vizly_release_room_lease(room, edit, current_gen) then raise exception 'Mid-write setup release failed'; end if;
  if public.vizly_claim_room_lease(room, recovery, current_gen, 'recovery') is null then raise exception 'Mid-write recovery admission failed'; end if;
  begin
    perform public.vizly_recover_atomic_room(room, recovery, current_gen, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', expected, 'Cww=');
    raise exception 'Recovery continued after mid-write lease expiry';
  exception when object_not_in_prerequisite_state then null; end;
  if public.vizly_inspect_room_recovery(room)->>'sha256' is distinct from expected
    or (select count(*) from vizly_collaboration.recovery_backup where diagram_id = room) <> 1 then
    raise exception 'Expired recovery changed state or backups';
  end if;
  if not public.vizly_release_room_lease(room, recovery, current_gen) then raise exception 'Mid-write recovery release failed'; end if;
  if public.vizly_claim_room_lease(room, edit, current_gen, 'edit') is null then raise exception 'Mid-write editor rejoin failed'; end if;
end; $$;
reset role;
drop trigger fixture_expire_during_write on vizly_collaboration.room_state;
drop function public.fixture_expire_room_lease();
insert into vizly_collaboration.recovery_backup(diagram_id, sha256, generation, record)
  select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', encode(sha256(convert_to('synthetic-backup-' || i, 'UTF8')), 'hex'),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', convert_to('synthetic-backup-' || i, 'UTF8')
  from generate_series(1, 31) as i;
set role service_role;
do $$
declare room constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  recovery constant uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  current_gen constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  expected text;
begin
  if not public.vizly_release_room_lease(room, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', current_gen) then raise exception 'Recovery quota setup release failed'; end if;
  if public.vizly_claim_room_lease(room, recovery, current_gen, 'recovery') is null then raise exception 'Recovery quota admission failed'; end if;
  expected := public.vizly_inspect_room_recovery(room)->>'sha256';
  begin
    perform public.vizly_recover_atomic_room(room, recovery, current_gen, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', expected, 'Cww=');
    raise exception 'Recovery exceeded backup capacity';
  exception when program_limit_exceeded then null; end;
  if public.vizly_read_atomic_room(room)->>'version' is distinct from '5'
    or public.vizly_inspect_room_recovery(room)->>'sha256' is distinct from expected
    or (select count(*) from vizly_collaboration.recovery_backup where diagram_id = room) <> 32 then
    raise exception 'Quota failure changed durable state';
  end if;
  if not public.vizly_release_room_lease(room, recovery, current_gen) then raise exception 'Recovery quota release failed'; end if;
end; $$;
reset role;
do $$ declare client text; signature text;
begin
  foreach client in array array['anon', 'authenticated'] loop
    foreach signature in array array['public.vizly_claim_room_lease(uuid,uuid,uuid,text)', 'public.vizly_renew_room_lease(uuid,uuid,uuid)',
      'public.vizly_release_room_lease(uuid,uuid,uuid)', 'public.vizly_inspect_room_recovery(uuid)', 'public.vizly_recover_atomic_room(uuid,uuid,uuid,uuid,text,text)'] loop
      if has_function_privilege(client, signature, 'execute') then raise exception 'Client lease or recovery RPC exposed'; end if;
    end loop;
    if has_table_privilege(client, 'vizly_collaboration.room_lease', 'select') or has_table_privilege(client, 'vizly_collaboration.recovery_backup', 'select') then
      raise exception 'Lease or backup exposed';
    end if;
  end loop;
end; $$;
