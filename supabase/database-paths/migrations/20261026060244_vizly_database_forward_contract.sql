-- Generated from reviewed components and hash-pinned historical definitions.
-- Apply only through scripts/database-path.mjs inside its single transaction.

CREATE TEMP TABLE vizly_expected_policies(table_name text,policy_name text) ON COMMIT DROP;
INSERT INTO vizly_expected_policies VALUES
('system_templates','Allow public read access to active templates'),
('system_templates','Allow admins to manage templates'),
('system_templates','Allow admin users to manage templates'),
('user_configs','Users can manage own configs'),
('user_configs','owner_all'),
('ai_conversations','Users can manage own AI conversations'),
('ai_conversations','Users can manage their own conversations'),
('diagrams','owner_all'),
('diagrams','collaborator_read'),
('diagrams','Users can insert own diagrams'),
('diagrams','Users can read permitted diagrams'),
('diagrams','Users can update editable diagrams'),
('diagrams','Users can delete own diagrams'),
('diagram_versions','Users can read permitted diagram versions'),
('diagram_versions','Users can insert own diagram versions'),
('diagram_versions','Enable all read access'),
('diagram_versions','Enable all insert access'),
('diagram_versions','Enable all update access'),
('diagram_versions','Enable all delete access'),
('diagram_versions','Permitted users can read diagram versions'),
('diagram_versions','Editors can append own diagram versions'),
('diagram_collaborators','adder_all'),
('diagram_collaborators','self_read'),
('diagram_collaborators','Users can read own collaborations'),
('shared_diagrams','creator_all'),
('shared_diagrams','read_active'),
('shared_diagrams','Users can manage own share links');

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

-- Only policy names admitted by preflight may be replaced. Never use CASCADE.
DO $policies$
DECLARE item record;
BEGIN
  FOR item IN SELECT p.tablename,p.policyname FROM pg_policies p JOIN vizly_expected_policies e
    ON e.table_name=p.tablename AND e.policy_name=p.policyname WHERE p.schemaname='public' LOOP
    EXECUTE format('DROP POLICY %I ON public.%I',item.policyname,item.tablename);
  END LOOP;
END $policies$;
CREATE TABLE IF NOT EXISTS vizly_migrations.version_reference_map (
  version_id uuid PRIMARY KEY, original_diagram_id text NOT NULL, canonical_diagram_id uuid NOT NULL,
  mapped_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE vizly_migrations.version_reference_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vizly_migrations.version_reference_map FROM PUBLIC,anon,authenticated,service_role;
DO $normalize$
BEGIN
  IF (SELECT udt_name FROM information_schema.columns WHERE table_schema='public'
    AND table_name='diagram_versions' AND column_name='diagram_id')='text' THEN
    INSERT INTO vizly_migrations.version_reference_map(version_id,original_diagram_id,canonical_diagram_id)
      SELECT id,diagram_id,diagram_id::uuid FROM public.diagram_versions;
    ALTER TABLE public.diagram_versions ALTER COLUMN diagram_id TYPE uuid USING diagram_id::uuid;
  END IF;
  -- UUID conversation IDs remain byte-for-byte JSON strings after widening to TEXT;
  -- the application also creates conv_* IDs. Dependent unknown objects fail safely.
  IF (SELECT udt_name FROM information_schema.columns WHERE table_schema='public'
    AND table_name='ai_conversations' AND column_name='id')='uuid' THEN
    ALTER TABLE public.ai_conversations ALTER COLUMN id TYPE text USING id::text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.diagram_versions'::regclass
    AND c.contype='f' AND c.confrelid='public.diagrams'::regclass
    AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='diagram_id')]::smallint[]
    AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.confrelid AND attname='id')]::smallint[]
    AND c.convalidated) THEN
    ALTER TABLE public.diagram_versions ADD CONSTRAINT vizly_versions_parent_fk FOREIGN KEY(diagram_id) REFERENCES public.diagrams(id) ON DELETE CASCADE;
  END IF;
END $normalize$;

-- Harden RLS policies for cloud-backed Vizly data.
-- This migration is defensive: tables created outside this repository are
-- hardened when present, while fresh checkouts can still apply the migration.

DO $$
DECLARE
  has_diagram_collaborators boolean := to_regclass('public.diagram_collaborators') IS NOT NULL;
BEGIN
  IF to_regclass('public.system_templates') IS NOT NULL THEN
    ALTER TABLE public.system_templates ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Allow admins to manage templates" ON public.system_templates;
    DROP POLICY IF EXISTS "Allow admin users to manage templates" ON public.system_templates;

    CREATE POLICY "Allow admin users to manage templates"
    ON public.system_templates
    FOR ALL
    TO authenticated
    USING (
      COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    )
    WITH CHECK (
      COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    );
  END IF;

  IF to_regclass('public.user_configs') IS NOT NULL THEN
    ALTER TABLE public.user_configs ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can manage own configs" ON public.user_configs;
    CREATE POLICY "Users can manage own configs"
    ON public.user_configs
    FOR ALL
    TO authenticated
    USING (user_id::text = auth.uid()::text)
    WITH CHECK (user_id::text = auth.uid()::text);
  END IF;

  IF to_regclass('public.ai_conversations') IS NOT NULL THEN
    ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can manage own AI conversations" ON public.ai_conversations;
    CREATE POLICY "Users can manage own AI conversations"
    ON public.ai_conversations
    FOR ALL
    TO authenticated
    USING (user_id::text = auth.uid()::text)
    WITH CHECK (user_id::text = auth.uid()::text);
  END IF;

  IF to_regclass('public.diagrams') IS NOT NULL THEN
    ALTER TABLE public.diagrams ENABLE ROW LEVEL SECURITY;
    -- Permissive policies are OR-combined. Remove the deployed legacy policies
    -- before installing the narrower role-aware replacements.
    DROP POLICY IF EXISTS owner_all ON public.diagrams;
    DROP POLICY IF EXISTS collaborator_read ON public.diagrams;
    REVOKE ALL ON public.diagrams FROM anon;
    REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.diagrams FROM authenticated;

    CREATE OR REPLACE FUNCTION public.prevent_diagram_user_id_change()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $function$
    BEGIN
      IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
        RAISE EXCEPTION 'Diagram owner cannot be changed'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END
    $function$;

    DROP TRIGGER IF EXISTS prevent_diagram_user_id_change ON public.diagrams;
    CREATE TRIGGER prevent_diagram_user_id_change
    BEFORE UPDATE OF user_id ON public.diagrams
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_diagram_user_id_change();
    REVOKE ALL ON FUNCTION public.prevent_diagram_user_id_change() FROM PUBLIC, anon, authenticated;

    DROP POLICY IF EXISTS "Users can insert own diagrams" ON public.diagrams;
    CREATE POLICY "Users can insert own diagrams"
    ON public.diagrams
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id::text = auth.uid()::text);

    DROP POLICY IF EXISTS "Users can read permitted diagrams" ON public.diagrams;
    IF has_diagram_collaborators THEN
      CREATE POLICY "Users can read permitted diagrams"
      ON public.diagrams
      FOR SELECT
      TO authenticated
      USING (
        user_id::text = auth.uid()::text
        OR EXISTS (
          SELECT 1
          FROM public.diagram_collaborators dc
          WHERE dc.diagram_id::text = diagrams.id::text
            AND dc.user_id::text = auth.uid()::text
        )
      );

      DROP POLICY IF EXISTS "Users can update editable diagrams" ON public.diagrams;
      CREATE POLICY "Users can update editable diagrams"
      ON public.diagrams
      FOR UPDATE
      TO authenticated
      USING (
        user_id::text = auth.uid()::text
        OR EXISTS (
          SELECT 1
          FROM public.diagram_collaborators dc
          WHERE dc.diagram_id::text = diagrams.id::text
            AND dc.user_id::text = auth.uid()::text
            AND dc.role IN ('owner', 'editor')
        )
      )
      WITH CHECK (
        user_id::text = auth.uid()::text
        OR EXISTS (
          SELECT 1
          FROM public.diagram_collaborators dc
          WHERE dc.diagram_id::text = diagrams.id::text
            AND dc.user_id::text = auth.uid()::text
            AND dc.role IN ('owner', 'editor')
        )
      );
    ELSE
      CREATE POLICY "Users can read permitted diagrams"
      ON public.diagrams
      FOR SELECT
      TO authenticated
      USING (user_id::text = auth.uid()::text);

      DROP POLICY IF EXISTS "Users can update editable diagrams" ON public.diagrams;
      CREATE POLICY "Users can update editable diagrams"
      ON public.diagrams
      FOR UPDATE
      TO authenticated
      USING (user_id::text = auth.uid()::text)
      WITH CHECK (user_id::text = auth.uid()::text);
    END IF;

    DROP POLICY IF EXISTS "Users can delete own diagrams" ON public.diagrams;
    CREATE POLICY "Users can delete own diagrams"
    ON public.diagrams
    FOR DELETE
    TO authenticated
    USING (user_id::text = auth.uid()::text);
  END IF;

  IF to_regclass('public.diagram_versions') IS NOT NULL THEN
    ALTER TABLE public.diagram_versions ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can read permitted diagram versions" ON public.diagram_versions;
    DROP POLICY IF EXISTS "Users can insert own diagram versions" ON public.diagram_versions;

    IF to_regclass('public.diagrams') IS NOT NULL THEN
      IF has_diagram_collaborators THEN
        CREATE POLICY "Users can read permitted diagram versions"
        ON public.diagram_versions
        FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.diagrams d
            WHERE d.id::text = diagram_versions.diagram_id::text
              AND (
                d.user_id::text = auth.uid()::text
                OR EXISTS (
                  SELECT 1
                  FROM public.diagram_collaborators dc
                  WHERE dc.diagram_id::text = d.id::text
                    AND dc.user_id::text = auth.uid()::text
                )
              )
          )
        );

        CREATE POLICY "Users can insert own diagram versions"
        ON public.diagram_versions
        FOR INSERT
        TO authenticated
        WITH CHECK (
          author_id::text = auth.uid()::text
          AND EXISTS (
            SELECT 1
            FROM public.diagrams d
            WHERE d.id::text = diagram_versions.diagram_id::text
              AND (
                d.user_id::text = auth.uid()::text
                OR EXISTS (
                  SELECT 1
                  FROM public.diagram_collaborators dc
                  WHERE dc.diagram_id::text = d.id::text
                    AND dc.user_id::text = auth.uid()::text
                    AND dc.role IN ('owner', 'editor')
                )
              )
          )
        );
      ELSE
        CREATE POLICY "Users can read permitted diagram versions"
        ON public.diagram_versions
        FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.diagrams d
            WHERE d.id::text = diagram_versions.diagram_id::text
              AND d.user_id::text = auth.uid()::text
          )
        );

        CREATE POLICY "Users can insert own diagram versions"
        ON public.diagram_versions
        FOR INSERT
        TO authenticated
        WITH CHECK (
          author_id::text = auth.uid()::text
          AND EXISTS (
            SELECT 1
            FROM public.diagrams d
            WHERE d.id::text = diagram_versions.diagram_id::text
              AND d.user_id::text = auth.uid()::text
          )
        );
      END IF;
    END IF;
  END IF;

  IF has_diagram_collaborators THEN
    ALTER TABLE public.diagram_collaborators ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS adder_all ON public.diagram_collaborators;
    DROP POLICY IF EXISTS self_read ON public.diagram_collaborators;
    -- Management is available through the owner-checked RPCs below. A direct
    -- insert with added_by=auth.uid() must never grant access to another diagram.
    REVOKE ALL ON public.diagram_collaborators FROM anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.diagram_collaborators FROM authenticated;

    DROP POLICY IF EXISTS "Users can read own collaborations" ON public.diagram_collaborators;
    CREATE POLICY "Users can read own collaborations"
    ON public.diagram_collaborators
    FOR SELECT
    TO authenticated
    USING (user_id::text = auth.uid()::text OR added_by::text = auth.uid()::text);
  END IF;

  IF to_regclass('public.shared_diagrams') IS NOT NULL THEN
    ALTER TABLE public.shared_diagrams ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS creator_all ON public.shared_diagrams;
    DROP POLICY IF EXISTS read_active ON public.shared_diagrams;
    -- Possession of a token is checked by the scoped RPC, not by table listing.
    REVOKE ALL ON public.shared_diagrams FROM anon;
    REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.shared_diagrams FROM authenticated;

    DROP POLICY IF EXISTS "Users can manage own share links" ON public.shared_diagrams;
    CREATE POLICY "Users can manage own share links"
    ON public.shared_diagrams
    FOR ALL
    TO authenticated
    USING (
      created_by::text = auth.uid()::text
      AND EXISTS (
        SELECT 1
        FROM public.diagrams d
        WHERE d.id::text = shared_diagrams.diagram_id::text
          AND d.user_id::text = auth.uid()::text
      )
    )
    WITH CHECK (
      created_by::text = auth.uid()::text
      AND EXISTS (
        SELECT 1
        FROM public.diagrams d
        WHERE d.id::text = shared_diagrams.diagram_id::text
          AND d.user_id::text = auth.uid()::text
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.shared_diagrams') IS NOT NULL
     AND to_regclass('public.diagrams') IS NOT NULL THEN
    EXECUTE $function$
      CREATE OR REPLACE FUNCTION public.get_shared_diagram_by_token(p_share_token text)
      RETURNS TABLE(share jsonb, diagram jsonb)
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      AS $sql$
        SELECT
          to_jsonb(s) AS share,
          jsonb_build_object(
            'id', d.id,
            'title', d.title,
            'content', d.content,
            'updated_at', d.updated_at
          ) AS diagram
        FROM public.shared_diagrams s
        JOIN public.diagrams d ON d.id::text = s.diagram_id::text
        WHERE s.share_token = p_share_token
          AND s.is_active = true
          AND (s.expires_at IS NULL OR s.expires_at > now())
        LIMIT 1
      $sql$;
    $function$;

    REVOKE ALL ON FUNCTION public.get_shared_diagram_by_token(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.get_shared_diagram_by_token(text) TO anon, authenticated;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.diagram_collaborators') IS NOT NULL
     AND to_regclass('public.diagrams') IS NOT NULL
     AND to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE $function$
      CREATE OR REPLACE FUNCTION public.get_diagram_collaborators(p_diagram_id uuid)
      RETURNS TABLE(
        diagram_id uuid,
        user_id uuid,
        role text,
        added_by uuid,
        created_at timestamptz,
        email text
      )
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public, auth
      AS $sql$
        SELECT
          dc.diagram_id::uuid,
          dc.user_id::uuid,
          dc.role::text,
          dc.added_by::uuid,
          dc.created_at,
          u.email::text
        FROM public.diagram_collaborators dc
        LEFT JOIN auth.users u ON u.id::text = dc.user_id::text
        WHERE dc.diagram_id::text = p_diagram_id::text
          AND (
            EXISTS (
              SELECT 1
              FROM public.diagrams d
              WHERE d.id::text = p_diagram_id::text
                AND d.user_id::text = auth.uid()::text
            )
            OR EXISTS (
              SELECT 1
              FROM public.diagram_collaborators mine
              WHERE mine.diagram_id::text = p_diagram_id::text
                AND mine.user_id::text = auth.uid()::text
                AND mine.role = 'owner'
            )
          )
        ORDER BY
          CASE dc.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
          dc.created_at ASC
      $sql$;
    $function$;

    EXECUTE $function$
      CREATE OR REPLACE FUNCTION public.add_diagram_collaborator(
        p_diagram_id uuid,
        p_target_email text,
        p_role text DEFAULT 'viewer'
      )
      RETURNS json
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth
      AS $sql$
      DECLARE
        v_actor uuid := auth.uid();
        v_target_id uuid;
        v_role text := lower(trim(p_role));
        v_email text := lower(trim(p_target_email));
        v_is_owner boolean := false;
        v_existing_role text;
      BEGIN
        IF v_actor IS NULL THEN
          RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
        END IF;

        IF v_role IS NULL OR v_role NOT IN ('viewer', 'editor') THEN
          RETURN jsonb_build_object('success', false, 'error', 'Invalid collaborator role');
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.diagrams d
          WHERE d.id::text = p_diagram_id::text
            AND d.user_id::text = v_actor::text
        )
        OR EXISTS (
          SELECT 1
          FROM public.diagram_collaborators dc
          WHERE dc.diagram_id::text = p_diagram_id::text
            AND dc.user_id::text = v_actor::text
            AND dc.role = 'owner'
        )
        INTO v_is_owner;

        IF NOT v_is_owner THEN
          RETURN jsonb_build_object('success', false, 'error', 'Only the diagram owner can manage collaborators');
        END IF;

        SELECT u.id
        INTO v_target_id
        FROM auth.users u
        WHERE lower(u.email) = v_email
        LIMIT 1;

        IF v_target_id IS NULL THEN
          RETURN jsonb_build_object('success', false, 'error', 'User not found');
        END IF;

        IF v_target_id = v_actor THEN
          RETURN jsonb_build_object('success', false, 'error', 'Cannot invite yourself');
        END IF;

        SELECT dc.role
        INTO v_existing_role
        FROM public.diagram_collaborators dc
        WHERE dc.diagram_id::text = p_diagram_id::text
          AND dc.user_id::text = v_target_id::text
        ORDER BY CASE WHEN dc.role = 'owner' THEN 0 ELSE 1 END
        LIMIT 1;

        IF v_existing_role = 'owner' THEN
          RETURN jsonb_build_object('success', false, 'error', 'Cannot modify diagram owner');
        END IF;

        UPDATE public.diagram_collaborators
        SET role = v_role,
            added_by = v_actor,
            created_at = COALESCE(created_at, now())
        WHERE diagram_id::text = p_diagram_id::text
          AND user_id::text = v_target_id::text
          AND role <> 'owner'
          AND v_existing_role IS NOT NULL;

        IF NOT FOUND THEN
          INSERT INTO public.diagram_collaborators (diagram_id, user_id, role, added_by, created_at)
          VALUES (p_diagram_id, v_target_id, v_role, v_actor, now());
        END IF;

        RETURN jsonb_build_object('success', true, 'user_id', v_target_id::text);
      END
      $sql$;
    $function$;

    EXECUTE $function$
      CREATE OR REPLACE FUNCTION public.remove_diagram_collaborator(
        p_diagram_id uuid,
        p_target_user_id uuid
      )
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, auth
      AS $sql$
      DECLARE
        v_actor uuid := auth.uid();
        v_is_owner boolean := false;
        v_deleted_count integer := 0;
      BEGIN
        IF v_actor IS NULL THEN
          RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
        END IF;

        IF p_target_user_id = v_actor THEN
          RETURN jsonb_build_object('success', false, 'error', 'Cannot remove yourself');
        END IF;

        SELECT EXISTS (
          SELECT 1
          FROM public.diagrams d
          WHERE d.id::text = p_diagram_id::text
            AND d.user_id::text = v_actor::text
        )
        OR EXISTS (
          SELECT 1
          FROM public.diagram_collaborators dc
          WHERE dc.diagram_id::text = p_diagram_id::text
            AND dc.user_id::text = v_actor::text
            AND dc.role = 'owner'
        )
        INTO v_is_owner;

        IF NOT v_is_owner THEN
          RETURN jsonb_build_object('success', false, 'error', 'Only the diagram owner can manage collaborators');
        END IF;

        DELETE FROM public.diagram_collaborators
        WHERE diagram_id::text = p_diagram_id::text
          AND user_id::text = p_target_user_id::text
          AND role <> 'owner';

        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        RETURN jsonb_build_object('success', v_deleted_count > 0);
      END
      $sql$;
    $function$;

    REVOKE ALL ON FUNCTION public.get_diagram_collaborators(uuid) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.add_diagram_collaborator(uuid, text, text) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.remove_diagram_collaborator(uuid, uuid) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.get_diagram_collaborators(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.add_diagram_collaborator(uuid, text, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.remove_diagram_collaborator(uuid, uuid) TO authenticated;
  END IF;
END $$;

DROP POLICY "Users can read permitted diagram versions" ON public.diagram_versions;
DROP POLICY "Users can insert own diagram versions" ON public.diagram_versions;

-- Reviewable proposal only. Production has NOT been changed.
-- Preserve every version row. Historical versions become append-only for clients.
-- Requires the already deployed owner/collaborator policies on public.diagrams.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'diagram_versions'
      AND column_name = 'diagram_id' AND udt_name = 'uuid'
  ) THEN
    RAISE EXCEPTION 'Expected deployed UUID diagram_versions.diagram_id';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'diagram_versions'
      AND policyname NOT IN (
        'Enable all read access', 'Enable all insert access',
        'Enable all update access', 'Enable all delete access',
        'Permitted users can read diagram versions',
        'Editors can append own diagram versions'
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected version policies: review before migration';
  END IF;
END
$guard$;

ALTER TABLE public.diagram_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.diagram_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.diagram_versions TO authenticated;

DROP POLICY IF EXISTS "Enable all read access" ON public.diagram_versions;
DROP POLICY IF EXISTS "Enable all insert access" ON public.diagram_versions;
DROP POLICY IF EXISTS "Enable all update access" ON public.diagram_versions;
DROP POLICY IF EXISTS "Enable all delete access" ON public.diagram_versions;
DROP POLICY IF EXISTS "Permitted users can read diagram versions" ON public.diagram_versions;
DROP POLICY IF EXISTS "Editors can append own diagram versions" ON public.diagram_versions;

CREATE POLICY "Permitted users can read diagram versions"
ON public.diagram_versions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.diagrams d
    WHERE d.id = diagram_versions.diagram_id
      AND (
        d.user_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.diagram_collaborators dc
          WHERE dc.diagram_id = d.id AND dc.user_id = (SELECT auth.uid())
        )
      )
  )
);

CREATE POLICY "Editors can append own diagram versions"
ON public.diagram_versions FOR INSERT TO authenticated
WITH CHECK (
  author_id = (SELECT auth.uid())::text
  AND EXISTS (
    SELECT 1 FROM public.diagrams d
    WHERE d.id = diagram_versions.diagram_id
      AND (
        d.user_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.diagram_collaborators dc
          WHERE dc.diagram_id = d.id AND dc.user_id = (SELECT auth.uid())
            AND dc.role IN ('owner', 'editor')
        )
      )
  )
);

-- Covers parent lookup, foreign-key cleanup, and deterministic history paging.
CREATE INDEX IF NOT EXISTS diagram_versions_diagram_created_id_idx
ON public.diagram_versions (diagram_id, created_at DESC, id ASC);

REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
-- Exact client capabilities, independent of platform default privileges.
REVOKE ALL ON public.diagrams,public.diagram_collaborators,public.shared_diagrams,public.diagram_versions,
  public.system_templates,public.user_configs,public.ai_conversations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.diagrams,public.shared_diagrams,public.user_configs,public.ai_conversations TO authenticated;
GRANT SELECT ON public.diagram_collaborators TO authenticated;
GRANT SELECT,INSERT ON public.diagram_versions TO authenticated;
GRANT SELECT ON public.system_templates TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE ON public.system_templates TO authenticated;
GRANT ALL ON public.diagrams,public.diagram_collaborators,public.shared_diagrams,public.diagram_versions,
  public.system_templates,public.user_configs,public.ai_conversations TO service_role;
CREATE POLICY "Allow public read access to active templates" ON public.system_templates FOR SELECT TO anon,authenticated USING(is_active=true);
-- Align the two historical policy aliases without replaying seed migrations.
ALTER POLICY "Users can manage own configs" ON public.user_configs RENAME TO owner_all;
ALTER POLICY "Users can manage own AI conversations" ON public.ai_conversations RENAME TO "Users can manage their own conversations";

-- Supabase grants EXECUTE directly to clients; PUBLIC revocation is insufficient.
REVOKE ALL ON FUNCTION public.get_diagram_collaborators(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_diagram_collaborator(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_diagram_collaborator(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prevent_diagram_user_id_change() FROM PUBLIC, anon, authenticated;

-- Narrow proposal: system_templates only. No row data changes.
-- Public active-template reads remain governed by the existing SELECT policy.

SET LOCAL lock_timeout = '5s';
ALTER TABLE public.system_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow admins to manage templates" ON public.system_templates;
DROP POLICY IF EXISTS "Allow admin users to manage templates" ON public.system_templates;
CREATE POLICY "Allow admin users to manage templates"
ON public.system_templates FOR ALL TO authenticated
USING (COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin')
WITH CHECK (COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin');
-- TRUNCATE bypasses RLS; client roles have no operational need for it.
REVOKE TRUNCATE ON public.system_templates FROM PUBLIC, anon, authenticated;

-- Server collaboration schema migration; separate from diagram permission hardening.
-- Server-only RPCs. The backend still must authorize every room admission/write.

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

-- Preserve an already-correct policy on Supabase's platform-owned table.
-- A temporary owner-controlled policy supplies PostgreSQL's canonical expressions.
CREATE TEMP TABLE vizly_expected_realtime_topics (topic text) ON COMMIT DROP;
CREATE POLICY vizly_backend_topics_deny_clients ON vizly_expected_realtime_topics
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (topic IS NOT NULL AND topic !~ '^vizly-backend:')
  WITH CHECK (topic IS NOT NULL AND topic !~ '^vizly-backend:');
DO $backend_topic_policy$
DECLARE expected record; actual record; relation oid;
BEGIN
  relation := to_regclass('realtime.messages');
  IF relation IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
    WHERE c.oid=relation AND c.relkind IN ('r','p') AND c.relrowsecurity
      AND a.attname='topic' AND NOT a.attisdropped AND a.atttypid='text'::regtype
  ) THEN
    RAISE EXCEPTION 'Unsupported realtime messages shape or disabled RLS; platform owner must reconcile';
  END IF;
  SELECT polcmd,polpermissive,
    ARRAY(SELECT r FROM unnest(polroles) r ORDER BY r) AS roles,
    pg_catalog.pg_get_expr(polqual,polrelid) AS using_expression,
    pg_catalog.pg_get_expr(polwithcheck,polrelid) AS check_expression
  INTO expected FROM pg_catalog.pg_policy
  WHERE polrelid='pg_temp.vizly_expected_realtime_topics'::regclass
    AND polname='vizly_backend_topics_deny_clients';
  SELECT polcmd,polpermissive,
    ARRAY(SELECT r FROM unnest(polroles) r ORDER BY r) AS roles,
    pg_catalog.pg_get_expr(polqual,polrelid) AS using_expression,
    pg_catalog.pg_get_expr(polwithcheck,polrelid) AS check_expression
  INTO actual FROM pg_catalog.pg_policy
  WHERE polrelid=relation AND polname='vizly_backend_topics_deny_clients';
  IF FOUND THEN
    IF actual IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'Backend realtime policy differs from the reviewed contract; platform owner must reconcile';
    END IF;
    RETURN;
  END IF;
  BEGIN
    CREATE POLICY vizly_backend_topics_deny_clients ON realtime.messages
      AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (topic IS NOT NULL AND topic !~ '^vizly-backend:')
      WITH CHECK (topic IS NOT NULL AND topic !~ '^vizly-backend:');
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'Backend realtime policy missing; platform owner must install the reviewed policy';
  END;
END $backend_topic_policy$;

-- Performance migration: tested through the unified isolated RLS gate.
-- Production application status is recorded separately; this file is not a receipt.
-- Preserve the existing policy commands, roles and owner/editor predicates.
-- Template and version permission fixes are separate pending migrations.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER POLICY "Users can manage their own conversations" ON public.ai_conversations
USING ((SELECT auth.uid()) = user_id);
ALTER POLICY owner_all ON public.user_configs
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can insert own diagrams" ON public.diagrams
WITH CHECK (user_id::text = (SELECT auth.uid())::text);
ALTER POLICY "Users can delete own diagrams" ON public.diagrams
USING (user_id::text = (SELECT auth.uid())::text);
ALTER POLICY "Users can read permitted diagrams" ON public.diagrams
USING (user_id::text = (SELECT auth.uid())::text OR EXISTS (
  SELECT 1 FROM public.diagram_collaborators dc
  WHERE dc.diagram_id::text = diagrams.id::text AND dc.user_id::text = (SELECT auth.uid())::text
));
ALTER POLICY "Users can update editable diagrams" ON public.diagrams
USING (user_id::text = (SELECT auth.uid())::text OR EXISTS (
  SELECT 1 FROM public.diagram_collaborators dc
  WHERE dc.diagram_id::text = diagrams.id::text AND dc.user_id::text = (SELECT auth.uid())::text
    AND dc.role IN ('owner', 'editor')
))
WITH CHECK (user_id::text = (SELECT auth.uid())::text OR EXISTS (
  SELECT 1 FROM public.diagram_collaborators dc
  WHERE dc.diagram_id::text = diagrams.id::text AND dc.user_id::text = (SELECT auth.uid())::text
    AND dc.role IN ('owner', 'editor')
));
ALTER POLICY "Users can read own collaborations" ON public.diagram_collaborators
USING (user_id::text = (SELECT auth.uid())::text OR added_by::text = (SELECT auth.uid())::text);
ALTER POLICY "Users can manage own share links" ON public.shared_diagrams
USING (created_by::text = (SELECT auth.uid())::text AND EXISTS (
  SELECT 1 FROM public.diagrams d WHERE d.id::text = shared_diagrams.diagram_id
    AND d.user_id::text = (SELECT auth.uid())::text
))
WITH CHECK (created_by::text = (SELECT auth.uid())::text AND EXISTS (
  SELECT 1 FROM public.diagrams d WHERE d.id::text = shared_diagrams.diagram_id
    AND d.user_id::text = (SELECT auth.uid())::text
));

CREATE INDEX IF NOT EXISTS ai_conversations_user_id_idx ON public.ai_conversations (user_id);
CREATE INDEX IF NOT EXISTS diagram_collaborators_added_by_idx ON public.diagram_collaborators (added_by);
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.ai_conversations_user_id_idx','public.ai_conversations','user_id'),
      ('public.diagram_collaborators_added_by_idx','public.diagram_collaborators','added_by')
    ) expected(index_name,table_name,column_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_index i JOIN pg_attribute a
      ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
      WHERE i.indexrelid=to_regclass(expected.index_name)
        AND i.indrelid=to_regclass(expected.table_name)
        AND a.attname=expected.column_name AND i.indnkeyatts=1
        AND i.indisvalid AND i.indisready AND i.indexprs IS NULL AND i.indpred IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'RLS performance index shape mismatch';
  END IF;
END
$guard$;
-- diagram_versions(diagram_id,created_at DESC,id) already belongs to the
-- separately prepared version-permission migration; do not add a duplicate.


SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.diagram_collaborators IN ACCESS EXCLUSIVE MODE;
DO $guard$
DECLARE
  primary_constraint pg_constraint%ROWTYPE;
  duplicate_constraint pg_constraint%ROWTYPE;
  primary_index pg_index%ROWTYPE;
  duplicate_index pg_index%ROWTYPE;
BEGIN
  SELECT * INTO primary_constraint FROM pg_constraint
    WHERE conrelid = 'public.diagram_collaborators'::regclass AND contype = 'p';
  IF NOT FOUND OR primary_constraint.condeferrable OR NOT primary_constraint.convalidated
    OR (SELECT array_agg(a.attname::text ORDER BY k.ordinality)
      FROM unnest(primary_constraint.conkey) WITH ORDINALITY k(attnum, ordinality)
      JOIN pg_attribute a ON a.attrelid = primary_constraint.conrelid AND a.attnum = k.attnum)
      IS DISTINCT FROM ARRAY['diagram_id','user_id']::text[] THEN
    RAISE EXCEPTION 'Collaborator primary key shape mismatch';
  END IF;
  SELECT * INTO primary_index FROM pg_index WHERE indexrelid = primary_constraint.conindid;
  IF NOT FOUND OR NOT primary_index.indisvalid OR NOT primary_index.indisready
    OR NOT primary_index.indisunique OR primary_index.indpred IS NOT NULL
    OR primary_index.indexprs IS NOT NULL OR primary_index.indnatts <> 2 THEN
    RAISE EXCEPTION 'Collaborator primary index invalid';
  END IF;
  SELECT * INTO duplicate_constraint FROM pg_constraint
    WHERE conrelid = primary_constraint.conrelid
      AND conname = 'diagram_collaborators_diagram_id_user_id_key';
  IF NOT FOUND THEN
    IF to_regclass('public.diagram_collaborators_diagram_id_user_id_key') IS NOT NULL THEN
      RAISE EXCEPTION 'Collaborator duplicate constraint shape mismatch';
    END IF;
    RETURN;
  END IF;
  IF duplicate_constraint.contype <> 'u' OR duplicate_constraint.condeferrable
    OR NOT duplicate_constraint.convalidated
    OR duplicate_constraint.conkey IS DISTINCT FROM primary_constraint.conkey THEN
    RAISE EXCEPTION 'Collaborator duplicate constraint shape mismatch';
  END IF;
  SELECT * INTO duplicate_index FROM pg_index WHERE indexrelid = duplicate_constraint.conindid;
  IF NOT FOUND OR NOT duplicate_index.indisvalid OR NOT duplicate_index.indisready
    OR NOT duplicate_index.indisunique OR duplicate_index.indisreplident OR duplicate_index.indisclustered
    OR duplicate_index.indpred IS NOT NULL OR duplicate_index.indexprs IS NOT NULL
    OR duplicate_index.indnatts IS DISTINCT FROM primary_index.indnatts
    OR duplicate_index.indkey IS DISTINCT FROM primary_index.indkey
    OR duplicate_index.indclass IS DISTINCT FROM primary_index.indclass
    OR duplicate_index.indcollation IS DISTINCT FROM primary_index.indcollation
    OR duplicate_index.indoption IS DISTINCT FROM primary_index.indoption
    OR duplicate_index.indnullsnotdistinct IS DISTINCT FROM primary_index.indnullsnotdistinct THEN
    RAISE EXCEPTION 'Collaborator duplicate index shape mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_depend WHERE refclassid = 'pg_class'::regclass
      AND refobjid = duplicate_constraint.conindid)
    OR EXISTS (SELECT 1 FROM pg_depend WHERE refclassid = 'pg_constraint'::regclass
      AND refobjid = duplicate_constraint.oid
      AND NOT (classid = 'pg_class'::regclass AND objid = duplicate_constraint.conindid AND deptype = 'i'))
    OR EXISTS (SELECT 1 FROM pg_proc WHERE prokind IN ('f','p')
      AND position('diagram_collaborators_diagram_id_user_id_key' in prosrc) > 0) THEN
    RAISE EXCEPTION 'Collaborator duplicate constraint has dependencies';
  END IF;
  ALTER TABLE public.diagram_collaborators
    DROP CONSTRAINT diagram_collaborators_diagram_id_user_id_key;
END
$guard$;

DO $verify$
DECLARE item record; expression text; actual_count bigint; actual_digest text; qualified_name text;
BEGIN
  FOR item IN SELECT * FROM vizly_rows_before LOOP
    expression := CASE WHEN item.table_name='diagram_versions' THEN '(to_jsonb(t) - ''diagram_id'') || jsonb_build_object(''diagram_id'',t.diagram_id::uuid::text)' ELSE 'to_jsonb(t)' END;
    qualified_name := CASE WHEN item.table_name LIKE 'vizly_collaboration.%' THEN format('vizly_collaboration.%I',split_part(item.table_name,'.',2)) ELSE format('public.%I',item.table_name) END;
    EXECUTE format('SELECT count(*),md5(coalesce(string_agg(row_hash,'''' ORDER BY row_hash),'''')) FROM (SELECT md5((%s)::text) row_hash FROM %s t) rows',expression,qualified_name) INTO actual_count,actual_digest;
    IF actual_count<>item.row_count OR actual_digest<>item.digest THEN
      RAISE EXCEPTION 'Migration changed business rows in %; transaction rolled back',item.table_name;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN (SELECT table_name FROM vizly_rows_before) AND NOT c.relrowsecurity) THEN
    RAISE EXCEPTION 'Missing application RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM public.diagram_versions v LEFT JOIN public.diagrams d ON d.id=v.diagram_id WHERE d.id IS NULL) THEN
    RAISE EXCEPTION 'Version references changed during upgrade';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN (VALUES ('anon'),('authenticated')) role(name)
    WHERE n.nspname='public' AND c.relname IN (SELECT table_name FROM vizly_rows_before)
    AND (has_table_privilege(role.name,c.oid,'TRUNCATE') OR has_table_privilege(role.name,c.oid,'TRIGGER')
      OR has_table_privilege(role.name,c.oid,'REFERENCES'))) THEN
    RAISE EXCEPTION 'Excessive application table grants';
  END IF;
END $verify$;

DO $index_guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indexrelid=to_regclass('public.diagram_versions_diagram_created_id_idx')
    AND i.indrelid='public.diagram_versions'::regclass AND i.indisvalid AND i.indisready
    AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=3 AND i.indnatts=3
    AND i.indoption::text='0 3 0'
    AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality) FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ordinality)
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum)=ARRAY['diagram_id','created_at','id']) THEN
    RAISE EXCEPTION 'Version history index shape mismatch';
  END IF;
END $index_guard$;
