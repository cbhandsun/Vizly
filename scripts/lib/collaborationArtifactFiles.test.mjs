// @vitest-environment node
import { expect, it } from 'vitest';
import { createCollaborationArtifactFiles } from './collaborationArtifactFiles.mjs';

it('uses a discoverable JS API entry with CommonJS metadata and matching function configuration', () => {
  const source = Buffer.from('module.exports = {default: syntheticServer};');
  const files = createCollaborationArtifactFiles(source);
  expect(files.map(file => file.file)).toEqual(['api/index.js', 'package.json', 'vercel.json']);
  expect(files[0].data).toEqual(source);
  expect(JSON.parse(files[1].data)).toMatchObject({ private: true, type: 'commonjs', engines: { node: '24.x' } });
  const config = JSON.parse(files[2].data);
  expect(config).toMatchObject({ fluid: true, functions: { 'api/index.js': { maxDuration: 300 } },
    rewrites: [{ source: '/(.*)', destination: '/api/index' }] });
  expect(files.map(file => file.file).some(name => /\.cjs$|\.env|\.map$/.test(name))).toBe(false);
  source.fill(0);
  expect(files[0].data.toString()).toContain('syntheticServer');
});

it.each([undefined, null, '', 'module.exports = {}', {}, [], new Uint8Array(0), new Uint8Array(16 * 1024 * 1024 + 1)])(
  'rejects empty, invalid or excessive compiled input %#', input => {
    expect(() => createCollaborationArtifactFiles(input)).toThrow('Invalid compiled collaboration artifact');
  },
);

it('retains non-ASCII compiled bytes and accepts the exact size boundary', () => {
  const bytes = Buffer.from('module.exports = "协同";');
  expect(createCollaborationArtifactFiles(bytes)[0].data).toEqual(bytes);
  expect(createCollaborationArtifactFiles(new Uint8Array(16 * 1024 * 1024))[0].data.byteLength).toBe(16 * 1024 * 1024);
});
