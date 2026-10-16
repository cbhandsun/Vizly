// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STANDARD_PRESET_KEYS } from '../presetMetadata';
import { parseStandardPresetCatalog, parseStandardPresetText } from '../presetLoader';

const source = readFileSync(new URL('../StandardPresetCatalog.json', import.meta.url), 'utf8');
describe('aggregate preset catalog boundary', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
  it('matches every individual asset exactly and detects catalog drift', () => {
    const raw: unknown = JSON.parse(source);
    if (!raw || typeof raw !== 'object' || !('presets' in raw)) throw new Error('Invalid fixture');
    const catalog = parseStandardPresetCatalog(source);
    for (const key of STANDARD_PRESET_KEYS) {
      const individual = readFileSync(new URL(`../${key}.json`, import.meta.url), 'utf8');
      expect((raw.presets as Record<string, unknown>)[key]).toEqual(JSON.parse(individual));
      expect(catalog[key]).toEqual(parseStandardPresetText(individual, key));
    }
  });
  it.each([null, '', '{', '{}', '[]', JSON.stringify({ schemaVersion: 2, presets: {} }), 'x'.repeat(2 * 1024 * 1024 + 1)])('rejects malformed, empty and oversized catalogs', value => {
    expect(() => parseStandardPresetCatalog(value)).toThrow();
  });
  it('rejects a malformed member and extra or missing keys atomically', () => {
    const value = JSON.parse(source) as { schemaVersion: number; presets: Record<string, unknown> };
    value.presets.ArchitectureStandardData = {};
    expect(() => parseStandardPresetCatalog(JSON.stringify(value))).toThrow();
    delete value.presets.ArchitectureStandardData;
    expect(() => parseStandardPresetCatalog(JSON.stringify(value))).toThrow();
    value.presets.extra = {};
    expect(() => parseStandardPresetCatalog(JSON.stringify(value))).toThrow();
  });
  it('retries failures, shares the successful catalog request and seeds individual caches', async () => {
    vi.resetModules();
    const fetch = vi.fn().mockRejectedValueOnce(new Error('transport failed')).mockResolvedValue(new Response(source));
    vi.stubGlobal('fetch', fetch);
    const module = await import('../presetLoader');
    await expect(module.loadStandardPresetCatalog()).rejects.toThrow('transport failed');
    const first = module.loadStandardPresetCatalog();
    expect(module.loadStandardPresetCatalog()).toBe(first);
    const catalog = await first;
    expect(await module.loadStandardPresetById('WmsStandardData')).toBe(catalog.WmsStandardData);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([new Response('', { status: 503 }), new Response(source, { headers: { 'content-length': '9999999999' } }), new Response(source, { headers: { 'content-length': 'invalid' } })])('rejects response failures and unsafe declared sizes', async response => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const module = await import('../presetLoader');
    await expect(module.loadStandardPresetCatalog()).rejects.toThrow();
  });
});
