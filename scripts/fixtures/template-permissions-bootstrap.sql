
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT COALESCE(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
CREATE TABLE public.system_templates(id text PRIMARY KEY,title text NOT NULL,content jsonb NOT NULL,is_active boolean DEFAULT true);
GRANT ALL ON public.system_templates TO anon,authenticated,service_role;
ALTER TABLE public.system_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow admins to manage templates" ON public.system_templates FOR ALL
 USING(auth.role()='authenticated') WITH CHECK(auth.role()='authenticated');
CREATE POLICY "Allow public read access to active templates" ON public.system_templates FOR SELECT USING(is_active=true);
INSERT INTO public.system_templates VALUES ('active','fixture','{}',true),('inactive','fixture','{}',false);
CREATE FUNCTION public.assert_template(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Template assertion: %',message; END IF; END $$;

