import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareVercelStaticArtifact } from './vercel-static-artifact.mjs';
import { verifyPreparedVercelDeployment } from './preparedVercelDeployment.mjs';

const roots = [];
const projectId = 'prj_Audit';
const teamId = 'team_Audit';
const run = promisify(execFile);
const launcher = join(process.cwd(), 'scripts/deploy-prepared-vercel-static.mjs');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'vizly-deploy-preflight-')); roots.push(root);
  await mkdir(join(root, 'build'));
  await writeFile(join(root, 'build/index.html'), '<div id="root"></div>');
  await prepareVercelStaticArtifact({ workspace: root, buildDirectory: 'build', outputDirectory: 'stage', projectId, teamId });
  return { root, artifactDirectory: join(root, 'stage'), projectId, teamId };
}
async function changeReceipt(input, update) {
  const path = join(input.artifactDirectory, 'artifact-receipt.json');
  const receipt = JSON.parse(await readFile(path, 'utf8')); update(receipt);
  await writeFile(path, JSON.stringify(receipt));
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('prepared preview deployment preflight', () => {
  it('accepts legacy receipts for preview only', async () => {
    const input = await fixture();
    await changeReceipt(input, receipt => { delete receipt.deploymentEnvironment; });
    await expect(verifyPreparedVercelDeployment(input)).resolves.toMatchObject({ deploymentEnvironment: 'preview' });
    await expect(verifyPreparedVercelDeployment({ ...input, environment: 'production' })).rejects.toThrow('environment mismatch');
  });
  it('does not infer a compiled production endpoint from a modified receipt', async () => {
    const input = await fixture();
    await changeReceipt(input, receipt => { receipt.deploymentEnvironment = 'production'; receipt.productionWebSocketUrl = 'wss://collab.example.com'; });
    await expect(verifyPreparedVercelDeployment({ ...input, environment: 'production' })).rejects.toThrow('endpoint missing');
  });
  it('accepts only the completed exact project artifact', async () => {
    const input = await fixture();
    await expect(verifyPreparedVercelDeployment(input)).resolves.toMatchObject({ projectId, teamId, files: 1, totalBytes: 21 });
  });
  it('rejects an in-progress stage before any CLI project creation', async () => {
    const input = await fixture(); await rm(join(input.artifactDirectory, 'artifact-receipt.json'));
    await expect(verifyPreparedVercelDeployment(input)).rejects.toThrow();
  });
  it.each([null, '', '../escape'])('rejects invalid project identity %s', async value => {
    const input = await fixture();
    await expect(verifyPreparedVercelDeployment({ ...input, projectId: value })).rejects.toThrow('Invalid deployment arguments');
  });
  it('rejects a stage linked to another project', async () => {
    const input = await fixture(); await writeFile(join(input.artifactDirectory, '.vercel/project.json'), JSON.stringify({ projectId: 'prj_Other', orgId: teamId }));
    await expect(verifyPreparedVercelDeployment(input)).rejects.toThrow('mismatch');
  });
  it('rejects changed compiled bytes', async () => {
    const input = await fixture(); await writeFile(join(input.artifactDirectory, '.vercel/output/static/index.html'), '<div id="root">changed</div>');
    await expect(verifyPreparedVercelDeployment(input)).rejects.toThrow('changed');
  });
  it('rejects an unexpected sensitive file', async () => {
    const input = await fixture(); await writeFile(join(input.artifactDirectory, '.vercel/output/static/auth.json'), '{}');
    await expect(verifyPreparedVercelDeployment(input)).rejects.toThrow('Unexpected artifact file');
  });
  it.each(['../index.html', '/index.html', 'src/index.js', 'auth.json'])('rejects unsafe manifest path %s', async name => {
    const input = await fixture(); await changeReceipt(input, receipt => { receipt.files[0].name = name; });
    await expect(verifyPreparedVercelDeployment(input)).rejects.toThrow('Invalid artifact manifest entry');
  });
  it.each([[], null, Array(5001).fill({})].map(files => [files]))('rejects invalid or excessive inventories', async files => {
    const input = await fixture(); await changeReceipt(input, receipt => { receipt.files = files; });
    await expect(verifyPreparedVercelDeployment(input)).rejects.toThrow('Invalid artifact inventory');
  });
  it('rejects incomplete assets without accepting a partial upload', async () => {
    const input = await fixture(); await rm(join(input.artifactDirectory, '.vercel/output/static/index.html'));
    await expect(verifyPreparedVercelDeployment(input)).rejects.toThrow('incomplete');
  });
  it('sanitizes malformed metadata errors', async () => {
    const input = await fixture(); await writeFile(join(input.artifactDirectory, 'artifact-receipt.json'), 'synthetic-sensitive-input');
    await expect(verifyPreparedVercelDeployment(input)).rejects.toThrow('Invalid deployment metadata JSON');
  });
  it('rejects duplicate manifest entries', async () => {
    const input = await fixture(); await changeReceipt(input, receipt => { receipt.files.push(receipt.files[0]); });
    await expect(verifyPreparedVercelDeployment(input)).rejects.toThrow('Invalid artifact manifest entry');
  });
  it('never launches a CLI for an unfinished stage', async () => {
    const input = await fixture(); const marker = join(input.root, 'cli-marker.json');
    const cli = join(input.root, 'fake-cli.mjs');
    await writeFile(cli, `import { writeFile } from 'node:fs/promises'; await writeFile(${JSON.stringify(marker)}, '{}');`);
    await rm(join(input.artifactDirectory, 'artifact-receipt.json'));
    await expect(run(process.execPath, [launcher, input.artifactDirectory, projectId, teamId, 'audit', cli], { timeout: 10000 })).rejects.toThrow();
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('pins project and team IDs even if inherited deployment variables point elsewhere', async () => {
    const input = await fixture(); const marker = join(input.root, 'cli-marker.json');
    const cli = join(input.root, 'fake-cli.mjs');
    await writeFile(cli, `import { writeFile } from 'node:fs/promises'; await writeFile(${JSON.stringify(marker)}, JSON.stringify({ project: process.env.VERCEL_PROJECT_ID, team: process.env.VERCEL_ORG_ID, args: process.argv.slice(2) }));`);
    await run(process.execPath, [launcher, input.artifactDirectory, projectId, teamId, 'audit', cli], {
      timeout: 10000, env: { ...process.env, VERCEL_PROJECT_ID: 'prj_Other', VERCEL_ORG_ID: 'team_Other' },
    });
    expect(JSON.parse(await readFile(marker, 'utf8'))).toEqual({ project: projectId, team: teamId, args: ['deploy', '--prebuilt', '--yes', '--scope', 'audit'] });
  });
  it('stages a verified production artifact without assigning any domain', async () => {
    const input = await fixture();
    await writeFile(join(input.root, 'build/app.js'), 'const endpoint="wss://collab.example.com";');
    await prepareVercelStaticArtifact({ workspace: input.root, buildDirectory: 'build', outputDirectory: 'production-stage', projectId, teamId,
      environment: 'production', productionWebSocketUrl: 'wss://collab.example.com' });
    const stage = join(input.root, 'production-stage');
    const marker = join(input.root, 'production-cli-marker.json');
    const cli = join(input.root, 'fake-production-cli.mjs');
    await writeFile(cli, `import { writeFile } from 'node:fs/promises'; await writeFile(${JSON.stringify(marker)}, JSON.stringify({ project: process.env.VERCEL_PROJECT_ID, team: process.env.VERCEL_ORG_ID, args: process.argv.slice(2) }));`);
    await run(process.execPath, [launcher, stage, projectId, teamId, 'audit', cli, 'production'], { timeout: 10000 });
    expect(JSON.parse(await readFile(marker, 'utf8'))).toEqual({ project: projectId, team: teamId,
      args: ['deploy', '--prebuilt', '--prod', '--skip-domain', '--yes', '--scope', 'audit'] });
    await expect(verifyPreparedVercelDeployment({ ...input, artifactDirectory: stage })).rejects.toThrow('environment mismatch');
  });
  it.each(['production', 'invalid'])('never launches a CLI when target %s mismatches the artifact', async environment => {
    const input = await fixture();
    const marker = join(input.root, 'wrong-target-marker.json');
    const cli = join(input.root, 'wrong-target-cli.mjs');
    await writeFile(cli, `import { writeFile } from 'node:fs/promises'; await writeFile(${JSON.stringify(marker)}, '{}');`);
    await expect(run(process.execPath, [launcher, input.artifactDirectory, projectId, teamId, 'audit', cli, environment], { timeout: 10000 })).rejects.toThrow();
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
