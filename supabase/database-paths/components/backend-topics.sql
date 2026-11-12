-- Preserve an already-correct policy on Supabase's platform-owned table.
-- A temporary owner-controlled policy supplies PostgreSQL's canonical expressions.
CREATE TEMP TABLE vizly_expected_realtime_topics (topic text) ON COMMIT DROP;
CREATE POLICY vizly_backend_topics_deny_clients ON vizly_expected_realtime_topics
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (topic IS NOT NULL AND topic !~ '^vizly-backend:')
  WITH CHECK (topic IS NOT NULL AND topic !~ '^vizly-backend:');
DO $backend_topic_policy$
DECLARE expected record; actual record; relation oid;
BEGIN
  relation := to_regclass('realtime.messages');
  IF relation IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
    WHERE c.oid=relation AND c.relkind IN ('r','p') AND c.relrowsecurity
      AND a.attname='topic' AND NOT a.attisdropped AND a.atttypid='text'::regtype
  ) THEN
    RAISE EXCEPTION 'Unsupported realtime messages shape or disabled RLS; platform owner must reconcile';
  END IF;
  SELECT polcmd,polpermissive,
    ARRAY(SELECT r FROM unnest(polroles) r ORDER BY r) AS roles,
    pg_catalog.pg_get_expr(polqual,polrelid) AS using_expression,
    pg_catalog.pg_get_expr(polwithcheck,polrelid) AS check_expression
  INTO expected FROM pg_catalog.pg_policy
  WHERE polrelid='pg_temp.vizly_expected_realtime_topics'::regclass
    AND polname='vizly_backend_topics_deny_clients';
  SELECT polcmd,polpermissive,
    ARRAY(SELECT r FROM unnest(polroles) r ORDER BY r) AS roles,
    pg_catalog.pg_get_expr(polqual,polrelid) AS using_expression,
    pg_catalog.pg_get_expr(polwithcheck,polrelid) AS check_expression
  INTO actual FROM pg_catalog.pg_policy
  WHERE polrelid=relation AND polname='vizly_backend_topics_deny_clients';
  IF FOUND THEN
    IF actual IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'Backend realtime policy differs from the reviewed contract; platform owner must reconcile';
    END IF;
    RETURN;
  END IF;
  BEGIN
    CREATE POLICY vizly_backend_topics_deny_clients ON realtime.messages
      AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (topic IS NOT NULL AND topic !~ '^vizly-backend:')
      WITH CHECK (topic IS NOT NULL AND topic !~ '^vizly-backend:');
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'Backend realtime policy missing; platform owner must install the reviewed policy';
  END;
END $backend_topic_policy$;
