import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { CORE_QUALITY_GATES, coreQualityReleaseFacts } from './coreQualityReleaseEvidence.mjs';
import { syntheticCoreQualityReport } from './releaseEvidenceFixture.mjs';

const identity = { core: { repository: 'test/core', commit: 'a'.repeat(40), tree: 'b'.repeat(40), lockSha256: 'c'.repeat(64), clean: true } };
const roots = [], run = promisify(execFile), cli = join(process.cwd(), 'scripts/import-core-quality-release-evidence.mjs');
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
it('binds all six engineering gates to the actual successful quality job and aggregate', () => {
  const facts = coreQualityReleaseFacts(syntheticCoreQualityReport(identity), { identity });
  expect(facts.map(fact => fact.id)).toEqual(CORE_QUALITY_GATES);
  expect(facts.every(fact => fact.jobId === '31' && fact.commit === identity.core.commit && fact.workflow === 'devfleet-quality.yaml')).toBe(true);
});
it.each(['provider', 'repository', 'workflow', 'run-failed', 'source', 'tree', 'lock', 'dirty', 'runtime', 'install',
  'queued', 'aggregate', 'missing-job', 'duplicate-job', 'missing-gate', 'duplicate-gate', 'failed-gate', 'argv', 'duration'])(
  'rejects %s evidence even with a passing original summary', scenario => {
    const raw = syntheticCoreQualityReport(identity), result = raw.jobs[0].quality_result;
    if (scenario === 'provider') raw.provider = 'github';
    if (scenario === 'repository') raw.repository = 'other/core';
    if (scenario === 'workflow') raw.workflow = 'devfleet-native.yaml';
    if (scenario === 'run-failed') raw.run.conclusion = 'failure';
    if (scenario === 'source') result.source_after = 'd'.repeat(40);
    if (scenario === 'tree') result.tree_after = 'd'.repeat(40);
    if (scenario === 'lock') result.lock_sha256_after = 'd'.repeat(64);
    if (scenario === 'dirty') result.working_tree_after = ['dirty'];
    if (scenario === 'runtime') result.npm = '11.0.0';
    if (scenario === 'install') result.installation_exit_code = 1;
    if (scenario === 'queued') raw.jobs[0].status = 'queued';
    if (scenario === 'aggregate') raw.jobs[1].conclusion = 'failure';
    if (scenario === 'missing-job') raw.jobs.pop();
    if (scenario === 'duplicate-job') raw.jobs[1].id = raw.jobs[0].id;
    if (scenario === 'missing-gate') result.gates.pop();
    if (scenario === 'duplicate-gate') result.gates[1] = result.gates[0];
    if (scenario === 'failed-gate') result.gates[0].exit_code = 1;
    if (scenario === 'argv') result.gates[0].argv.push('--skip-check');
    if (scenario === 'duration') result.gates[0].seconds = -1;
    expect(() => coreQualityReleaseFacts(raw, { identity })).toThrow('Core quality release evidence');
  },
);
it('imports six wrappers once and refuses to overwrite an earlier attempt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vizly-core-quality-')); roots.push(root);
  const selected = join(root, 'identity.json'), raw = join(root, 'raw.json'), output = join(root, 'reports');
  await writeFile(selected, JSON.stringify(identity)); await writeFile(raw, JSON.stringify(syntheticCoreQualityReport(identity)));
  const result = await run(process.execPath, [cli, selected, raw, output]);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: 'imported-core-quality-only', gates: 6, runId: '567' });
  const initial = await readFile(join(output, 'core-quality-import.json'), 'utf8');
  expect(JSON.parse(initial).gates.map(gate => gate.id)).toEqual(CORE_QUALITY_GATES);
  await expect(run(process.execPath, [cli, selected, raw, output])).rejects.toThrow();
  expect(await readFile(join(output, 'core-quality-import.json'), 'utf8')).toBe(initial);
});
it('creates no passing output for an incomplete run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vizly-core-quality-failed-')); roots.push(root);
  const selected = join(root, 'identity.json'), raw = join(root, 'raw.json'), output = join(root, 'reports');
  const report = syntheticCoreQualityReport(identity); report.jobs.pop();
  await writeFile(selected, JSON.stringify(identity)); await writeFile(raw, JSON.stringify(report));
  await expect(run(process.execPath, [cli, selected, raw, output])).rejects.toThrow();
  await expect(stat(output)).rejects.toThrow();
});
