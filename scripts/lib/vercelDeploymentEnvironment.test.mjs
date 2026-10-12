// @vitest-environment node
import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { ESLint } from 'eslint';
import { containsCompiledEndpoint, parseDeploymentEnvironment, parseProductionWebSocketUrl } from './vercelDeploymentEnvironment.mjs';
const lintWorkspace = resolve(import.meta.dirname, '../..');
const lint = new ESLint({ cwd: lintWorkspace });
const releaseModule = join(lintWorkspace, 'scripts/lib/vercelDeploymentEnvironment.mjs');
// Load the real toolchain once, as fixture setup. Assertions retain default deadlines.
const releaseLintConfig = await lint.calculateConfigForFile(releaseModule);
const sourceLintConfig = await lint.calculateConfigForFile(join(lintWorkspace, 'src/services/DataService.ts'));
it.each(['preview', 'production'])('accepts explicit deployment environment %s', value => {
  expect(parseDeploymentEnvironment(value)).toBe(value);
});
it.each([undefined, null, '', 'Production', '--prod', {}, [], 0, NaN])('rejects invalid deployment environments %#', value => {
  expect(() => parseDeploymentEnvironment(value)).toThrow('Invalid deployment environment');
});
it.each(['wss://collab.example.com', 'wss://collab.example.com:443/yjs'])('accepts an exact production endpoint %s', value => {
  expect(parseProductionWebSocketUrl(value)).toBe(value);
});
it.each([undefined, null, '', 'ws://collab.example.com', 'wss://localhost', 'wss://api.localhost',
  'wss://127.1', 'wss://127.0.0.1', 'wss://[::1]', 'wss://user:synthetic@example.com',
  'wss://collab.example.com?token=synthetic', 'wss://collab.example.com#fragment',
  'wss://collab.example.com:65536', ' wss://collab.example.com', 'wss://-.example.com',
  `wss://${'a'.repeat(64)}.example.com`, `wss://collab.example.com/${'a'.repeat(1024)}`, {}, []])('rejects unsafe or invalid production endpoints %#', value => {
  expect(() => parseProductionWebSocketUrl(value)).toThrow('Invalid production WebSocket endpoint');
});
it('matches only the whole compiled URL literal', () => {
  const endpoint = 'wss://collab.example.com';
  expect(containsCompiledEndpoint(`const endpoint=${JSON.stringify(endpoint)};`, endpoint)).toBe(true);
  expect(containsCompiledEndpoint(`const endpoint='${endpoint}';`, endpoint)).toBe(true);
  expect(containsCompiledEndpoint(`const endpoint='${endpoint}.attacker.invalid';`, endpoint)).toBe(false);
  expect(containsCompiledEndpoint(`const endpoint='${endpoint}/other';`, endpoint)).toBe(false);
  expect(containsCompiledEndpoint('', endpoint)).toBe(false);
  expect(containsCompiledEndpoint(null, endpoint)).toBe(false);
});
it('includes release tooling in the unified strict type gate and rejects unknown access and implicit parameters', async () => {
  const workspace = resolve(import.meta.dirname, '../..');
  const rootConfig = JSON.parse(await readFile(join(workspace, 'tsconfig.json'), 'utf8'));
  expect(rootConfig.references).toContainEqual({ path: './tsconfig.release-tooling.json' });
  const config = JSON.parse(await readFile(join(workspace, 'tsconfig.release-tooling.json'), 'utf8'));
  expect(config.compilerOptions).toMatchObject({ allowJs: true, checkJs: true, strict: true, noEmit: true });
  expect(config.files).toContain('scripts/lib/vercelDeploymentEnvironment.mjs');
  const temporary = await mkdtemp(join(tmpdir(), 'vizly-release-tooling-types-'));
  if (dirname(resolve(temporary)) !== resolve(tmpdir()) || !basename(temporary).startsWith('vizly-release-tooling-types-')) throw new Error('Unsafe fixture cleanup path');
  const run = promisify(execFile);
  const fixture = join(temporary, 'fixture.mjs');
  const project = join(temporary, 'tsconfig.json');
  try {
    await writeFile(project, JSON.stringify({ ...config, files: ['./fixture.mjs'], compilerOptions: {
      ...config.compilerOptions, tsBuildInfoFile: join(temporary, 'types.tsbuildinfo'), typeRoots: [join(workspace, 'node_modules/@types')],
    } }));
    const compiler = join(workspace, 'node_modules/@typescript/native/bin/tsc');
    await writeFile(fixture, '/** @param {unknown} value */\nexport function parse(value) { return typeof value === "string" ? value.trim() : null; }');
    await expect(run(process.execPath, [compiler, '-p', project], { timeout: 10000 })).resolves.toMatchObject({ stdout: '', stderr: '' });
    await writeFile(fixture, '/** @param {unknown} value */\nexport function parse(value) { return value.trim(); }\nexport function loose(value) { return value; }');
    const rejected = await run(process.execPath, [compiler, '-p', project], { timeout: 10000 }).catch(error => error);
    expect(rejected).toMatchObject({ code: 1, stdout: expect.stringContaining('TS18046') });
    expect(rejected.stdout).toContain('TS7006');
  } finally {
    // Remove only this fresh owned fixture directory, never a derived workspace.
    await rm(temporary, { recursive: true, force: true });
  }
});
it('enforces the release module through the ordinary lint configuration', async () => {
  expect(releaseLintConfig.rules['no-undef'][0]).toBe(2);
  const valid = await lint.lintText('export const endpoint = "wss://collab.example.com";', { filePath: releaseModule });
  expect(valid[0].errorCount).toBe(0);
  expect(valid[0].warningCount).toBe(0);
  const invalid = await lint.lintText('export const endpoint = undefinedProductionEndpoint;', { filePath: releaseModule });
  expect(invalid[0].messages).toContainEqual(expect.objectContaining({ ruleId: 'no-undef', severity: 2 }));
  expect(await lint.isPathIgnored(join(lintWorkspace, 'tmp/synthetic-build/assets/app.js'))).toBe(true);
  expect(await lint.isPathIgnored(join(lintWorkspace, 'dist-collaboration/index.js'))).toBe(true);
  expect(await lint.isPathIgnored(join(lintWorkspace, 'tmp/private-room-notice-candidate/privateRoomNoticeBus.ts'))).toBe(false);
  expect(await lint.isPathIgnored(join(lintWorkspace, 'src/services/DataService.ts'))).toBe(false);
  expect(sourceLintConfig.rules['@typescript-eslint/no-explicit-any'][0]).toBe(2);
});

it('accepts the exact static template URL emitted by the production minifier', () => {
  const endpoint = 'wss://collab-preview.vizly.fun';
  const quote = String.fromCharCode(96);
  expect(containsCompiledEndpoint('const endpoint=' + quote + endpoint + quote + ';', endpoint)).toBe(true);
  for (const suffix of ['.attacker.invalid', '/other', String.fromCharCode(36) + '{suffix}']) {
    expect(containsCompiledEndpoint('const endpoint=' + quote + endpoint + suffix + quote + ';', endpoint)).toBe(false);
  }
});
it('rejects dynamic or escaped template endpoint arguments', () => {
  const quote = String.fromCharCode(96);
  for (const endpoint of ['wss://collab.example.com/' + String.fromCharCode(36) + '{path}', 'wss://collab.example.com/' + quote, 'wss://collab.example.com/' + String.fromCharCode(92)]) {
    expect(containsCompiledEndpoint(quote + endpoint + quote, endpoint)).toBe(false);
  }
});
