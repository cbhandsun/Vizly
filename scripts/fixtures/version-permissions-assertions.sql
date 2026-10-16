SELECT public.assert_rls((SELECT count(*)=2 FROM pg_policies WHERE schemaname='public' AND tablename='diagram_versions'),'exactly scoped select/insert policies');
SELECT public.assert_rls(NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='diagram_versions' AND (qual='true' OR with_check='true')),'remove unrestricted policy alternatives');
SELECT public.assert_rls(NOT EXISTS(SELECT * FROM version_test.rows_before EXCEPT SELECT * FROM public.diagram_versions) AND NOT EXISTS(SELECT * FROM public.diagram_versions EXCEPT SELECT * FROM version_test.rows_before),'migration preserves every synthetic row and field');
SELECT public.assert_rls(NOT EXISTS(SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege WHERE has_table_privilege('anon','public.diagram_versions',privilege)),'anonymous has no version-table privileges');
SELECT public.assert_rls(NOT EXISTS(SELECT 1 FROM unnest(ARRAY['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege WHERE has_table_privilege('authenticated','public.diagram_versions',privilege)),'authenticated history is append-only and cannot truncate');
SELECT public.assert_rls(has_table_privilege('authenticated','public.diagram_versions','SELECT,INSERT'),'signed-in clients can list/read and append');
SELECT public.assert_rls(EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='diagram_versions' AND indexname='diagram_versions_diagram_created_id_idx'),'history foreign-key and paging index installed');

SET ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM * FROM public.diagram_versions; RAISE EXCEPTION 'anonymous read was accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,'{}'); RAISE EXCEPTION 'anonymous write was accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN TRUNCATE public.diagram_versions; RAISE EXCEPTION 'anonymous truncate was accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT public.assert_rls((SELECT count(*)=1 FROM public.diagram_versions),'owner reads only own graph history');
SELECT public.assert_rls((SELECT count(*)=0 FROM public.diagram_versions WHERE diagram_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'),'missing graph has empty history');
INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','{"nodes":[],"edges":[]}');
DO $$ BEGIN
  BEGIN INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','{}'); RAISE EXCEPTION 'spoofed author accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,'{}'); RAISE EXCEPTION 'null author accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','','{}'); RAISE EXCEPTION 'empty author accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('x',10000),'{}'); RAISE EXCEPTION 'unbounded foreign author accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','{}'); RAISE EXCEPTION 'foreign graph write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','{}'); RAISE EXCEPTION 'missing graph write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.diagram_versions SET diagram_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; RAISE EXCEPTION 'history reassignment accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.diagram_versions; RAISE EXCEPTION 'history deletion accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN TRUNCATE public.diagram_versions; RAISE EXCEPTION 'authenticated truncate accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SELECT public.assert_rls((SELECT count(*)=2 FROM public.diagram_versions),'viewer reads permitted graph history');
DO $$ BEGIN
  BEGIN INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','{}'); RAISE EXCEPTION 'viewer write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
SELECT public.assert_rls((SELECT count(*)=2 FROM public.diagram_versions),'editor reads permitted graph history');
INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','{"nodes":[],"edges":[]}');
SELECT public.assert_rls((SELECT count(*)=3 FROM public.diagram_versions),'editor append can return inserted version through SELECT');
RESET ROLE;
UPDATE public.diagram_collaborators SET role='owner' WHERE user_id='44444444-4444-4444-8444-444444444444';
SET ROLE authenticated;
INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','{}');
SELECT public.assert_rls((SELECT count(*)=4 FROM public.diagram_versions),'legacy collaborator owner role can append');
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SELECT public.assert_rls((SELECT count(*)=1 FROM public.diagram_versions),'outsider cannot read another graph history');
DO $$ BEGIN
  BEGIN INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','{}'); RAISE EXCEPTION 'outsider write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT public.assert_rls((SELECT count(*)=0 FROM public.diagram_versions),'missing authenticated identity reads no history');
DO $$ BEGIN
  BEGIN INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','','{}'); RAISE EXCEPTION 'missing identity write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DELETE FROM public.diagram_collaborators WHERE user_id IN ('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
SELECT public.assert_rls((SELECT count(*)=0 FROM public.diagram_versions),'revoked editor immediately loses history read');
DO $$ BEGIN
  BEGIN INSERT INTO public.diagram_versions(diagram_id,author_id,snapshot_data) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','{}'); RAISE EXCEPTION 'revoked editor write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SELECT public.assert_rls((SELECT count(*)=0 FROM public.diagram_versions),'revoked viewer immediately loses history read');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
WITH deleted AS (DELETE FROM public.diagrams WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' RETURNING id)
SELECT public.assert_rls(count(*)=1,'owner can delete the parent through the normal authenticated role') FROM deleted;
RESET ROLE;
SELECT public.assert_rls((SELECT count(*)=1 FROM public.diagram_versions),'parent cleanup retains existing foreign-key cascade');
