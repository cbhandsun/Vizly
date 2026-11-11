import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { prepareVercelStaticArtifact } from './vercel-static-artifact.mjs';
import { verifyPreparedVercelDeployment } from './preparedVercelDeployment.mjs';
import { verifyReleaseEvidence, ENGINEERING_GATES, LEGACY_ENGINEERING_GATES, PROMOTION_GATES } from './releaseEvidence.mjs';
import { syntheticReleaseFixture } from './releaseEvidenceFixture.mjs';
import { CORE_HOST_GATES } from './coreHostReleaseEvidence.mjs';
import { CORE_QUALITY_GATES } from './coreQualityReleaseEvidence.mjs';
const roots = [], run = promisify(execFile), projectId = 'prj_Test', teamId = 'team_Test';
const launcher = join(process.cwd(), 'scripts/deploy-prepared-vercel-static.mjs');
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(promotion = false, production = promotion, legacy = false) {
  const root = await mkdtemp(join(tmpdir(), 'vizly-release-gates-')); roots.push(root);
  await mkdir(join(root, 'build')); await writeFile(join(root, 'build/index.html'), '<div id="root"></div>');
  if (production) await writeFile(join(root, 'build/app.js'), 'const endpoint="wss://collab.example.com";');
  const environment = production ? 'production' : 'preview';
  await prepareVercelStaticArtifact({ workspace: root, buildDirectory: 'build', outputDirectory: 'stage', projectId, teamId, environment,
    ...(production ? { productionWebSocketUrl: 'wss://collab.example.com', telemetryIngestUrl: 'https://collab.example.com/telemetry' } : {}) });
  const prepared = await verifyPreparedVercelDeployment({ artifactDirectory: join(root, 'stage'), projectId, teamId, environment });
  const release = await syntheticReleaseFixture(root, prepared, promotion, legacy);
  return { root, prepared, ...release, save: () => writeFile(release.manifestPath, JSON.stringify(release.manifest)) };
}
it('accepts exactly bound engineering evidence; promotion requires separate real-service and rollback receipts', async () => {
  const f = await fixture(false, true); expect((await verifyReleaseEvidence(f)).gates).toBe(ENGINEERING_GATES.length);
  await expect(verifyReleaseEvidence({ ...f, phase: 'promotion' })).rejects.toThrow('missing gate staging-real-accounts');
  const complete = await fixture(true);
  expect((await verifyReleaseEvidence({ ...complete, phase: 'promotion' })).gates).toBe(ENGINEERING_GATES.length + PROMOTION_GATES.length);
});
it.each([...CORE_HOST_GATES, 'app-security', 'core-package-contents', 'app-browser-main', 'app-rls', 'core-gitea-linux',
  'app-database-paths', 'app-telemetry-storage', 'app-collaboration-auth-load', 'app-collaboration-mixed-load', 'app-browser-compatibility'])('rejects missing required gate %s', async id => {
  const f = await fixture(); f.manifest.gates = f.manifest.gates.filter(gate => gate.id !== id); await f.save();
  await expect(verifyReleaseEvidence(f)).rejects.toThrow(`missing gate ${id}`);
});
it.each(['app-database-paths', 'app-telemetry-storage', 'app-collaboration-auth-load', 'app-collaboration-mixed-load'])(
  'rejects failed original business evidence even when wrapper hashes are updated: %s', async id => {
    const f = await fixture();
    const reference = f.manifest.gates.find(gate => gate.id === id);
    const path = join(f.evidence, reference.path);
    const report = JSON.parse(await readFile(path, 'utf8'));
    const rawPath = join(f.evidence, report.evidence.path);
    const raw = JSON.parse(await readFile(rawPath, 'utf8'));
    raw.jobs[0].business_result.gates[0].exit_code = 1;
    const rawBytes = JSON.stringify(raw); await writeFile(rawPath, rawBytes);
    report.evidence.sha256 = createHash('sha256').update(rawBytes).digest('hex');
    const bytes = JSON.stringify(report); await writeFile(path, bytes);
    reference.sha256 = createHash('sha256').update(bytes).digest('hex'); await f.save();
    await expect(verifyReleaseEvidence(f)).rejects.toThrow('Business release evidence');
  },
);
it.each(['failed', 'skipped', 'running', 'cancelled'])('rejects non-passing evidence even with a matching hash: %s', async status => {
  const f = await fixture(); const gate = f.manifest.gates[0]; const path = join(f.evidence, gate.path);
  const report = JSON.parse(await readFile(path, 'utf8')); report.status = status;
  const data = JSON.stringify(report); await writeFile(path, data); gate.sha256 = createHash('sha256').update(data).digest('hex'); await f.save();
  await expect(verifyReleaseEvidence(f)).rejects.toThrow('gate failed');
});
it.each(['app', 'core'])('rejects uncommitted and different %s source', async repo => {
  const f = await fixture(); f.manifest.identity[repo].clean = false; await f.save();
  await expect(verifyReleaseEvidence(f)).rejects.toThrow('committed source');
  f.manifest.identity[repo].clean = true; f.manifest.identity[repo].commit = '9'.repeat(40); await f.save();
  await expect(verifyReleaseEvidence(f)).rejects.toThrow('wrong identity');
});
it.each(['sdk.tgz', 'backend/index.js', 'backend/extra.js', 'app-unit.log', 'app-unit.json'])('rejects changed or added artifact/evidence bytes: %s', async path => {
  const f = await fixture(); await writeFile(join(f.evidence, path), 'changed');
  await expect(verifyReleaseEvidence(f)).rejects.toThrow();
});
it('binds frontend routing config as well as HTML and JavaScript', async () => {
  const f = await fixture(); await writeFile(join(f.prepared.root, '.vercel/output/config.json'), '{"version":3,"routes":[]}');
  await expect(verifyReleaseEvidence(f)).rejects.toThrow('frontend mismatch');
});
it('rejects configuration/migration drift, duplicate gates and unsafe evidence paths', async () => {
  const f = await fixture(); f.manifest.configuration.telemetryEnabled = false; await f.save();
  await expect(verifyReleaseEvidence(f)).rejects.toThrow('configuration or migrations');
  f.manifest.configuration.telemetryEnabled = true; f.manifest.gates.push(f.manifest.gates[0]); await f.save();
  await expect(verifyReleaseEvidence(f)).rejects.toThrow('duplicate');
  f.manifest.gates.pop(); f.manifest.gates[0].path = '../outside.json'; await f.save();
  await expect(verifyReleaseEvidence(f)).rejects.toThrow('unsafe path');
});
it('rejects symlinked artifacts', async () => {
  const f = await fixture(); await rm(join(f.evidence, 'sdk.tgz')); await symlink(join(f.evidence, 'backend/index.js'), join(f.evidence, 'sdk.tgz'));
  await expect(verifyReleaseEvidence(f)).rejects.toThrow('symbolic link');
});
it('requires a distinct compatible rollback reference at promotion', async () => {
  const f = await fixture(true); f.manifest.previousCompatible.databaseRollback = 'drop-schema'; await f.save();
  await expect(verifyReleaseEvidence({ ...f, phase: 'promotion' })).rejects.toThrow('rollback');
});
it('dry-run performs validation without resolving or executing a deployment CLI', async () => {
  const f = await fixture();
  const result = await run(process.execPath, [launcher, f.prepared.root, projectId, teamId, 'test', '/nonexistent/cli.mjs', 'preview', f.manifestPath]);
  expect(JSON.parse(result.stdout)).toMatchObject({ action: 'dry-run-verified', gates: ENGINEERING_GATES.length });
});
it('does not launch even an explicitly requested CLI when release evidence is incomplete', async () => {
  const f = await fixture(); const marker = join(f.root, 'executed'), cli = join(f.root, 'cli.mjs');
  await writeFile(cli, `import {writeFile} from 'node:fs/promises'; await writeFile(${JSON.stringify(marker)}, 'yes');`);
  f.manifest.gates.pop(); await f.save();
  await expect(run(process.execPath, [launcher, f.prepared.root, projectId, teamId, 'test', cli, 'preview', f.manifestPath, '--deploy'])).rejects.toThrow();
  await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('does not permit promotion of a preview artifact', async () => {
  const f = await fixture();
  await expect(verifyReleaseEvidence({ ...f, phase: 'promotion' })).rejects.toThrow('production artifact required');
});
it.each([['provider', 'github'], ['commit', '0'.repeat(40)], ['repository', 'other/repo'], ['runId', ''], ['workflow', '../ci.yml']])('rejects mismatched CI provenance: %s', async (field, value) => {
  const f = await fixture(), gate = f.manifest.gates.find(item => item.id === 'app-gitea-linux');
  const path = join(f.evidence, gate.path), report = JSON.parse(await readFile(path, 'utf8'));
  report[field] = value; const data = JSON.stringify(report); await writeFile(path, data);
  gate.sha256 = createHash('sha256').update(data).digest('hex'); await f.save();
  await expect(verifyReleaseEvidence(f)).rejects.toThrow(/CI provenance|native run\/job mismatch/);
});
it('rejects reusing a rollback receipt for a different previous deployment', async () => {
  const f = await fixture(true); f.manifest.previousCompatible.deploymentId = 'dpl_Another'; await f.save();
  await expect(verifyReleaseEvidence({ ...f, phase: 'promotion' })).rejects.toThrow('rollback evidence mismatch');
});

it.each(['app-rls', 'app-security', 'app-browser-main', 'app-browser-compatibility'])(
  'rejects incorrect business run/job provenance with valid wrapper hashes: %s', async id => {
    const f = await fixture(), gate = f.manifest.gates.find(item => item.id === id);
    const path = join(f.evidence, gate.path), report = JSON.parse(await readFile(path, 'utf8'));
    for (const field of ['runId', 'jobId', 'provider', 'repository', 'commit', 'workflow']) {
      const original = report[field]; report[field] = field.endsWith('Id') ? '99999' : 'wrong';
      const data = JSON.stringify(report); await writeFile(path, data);
      gate.sha256 = createHash('sha256').update(data).digest('hex'); await f.save();
      await expect(verifyReleaseEvidence(f)).rejects.toThrow(/business CI provenance/);
      report[field] = original;
    }
  },
);

it.each(CORE_QUALITY_GATES)('rejects failed Core quality execution behind a rehashed passing wrapper: %s', async id => {
  const f = await fixture(), reference = f.manifest.gates.find(gate => gate.id === id);
  const path = join(f.evidence, reference.path), report = JSON.parse(await readFile(path, 'utf8'));
  const rawPath = join(f.evidence, report.evidence.path), raw = JSON.parse(await readFile(rawPath, 'utf8'));
  raw.jobs[0].quality_result.gates[0].exit_code = 9;
  const bytes = JSON.stringify(raw); await writeFile(rawPath, bytes);
  report.evidence.sha256 = createHash('sha256').update(bytes).digest('hex');
  const wrapper = JSON.stringify(report); await writeFile(path, wrapper);
  reference.sha256 = createHash('sha256').update(wrapper).digest('hex'); await f.save();
  await expect(verifyReleaseEvidence(f)).rejects.toThrow('Core quality release evidence');
});
it.each(['runId', 'jobId', 'commit'])('rejects Core quality wrapper %s mismatch', async field => {
  const f = await fixture(), reference = f.manifest.gates.find(gate => gate.id === 'core-security');
  const path = join(f.evidence, reference.path), report = JSON.parse(await readFile(path, 'utf8'));
  report[field] = '99999'; const wrapper = JSON.stringify(report); await writeFile(path, wrapper);
  reference.sha256 = createHash('sha256').update(wrapper).digest('hex'); await f.save();
  await expect(verifyReleaseEvidence(f)).rejects.toThrow('Core quality CI provenance');
});

it.each(['sdk', 'app-source', 'budget'])(
  'rejects changed original Core host facts after wrapper hashes are refreshed: %s', async scenario => {
    const f = await fixture();
    const reference = f.manifest.gates.find(gate => gate.id === 'core-performance-large');
    const path = join(f.evidence, reference.path);
    const report = JSON.parse(await readFile(path, 'utf8'));
    const rawPath = join(f.evidence, report.evidence.path);
    const raw = JSON.parse(await readFile(rawPath, 'utf8'));
    const result = raw.jobs.find(job => job.name === 'core-host-performance').host_result;
    if (scenario === 'sdk') result.sdk_sha256 = '0'.repeat(64);
    if (scenario === 'app-source') result.app_source.commit = '0'.repeat(40);
    if (scenario === 'budget') result.gates.find(gate => gate.id === 'core-performance-large').summary.groups[0].workerRouting.maxMs = 751;
    const rawBytes = JSON.stringify(raw); await writeFile(rawPath, rawBytes);
    report.evidence.sha256 = createHash('sha256').update(rawBytes).digest('hex');
    const bytes = JSON.stringify(report); await writeFile(path, bytes);
    reference.sha256 = createHash('sha256').update(bytes).digest('hex'); await f.save();
    await expect(verifyReleaseEvidence(f)).rejects.toThrow('Core host release evidence');
  },
);

it('retains historical three-platform release verification without relaxing old evidence', async () => {
  const f=await fixture(false,false,true);
  expect((await verifyReleaseEvidence(f)).gates).toBe(LEGACY_ENGINEERING_GATES.length);
  f.manifest.gates=f.manifest.gates.filter(g=>g.id!=='app-gitea-windows');await f.save();
  await expect(verifyReleaseEvidence(f)).rejects.toThrow('missing gate app-gitea-windows');
});
it('rejects unsupported policy even if every supplied report succeeded', async () => {
  const f=await fixture();f.manifest.nativePolicy='skip-linux';await f.save();
  await expect(verifyReleaseEvidence(f)).rejects.toThrow('native policy');
});
it('does not claim current two-platform policy using historical release evidence', async () => {
  const f=await fixture(false,false,true);f.manifest.schema='vizly-release-v2';f.manifest.nativePolicy='linux-macos-v1';await f.save();
  await expect(verifyReleaseEvidence(f)).rejects.toThrow('native policy');
});
