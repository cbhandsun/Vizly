-- Supabase grants EXECUTE directly to clients; PUBLIC revocation is insufficient.
REVOKE ALL ON FUNCTION public.get_diagram_collaborators(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_diagram_collaborator(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_diagram_collaborator(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.prevent_diagram_user_id_change() FROM PUBLIC, anon, authenticated;
