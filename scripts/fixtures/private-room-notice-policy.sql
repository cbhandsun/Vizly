-- Review candidate only; unapplied. Integrate into the owned database regression
-- and generate a proper migration with the CLI before production deployment.
-- Existing permissive realtime policies are OR-combined. A restrictive policy
-- fences backend topics even when a broad user-facing permissive policy exists.
-- service_role bypasses RLS; no client receives a backend secret/JWT.
BEGIN;
DROP POLICY IF EXISTS vizly_backend_topics_deny_clients ON realtime.messages;
CREATE POLICY vizly_backend_topics_deny_clients ON realtime.messages
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (topic IS NOT NULL AND topic !~ '^vizly-backend:')
  WITH CHECK (topic IS NOT NULL AND topic !~ '^vizly-backend:');
COMMIT;
