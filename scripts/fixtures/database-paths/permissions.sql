-- Verify roles against the actual newly installed/updated schema, not bespoke app tables.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Database path assertion: %',label; END IF; END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.diagrams),'owner isolation');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.diagram_versions),'owner history isolation');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.user_configs),'owner config isolation');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.ai_conversations),'owner conversation isolation');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.get_diagram_collaborators('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),'owner collaborator lookup');
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.diagrams),'editor read');
WITH changed AS (UPDATE public.diagrams SET title='Editor update' WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' RETURNING id)
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM changed),'editor update');
INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','{"nodes":[],"edges":[]}');
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.diagrams),'viewer read');
WITH changed AS (UPDATE public.diagrams SET title='Must not update' RETURNING id)
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM changed),'viewer cannot update');
DO $$ BEGIN
  BEGIN INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','{}');
    RAISE EXCEPTION 'Viewer unexpectedly inserted version'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.diagram_versions SET message='tamper'; RAISE EXCEPTION 'Version update unexpectedly permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.user_configs),'viewer cannot read owner configs');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.ai_conversations),'viewer cannot read owner conversations');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.vizly_read_atomic_room(uuid)','EXECUTE'),'browser cannot read backend room');
SET ROLE anon;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.system_templates),'anonymous active templates only');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.get_shared_diagram_by_token('fixture-active')),'anonymous valid share');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.get_shared_diagram_by_token('fixture-expired')),'anonymous expired share blocked');
DO $$ BEGIN
  BEGIN PERFORM * FROM public.diagram_versions; RAISE EXCEPTION 'Anonymous history unexpectedly readable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.diagrams; RAISE EXCEPTION 'Anonymous diagrams unexpectedly readable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
SELECT set_config('request.jwt.claims','{"user_metadata":{"role":"admin"}}',true);
WITH changed AS (UPDATE public.system_templates SET title='spoofed' RETURNING id)
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM changed),'user_metadata cannot grant admin');
SELECT set_config('request.jwt.claims','{"app_metadata":{"role":"admin"}}',true);
WITH changed AS (UPDATE public.system_templates SET title='admin update' RETURNING id)
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM changed),'trusted admin template edit');
ROLLBACK;
