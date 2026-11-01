import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { containsCompiledEndpoint, parseDeploymentEnvironment, parseProductionWebSocketUrl,
  parseTelemetryIngestUrl, staticDeploymentRoutes } from './vercelDeploymentEnvironment.mjs';
import { parseTelemetryRelayOptions, verifyTelemetryRelay } from './vercelTelemetryRelayArtifact.mjs';
import { STATIC_ASSET_CACHE_POLICY } from './staticAssetCache.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const contained = (root, path) => {
  const name = relative(root, path);
  return name !== '' && !isAbsolute(name) && name !== '..' && !name.startsWith('../') && !name.startsWith('..\\');
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function readJson(root, path) {
  const resolved = await realpath(path);
  if (!contained(root, resolved)) throw new Error('Deployment metadata escaped artifact');
  const metadata = await stat(resolved);
  if (!metadata.isFile() || metadata.size > 2 * 1024 * 1024) throw new Error('Deployment metadata exceeds budget');
  try { return JSON.parse(await readFile(resolved, 'utf8')); }
  catch { throw new Error('Invalid deployment metadata JSON'); }
}
const assetName = value => typeof value === 'string' && value.length > 0 && value.length <= 512
  && !value.includes('\\') && !value.includes('\0') && !value.startsWith('/')
  && !value.split('/').some(part => part === '' || part === '.' || part === '..')
  && !/(?:^|\/)(?:src|server|node_modules|\.git|\.vercel|packages|auth\.json)(?:\/|$)/i.test(value)
  && /\.(?:html|js|css|json|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf|wasm)$/i.test(value);

/** Refuse incomplete stages and wrong targets before Vercel can auto-create a project. */
export async function verifyPreparedVercelDeployment({ artifactDirectory, projectId, teamId, environment = 'preview' }) {
  const deploymentEnvironment = parseDeploymentEnvironment(environment);
  if (typeof artifactDirectory !== 'string' || artifactDirectory.length === 0
    || typeof projectId !== 'string' || !/^prj_[A-Za-z0-9]+$/.test(projectId)
    || typeof teamId !== 'string' || !/^team_[A-Za-z0-9]+$/.test(teamId)) throw new Error('Invalid deployment arguments');
  const root = await realpath(resolve(artifactDirectory));
  // The preparation function writes this receipt last, after all assets and metadata.
  const receipt = await readJson(root, join(root, 'artifact-receipt.json'));
  const link = await readJson(root, join(root, '.vercel/project.json'));
  const config = await readJson(root, join(root, '.vercel/output/config.json'));
  const legacyStatic = receipt?.version === 1 && receipt?.source === 'compiled-static-assets';
  const protectedRelay = receipt?.version === 2 && receipt?.source === 'compiled-static-assets-and-telemetry-relay';
  if (!object(receipt) || (!legacyStatic && !protectedRelay)
    || receipt.projectId !== projectId || receipt.teamId !== teamId
    || !object(link) || link.projectId !== projectId || link.orgId !== teamId
    || !object(config) || config.version !== 3) throw new Error('Prepared deployment target or format mismatch');
  // Legacy receipts are preview-only; they never authorize a production upload.
  const receiptEnvironment = receipt.deploymentEnvironment === undefined ? 'preview' : parseDeploymentEnvironment(receipt.deploymentEnvironment);
  if (receiptEnvironment !== deploymentEnvironment) throw new Error('Prepared deployment environment mismatch');
  const endpoint = deploymentEnvironment === 'production' ? parseProductionWebSocketUrl(receipt.productionWebSocketUrl) : undefined;
  if (deploymentEnvironment === 'preview' && receipt.productionWebSocketUrl !== undefined) throw new Error('Production endpoint supplied for preview artifact');
  const ingest = receipt.telemetryIngestUrl === undefined && deploymentEnvironment === 'preview'
    ? undefined : parseTelemetryIngestUrl(receipt.telemetryIngestUrl);
  if (legacyStatic && receipt.telemetryRelay !== undefined) throw new Error('Unexpected telemetry relay on static artifact');
  const relayOptions = protectedRelay ? parseTelemetryRelayOptions({ environment: deploymentEnvironment,
    authentication: receipt.telemetryRelay?.authentication, origin: receipt.telemetryRelay?.origin,
    ingestUrl: ingest }) : undefined;
  if (protectedRelay && !relayOptions) throw new Error('Missing protected telemetry relay');
  if (receipt.staticCachePolicy !== undefined && receipt.staticCachePolicy !== STATIC_ASSET_CACHE_POLICY) throw new Error('Unknown static cache policy');
  if (!Array.isArray(receipt.files) || receipt.files.length === 0 || receipt.files.length > 5000
    || !Number.isSafeInteger(receipt.totalBytes) || receipt.totalBytes < 0 || receipt.totalBytes > 256 * 1024 * 1024) throw new Error('Invalid artifact inventory');
  const expected = new Map();
  for (const file of receipt.files) {
    if (!object(file) || !assetName(file.name) || typeof file.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(file.sha256) || expected.has(file.name)) throw new Error('Invalid artifact manifest entry');
    expected.set(file.name, file.sha256);
  }
  if (!expected.has('index.html')) throw new Error('Artifact entry missing');
  const cachedNames = receipt.staticCachePolicy === STATIC_ASSET_CACHE_POLICY ? [...expected.keys()] : [];
  if (!isDeepStrictEqual(config, { version: 3, routes: staticDeploymentRoutes(ingest, protectedRelay, cachedNames) })) throw new Error('Prepared artifact routing mismatch');
  const staticRoot = await realpath(join(root, '.vercel/output/static'));
  if (!contained(root, staticRoot)) throw new Error('Static directory escaped artifact');
  let totalBytes = 0;
  let count = 0;
  let compiledEndpointFound = false;
  async function verify(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Artifact symbolic links forbidden');
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { await verify(path); continue; }
      const name = relative(staticRoot, path).replaceAll('\\', '/');
      if (!entry.isFile() || !expected.has(name)) throw new Error('Unexpected artifact file');
      const metadata = await stat(path);
      if (metadata.size > 32 * 1024 * 1024 || totalBytes + metadata.size > 256 * 1024 * 1024) throw new Error('Artifact size budget exceeded');
      const bytes = await readFile(path);
      if (bytes.length !== metadata.size || sha256(bytes) !== expected.get(name)) throw new Error('Prepared artifact changed');
      if (endpoint && /\.js$/i.test(name) && containsCompiledEndpoint(bytes.toString('utf8'), endpoint)) compiledEndpointFound = true;
      totalBytes += bytes.length; count += 1;
    }
  }
  await verify(staticRoot);
  if (count !== expected.size || totalBytes !== receipt.totalBytes) throw new Error('Artifact inventory incomplete');
  if (endpoint && !compiledEndpointFound) throw new Error('Compiled production WebSocket endpoint missing');
  const relayFiles = protectedRelay ? await verifyTelemetryRelay(root, receipt.telemetryRelay, relayOptions) : [];
  // Check the complete upload root, including server functions and hidden metadata.
  // Static-file verification alone must not permit an unlisted function or credential.
  const allowed = new Set(['artifact-receipt.json', '.vercel/project.json', '.vercel/output/config.json',
    ...[...expected.keys()].map(name => '.vercel/output/static/' + name), ...relayFiles]);
  const allowedDirectories = new Set([...allowed].flatMap(name => {
    const parts = name.split('/');
    return parts.slice(0, -1).map((_part, index) => parts.slice(0, index + 1).join('/'));
  }));
  async function verifyUploadInventory(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Artifact symbolic links forbidden');
      if (entry.isDirectory()) {
        if (!allowedDirectories.has(relative(root, path).replaceAll('\\', '/'))) throw new Error('Unexpected deployment upload directory');
        await verifyUploadInventory(path);
      }
      else if (!entry.isFile() || !allowed.has(relative(root, path).replaceAll('\\', '/'))) throw new Error('Unexpected deployment upload file');
    }
  }
  await verifyUploadInventory(root);
  return { root, projectId, teamId, files: count, totalBytes, deploymentEnvironment,
    ...(ingest ? { telemetryIngestUrl: ingest } : {}),
    ...(protectedRelay ? { telemetryAuthentication: 'vercel-oidc', telemetryOrigin: relayOptions.origin } : {}) };
}
