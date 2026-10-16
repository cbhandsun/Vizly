import { readFileSync } from 'node:fs';

// Run against a clean database in the already-owned, network-isolated container.
// This preserves the existing diagrams/shares/RPC regression and fixture state.
export function runDiagramVersionRlsRegression(runDocker, container) {
  const database = 'vizly_version_boundary';
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const sql = input => runDocker(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database,
    '-v', 'ON_ERROR_STOP=1'], { input, maxBuffer: 4 * 1024 * 1024 });
  runDocker(['exec', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE DATABASE ' + database]);
  // PostgreSQL roles are cluster-wide and were created by the first suite.
  // Recreate the database-local schema and fixtures without redefining roles.
  const bootstrap = read('../fixtures/rls-bootstrap.sql')
    .replace(/^CREATE ROLE (?:anon|authenticated);\r?$/gm, '');
  sql(bootstrap
    + '\n' + read('../../supabase/migrations/20260611000000_harden_rls_policies.sql')
    + '\n' + read('../../supabase/migrations/20261008054418_revoke_explicit_anonymous_collaborator_rpc_grants.sql')
    + '\n' + read('../fixtures/version-permissions-bootstrap.sql'));
  const migration = read('../../supabase/migrations/20261008202340_harden_diagram_version_permissions.sql');
  const assertRejected = (input, expected) => {
    try { sql(input); }
    catch (error) {
      if (!(error instanceof Error) || !error.message.includes(expected)) throw error;
      return;
    }
    throw new Error('Version migration guard unexpectedly accepted input');
  };
  sql('CREATE POLICY unexpected_policy ON public.diagram_versions FOR SELECT USING(true);');
  assertRejected(migration, 'Unexpected version policies');
  sql('DROP POLICY unexpected_policy ON public.diagram_versions;');
  assertRejected('BEGIN; ALTER TABLE public.diagram_versions DROP CONSTRAINT diagram_versions_diagram_id_fkey; '
    + 'ALTER TABLE public.diagram_versions ALTER COLUMN diagram_id TYPE text USING diagram_id::text;\n' + migration,
    'Expected deployed UUID');
  sql(migration + '\n' + migration + '\n' + read('../fixtures/version-permissions-assertions.sql'));
}
