-- Performance migration: tested through the unified isolated RLS gate.
-- Production application status is recorded separately; this file is not a receipt.
-- Preserve the existing policy commands, roles and owner/editor predicates.
-- Template and version permission fixes are separate pending migrations.
BEGIN;
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
COMMIT;
