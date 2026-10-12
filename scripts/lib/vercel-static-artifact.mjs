import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { containsCompiledEndpoint, parseDeploymentEnvironment, parseProductionWebSocketUrl } from './vercelDeploymentEnvironment.mjs';

const allowedExtensions = /\.(?:html|js|css|json|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf|wasm)$/i;
const localWebSocket = /wss?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?=[:/"'\s]|$)/i;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const contained = (parent, child) => {
  const name = relative(parent, child);
  return name !== '' && !isAbsolute(name) && name !== '..' && !name.startsWith('../') && !name.startsWith('..\\');
};

/** Stage compiled assets only; never upload source, local packages or credentials. */
export async function prepareVercelStaticArtifact({ workspace, buildDirectory, outputDirectory, projectId, teamId, environment = 'preview', productionWebSocketUrl }) {
  const deploymentEnvironment = parseDeploymentEnvironment(environment);
  const endpoint = deploymentEnvironment === 'production' ? parseProductionWebSocketUrl(productionWebSocketUrl) : undefined;
  if (deploymentEnvironment === 'preview' && productionWebSocketUrl !== undefined) throw new Error('Production endpoint supplied for preview artifact');
  if (typeof workspace !== 'string' || typeof buildDirectory !== 'string' || typeof outputDirectory !== 'string') throw new Error('Artifact paths must be strings');
  if (typeof projectId !== 'string' || !/^prj_[A-Za-z0-9]+$/.test(projectId)) throw new Error('Invalid Vercel project ID');
  if (typeof teamId !== 'string' || !/^team_[A-Za-z0-9]+$/.test(teamId)) throw new Error('Invalid Vercel team ID');
  const root = await realpath(resolve(workspace));
  const build = await realpath(resolve(root, buildDirectory));
  const output = resolve(root, outputDirectory);
  if (!contained(root, build) || !contained(root, output) || contained(build, output) || contained(output, build) || build === output) throw new Error('Build and output must be separate workspace directories');
  const outputParent = await realpath(dirname(output));
  if (outputParent !== root && !contained(root, outputParent)) throw new Error('Artifact output parent escaped workspace');
  const files = [];
  let totalBytes = 0;
  let compiledEndpointFound = false;
  const collect = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Artifact symbolic links are forbidden');
      const path = join(directory, entry.name);
      const name = relative(build, path).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        if (/(?:^|\/)(?:src|server|node_modules|\.git|\.vercel|packages)(?:\/|$)/i.test(name)) throw new Error('Source or dependency directory in artifact');
        await collect(path);
      } else if (entry.isFile()) {
        if (!allowedExtensions.test(name) || /(?:^|\/)(?:auth\.json|\.env[^/]*|\.npmrc)$/i.test(name)) throw new Error('Unsupported or sensitive artifact file');
        // Reject oversized inputs before allocating a buffer for their contents.
        const metadata = await stat(path);
        if (metadata.size > 32 * 1024 * 1024 || totalBytes + metadata.size > 256 * 1024 * 1024 || files.length >= 5000) throw new Error('Artifact size budget exceeded');
        const bytes = await readFile(path);
        totalBytes += bytes.length;
        if (bytes.length > 32 * 1024 * 1024 || totalBytes > 256 * 1024 * 1024 || files.length >= 5000) throw new Error('Artifact size budget exceeded');
        if (/\.(?:js|html|json)$/i.test(name) && localWebSocket.test(bytes.toString('utf8'))) throw new Error('Production artifact contains a loopback WebSocket endpoint');
        if (endpoint && /\.js$/i.test(name) && containsCompiledEndpoint(bytes.toString('utf8'), endpoint)) compiledEndpointFound = true;
        files.push({ name, path, bytes, sha256: hash(bytes) });
      } else throw new Error('Unsupported artifact filesystem entry');
    }
  };
  await collect(build);
  const entry = files.find(file => file.name === 'index.html');
  if (!entry || !/id=["']root["']/.test(entry.bytes.toString('utf8'))) throw new Error('Application entry is missing');
  if (endpoint && !compiledEndpointFound) throw new Error('Compiled production WebSocket endpoint missing');
  // An existing destination is never merged with a different release.
  await mkdir(output);
  const vercel = join(output, '.vercel');
  const staticRoot = join(vercel, 'output/static');
  for (const file of files) {
    const destination = resolve(staticRoot, file.name);
    if (!contained(staticRoot, destination)) throw new Error('Artifact path escaped static root');
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(file.path, destination);
    if (hash(await readFile(destination)) !== file.sha256) throw new Error('Build changed during artifact staging');
  }
  await writeFile(join(vercel, 'project.json'), JSON.stringify({ projectId, orgId: teamId }, null, 2), { flag: 'wx' });
  await writeFile(join(vercel, 'output/config.json'), JSON.stringify({ version: 3, routes: [
    { handle: 'filesystem' }, { src: '/assets/(.*)', status: 404 }, { src: '/(.*)', dest: '/index.html' },
  ] }, null, 2), { flag: 'wx' });
  const receipt = { version: 1, projectId, teamId, source: 'compiled-static-assets', deploymentEnvironment,
    ...(endpoint ? { productionWebSocketUrl: endpoint } : {}), files: files.map(({name,sha256})=>({name,sha256})), totalBytes };
  await writeFile(join(output, 'artifact-receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
  return { output, files: files.length, totalBytes, projectId, teamId };
}
