// @vitest-environment node
import { it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isFingerprintedStaticAsset, fingerprintedAssetCacheRoutes, STATIC_ASSET_CACHE_POLICY } from './staticAssetCache.mjs';
import { staticDeploymentRoutes } from './vercelDeploymentEnvironment.mjs';
import { prepareVercelStaticArtifact } from './vercel-static-artifact.mjs';
import { verifyPreparedVercelDeployment } from './preparedVercelDeployment.mjs';

it.each(['assets/index-AbCd0123.js', 'assets/flow.worker-P9_abcDE.css', 'assets/zh-C1UpQ1vZ.json',
  'assets/baseReactFlowDisplayEdges.worker-C7WNKOxr-z3_nMrpy.js', 'assets/font-Az09abcd.woff2'])('recognizes a fingerprinted compiler asset %s', name => {
  expect(isFingerprintedStaticAsset(name)).toBe(true);
});
it.each(['index.html', 'assets/index-AbCd0123.html', 'assets/app.js', 'assets/startup-resource-guard.v1.js',
  'assets/manual-abcdefgh.js', 'assets/app-AbCd0123.js.map', 'assets/app-AbCd0123.js?token=unused',
  'assets/../app-AbCd0123.js', '/assets/app-AbCd0123.js', 'https://other.invalid/assets/app-AbCd0123.js',
  'assets/sub/app-AbCd0123.js', undefined, null, {}, []])('does not cache a mutable, unsafe or non-asset path %#', name => {
  expect(isFingerprintedStaticAsset(name)).toBe(false);
});
it('matches only exact inventoried paths and only safe read methods', () => {
  const routes = fingerprintedAssetCacheRoutes(['index.html', 'assets/index-AbCd0123.js', 'assets/index-AbCd0123.js', 'assets/startup-resource-guard.v1.js']);
  expect(routes).toHaveLength(1);
  const rule = routes[0];
  expect(rule).toMatchObject({ methods: ['GET', 'HEAD'], caseSensitive: true, continue: true,
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } });
  const matcher = new RegExp(rule.src);
  expect(matcher.test('/assets/index-AbCd0123.js')).toBe(true);
  for (const path of ['/index.html', '/assets/missing-AbCd0123.js', '/assets/index-abcd0123.js', '/telemetry', '/assets/startup-resource-guard.v1.js']) expect(matcher.test(path)).toBe(false);
});
it('batches a large inventory within bounded exact-path expressions', () => {
  const names = Array.from({ length: 100 }, (_, i) => `assets/chunk-${i}-AbCd0123.js`);
  const routes = fingerprintedAssetCacheRoutes(names);
  expect(routes).toHaveLength(4);
  for (const name of names) expect(routes.filter(route => new RegExp(route.src).test('/' + name))).toHaveLength(1);
  expect(routes.every(route => route.src.length < 3100)).toBe(true);
});
it('keeps diagnostics before the cache and filesystem phases', () => {
  const routes = staticDeploymentRoutes('https://ingest.example.com/telemetry', true, ['assets/index-AbCd0123.js']);
  expect(routes[0]).toMatchObject({ dest: '/__vizly_telemetry_relay', headers: { 'Cache-Control': 'no-store' } });
  expect(routes[1]).toMatchObject({ status: 405, headers: { 'Cache-Control': 'no-store' } });
  expect(routes[2]).toHaveProperty('continue', true);
  expect(routes[3]).toEqual({ handle: 'filesystem' });
  expect(routes[4]).toEqual({ src: '/assets/(.*)', status: 404 });
});
it('preserves legacy routing when no inventory is supplied', () => {
  expect(staticDeploymentRoutes(undefined).slice(2)).toEqual([{ handle: 'filesystem' }, { src: '/assets/(.*)', status: 404 }, { src: '/(.*)', dest: '/index.html' }]);
});
it.each([null, {}, new Array(5001).fill('assets/app-AbCd0123.js'), [null]])('rejects an invalid cache inventory %#', input => {
  expect(() => fingerprintedAssetCacheRoutes(input)).toThrow('Invalid static cache inventory');
});
const withArtifact = async run => {
  const workspace = await mkdtemp(join(tmpdir(), 'vizly-static-cache-'));
  try {
    await mkdir(join(workspace, 'build/assets'), { recursive: true });
    await writeFile(join(workspace, 'build/index.html'), '<div id="root"></div>');
    await writeFile(join(workspace, 'build/assets/index-AbCd0123.js'), 'const endpoint="wss://collab.example.com";');
    await writeFile(join(workspace, 'build/assets/startup-resource-guard.v1.js'), 'void 0;');
    const target = { projectId: 'prj_test', teamId: 'team_test', environment: 'production' };
    const prepared = await prepareVercelStaticArtifact({ workspace, buildDirectory: 'build', outputDirectory: 'artifact', ...target,
      productionWebSocketUrl: 'wss://collab.example.com', telemetryIngestUrl: 'https://ingest.example.com/telemetry' });
    const options = { artifactDirectory: prepared.output, ...target };
    await run({ options, configPath: join(prepared.output, '.vercel/output/config.json'), receiptPath: join(prepared.output, 'artifact-receipt.json') });
  } finally { await rm(workspace, { recursive: true, force: true }); }
};
it('stages and verifies the explicit new policy without changing static bytes', async () => withArtifact(async ({ options, receiptPath, configPath }) => {
  expect((await verifyPreparedVercelDeployment(options)).deploymentEnvironment).toBe('production');
  expect(JSON.parse(await readFile(receiptPath, 'utf8')).staticCachePolicy).toBe(STATIC_ASSET_CACHE_POLICY);
  const routes = JSON.parse(await readFile(configPath, 'utf8')).routes;
  expect(routes.some(route => route.headers?.['Cache-Control']?.includes('immutable'))).toBe(true);
}));
it.each(['broad-path', 'html-cache', 'cache-header', 'removed-policy', 'unknown-policy'])('rejects changed cache metadata %s', async change => withArtifact(async ({ options, configPath, receiptPath }) => {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  if (change === 'broad-path') config.routes[2].src = '/assets/(.*)';
  if (change === 'html-cache') config.routes[2].src = '/(.*)';
  if (change === 'cache-header') config.routes[2].headers['Cache-Control'] = 'public, max-age=1';
  if (change === 'removed-policy') delete receipt.staticCachePolicy;
  if (change === 'unknown-policy') receipt.staticCachePolicy = 'unknown';
  await writeFile(configPath, JSON.stringify(config)); await writeFile(receiptPath, JSON.stringify(receipt));
  await expect(verifyPreparedVercelDeployment(options)).rejects.toThrow();
}));
it('still verifies the exact legacy artifact for rollback compatibility', async () => withArtifact(async ({ options, configPath, receiptPath }) => {
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8')); delete receipt.staticCachePolicy;
  await writeFile(receiptPath, JSON.stringify(receipt));
  await writeFile(configPath, JSON.stringify({ version: 3, routes: staticDeploymentRoutes('https://ingest.example.com/telemetry') }));
  await expect(verifyPreparedVercelDeployment(options)).resolves.toHaveProperty('deploymentEnvironment', 'production');
}));
