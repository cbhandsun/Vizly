import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { verifyBusinessReleaseEvidence, REQUIRED_BUSINESS_GATES, BUSINESS_RELEASE_GATES, businessReleaseFacts } from './businessReleaseEvidence.mjs';
import { syntheticBusinessReport, syntheticBusinessCiReport } from './releaseEvidenceFixture.mjs';

const identity = { app: { repository: 'test/app', commit: 'a'.repeat(40), tree: 'b'.repeat(40), lockSha256: 'c'.repeat(64), clean: true } };
const roots = [], run = promisify(execFile), cli = join(process.cwd(), 'scripts/import-business-release-evidence.mjs');
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
it('accepts complete source-bound original business execution evidence', () => {
  expect(verifyBusinessReleaseEvidence(syntheticBusinessReport(identity), identity)).toEqual(REQUIRED_BUSINESS_GATES.filter(id => !id.startsWith('app-browser-')));
});
it.each(['failed', 'installation', 'source', 'tree', 'lock', 'dirty', 'runtime', 'missing', 'duplicate', 'failed-gate', 'duration', 'wrong-command'])(
  'rejects a passing wrapper whose original business evidence is %s', scenario => {
    const raw = syntheticBusinessReport(identity);
    if (scenario === 'failed') raw.status = 'failed';
    if (scenario === 'installation') raw.installation_exit_code = 1;
    if (scenario === 'source') raw.source_after = 'd'.repeat(40);
    if (scenario === 'tree') raw.tree_after = 'd'.repeat(40);
    if (scenario === 'lock') raw.lock_sha256_after = 'd'.repeat(64);
    if (scenario === 'dirty') raw.working_tree_after = ['dirty'];
    if (scenario === 'runtime') raw.node = '22.22.2';
    if (scenario === 'missing') raw.gates.pop();
    if (scenario === 'duplicate') raw.gates[1] = raw.gates[0];
    if (scenario === 'failed-gate') raw.gates[0].exit_code = 1;
    if (scenario === 'duration') raw.gates[0].seconds = -1;
    if (scenario === 'wrong-command') raw.gates[0].command = 'echo synthetic';
    expect(() => verifyBusinessReleaseEvidence(raw, identity)).toThrow('Business release evidence');
  },
);

it('derives eleven facts only from a complete successful business workflow', () => {
  const facts = businessReleaseFacts(syntheticBusinessCiReport(identity), { identity });
  expect(facts.map(fact => fact.id)).toEqual(BUSINESS_RELEASE_GATES);
  expect(facts.find(fact => fact.id === 'app-security').jobId).toBe('22');
  expect(facts.find(fact => fact.id === 'app-rls').jobId).toBe('21');
  expect(facts.find(fact => fact.id === 'app-browser-main').jobId).toBe('24');
});
it.each(['provider', 'workflow', 'repository', 'run', 'old-source', 'queued-job', 'failed-job', 'missing-job', 'duplicate-id', 'security-failed'])(
  'rejects incomplete or mismatched business CI metadata: %s', scenario => {
    const raw = syntheticBusinessCiReport(identity);
    if (scenario === 'provider') raw.provider = 'github';
    if (scenario === 'workflow') raw.workflow = 'devfleet-native.yaml';
    if (scenario === 'repository') raw.repository = 'other/app';
    if (scenario === 'run') raw.run.conclusion = 'failure';
    if (scenario === 'old-source') raw.run.head_sha = 'd'.repeat(40);
    if (scenario === 'queued-job') raw.jobs[0].status = 'queued';
    if (scenario === 'failed-job') raw.jobs[2].conclusion = 'failure';
    if (scenario === 'missing-job') raw.jobs.pop();
    if (scenario === 'duplicate-id') raw.jobs[1].id = raw.jobs[0].id;
    if (scenario === 'security-failed') raw.jobs[1].business_result.gates[0].exit_code = 1;
    expect(() => businessReleaseFacts(raw, { identity })).toThrow('Business release evidence');
  },
);
it('imports an entire successful run once and refuses to replace its evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vizly-business-import-')); roots.push(root);
  const selected = join(root, 'identity.json'), raw = join(root, 'raw.json'), output = join(root, 'reports');
  await writeFile(selected, JSON.stringify(identity)); await writeFile(raw, JSON.stringify(syntheticBusinessCiReport(identity)));
  const result = await run(process.execPath, [cli, selected, raw, output]);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: 'imported-business-only', gates: 11, runId: '456' });
  const receipt = await readFile(join(output, 'app-business-import.json'), 'utf8');
  expect(JSON.parse(receipt).gates).toHaveLength(11);
  await expect(run(process.execPath, [cli, selected, raw, output])).rejects.toThrow();
  expect(await readFile(join(output, 'app-business-import.json'), 'utf8')).toBe(receipt);
});
it('writes no passing output when original business CI is incomplete', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vizly-business-reject-')); roots.push(root);
  const selected = join(root, 'identity.json'), raw = join(root, 'raw.json'), output = join(root, 'reports');
  const report = syntheticBusinessCiReport(identity); report.jobs.pop();
  await writeFile(selected, JSON.stringify(identity)); await writeFile(raw, JSON.stringify(report));
  await expect(run(process.execPath, [cli, selected, raw, output])).rejects.toThrow();
  await expect(stat(output)).rejects.toThrow();
});

it.each(['app-browser-runtime', 'app-browser-main', 'app-browser-recovery', 'app-browser-s3', 'app-browser-compatibility'])(
  'requires original successful browser execution for %s', id => {
    for (const missing of [false, true]) {
      const raw = syntheticBusinessCiReport(identity);
      const browser = raw.jobs.find(job => job.name === 'business-browser').business_result;
      if (missing) browser.gates = browser.gates.filter(gate => gate.id !== id);
      else browser.gates.find(gate => gate.id === id).exit_code = 1;
      expect(() => businessReleaseFacts(raw, { identity })).toThrow('Business release evidence');
    }
  },
);

it.each(['missing', 'empty', 'skipped', 'flaky', 'unexpected', 'count-mismatch', 'bad-digest', 'legacy-schema'])(
  'rejects passing browser wrapper with %s original report evidence', scenario => {
    const raw = syntheticBusinessCiReport(identity);
    const gate = raw.jobs.find(job => job.name === 'business-browser').business_result.gates.find(item => item.id === 'app-browser-main');
    if (scenario === 'legacy-schema') raw.jobs.find(job => job.name === 'business-browser').business_result.schema = 'vizly-business-v1';
    if (scenario === 'missing') delete gate.browser;
    if (scenario === 'empty') gate.browser.expected = gate.browser.cases = 0;
    if (['skipped', 'flaky', 'unexpected'].includes(scenario)) gate.browser[scenario] = 1;
    if (scenario === 'count-mismatch') gate.browser.cases = 2;
    if (scenario === 'bad-digest') gate.browser.reportSha256 = 'wrong';
    expect(() => businessReleaseFacts(raw, { identity })).toThrow('Business release evidence');
  },
);
