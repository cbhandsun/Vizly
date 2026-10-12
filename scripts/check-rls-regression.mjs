import { runDiagramVersionRlsRegression } from './lib/check-diagram-version-rls.mjs';
import { runTemplatePermissionRlsRegression } from './lib/check-template-permissions-rls.mjs';
import { runCollaborationAtomicStoreRegression } from './lib/check-collaboration-atomic-store.mjs';
import { runPrivateRoomNoticeRlsRegression } from './lib/check-private-room-notice-rls.mjs';
import { runRlsPerformanceRegression } from './lib/check-rls-performance.mjs';
import { runCollaboratorDuplicateIndexRegression } from './lib/check-collaborator-duplicate-index.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { waitForIsolatedPostgres } from './lib/isolatedPostgresReadiness.mjs';

const container = `vizly-rls-regression-${process.pid}`;
// Match the production major/minor version and pin the accepted image manifest.
const postgresImage = 'postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94';
const runDocker = (args, options = {}) => {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 60_000, ...options });
  if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr ?? 'Docker command failed');
  return result.stdout;
};
let started = false;
try {
  runDocker(['run', '--detach', '--name', container, '--network', 'none', '--tmpfs', '/var/lib/postgresql/data', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', postgresImage]);
  started = true;
  await waitForIsolatedPostgres({ container,
    probe: args => spawnSync('docker', args, { encoding: 'utf8', timeout: 5000 }),
  });
  const fixture = readFileSync(new URL('./fixtures/rls-bootstrap.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../supabase/migrations/20260611000000_harden_rls_policies.sql', import.meta.url), 'utf8');
  const assertions = readFileSync(new URL('./fixtures/rls-assertions.sql', import.meta.url), 'utf8');
  const rpcGrants = readFileSync(new URL('../supabase/migrations/20261008054418_revoke_explicit_anonymous_collaborator_rpc_grants.sql', import.meta.url), 'utf8');
  runDocker(['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: `${fixture}\n${migration}\n${rpcGrants}\n${migration}\n${rpcGrants}\n${assertions}`, maxBuffer: 4 * 1024 * 1024 });
  runDiagramVersionRlsRegression(runDocker, container);
  runTemplatePermissionRlsRegression(runDocker, container);
  await runCollaborationAtomicStoreRegression(runDocker, container);
  runPrivateRoomNoticeRlsRegression(runDocker, container);
  runRlsPerformanceRegression(runDocker, container);
  runCollaboratorDuplicateIndexRegression(runDocker, container);
  process.stdout.write('RLS regression passed: diagram/share/version/template permissions, atomic room RPC grants and concurrent CAS, private backend topic isolation, anonymous reads, spoofed claims, CRUD, repeated migrations, identity InitPlan/index guards, duplicate constraint dependency/replica guards and transaction rollback verified.\n');
} finally {
  if (started) runDocker(['rm', '--force', container]);
}
