SET ROLE anon;
SELECT public.assert_rls((SELECT count(*) FROM public.ai_conversations)=0,'anonymous conversations denied');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub='';
SELECT public.assert_rls((SELECT count(*) FROM public.user_configs)=0,'missing identity denied');
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
SELECT public.assert_rls((SELECT count(*) FROM public.ai_conversations)=5000,'owner list preserved');
SELECT public.assert_rls((SELECT count(*) FROM public.user_configs)=1,'owner configs preserved');
DO $$ BEGIN BEGIN INSERT INTO public.user_configs VALUES(3,'22222222-2222-4222-8222-222222222222');
RAISE EXCEPTION 'Foreign insert admitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
DO $$ BEGIN BEGIN UPDATE public.user_configs SET user_id='22222222-2222-4222-8222-222222222222' WHERE id=1;
RAISE EXCEPTION 'Owner transfer admitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
DO $$ BEGIN BEGIN INSERT INTO public.user_configs VALUES(3,NULL);
RAISE EXCEPTION 'Null identity insert admitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
INSERT INTO public.user_configs VALUES(3,'11111111-1111-4111-8111-111111111111');
WITH changed AS(UPDATE public.user_configs SET id=4 WHERE id=3 RETURNING id)
SELECT public.assert_rls(count(*)=1,'own update preserved') FROM changed;
WITH changed AS(DELETE FROM public.user_configs WHERE id=4 RETURNING id)
SELECT public.assert_rls(count(*)=1,'own delete preserved') FROM changed;
RESET ROLE;
SELECT public.assert_rls((SELECT count(*) FROM pg_indexes WHERE schemaname='public'
AND indexname IN('ai_conversations_user_id_idx','diagram_collaborators_added_by_idx'))=2,'indexes created');
