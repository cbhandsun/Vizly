-- Generated from reviewed components and hash-pinned historical definitions.
-- Apply only through scripts/database-path.mjs inside its single transaction.
-- Empty-database baseline. Supabase owns auth/realtime schemas and client roles.
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN
      ('diagrams','diagram_collaborators','shared_diagrams','diagram_versions','system_templates','user_configs','ai_conversations')) THEN
    RAISE EXCEPTION 'Baseline requires an empty application schema; use the upgrade path';
  END IF;
  IF to_regclass('auth.users') IS NULL OR to_regclass('realtime.messages') IS NULL
    OR to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.jwt()') IS NULL THEN
    RAISE EXCEPTION 'Supabase platform schemas and roles must exist before application bootstrap';
  END IF;
END $guard$;
CREATE TABLE public.diagrams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL, content jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.diagram_collaborators (
  diagram_id uuid NOT NULL REFERENCES public.diagrams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id), role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  added_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (diagram_id,user_id)
);
CREATE TABLE public.shared_diagrams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), diagram_id text NOT NULL, created_by uuid NOT NULL REFERENCES auth.users(id),
  share_token text NOT NULL UNIQUE, is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.diagram_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), diagram_id uuid NOT NULL REFERENCES public.diagrams(id) ON DELETE CASCADE,
  snapshot_data jsonb NOT NULL, author_id text, created_at timestamptz NOT NULL DEFAULT now(), message text
);
CREATE TABLE public.system_templates (
  id text PRIMARY KEY, title text NOT NULL, content jsonb NOT NULL, is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(), description text, category text, tags text[], sort_order integer DEFAULT 0, thumbnail_url text
);
CREATE TABLE public.user_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
  key text NOT NULL, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id,key)
);
CREATE TABLE public.ai_conversations (
  id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id), title text NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
-- No client grants until the forward security contract is installed in the same transaction.
ALTER TABLE public.diagrams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagram_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_diagrams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagram_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.diagrams,public.diagram_collaborators,public.shared_diagrams,public.diagram_versions,
  public.system_templates,public.user_configs,public.ai_conversations FROM PUBLIC,anon,authenticated;
