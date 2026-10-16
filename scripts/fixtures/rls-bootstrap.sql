CREATE ROLE anon;
CREATE ROLE authenticated;
-- Supabase grants client EXECUTE explicitly, including on newly created RPCs.
-- Revoking PUBLIC alone must not accidentally pass this upgrade regression.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE TABLE public.diagrams (id uuid PRIMARY KEY, user_id uuid, title text, content jsonb, updated_at timestamptz);
CREATE TABLE public.diagram_collaborators (diagram_id uuid REFERENCES public.diagrams, user_id uuid, role text, added_by uuid, created_at timestamptz, PRIMARY KEY(diagram_id, user_id));
CREATE TABLE public.shared_diagrams (id uuid PRIMARY KEY, diagram_id text, created_by uuid, share_token text, is_active boolean, expires_at timestamptz, created_at timestamptz DEFAULT now());
GRANT ALL ON public.diagrams, public.diagram_collaborators, public.shared_diagrams TO anon, authenticated;
ALTER TABLE public.diagrams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagram_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_diagrams ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_all ON public.diagrams FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY collaborator_read ON public.diagrams FOR SELECT USING (EXISTS(SELECT 1 FROM public.diagram_collaborators dc WHERE dc.diagram_id = diagrams.id AND dc.user_id = auth.uid()));
CREATE POLICY adder_all ON public.diagram_collaborators FOR ALL USING (auth.uid() = added_by) WITH CHECK (auth.uid() = added_by);
CREATE POLICY self_read ON public.diagram_collaborators FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY creator_all ON public.shared_diagrams FOR ALL USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY read_active ON public.shared_diagrams FOR SELECT USING (is_active = true);
INSERT INTO auth.users VALUES
('11111111-1111-4111-8111-111111111111', 'owner@example.invalid'),
('22222222-2222-4222-8222-222222222222', 'outsider@example.invalid'),
('33333333-3333-4333-8333-333333333333', 'viewer@example.invalid');
INSERT INTO public.diagrams VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Owner diagram', '{}'::jsonb, now()),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Outsider diagram', '{}'::jsonb, now());
INSERT INTO public.shared_diagrams (id, diagram_id, created_by, share_token, is_active, expires_at) VALUES
('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'fixture-active', true, now()+interval '1 day'),
('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'fixture-expired', true, now()-interval '1 day'),
('aaaaaaaa-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'fixture-inactive', false, null);
-- The deployed RPCs predate this migration. Upgrade acceptance must include
-- their actual return signatures: CREATE OR REPLACE cannot change them.
CREATE FUNCTION public.get_diagram_collaborators(p_diagram_id uuid)
RETURNS TABLE(diagram_id uuid, user_id uuid, role text, added_by uuid, created_at timestamptz, email text)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT dc.diagram_id, dc.user_id, dc.role, dc.added_by, dc.created_at, u.email
  FROM public.diagram_collaborators dc
  LEFT JOIN auth.users u ON u.id = dc.user_id
  WHERE dc.diagram_id = p_diagram_id
$$;
CREATE FUNCTION public.add_diagram_collaborator(p_diagram_id uuid, p_target_email text, p_role text DEFAULT 'viewer')
RETURNS json LANGUAGE sql SECURITY DEFINER AS $$
  SELECT json_build_object('success', false, 'error', 'Legacy fixture')
$$;
CREATE FUNCTION public.assert_rls(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'RLS assertion: %', message; END IF; END $$;
