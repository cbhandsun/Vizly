// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCoreArtifactLockOverlay } from './coreArtifactLockOverlay.mjs';

const fixture = () => {
  const core = { version: '0.1.0-alpha.8', resolved: 'file:vendor/old.tgz', integrity: 'old', dependencies: { '@vizly/contracts': '0.1.0-alpha.2' }, peerDependencies: { react: '^19.2.8' } };
  return { pkg: { name: 'vizly-app', dependencies: { '@vizly/core': 'file:vendor/old.tgz', react: '19.2.8' } },
    lock: { lockfileVersion: 3, packages: { '': { dependencies: { '@vizly/core': 'file:vendor/old.tgz', react: '19.2.8' } }, 'node_modules/@vizly/core': core, 'node_modules/react': { version: '19.2.8', integrity: 'locked-react' } } },
    manifest: { name: '@vizly/core', ...structuredClone(core) }, path: 'tmp/ci-core-artifact-' + 'a'.repeat(24) + '.tgz', integrity: 'sha512-' + 'A'.repeat(86) + '==' };
};
const apply = f => createCoreArtifactLockOverlay(f.pkg, f.lock, f.manifest, f.path, f.integrity);

describe('locked compiled Core replacement', () => {
  it('treats absent and empty dependency metadata equally', () => {
    const f = fixture(); f.manifest.engines = {};
    expect(() => apply(f)).not.toThrow();
  });
  it('replaces only the Core artifact and preserves unrelated locked package entries', () => {
    const f = fixture(), before = JSON.stringify(f), result = apply(f);
    expect(JSON.stringify(f)).toBe(before);
    expect(result.lockfile.packages['node_modules/react']).toBe(f.lock.packages['node_modules/react']);
    expect(result.lockfile.packages['node_modules/@vizly/core']).toMatchObject({ resolved: 'file:' + f.path, integrity: f.integrity });
    expect(result.packageJson.dependencies.react).toBe('19.2.8');
  });
  it('allows a new Core version while retaining its existing dependency graph', () => {
    const f = fixture(); f.manifest.version = '0.1.0-alpha.9';
    expect(apply(f).lockfile.packages['node_modules/@vizly/core'].version).toBe('0.1.0-alpha.9');
  });
  it.each([null, [], {}, { lockfileVersion: 2 }])('rejects malformed lock input %#', value => {
    const f = fixture(); expect(() => createCoreArtifactLockOverlay(f.pkg, value, f.manifest, f.path, f.integrity)).toThrow();
  });
  it.each(['', '../outside.tgz', '/outside.tgz', 'tmp/ci-core-artifact-' + 'a'.repeat(24) + '.tgz\n', 'x'.repeat(10_000)])('rejects unsafe artifact paths %#', path => {
    const f = fixture(); expect(() => createCoreArtifactLockOverlay(f.pkg, f.lock, f.manifest, path, f.integrity)).toThrow();
  });
  it('rejects dependency and peer upgrades instead of re-resolving the host graph', () => {
    const f = fixture(); f.manifest.dependencies = { '@vizly/contracts': 'new-version' };
    expect(() => apply(f)).toThrow('dependency graph differs');
    const peer = fixture(); peer.manifest.peerDependencies = { react: '^20.0.0' };
    expect(() => apply(peer)).toThrow('dependency graph differs');
  });
  it('rejects added dependencies and mismatched source/lock Core declarations', () => {
    const f = fixture(); f.manifest.dependencies.extra = '1.0.0'; expect(() => apply(f)).toThrow();
    const inconsistent = fixture(); inconsistent.pkg.dependencies['@vizly/core'] = 'file:other.tgz'; expect(() => apply(inconsistent)).toThrow();
  });
  it('rejects prototype pollution metadata and artifact lifecycle hooks', () => {
    const f = fixture(); const unsafe = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(() => createCoreArtifactLockOverlay(f.pkg, f.lock, unsafe, f.path, f.integrity)).toThrow();
    expect({}.polluted).toBeUndefined();
    expect(() => createCoreArtifactLockOverlay(f.pkg, f.lock, { ...f.manifest, scripts: { postinstall: 'untrusted' } }, f.path, f.integrity)).toThrow('install hooks');
  });
  it.each(['', 'sha512-short', 'x'.repeat(100_000)])('rejects invalid integrity %#', integrity => {
    const f = fixture(); expect(() => createCoreArtifactLockOverlay(f.pkg, f.lock, f.manifest, f.path, integrity)).toThrow();
  });
});
