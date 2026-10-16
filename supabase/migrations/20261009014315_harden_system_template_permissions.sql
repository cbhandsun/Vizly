-- Narrow proposal: system_templates only. No row data changes.
-- Public active-template reads remain governed by the existing SELECT policy.
BEGIN;
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
COMMIT;
