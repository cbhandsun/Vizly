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
