-- Reviewable proposal only. Production has NOT been changed.
-- Preserve every version row. Historical versions become append-only for clients.
-- Requires the already deployed owner/collaborator policies on public.diagrams.
BEGIN;
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
COMMIT;
