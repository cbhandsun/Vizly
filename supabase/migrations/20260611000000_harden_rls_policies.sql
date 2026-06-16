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

    DROP POLICY IF EXISTS "Users can read own collaborations" ON public.diagram_collaborators;
    CREATE POLICY "Users can read own collaborations"
    ON public.diagram_collaborators
    FOR SELECT
    TO authenticated
    USING (user_id::text = auth.uid()::text OR added_by::text = auth.uid()::text);
  END IF;

  IF to_regclass('public.shared_diagrams') IS NOT NULL THEN
    ALTER TABLE public.shared_diagrams ENABLE ROW LEVEL SECURITY;

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
        diagram_id text,
        user_id text,
        role text,
        added_by text,
        created_at timestamptz,
        email text
      )
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public, auth
      AS $sql$
        SELECT
          dc.diagram_id::text,
          dc.user_id::text,
          dc.role::text,
          dc.added_by::text,
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
      RETURNS jsonb
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

        IF v_role NOT IN ('viewer', 'editor') THEN
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

    REVOKE ALL ON FUNCTION public.get_diagram_collaborators(uuid) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.add_diagram_collaborator(uuid, text, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.remove_diagram_collaborator(uuid, uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.get_diagram_collaborators(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.add_diagram_collaborator(uuid, text, text) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.remove_diagram_collaborator(uuid, uuid) TO authenticated;
  END IF;
END $$;
