-- Synthetic fixture matching the live version table shape; no production rows.
CREATE TABLE public.diagram_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagram_id uuid NOT NULL REFERENCES public.diagrams(id) ON DELETE CASCADE,
  author_id text, message text, snapshot_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.diagram_versions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.diagram_versions TO anon, authenticated;
CREATE POLICY "Enable all read access" ON public.diagram_versions FOR SELECT USING (true);
CREATE POLICY "Enable all insert access" ON public.diagram_versions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable all update access" ON public.diagram_versions FOR UPDATE USING (true);
CREATE POLICY "Enable all delete access" ON public.diagram_versions FOR DELETE USING (true);
INSERT INTO auth.users VALUES ('44444444-4444-4444-8444-444444444444','editor@example.invalid');
INSERT INTO public.diagram_collaborators (diagram_id,user_id,role,added_by) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','viewer','11111111-1111-4111-8111-111111111111'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','editor','11111111-1111-4111-8111-111111111111');
INSERT INTO public.diagram_versions (id,diagram_id,author_id,snapshot_data) VALUES
('aaaaaaaa-0000-4000-8000-000000000011','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','{"nodes":[],"edges":[]}'),
('bbbbbbbb-0000-4000-8000-000000000011','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','{"nodes":[],"edges":[]}');
-- Synthetic pre-fix proof: the deployed grants/policies expose other histories.
SET ROLE anon;
SELECT public.assert_rls((SELECT count(*)=2 FROM public.diagram_versions),'pre-fix anonymous cross-account history exposure');
RESET ROLE;
-- Separate psql calls validate guards and the migration; retain the baseline
-- in a PostgreSQL-only fixture schema instead of a session-local temp table.
CREATE SCHEMA version_test;
CREATE TABLE version_test.rows_before AS TABLE public.diagram_versions;
