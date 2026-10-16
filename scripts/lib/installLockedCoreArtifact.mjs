import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { open, readFile, writeFile, copyFile, mkdir, realpath, stat, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { createCoreArtifactLockOverlay } from './coreArtifactLockOverlay.mjs';

/** @param {unknown} value @returns {Record<string, unknown>} */
const record = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid installed dependency inventory');
  return /** @type {Record<string, unknown>} */ (value);
};

/** @param {unknown} expected @param {unknown} actual */
export function assertLockedDependencyGraph(expected, actual) {
  const locked = record(record(expected).packages), installed = record(record(actual).packages);
  for (const [name, entry] of Object.entries(installed)) {
    if (name === '') continue;
    if (!Object.hasOwn(locked, name)) throw new Error('An unexpected dependency is installed');
    const original = record(locked[name]), current = record(entry);
    for (const key of ['version', 'resolved', 'integrity']) {
      if (original[key] !== current[key]) throw new Error('Installed dependency graph drifted from the lockfile');
    }
  }
  for (const [name, entry] of Object.entries(locked)) {
    if (name !== '' && !Object.hasOwn(installed, name) && record(entry).optional !== true) {
      throw new Error('A required locked dependency is missing');
    }
  }
}

/** @param {string} artifactPath @returns {unknown} */
function readArtifactManifest(artifactPath) {
  const result = spawnSync('tar', ['-xOf', artifactPath, 'package/package.json'], {
    encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 30_000, windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error('Cannot read compiled Core artifact manifest');
  try { return JSON.parse(result.stdout); } catch { throw new Error('Invalid compiled Core artifact manifest'); }
}

/** @param {string} root */
function runNpmCi(root) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: root, stdio: 'ignore', timeout: 20 * 60_000, windowsHide: true, shell: process.platform === 'win32',
  });
  if (result.error || result.status !== 0) throw new Error('Locked Core artifact npm ci failed');
}

/**
 * Install a compiled Core without resolving unrelated host dependencies.
 * Source manifests are restored byte-for-byte even when npm fails.
 * @param {string} rootPath
 * @param {string} artifactPath
 * @param {{runInstall?: (root: string) => void | Promise<void>, readManifest?: (path: string) => unknown}} options
 */
export async function installLockedCoreArtifact(rootPath, artifactPath, options = {}) {
  const root = await realpath(resolve(rootPath));
  const input = await realpath(resolve(artifactPath));
  const metadata = await stat(input);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > 128 * 1024 * 1024) throw new Error('Invalid compiled Core artifact size');
  const lockPath = join(root, '.vizly-core-install.lock');
  const guard = await open(lockPath, 'wx');
  const pkgPath = join(root, 'package.json'), sourceLockPath = join(root, 'package-lock.json');
  /** @type {Buffer | undefined} */ let pkgBytes;
  /** @type {Buffer | undefined} */ let lockBytes;
  /** @type {string | undefined} */ let copiedArtifact;
  let overlayWritten = false;
  /** @type {unknown} */ let failure;
  let failed = false;
  /** @type {{integrity: string, version: unknown} | undefined} */ let receipt;
  try {
    pkgBytes = await readFile(pkgPath); lockBytes = await readFile(sourceLockPath);
    const tmp = join(root, 'tmp');
    await mkdir(tmp, { recursive: true });
    if (await realpath(tmp) !== tmp) throw new Error('Core install temporary directory must stay in the host');
    const relative = `tmp/ci-core-artifact-${randomBytes(12).toString('hex')}.tgz`;
    const destination = join(root, relative);
    await copyFile(input, destination, constants.COPYFILE_EXCL);
    copiedArtifact = destination;
    const bytes = await readFile(copiedArtifact);
    const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
    const overlay = createCoreArtifactLockOverlay(JSON.parse(pkgBytes.toString('utf8')), JSON.parse(lockBytes.toString('utf8')),
      (options.readManifest ?? readArtifactManifest)(copiedArtifact), relative, integrity);
    overlayWritten = true;
    await writeFile(pkgPath, JSON.stringify(overlay.packageJson, null, 2) + '\n');
    await writeFile(sourceLockPath, JSON.stringify(overlay.lockfile, null, 2) + '\n');
    await (options.runInstall ?? runNpmCi)(root);
    assertLockedDependencyGraph(overlay.lockfile, JSON.parse(await readFile(join(root, 'node_modules/.package-lock.json'), 'utf8')));
    const installedManifest = record(JSON.parse(await readFile(join(root, 'node_modules/@vizly/core/package.json'), 'utf8')));
    if (installedManifest.name !== '@vizly/core' || installedManifest.version !== record(overlay.lockfile.packages['node_modules/@vizly/core']).version) {
      throw new Error('Installed Core artifact identity differs');
    }
    receipt = { integrity, version: installedManifest.version };
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    // Attempt every restoration and cleanup, including after a partial source write.
    const cleanup = await Promise.allSettled([
      ...(overlayWritten && pkgBytes && lockBytes ? [writeFile(pkgPath, pkgBytes), writeFile(sourceLockPath, lockBytes)] : []),
      ...(copiedArtifact ? [unlink(copiedArtifact)] : []),
      guard.close(),
    ]);
    try { await unlink(lockPath); } catch (error) { cleanup.push({ status: 'rejected', reason: error }); }
    const errors = cleanup.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) {
      failure = new AggregateError([...(failed ? [failure] : []), ...errors], 'Core install source restoration or cleanup failed');
      failed = true;
    }
  }
  if (failed) throw failure;
  if (!receipt) throw new Error('Core artifact installation did not produce a receipt');
  return receipt;
}
