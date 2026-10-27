import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { nativeReleaseFacts } from './nativeReleaseEvidence.mjs';
import { syntheticNativeReport } from './releaseEvidenceFixture.mjs';
const identity = { app: { repository: 'test/app', commit: 'a'.repeat(40), tree: 'b'.repeat(40), lockSha256: 'c'.repeat(64), clean: true },
  core: { repository: 'test/core', commit: 'd'.repeat(40), tree: 'e'.repeat(40), lockSha256: 'f'.repeat(64), clean: true } };
const roots = [], run = promisify(execFile);
const cli = join(process.cwd(), 'scripts/import-native-release-evidence.mjs');
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
it.each(['app', 'core'])('derives four native facts from complete %s API and runner evidence', repo => {
  const facts = nativeReleaseFacts(syntheticNativeReport(identity, repo), { identity, repo });
  expect(facts.map(fact => fact.id)).toEqual(['macos', 'windows', 'linux', 'aggregate'].map(os => `${repo}-gitea-${os}`));
  expect(facts.every(fact => fact.commit === identity[repo].commit && fact.runId === '123')).toBe(true);
});
it.each(['failed-run', 'queued-job', 'missing-job', 'duplicate-job', 'old-source', 'dirty', 'drift', 'lock-drift', 'old-node', 'legacy-receipt', 'missing-check', 'failed-check', 'invalid-duration', 'wrong-os'])('rejects incomplete or incompatible evidence: %s', scenario => {
  const raw = syntheticNativeReport(identity, 'app'), result = raw.jobs[0].native_result;
  if (scenario === 'failed-run') raw.run.conclusion = 'failure';
  if (scenario === 'queued-job') raw.jobs[0].status = 'queued';
  if (scenario === 'missing-job') raw.jobs.pop();
  if (scenario === 'duplicate-job') raw.jobs[1] = raw.jobs[0];
  if (scenario === 'old-source') raw.run.head_sha = '0'.repeat(40);
  if (scenario === 'dirty') result.working_tree_before = ['changed'];
  if (scenario === 'drift') result.tree_after = '0'.repeat(40);
  if (scenario === 'lock-drift') result.lock_sha256_after = '0'.repeat(64);
  if (scenario === 'old-node') result.node = '22.22.2';
  if (scenario === 'legacy-receipt') delete result.schema;
  if (scenario === 'missing-check') result.gates.pop();
  if (scenario === 'failed-check') result.gates[0].exit_code = 1;
  if (scenario === 'invalid-duration') result.gates[0].seconds = NaN;
  if (scenario === 'wrong-os') result.os = 'Linux';
  expect(() => nativeReleaseFacts(raw, { identity, repo: 'app' })).toThrow('Native release evidence:');
});
it('rejects identity-free evidence before emitting reports', () => {
  expect(() => nativeReleaseFacts(syntheticNativeReport(identity, 'app'), { identity: { app: {} }, repo: 'app' })).toThrow('selected source identity');
});
it('imports validated reports without overwriting an earlier attempt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vizly-native-import-')); roots.push(root);
  await writeFile(join(root, 'identity.json'), JSON.stringify(identity));
  await writeFile(join(root, 'raw.json'), JSON.stringify(syntheticNativeReport(identity, 'app')));
  const args = [cli, 'app', join(root, 'identity.json'), join(root, 'raw.json'), join(root, 'out')];
  expect(JSON.parse((await run(process.execPath, args)).stdout)).toMatchObject({ status: 'imported-native-only', gates: 4 });
  const receipt = JSON.parse(await readFile(join(root, 'out/app-import.json'), 'utf8'));
  expect(receipt.gates).toHaveLength(4);
  await expect(run(process.execPath, args)).rejects.toThrow();
});
it('does not write successful output for a failed native run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vizly-native-reject-')); roots.push(root);
  await writeFile(join(root, 'identity.json'), JSON.stringify(identity));
  const raw = syntheticNativeReport(identity, 'app'); raw.jobs[2].conclusion = 'failure';
  await writeFile(join(root, 'raw.json'), JSON.stringify(raw));
  await expect(run(process.execPath, [cli, 'app', join(root, 'identity.json'), join(root, 'raw.json'), join(root, 'out')])).rejects.toThrow();
  await expect(readFile(join(root, 'out/app-import.json'))).rejects.toMatchObject({ code: 'ENOENT' });
});
