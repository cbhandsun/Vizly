import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { containsCompiledEndpoint, parseDeploymentEnvironment, parseProductionWebSocketUrl } from './vercelDeploymentEnvironment.mjs';

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
  if (!object(receipt) || receipt.version !== 1 || receipt.source !== 'compiled-static-assets'
    || receipt.projectId !== projectId || receipt.teamId !== teamId
    || !object(link) || link.projectId !== projectId || link.orgId !== teamId
    || !object(config) || config.version !== 3) throw new Error('Prepared deployment target or format mismatch');
  // Legacy receipts are preview-only; they never authorize a production upload.
  const receiptEnvironment = receipt.deploymentEnvironment === undefined ? 'preview' : parseDeploymentEnvironment(receipt.deploymentEnvironment);
  if (receiptEnvironment !== deploymentEnvironment) throw new Error('Prepared deployment environment mismatch');
  const endpoint = deploymentEnvironment === 'production' ? parseProductionWebSocketUrl(receipt.productionWebSocketUrl) : undefined;
  if (deploymentEnvironment === 'preview' && receipt.productionWebSocketUrl !== undefined) throw new Error('Production endpoint supplied for preview artifact');
  if (!Array.isArray(receipt.files) || receipt.files.length === 0 || receipt.files.length > 5000
    || !Number.isSafeInteger(receipt.totalBytes) || receipt.totalBytes < 0 || receipt.totalBytes > 256 * 1024 * 1024) throw new Error('Invalid artifact inventory');
  const expected = new Map();
  for (const file of receipt.files) {
    if (!object(file) || !assetName(file.name) || typeof file.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(file.sha256) || expected.has(file.name)) throw new Error('Invalid artifact manifest entry');
    expected.set(file.name, file.sha256);
  }
  if (!expected.has('index.html')) throw new Error('Artifact entry missing');
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
  return { root, projectId, teamId, files: count, totalBytes, deploymentEnvironment };
}
