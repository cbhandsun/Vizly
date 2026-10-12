set role service_role;
select public.vizly_claim_room_lease('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'edit');
do $$
begin
  if public.vizly_read_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') is not null then raise exception 'Expected absent room'; end if;
  if not public.vizly_exchange_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', null, 'AQI=', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') then raise exception 'Initialization failed'; end if;
  if public.vizly_exchange_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', null, 'AwQ=', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') then raise exception 'Duplicate initialization overwrote room'; end if;
  if not public.vizly_exchange_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '1', 'AwQ=', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') then raise exception 'Update failed'; end if;
  if public.vizly_exchange_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '1', 'AQI=', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') then raise exception 'Stale update accepted'; end if;
  if public.vizly_exchange_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2', 'AQI=', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') then raise exception 'Stale generation accepted'; end if;
  if public.vizly_read_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'version' <> '2' then raise exception 'Wrong durable version'; end if;
  begin
    perform public.vizly_exchange_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '2', '', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    raise exception 'Empty record accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.vizly_exchange_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'invalid', 'AQI=', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    raise exception 'Invalid version accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.vizly_exchange_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '2', repeat('A', 5592552), 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    raise exception 'Excessive record accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.vizly_claim_room_lease('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'edit');
    raise exception 'Missing diagram accepted';
  exception when foreign_key_violation then null; end;
  begin
    perform public.vizly_exchange_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '2', 'AR==', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    raise exception 'Noncanonical base64 accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.vizly_exchange_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '9223372036854775807', 'AQI=', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    raise exception 'Overflow version accepted';
  exception when invalid_parameter_value then null; end;
end;
$$;
reset role;
do $$
declare client text;
begin
  foreach client in array array['anon', 'authenticated'] loop
    if has_function_privilege(client, 'public.vizly_read_atomic_room(uuid)', 'execute')
      or has_function_privilege(client, 'public.vizly_exchange_atomic_room(uuid,uuid,text,text,uuid)', 'execute')
      or has_schema_privilege(client, 'vizly_collaboration', 'usage')
      or has_table_privilege(client, 'vizly_collaboration.room_state', 'select') then raise exception 'Client access exposed'; end if;
  end loop;
end;
$$;
set role anon;
do $$ begin
  begin perform public.vizly_read_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); raise exception 'Anonymous RPC accepted';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
set role authenticated;
do $$ begin
  begin perform public.vizly_exchange_atomic_room('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '2', 'AQI=', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'); raise exception 'Authenticated RPC accepted';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
