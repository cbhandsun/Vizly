import { readFileSync } from 'node:fs';

export function runRlsPerformanceRegression(runDocker, container) {
  const database = 'vizly_rls_performance_boundary';
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const sql = input => runDocker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1', '-qAt'], { input, maxBuffer: 4 * 1024 * 1024 });
  runDocker(['exec', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE DATABASE ' + database]);
  const bootstrap = read('../fixtures/rls-bootstrap.sql').replace(/^CREATE ROLE (?:anon|authenticated);\r?$/gm, '');
  sql(bootstrap + '\n' + read('../../supabase/migrations/20260611000000_harden_rls_policies.sql')
    + '\n' + read('../../supabase/migrations/20261008054418_revoke_explicit_anonymous_collaborator_rpc_grants.sql')
    + '\n' + read('../fixtures/rls-performance-bootstrap.sql'));
  const migration = read('../../supabase/migrations/20261009171828_optimize_rls_identity_indexes.sql');
  sql(migration); sql(migration);
  sql('BEGIN;\n' + read('../fixtures/rls-assertions.sql') + '\nROLLBACK;');
  sql(read('../fixtures/rls-performance-assertions.sql'));
  const report = JSON.parse(sql(`SET ROLE authenticated;
    SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
    EXPLAIN (ANALYZE,FORMAT JSON) SELECT count(*) FROM public.ai_conversations;`));
  if (!Array.isArray(report) || report.length !== 1) throw new Error('Invalid performance query plan');
  let singleIdentityPlan = false;
  const visit = (plan, depth = 0) => {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan) || depth > 16) throw new Error('Invalid performance plan node');
    if (plan['Parent Relationship'] === 'InitPlan' && plan['Actual Loops'] === 1) singleIdentityPlan = true;
    if (plan.Plans !== undefined && !Array.isArray(plan.Plans)) throw new Error('Invalid nested performance plans');
    for (const child of plan.Plans ?? []) visit(child, depth + 1);
  };
  visit(report[0]?.Plan);
  if (!singleIdentityPlan) throw new Error('Identity was not evaluated once as an InitPlan');
  sql(`ALTER POLICY "Users can manage their own conversations" ON public.ai_conversations USING(auth.uid()=user_id);
    DROP INDEX public.ai_conversations_user_id_idx;
    DROP INDEX public.diagram_collaborators_added_by_idx;
    CREATE INDEX diagram_collaborators_added_by_idx ON public.diagram_collaborators(user_id);`);
  const predicate = () => sql("SELECT qual FROM pg_policies WHERE schemaname='public' AND tablename='ai_conversations';");
  const before = predicate();
  let rejected = false;
  try { sql(migration); } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('RLS performance index shape mismatch')) throw error;
    rejected = true;
  }
  if (!rejected || predicate() !== before) throw new Error('Malformed index was admitted or policy rollback failed');
  sql("SELECT public.assert_rls(to_regclass('public.ai_conversations_user_id_idx') IS NULL,'failed migration rolled back index creation');");
}
