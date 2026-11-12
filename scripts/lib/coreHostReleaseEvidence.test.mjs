import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { CORE_HOST_GATES, coreHostReleaseFacts } from './coreHostReleaseEvidence.mjs';
import { syntheticCoreHostReport } from './releaseEvidenceFixture.mjs';

const identity = { core: { repository: 'test/core', commit: 'a'.repeat(40), tree: 'b'.repeat(40), lockSha256: 'c'.repeat(64), clean: true },
  app: { repository: 'test/app', commit: 'd'.repeat(40), tree: 'e'.repeat(40), lockSha256: 'f'.repeat(64), clean: true }, sdkSha256: '1'.repeat(64) };
const roots = [], run = promisify(execFile), cli = join(process.cwd(), 'scripts/import-core-host-release-evidence.mjs');
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

it('binds host and all repeated performance gates to the Core job, App snapshot and SDK', () => {
  const facts = coreHostReleaseFacts(syntheticCoreHostReport(identity), { identity });
  expect(facts.map(fact => fact.id)).toEqual(CORE_HOST_GATES);
  expect(facts.every(fact => fact.commit === identity.core.commit && fact.jobId === '41'
    && fact.workflow === 'devfleet-host-performance.yaml')).toBe(true);
});

it.each(['provider', 'repository', 'workflow', 'run', 'queued', 'aggregate', 'duplicate-job', 'missing-job',
  'core-source', 'core-tree', 'core-lock', 'dirty', 'runtime', 'app-source', 'app-tree', 'app-lock',
  'sdk', 'preparation', 'preparation-failed', 'installed', 'source-drift', 'cleanup', 'chrome',
  'missing-gate', 'duplicate-gate', 'argv', 'exit', 'status', 'port', 'hash', 'duration',
  'journeys', 'startup', 'samples', 'duplicate-group', 'profile', 'worker', 'cache', 'drag', 'browser'])(
  'rejects %s host evidence even when the overall result says passed', scenario => {
    const raw = syntheticCoreHostReport(identity), result = raw.jobs[0].host_result;
    const nav = result.gates.find(gate => gate.id === 'core-performance-navigation');
    if (scenario === 'provider') raw.provider = 'github';
    if (scenario === 'repository') raw.repository = 'other/core';
    if (scenario === 'workflow') raw.workflow = 'devfleet-native.yaml';
    if (scenario === 'run') raw.run.head_sha = '0'.repeat(40);
    if (scenario === 'queued') raw.jobs[0].status = 'queued';
    if (scenario === 'aggregate') raw.jobs[1].conclusion = 'failure';
    if (scenario === 'duplicate-job') raw.jobs[1].id = raw.jobs[0].id;
    if (scenario === 'missing-job') raw.jobs.pop();
    if (scenario === 'core-source') result.source_after = '0'.repeat(40);
    if (scenario === 'core-tree') result.tree_after = '0'.repeat(40);
    if (scenario === 'core-lock') result.lock_sha256_after = '0'.repeat(64);
    if (scenario === 'dirty') result.working_tree_after = ['dirty'];
    if (scenario === 'runtime') result.os = 'Linux';
    if (scenario === 'app-source') result.app_source.commit = '0'.repeat(40);
    if (scenario === 'app-tree') result.app_source.tree = '0'.repeat(40);
    if (scenario === 'app-lock') result.app_source.lock_sha256 = '0'.repeat(64);
    if (scenario === 'sdk') result.sdk_sha256 = '0'.repeat(64);
    if (scenario === 'preparation') result.preparation.pop();
    if (scenario === 'preparation-failed') result.preparation[1].exit_code = 1;
    if (scenario === 'installed') result.installed_sdk_files = 0;
    if (scenario === 'source-drift') result.host_source_digest_after = '0'.repeat(64);
    if (scenario === 'cleanup') result.owned_host_dependencies_removed = false;
    if (scenario === 'chrome') result.chrome_binary_sha256_after = '0'.repeat(64);
    if (scenario === 'missing-gate') result.gates.pop();
    if (scenario === 'duplicate-gate') result.gates[1] = result.gates[0];
    if (scenario === 'argv') nav.argv.push('--skip-check');
    if (scenario === 'exit') nav.exit_code = 1;
    if (scenario === 'status') nav.status = 'failed';
    if (scenario === 'port') nav.owned_port_released = false;
    if (scenario === 'hash') nav.evidence_sha256 = 'invalid';
    if (scenario === 'duration') nav.seconds = -1;
    if (scenario === 'journeys') result.gates[0].summary.journeys.pop();
    if (scenario === 'startup') result.gates[0].summary.startupCases = 5;
    if (scenario === 'samples') nav.summary.sampleCount = 4;
    if (scenario === 'duplicate-group') nav.summary.groups[1] = structuredClone(nav.summary.groups[0]);
    if (scenario === 'profile') delete nav.summary.groups[0].graphProfile;
    if (scenario === 'worker') nav.summary.groups[0].workerRouting.maxMs = 751;
    if (scenario === 'cache') nav.summary.groups[0].validatedCacheCount = 5;
    if (scenario === 'drag') result.gates.find(gate => gate.id === 'core-performance-business').summary.groups[0]
      .metrics.localRoute = { sampleCount: 5, medianMs: 10, p95Ms: 151, maxMs: 151, budgetMs: 150, passed: true };
    if (scenario === 'browser') nav.summary.browser = { product: 'Chrome/1.0.0.0', revision: 'other' };
    expect(() => coreHostReleaseFacts(raw, { identity })).toThrow('Core host release evidence');
  },
);

it('imports complete host evidence once without replacing previous attempts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vizly-core-host-import-')); roots.push(root);
  const selected = join(root, 'identity.json'), raw = join(root, 'raw.json'), output = join(root, 'reports');
  await writeFile(selected, JSON.stringify(identity)); await writeFile(raw, JSON.stringify(syntheticCoreHostReport(identity)));
  const result = await run(process.execPath, [cli, selected, raw, output]);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: 'imported-core-host-only', gates: 5, runId: '678' });
  const initial = await readFile(join(output, 'core-host-import.json'), 'utf8');
  expect(JSON.parse(initial).gates.map(gate => gate.id)).toEqual(CORE_HOST_GATES);
  await expect(run(process.execPath, [cli, selected, raw, output])).rejects.toThrow();
  expect(await readFile(join(output, 'core-host-import.json'), 'utf8')).toBe(initial);
});

it('creates no passing release wrapper for a stale App snapshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vizly-core-host-reject-')); roots.push(root);
  const selected = join(root, 'identity.json'), raw = join(root, 'raw.json'), output = join(root, 'reports');
  const report = syntheticCoreHostReport(identity); report.jobs[0].host_result.app_source.commit = '0'.repeat(40);
  await writeFile(selected, JSON.stringify(identity)); await writeFile(raw, JSON.stringify(report));
  await expect(run(process.execPath, [cli, selected, raw, output])).rejects.toThrow();
  await expect(stat(output)).rejects.toThrow();
});
