// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build, type Rollup } from 'vite';
import { describe, expect, it } from 'vitest';
import { minifyBoundedJsonAsset } from '../../vite-plugins/boundedJsonAssets';

const appRoot = resolve(import.meta.dirname, '../..');
const fixtureDocument = {
  id: 'enterprise', name: 'Enterprise', type: 'architecture', version: '1',
  layout: {}, theme: {}, config: {}, metadata: { futureField: 'preserved' },
  nodes: [{ id: 'n1', description: '<b>Node</b><br/>• First<br/>• Second', domain: 'core', domainClass: 'mid', type: 'custom', zIndex: 17, extra: { x: 3 } }],
  edges: [{ id: 'e1', source: 'n1', target: 'n1', type: 'dependency', label: 'self', custom: true }],
};

async function buildFixture(assets: Record<string, string | Uint8Array>, base = '/nested/') {
  const root = await mkdtemp(join(tmpdir(), 'vizly-json-assets-'));
  try {
    for (const [file, source] of Object.entries(assets)) {
      const absolute = join(root, 'src', file);
      await mkdir(resolve(absolute, '..'), { recursive: true });
      await writeFile(absolute, source);
    }
    await writeFile(join(root, 'index.html'), '<script type="module" src="/src/main.ts"></script>');
    await writeFile(join(root, 'src/main.ts'), Object.keys(assets).map((file, index) =>
      `import url${index} from './${file}?url&no-inline'; globalThis.asset${index} = url${index};`).join('\n'));
    const result = await build({ root, base, configFile: join(appRoot, 'vite.config.ts'), logLevel: 'silent',
      build: { write: false, minify: false, assetsInlineLimit: 4096 } });
    if (!result || Array.isArray(result) || !('output' in result)) throw new Error('Unexpected Vite build output');
    return result.output;
  } finally { await rm(root, { recursive: true, force: true }); }
}

const assetText = (asset: Rollup.OutputAsset): string => typeof asset.source === 'string'
  ? asset.source : Buffer.from(asset.source).toString('utf8');

describe('bounded JSON assets in the actual public App build', () => {
  it('minifies emitted locales and presets before hashing while preserving every field', async () => {
    const locale = { nested: { message: '中文 😀', count: 1 }, values: [false, null, 'a'] };
    const output = await buildFixture({
      'locales/en.json': JSON.stringify(locale, null, 2),
      'data/standardized/ArchitectureStandardData.json': JSON.stringify(fixtureDocument, null, 2),
      'data/standardized/BlankCanvasStandardData.json': '{\n  "nodes": [],\n  "edges": []\n}',
      'other/route.json': '{\n  "untouched": true\n}',
    });
    const assets = output.filter((item): item is Rollup.OutputAsset => item.type === 'asset');
    for (const [prefix, expected] of [['en', locale], ['ArchitectureStandardData', fixtureDocument], ['BlankCanvasStandardData', { nodes: [], edges: [] }]] as const) {
      const emitted = assets.find(item => item.fileName.startsWith(`assets/${prefix}-`));
      expect(emitted).toBeDefined();
      if (!emitted) throw new Error('Missing emitted JSON asset');
      expect(emitted.fileName).toMatch(/-[\w-]+\.json$/);
      expect(assetText(emitted)).toBe(JSON.stringify(expected));
      expect(JSON.parse(assetText(emitted))).toEqual(expected);
    }
    const unrelated = assets.find(item => item.fileName.startsWith('assets/route-'));
    expect(unrelated && assetText(unrelated)).toBe('{\n  "untouched": true\n}');
    const chunks = output.filter((item): item is Rollup.OutputChunk => item.type === 'chunk');
    expect(chunks.map(item => item.code).join('\n')).not.toContain('data:application/json');
    for (const asset of assets.filter(item => item.fileName.endsWith('.json'))) {
      expect(chunks.some(chunk => chunk.code.includes(asset.fileName.split('/').at(-1) ?? 'missing'))).toBe(true);
    }
  });

  it('preserves every field in the current architecture preset', async () => {
    const source = await readFile(join(appRoot, 'src/data/standardized/ArchitectureStandardData.json'), 'utf8');
    expect(JSON.parse(minifyBoundedJsonAsset(source))).toEqual(JSON.parse(source));
  });

  it('hashes the minified payload consistently and changes the URL when content changes', async () => {
    const names: string[] = [];
    for (const source of ['{\n "message": "same"\n}', '{"message":"same"}', '{"message":"changed"}']) {
      const output = await buildFixture({ 'locales/en.json': source });
      const asset = output.find(item => item.type === 'asset' && item.fileName.startsWith('assets/en-'));
      if (!asset) throw new Error('Missing locale output');
      names.push(asset.fileName);
    }
    expect(names[0]).toBe(names[1]);
    expect(names[2]).not.toBe(names[1]);
  });

  it.each(['', '{"broken":', '[]', 'null', '1', '"text"'])('rejects invalid or non-object JSON %j', source => {
    expect(() => minifyBoundedJsonAsset(source)).toThrow();
  });

  it.each([null, undefined, 1, {}, new Uint8Array([1, 2, 3])])('rejects non-text input %j', source => {
    expect(() => minifyBoundedJsonAsset(source)).toThrow('UTF-8 text');
  });

  it.each(['__proto__', 'constructor', 'prototype'])('rejects unsafe nested keys %s', key => {
    expect(() => minifyBoundedJsonAsset(`{"safe":{"${key}":{"polluted":true}}}`)).toThrow('unsafe key');
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('bounds UTF-8 bytes, depth, value count and non-finite numbers', () => {
    expect(() => minifyBoundedJsonAsset(JSON.stringify({ value: '中'.repeat(750_000) }))).toThrow('2 MiB');
    expect(() => minifyBoundedJsonAsset('{"a":'.repeat(66) + '0' + '}'.repeat(66))).toThrow('deeply nested');
    expect(() => minifyBoundedJsonAsset(JSON.stringify({ values: Array(100_000).fill(0) }))).toThrow('too many values');
    expect(() => minifyBoundedJsonAsset('{"value":1e999}')).toThrow('non-finite');
    expect(minifyBoundedJsonAsset('{}')).toBe('{}');
  });

  it.each(['{"broken":', new Uint8Array([0xc3, 0x28])])('fails the actual build on invalid asset input', async source => {
    await expect(buildFixture({ 'locales/zh.json': source })).rejects.toThrow();
  });
});
