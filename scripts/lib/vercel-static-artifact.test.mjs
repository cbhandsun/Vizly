// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { prepareVercelStaticArtifact } from './vercel-static-artifact.mjs';
const roots = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'vizly-static-'));
  roots.push(root);
  await mkdir(join(root, 'build/assets'), { recursive: true });
  await writeFile(join(root, 'build/index.html'), '<div id="root"></div>');
  await writeFile(join(root, 'build/assets/app.js'), 'const endpoint="wss://collab.example.com";');
  return { workspace: root, buildDirectory: 'build', outputDirectory: 'release', projectId: 'prj_test', teamId: 'team_test' };
}
it('stages an exact compiled release with the selected project and SPA config', async () => {
  const options = await fixture();
  const result = await prepareVercelStaticArtifact(options);
  expect(result.files).toBe(2);
  expect(await readFile(join(result.output, '.vercel/output/static/assets/app.js'), 'utf8')).toBe('const endpoint="wss://collab.example.com";');
  expect(JSON.parse(await readFile(join(result.output, '.vercel/project.json'), 'utf8'))).toEqual({ projectId:'prj_test', orgId:'team_test' });
  expect(JSON.parse(await readFile(join(result.output, '.vercel/output/config.json'), 'utf8')).routes[1]).toEqual({src:'/assets/(.*)',status:404});
  await expect(prepareVercelStaticArtifact(options)).rejects.toThrow();
});
it.each(['ws://localhost:5422', 'ws://127.0.0.1:5422', 'wss://[::1]:5422'])('rejects a production endpoint on loopback (%s)', async endpoint => {
  const options = await fixture();
  await writeFile(join(options.workspace, 'build/assets/app.js'), `const endpoint=${JSON.stringify(endpoint)};`);
  await expect(prepareVercelStaticArtifact(options)).rejects.toThrow('loopback');
});
it.each(['.env.local', '.npmrc', 'auth.json', 'app.js.map'])('rejects sensitive or source-map files (%s)', async name => {
  const options = await fixture();
  await writeFile(join(options.workspace, 'build', name), 'test');
  await expect(prepareVercelStaticArtifact(options)).rejects.toThrow();
});
it.each(['src', 'server', 'node_modules', 'packages'])('rejects source/dependency directories (%s)', async name => {
  const options = await fixture();
  await mkdir(join(options.workspace, 'build', name));
  await expect(prepareVercelStaticArtifact(options)).rejects.toThrow('directory');
});
it('rejects escaping paths, invalid project identifiers, missing entry and empty input', async () => {
  const options = await fixture();
  await expect(prepareVercelStaticArtifact({...options, outputDirectory:'../escape'})).rejects.toThrow('workspace');
  await expect(prepareVercelStaticArtifact({...options, outputDirectory:'build/release'})).rejects.toThrow('separate');
  await expect(prepareVercelStaticArtifact({...options, projectId:'../invalid'})).rejects.toThrow('project');
  await expect(prepareVercelStaticArtifact({...options, teamId:''})).rejects.toThrow('team');
  await expect(prepareVercelStaticArtifact({...options, buildDirectory:null})).rejects.toThrow('strings');
  await rm(join(options.workspace, 'build/index.html'));
  await expect(prepareVercelStaticArtifact(options)).rejects.toThrow('entry');
});
it('rejects oversized sparse files before reading their contents', async () => {
  const options = await fixture();
  const largeFile = join(options.workspace, 'build/assets/large.js');
  await writeFile(largeFile, '');
  await truncate(largeFile, 1024 * 1024 * 1024);
  await expect(prepareVercelStaticArtifact(options)).rejects.toThrow('budget');
});
it('rejects symbolic links without copying their target', async () => {
  const options = await fixture();
  await mkdir(join(options.workspace, 'outside'));
  await symlink(join(options.workspace, 'outside'), join(options.workspace, 'build/link'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(prepareVercelStaticArtifact(options)).rejects.toThrow('symbolic');
});
it('rejects an output parent junction that escapes the workspace', async () => {
  const options = await fixture();
  const outside = await mkdtemp(join(tmpdir(), 'vizly-output-outside-'));
  roots.push(outside);
  await symlink(outside, join(options.workspace, 'output-link'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(prepareVercelStaticArtifact({...options, outputDirectory:'output-link/release'})).rejects.toThrow('escaped');
});
it('binds production staging to the exact compiled WSS endpoint and explicit environment', async () => {
  const options = await fixture();
  const result = await prepareVercelStaticArtifact({ ...options, environment: 'production', productionWebSocketUrl: 'wss://collab.example.com' });
  expect(JSON.parse(await readFile(join(result.output, 'artifact-receipt.json'), 'utf8'))).toMatchObject({
    deploymentEnvironment: 'production', productionWebSocketUrl: 'wss://collab.example.com',
  });
});
it.each(['const endpoint="wss://other.example.com";', 'const endpoint="wss://collab.example.com.attacker.invalid";', ''])('rejects a production artifact without the expected endpoint %#', async source => {
  const options = await fixture();
  await writeFile(join(options.workspace, 'build/assets/app.js'), source);
  await expect(prepareVercelStaticArtifact({ ...options, environment: 'production', productionWebSocketUrl: 'wss://collab.example.com' })).rejects.toThrow('endpoint missing');
  await expect(readFile(join(options.workspace, 'release/artifact-receipt.json'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('rejects an unconfigured production endpoint and a production URL on preview', async () => {
  const options = await fixture();
  await expect(prepareVercelStaticArtifact({ ...options, environment: 'production' })).rejects.toThrow('Invalid production WebSocket');
  await expect(prepareVercelStaticArtifact({ ...options, productionWebSocketUrl: 'wss://collab.example.com' })).rejects.toThrow('supplied for preview');
});

it('stages the exact production template literal without relaxing endpoint binding', async () => {
  const options = await fixture();
  const endpoint = 'wss://collab.example.com';
  const quote = String.fromCharCode(96);
  await writeFile(join(options.workspace, 'build/assets/app.js'), 'const endpoint=' + quote + endpoint + quote + ';');
  const result = await prepareVercelStaticArtifact({ ...options, environment: 'production', productionWebSocketUrl: endpoint });
  expect(JSON.parse(await readFile(join(result.output, 'artifact-receipt.json'), 'utf8'))).toMatchObject({deploymentEnvironment:'production', productionWebSocketUrl:endpoint});
});
