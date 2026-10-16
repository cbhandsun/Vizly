// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installLockedCoreArtifact, assertLockedDependencyGraph } from './installLockedCoreArtifact.mjs';

const roots = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'vizly-locked-core-')); roots.push(root);
  const pkg = { name: 'vizly-app', dependencies: { '@vizly/core': 'file:old.tgz' } };
  const lock = { lockfileVersion: 3, packages: { '': { dependencies: pkg.dependencies },
    'node_modules/@vizly/core': { version: '1.0.0', resolved: 'file:old.tgz', integrity: 'old' },
    'node_modules/required': { version: '2.0.0', resolved: 'https://registry.npmjs.org/required', integrity: 'fixed' },
    'node_modules/optional': { version: '1.0.0', optional: true } } };
  const pkgBytes = JSON.stringify(pkg) + '\r\n', lockBytes = JSON.stringify(lock) + '\r\n';
  await writeFile(join(root, 'package.json'), pkgBytes); await writeFile(join(root, 'package-lock.json'), lockBytes);
  const artifact = join(root, 'core.tgz'); await writeFile(artifact, 'compiled fixture bytes');
  const readManifest = () => ({ name: '@vizly/core', version: '1.0.1' });
  const runInstall = async () => {
    const overlay = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
    delete overlay.packages['node_modules/optional'];
    await mkdir(join(root, 'node_modules/@vizly/core'), { recursive: true });
    await writeFile(join(root, 'node_modules/.package-lock.json'), JSON.stringify(overlay));
    await writeFile(join(root, 'node_modules/@vizly/core/package.json'), JSON.stringify(readManifest()));
  };
  return { root, artifact, pkgBytes, lockBytes, lock, readManifest, runInstall };
}
async function assertRestored(f) {
  expect(await readFile(join(f.root, 'package.json'), 'utf8')).toBe(f.pkgBytes);
  expect(await readFile(join(f.root, 'package-lock.json'), 'utf8')).toBe(f.lockBytes);
  expect(await readdir(f.root)).not.toContain('.vizly-core-install.lock');
  expect(await readdir(join(f.root, 'tmp'))).toEqual([]);
}
describe('locked Core installation transaction', () => {
  it('installs the overlay then restores exact original source bytes', async () => {
    const f = await fixture();
    expect(await installLockedCoreArtifact(f.root, f.artifact, f)).toMatchObject({ version: '1.0.1' });
    await assertRestored(f);
  });
  it('restores original source bytes after npm modifies sources and fails', async () => {
    const f = await fixture();
    await expect(installLockedCoreArtifact(f.root, f.artifact, { ...f, runInstall: async () => {
      await writeFile(join(f.root, 'package.json'), 'changed by npm'); throw new Error('npm failed');
    } })).rejects.toThrow('npm failed');
    await assertRestored(f);
  });
  it('rejects installed dependency drift and still restores source files', async () => {
    const f = await fixture();
    await expect(installLockedCoreArtifact(f.root, f.artifact, { ...f, runInstall: async () => {
      await f.runInstall(); const path = join(f.root, 'node_modules/.package-lock.json');
      const graph = JSON.parse(await readFile(path, 'utf8')); graph.packages['node_modules/required'].version = '3.0.0';
      await writeFile(path, JSON.stringify(graph));
    } })).rejects.toThrow('drifted');
    await assertRestored(f);
  });
  it('preserves rejection even when the failure value is undefined', async () => {
    const f = await fixture();
    const outcome = await installLockedCoreArtifact(f.root, f.artifact, { ...f, runInstall: () => Promise.reject(undefined) })
      .then(() => 'unexpected success', () => 'rejected');
    expect(outcome).toBe('rejected');
    await assertRestored(f);
  });
  it('rejects oversized artifact before installation', async () => {
    const f = await fixture(); await truncate(f.artifact, 128 * 1024 * 1024 + 1);
    await expect(installLockedCoreArtifact(f.root, f.artifact, f)).rejects.toThrow('size');
    expect(await readFile(join(f.root, 'package.json'), 'utf8')).toBe(f.pkgBytes);
  });
  it('rejects concurrent installation without taking ownership of the other lock', async () => {
    const f = await fixture(); await writeFile(join(f.root, '.vizly-core-install.lock'), 'other install');
    await expect(installLockedCoreArtifact(f.root, f.artifact, f)).rejects.toThrow();
    expect(await readFile(join(f.root, '.vizly-core-install.lock'), 'utf8')).toBe('other install');
    expect(await readFile(join(f.root, 'package.json'), 'utf8')).toBe(f.pkgBytes);
  });
  it('rejects unsafe manifest before changing sources', async () => {
    const f = await fixture();
    await expect(installLockedCoreArtifact(f.root, f.artifact, { ...f, readManifest: () => null })).rejects.toThrow();
    await assertRestored(f);
  });
  it('rejects empty artifact and invalid archive', async () => {
    const f = await fixture(); await writeFile(f.artifact, '');
    await expect(installLockedCoreArtifact(f.root, f.artifact, f)).rejects.toThrow('size');
    await writeFile(f.artifact, 'invalid tar');
    await expect(installLockedCoreArtifact(f.root, f.artifact)).rejects.toThrow('manifest');
    await assertRestored(f);
  });
  it('rejects a temporary directory escaping the host', async () => {
    const f = await fixture(), outside = await mkdtemp(join(tmpdir(), 'vizly-core-outside-')); roots.push(outside);
    await symlink(outside, join(f.root, 'tmp'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(installLockedCoreArtifact(f.root, f.artifact, f)).rejects.toThrow('stay in the host');
    expect(await readdir(outside)).toEqual([]);
    expect(await readFile(join(f.root, 'package.json'), 'utf8')).toBe(f.pkgBytes);
  });
});
describe('installed locked dependency graph', () => {
  it('rejects package names inherited from Object.prototype', () => {
    const actual = JSON.parse('{"packages":{"__proto__":{}}}');
    expect(() => assertLockedDependencyGraph({ packages: {} }, actual)).toThrow();
  });
  it('permits only missing optional platform packages', () => {
    expect(() => assertLockedDependencyGraph({ packages: { a: { version: '1', optional: true } } }, { packages: {} })).not.toThrow();
    expect(() => assertLockedDependencyGraph({ packages: { a: { version: '1' } } }, { packages: {} })).toThrow('missing');
  });
  it('rejects added packages, integrity changes, and malformed inventories', () => {
    expect(() => assertLockedDependencyGraph({ packages: {} }, { packages: { added: {} } })).toThrow();
    expect(() => assertLockedDependencyGraph({ packages: { a: { integrity: 'locked' } } }, { packages: { a: { integrity: 'other' } } })).toThrow();
    expect(() => assertLockedDependencyGraph(null, {})).toThrow();
  });
});
