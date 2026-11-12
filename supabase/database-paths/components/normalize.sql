-- Only policy names admitted by preflight may be replaced. Never use CASCADE.
DO $policies$
DECLARE item record;
BEGIN
  FOR item IN SELECT p.tablename,p.policyname FROM pg_policies p JOIN vizly_expected_policies e
    ON e.table_name=p.tablename AND e.policy_name=p.policyname WHERE p.schemaname='public' LOOP
    EXECUTE format('DROP POLICY %I ON public.%I',item.policyname,item.tablename);
  END LOOP;
END $policies$;
CREATE TABLE IF NOT EXISTS vizly_migrations.version_reference_map (
  version_id uuid PRIMARY KEY, original_diagram_id text NOT NULL, canonical_diagram_id uuid NOT NULL,
  mapped_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE vizly_migrations.version_reference_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vizly_migrations.version_reference_map FROM PUBLIC,anon,authenticated,service_role;
DO $normalize$
BEGIN
  IF (SELECT udt_name FROM information_schema.columns WHERE table_schema='public'
    AND table_name='diagram_versions' AND column_name='diagram_id')='text' THEN
    INSERT INTO vizly_migrations.version_reference_map(version_id,original_diagram_id,canonical_diagram_id)
      SELECT id,diagram_id,diagram_id::uuid FROM public.diagram_versions;
    ALTER TABLE public.diagram_versions ALTER COLUMN diagram_id TYPE uuid USING diagram_id::uuid;
  END IF;
  -- UUID conversation IDs remain byte-for-byte JSON strings after widening to TEXT;
  -- the application also creates conv_* IDs. Dependent unknown objects fail safely.
  IF (SELECT udt_name FROM information_schema.columns WHERE table_schema='public'
    AND table_name='ai_conversations' AND column_name='id')='uuid' THEN
    ALTER TABLE public.ai_conversations ALTER COLUMN id TYPE text USING id::text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.diagram_versions'::regclass
    AND c.contype='f' AND c.confrelid='public.diagrams'::regclass
    AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='diagram_id')]::smallint[]
    AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.confrelid AND attname='id')]::smallint[]
    AND c.convalidated) THEN
    ALTER TABLE public.diagram_versions ADD CONSTRAINT vizly_versions_parent_fk FOREIGN KEY(diagram_id) REFERENCES public.diagrams(id) ON DELETE CASCADE;
  END IF;
END $normalize$;
