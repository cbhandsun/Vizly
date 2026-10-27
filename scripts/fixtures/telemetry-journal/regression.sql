-- Destructive fixture operations below belong ONLY to an owned, isolated test database.
DO $guard$ BEGIN
  IF current_setting('vizly.telemetry_fixture',true) IS DISTINCT FROM 'owned-isolated-postgres' THEN
    RAISE EXCEPTION 'Telemetry fixture requires an isolated target';
  END IF;
END $guard$;
SET ROLE service_role;
DO $test$
DECLARE
  batch jsonb;
  event jsonb;
  metrics jsonb;
  large_batch jsonb;
  result jsonb;
  index integer;
  copies integer;
  refused boolean;
BEGIN
  SELECT jsonb_object_agg(operation,jsonb_build_object('started',64,'success',0,'failure',64,'cancelled',0))
    INTO metrics FROM unnest(ARRAY['startup','save','connect','reconnect','permission','cas','lease','export','route']) AS t(operation);
  event := jsonb_build_object('schema','vizly-operation-v1','releaseId',repeat('a',40),
    'requestId','11111111-1111-4111-8111-111111111111','operation','save','outcome','failure','code','network','durationMs',12);
  batch := jsonb_build_object('schema','vizly-telemetry-v1','releaseId',repeat('a',40),
    'streamId','22222222-2222-4222-8222-222222222222','sequence',1,'dropped',0,'metrics',metrics,'events',jsonb_build_array(event));
  DELETE FROM vizly_telemetry.journal;
  result := public.vizly_record_telemetry(batch || '{"token":"PRIVATE-CANARY"}'::jsonb);
  IF result <> '{"accepted":true,"stored":true}'::jsonb THEN RAISE EXCEPTION 'Write acknowledgment mismatch'; END IF;
  IF EXISTS (SELECT FROM vizly_telemetry.journal AS stored WHERE stored.batch::text LIKE '%PRIVATE-CANARY%') THEN
    RAISE EXCEPTION 'Sensitive extra field persisted';
  END IF;
  IF public.vizly_record_telemetry(batch) <> '{"accepted":true,"stored":false}'::jsonb THEN
    RAISE EXCEPTION 'Retry was not idempotent';
  END IF;
  refused := false;
  BEGIN PERFORM public.vizly_record_telemetry(batch || '{"dropped":1}'::jsonb);
    EXCEPTION WHEN invalid_parameter_value THEN refused := true;
  END;
  IF NOT refused OR (SELECT count(*) FROM vizly_telemetry.journal) <> 1 THEN
    RAISE EXCEPTION 'Conflicting retry mutated storage';
  END IF;
  IF (SELECT count(*) FROM public.vizly_query_telemetry(repeat('a',40),'11111111-1111-4111-8111-111111111111')) <> 1
    OR (SELECT count(*) FROM public.vizly_query_telemetry(repeat('b',40))) <> 0 THEN
    RAISE EXCEPTION 'Query identity filtering failed';
  END IF;
  FOR index IN 2..1001 LOOP
    PERFORM public.vizly_record_telemetry(jsonb_set(batch,'{sequence}',to_jsonb(index)));
  END LOOP;
  IF (SELECT count(*) FROM vizly_telemetry.journal) <> 1000
    OR EXISTS (SELECT FROM vizly_telemetry.journal WHERE sequence=1)
    OR NOT EXISTS (SELECT FROM vizly_telemetry.journal WHERE sequence=1001) THEN
    RAISE EXCEPTION 'Record-count retention failed';
  END IF;
  SELECT jsonb_set(batch,'{events}',jsonb_agg(event)) INTO large_batch FROM generate_series(1,64);
  copies := ceil(4194304.0 / octet_length(large_batch::text))::integer + 2;
  FOR index IN 1..copies LOOP
    PERFORM public.vizly_record_telemetry(jsonb_set(large_batch,'{sequence}',to_jsonb(2000+index)));
  END LOOP;
  IF (SELECT sum(payload_bytes) FROM vizly_telemetry.journal) > 4194304
    OR (SELECT count(*) FROM vizly_telemetry.journal) > 1000
    OR NOT EXISTS (SELECT FROM vizly_telemetry.journal WHERE sequence=2000+copies) THEN
    RAISE EXCEPTION 'Payload-byte retention failed';
  END IF;
  IF (SELECT count(*) FROM public.vizly_query_telemetry(repeat('a',40))) > 1000 THEN
    RAISE EXCEPTION 'Query record bound failed';
  END IF;
END $test$;
RESET ROLE;
-- Backdated fixture data checks expiry without changing the host/database clock.
UPDATE vizly_telemetry.journal SET received_at=clock_timestamp()-interval '8 days';
SET ROLE service_role;
DO $expiry$
DECLARE batch jsonb;
BEGIN
  SELECT journal.batch INTO batch FROM vizly_telemetry.journal AS journal LIMIT 1;
  IF (SELECT count(*) FROM public.vizly_query_telemetry(repeat('a',40))) <> 0 THEN
    RAISE EXCEPTION 'Expired entries returned by lookup';
  END IF;
  PERFORM public.vizly_record_telemetry(jsonb_set(batch,'{sequence}','9000'::jsonb));
  IF (SELECT count(*) FROM vizly_telemetry.journal) <> 1 THEN
    RAISE EXCEPTION 'Expired entries not purged on write';
  END IF;
END $expiry$;
RESET ROLE;
SELECT '{"status":"passed","suite":"telemetry-journal-sql","cases":["server-role-write","database-projection","idempotent-retry","conflicting-retry","release-request-filter","record-count-bound","payload-byte-bound","newest-record-retained","query-count-bound","expired-query-excluded","expired-records-purged-on-write"]}'::jsonb;
