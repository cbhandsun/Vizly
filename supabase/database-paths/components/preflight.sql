-- Locks bound the inventory/data checks to the exact state being upgraded.
LOCK TABLE public.diagrams,public.diagram_collaborators,public.shared_diagrams,public.diagram_versions,
  public.system_templates,public.user_configs,public.ai_conversations IN ACCESS EXCLUSIVE MODE;
DO $guard$
DECLARE actual text; item record; bad bigint;
BEGIN
  IF to_regclass('auth.users') IS NULL OR to_regclass('realtime.messages') IS NULL THEN
    RAISE EXCEPTION 'Supabase platform schemas are required';
  END IF;
  FOR item IN SELECT * FROM (VALUES
    ('diagrams','id','uuid'),('diagrams','user_id','uuid'),('diagrams','title','text'),('diagrams','content','jsonb'),('diagrams','updated_at','timestamptz'),
    ('diagram_collaborators','diagram_id','uuid'),('diagram_collaborators','user_id','uuid'),('diagram_collaborators','added_by','uuid'),('diagram_collaborators','role','text'),('diagram_collaborators','created_at','timestamptz'),
    ('shared_diagrams','id','uuid'),('shared_diagrams','diagram_id','text'),('shared_diagrams','created_by','uuid'),('shared_diagrams','share_token','text'),('shared_diagrams','is_active','bool'),('shared_diagrams','expires_at','timestamptz'),('shared_diagrams','created_at','timestamptz'),
    ('diagram_versions','id','uuid'),('diagram_versions','diagram_id','uuid|text'),('diagram_versions','author_id','text'),('diagram_versions','snapshot_data','jsonb'),('diagram_versions','created_at','timestamptz'),('diagram_versions','message','text'),
    ('system_templates','id','text'),('system_templates','title','text'),('system_templates','content','jsonb'),('system_templates','is_active','bool'),
    ('user_configs','user_id','uuid'),('user_configs','key','text'),('user_configs','value','jsonb'),('user_configs','updated_at','timestamptz'),
    ('ai_conversations','id','text|uuid'),('ai_conversations','user_id','uuid'),('ai_conversations','title','text'),('ai_conversations','messages','jsonb'),('ai_conversations','created_at','timestamptz'),('ai_conversations','updated_at','timestamptz')
  ) expected(table_name,column_name,allowed_types) LOOP
    SELECT udt_name INTO actual FROM information_schema.columns WHERE table_schema='public'
      AND table_name=item.table_name AND column_name=item.column_name;
    IF actual IS NULL OR NOT actual=ANY(string_to_array(item.allowed_types,'|')) THEN
      RAISE EXCEPTION 'Unsupported column %.%; expected %, found %',item.table_name,item.column_name,item.allowed_types,actual;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename IN
    ('diagrams','diagram_collaborators','shared_diagrams','diagram_versions','system_templates','user_configs','ai_conversations')
    AND NOT EXISTS (SELECT 1 FROM vizly_expected_policies e WHERE e.table_name=p.tablename AND e.policy_name=p.policyname)) THEN
    RAISE EXCEPTION 'Unknown application policy; review inventory before upgrading';
  END IF;
  -- Only the version parent reference has a supported TEXT -> UUID conversion.
  SELECT count(*) INTO bad FROM public.diagram_versions
    WHERE diagram_id IS NULL OR diagram_id::text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  IF bad>0 THEN RAISE EXCEPTION 'Invalid historical diagram version IDs: %; no data changed, provide an explicit reviewed mapping',bad; END IF;
  SELECT count(*) INTO bad FROM public.diagram_versions v LEFT JOIN public.diagrams d ON d.id=v.diagram_id::uuid WHERE d.id IS NULL;
  IF bad>0 THEN RAISE EXCEPTION 'Orphan version references: %; restore parents or review mapping first',bad; END IF;
  IF EXISTS (SELECT 1 FROM public.diagrams d LEFT JOIN auth.users u ON u.id=d.user_id WHERE u.id IS NULL)
    OR EXISTS (SELECT 1 FROM public.diagram_collaborators c LEFT JOIN public.diagrams d ON d.id=c.diagram_id
      LEFT JOIN auth.users u ON u.id=c.user_id LEFT JOIN auth.users a ON a.id=c.added_by
      WHERE d.id IS NULL OR u.id IS NULL OR a.id IS NULL OR c.role IS NULL OR c.role NOT IN ('owner','editor','viewer'))
    OR EXISTS (SELECT 1 FROM public.shared_diagrams s LEFT JOIN public.diagrams d ON d.id::text=s.diagram_id
      LEFT JOIN auth.users u ON u.id=s.created_by WHERE d.id IS NULL OR u.id IS NULL)
    OR EXISTS (SELECT 1 FROM public.user_configs c LEFT JOIN auth.users u ON u.id=c.user_id WHERE u.id IS NULL)
    OR EXISTS (SELECT 1 FROM public.ai_conversations c LEFT JOIN auth.users u ON u.id=c.user_id WHERE u.id IS NULL) THEN
    RAISE EXCEPTION 'Orphan application ownership/reference or invalid collaborator role; no automatic deletion';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_configs GROUP BY user_id,key HAVING count(*)>1)
    OR EXISTS (SELECT 1 FROM public.shared_diagrams GROUP BY share_token HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Duplicate configuration key or share token; review before upgrade';
  END IF;
END $guard$;
-- Record a canonicalized content digest before changes. No user content leaves SQL.
CREATE TEMP TABLE vizly_rows_before(table_name text PRIMARY KEY, row_count bigint, digest text) ON COMMIT DROP;
DO $capture$
DECLARE name text; expression text;
BEGIN
  FOREACH name IN ARRAY ARRAY['diagrams','diagram_collaborators','shared_diagrams','diagram_versions','system_templates','user_configs','ai_conversations'] LOOP
    expression := CASE WHEN name='diagram_versions' THEN '(to_jsonb(t) - ''diagram_id'') || jsonb_build_object(''diagram_id'',t.diagram_id::uuid::text)' ELSE 'to_jsonb(t)' END;
    EXECUTE format('INSERT INTO vizly_rows_before SELECT %L,count(*),md5(coalesce(string_agg(row_hash,'''' ORDER BY row_hash),'''')) FROM (SELECT md5((%s)::text) row_hash FROM public.%I t) rows',name,expression,name);
  END LOOP;
END $capture$;
DO $keys$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('diagrams',ARRAY['id']),('diagram_versions',ARRAY['id']),('shared_diagrams',ARRAY['id']),
    ('shared_diagrams',ARRAY['share_token']),('system_templates',ARRAY['id']),
    ('user_configs',ARRAY['user_id','key']),('ai_conversations',ARRAY['id'])
  ) expected(table_name,columns) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=to_regclass('public.'||item.table_name)
      AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL
      AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ordinality)
        JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE k.ordinality<=i.indnkeyatts)=item.columns) THEN
      RAISE EXCEPTION 'Missing supported unique key on %.%',item.table_name,item.columns;
    END IF;
  END LOOP;
END $keys$;
DO $private_capture$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['room_state','room_lease','recovery_backup'] LOOP
    IF to_regclass('vizly_collaboration.'||name) IS NOT NULL THEN
      EXECUTE format('LOCK TABLE vizly_collaboration.%I IN ACCESS EXCLUSIVE MODE',name);
      EXECUTE format('INSERT INTO vizly_rows_before SELECT %L,count(*),md5(coalesce(string_agg(row_hash,'''' ORDER BY row_hash),'''')) FROM (SELECT md5(to_jsonb(t)::text) row_hash FROM vizly_collaboration.%I t) rows','vizly_collaboration.'||name,name);
    END IF;
  END LOOP;
END $private_capture$;
