-- Read-only inventory. Captures definitions/counts, never user content or secrets.
BEGIN READ ONLY;
SELECT jsonb_build_object('kind','columns','items',coalesce(jsonb_agg(to_jsonb(c)),'[]')) FROM (
  SELECT table_schema,table_name,column_name,udt_name,is_nullable,md5(column_default) default_hash
  FROM information_schema.columns WHERE table_schema IN ('public','vizly_collaboration','vizly_ai','vizly_migrations') ORDER BY 1,2,ordinal_position
) c;
SELECT jsonb_build_object('kind','policies','items',coalesce(jsonb_agg(to_jsonb(p)),'[]')) FROM (
  SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
  WHERE schemaname IN ('public','realtime','vizly_collaboration','vizly_ai','vizly_migrations') ORDER BY 1,2,3
) p;
SELECT jsonb_build_object('kind','grants','items',coalesce(jsonb_agg(to_jsonb(g)),'[]')) FROM (
  SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.table_privileges
  WHERE table_schema IN ('public','vizly_collaboration','vizly_ai','vizly_migrations') ORDER BY 1,2,3,4
) g;
SELECT jsonb_build_object('kind','constraints','items',coalesce(jsonb_agg(to_jsonb(c)),'[]')) FROM (
  SELECT n.nspname schema_name,r.relname table_name,c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid) definition
  FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
  WHERE n.nspname IN ('public','vizly_collaboration','vizly_ai') ORDER BY 1,2,3
) c;
SELECT jsonb_build_object('kind','indexes','items',coalesce(jsonb_agg(to_jsonb(i)),'[]')) FROM (
  SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN ('public','vizly_collaboration','vizly_ai') ORDER BY 1,2,3
) i;
SELECT jsonb_build_object('kind','functions','items',coalesce(jsonb_agg(to_jsonb(f)),'[]')) FROM (
  SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) arguments,
    pg_get_function_result(p.oid) result,p.prosecdef,p.proacl,p.proconfig,md5(pg_get_functiondef(p.oid)) definition_hash
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','vizly_collaboration','vizly_ai') AND p.prokind='f' ORDER BY 1,2,3
) f;
-- psql conditionals keep missing history tables valid in an empty platform database.
SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS has_history \gset
\if :has_history
SELECT jsonb_build_object('kind','supabase-history','versions',coalesce(jsonb_agg(version ORDER BY version),'[]')) FROM supabase_migrations.schema_migrations;
\else
SELECT '{"kind":"supabase-history","versions":[],"tablePresent":false}'::jsonb;
\endif
SELECT to_regclass('vizly_migrations.applied') IS NOT NULL AS has_vizly_history \gset
\if :has_vizly_history
SELECT jsonb_build_object('kind','vizly-history','items',coalesce(jsonb_agg(to_jsonb(h) ORDER BY name),'[]')) FROM vizly_migrations.applied h;
\endif
SELECT jsonb_build_object('kind','rls','items',coalesce(jsonb_agg(to_jsonb(r)),'[]')) FROM (
  SELECT n.nspname schema_name,c.relname table_name,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','vizly_collaboration','vizly_ai') AND c.relkind='r' ORDER BY 1,2
) r;
SELECT jsonb_build_object('kind','triggers','items',coalesce(jsonb_agg(to_jsonb(t)),'[]')) FROM (
  SELECT n.nspname schema_name,c.relname table_name,t.tgname,t.tgenabled,md5(pg_get_triggerdef(t.oid)) definition_hash
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','vizly_collaboration','vizly_ai') AND NOT t.tgisinternal ORDER BY 1,2,3
) t;
SELECT format('SELECT jsonb_build_object(''kind'',''row-count'',''table'',%L,''count'',count(*)) FROM public.%I;',tablename,tablename)
FROM pg_tables WHERE schemaname='public' AND tablename IN ('diagrams','diagram_collaborators','shared_diagrams','diagram_versions','system_templates','user_configs','ai_conversations') ORDER BY tablename \gexec
SELECT to_regclass('public.diagram_versions') IS NOT NULL AND to_regclass('public.diagrams') IS NOT NULL AS has_versions \gset
\if :has_versions
SELECT jsonb_build_object('kind','version-reference-audit',
  'rows',count(*),'invalidOrNull',count(*) FILTER(WHERE v.diagram_id IS NULL OR v.diagram_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  'unmatchedParents',count(*) FILTER(WHERE d.id IS NULL),
  'authorLabelsRetainedAsText',count(*) FILTER(WHERE v.author_id IS NOT NULL AND v.author_id !~* '^[0-9a-f-]{36}$'))
FROM public.diagram_versions v LEFT JOIN public.diagrams d ON d.id::text=lower(v.diagram_id::text);
\endif
COMMIT;
