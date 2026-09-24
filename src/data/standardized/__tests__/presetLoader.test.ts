import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadStandardPresetAsset,
  loadStandardPresetById,
  parseStandardPresetModule,
  parseStandardPresetText,
} from '../presetLoader';

const logisticsPresetSource = readFileSync(
  'src/data/standardized/LogisticsStandardData.json',
  'utf8',
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadStandardPresetById', () => {
  it('single-flights the canonical key and persisted diagram id', async () => {
    const fetchPreset = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(logisticsPresetSource, { status: 200 }),
    );
    const byId = loadStandardPresetById('logistics-architecture-v1');
    const byKey = loadStandardPresetById('LogisticsStandardData');

    expect(byId).toBe(byKey);
    await expect(byId).resolves.toMatchObject({
      id: 'logistics-architecture-v1',
      type: 'logistics',
    });
    expect(fetchPreset).toHaveBeenCalledTimes(1);
  });

  it('returns null for unknown ids without importing a fallback preset', async () => {
    await expect(loadStandardPresetById('unknown-diagram')).resolves.toBeNull();
  });

  it('parses wrapped and direct preset modules through the diagram boundary', () => {
    const raw = {
      id: 'test-preset',
      name: 'Test preset',
      type: 'custom',
      version: '1',
      nodes: [{ id: 'node-1', type: 'custom', description: 'Node' }],
      edges: [],
    };

    expect(parseStandardPresetModule({ default: raw }, 'BlankCanvasStandardData'))
      .toMatchObject({ id: 'test-preset', nodes: [{ id: 'node-1' }], edges: [] });
    expect(parseStandardPresetModule(raw, 'BlankCanvasStandardData'))
      .toMatchObject({ id: 'test-preset' });
  });

  it('rejects missing, empty, and incorrectly typed preset payloads', () => {
    expect(() => parseStandardPresetModule(null, 'BlankCanvasStandardData')).toThrow('Invalid standard preset');
    expect(() => parseStandardPresetModule({ default: {} }, 'BlankCanvasStandardData'))
      .toThrow('Invalid standard preset');
    expect(() => parseStandardPresetModule({
      id: '',
      nodes: [],
      edges: [],
    }, 'BlankCanvasStandardData')).toThrow('Invalid standard preset');
    expect(() => parseStandardPresetModule({
      id: 'bad-preset',
      nodes: 'not-an-array',
      edges: [],
    }, 'BlankCanvasStandardData')).toThrow('Invalid standard preset');
  });

  it('bounds and validates emitted JSON assets before coercion', () => {
    expect(() => parseStandardPresetText('', 'BlankCanvasStandardData'))
      .toThrow('Invalid standard preset asset');
    expect(() => parseStandardPresetText('{', 'BlankCanvasStandardData'))
      .toThrow('Invalid standard preset asset');
    expect(() => parseStandardPresetText(' '.repeat(1024 * 1024 + 1), 'BlankCanvasStandardData'))
      .toThrow('Invalid standard preset asset');
    expect(parseStandardPresetText(logisticsPresetSource, 'LogisticsStandardData'))
      .toMatchObject({ id: 'logistics-architecture-v1' });
  });

  it('expands a bounded compact architecture asset before coercion', () => {
    const compact = {
      compactStandardPresetVersion: 1,
      document: ['enterprise', 'Enterprise', 'architecture', '1', {}, {}, {}, {}, ['core']],
      nodes: [['n1', 'Node\nFirst\nSecond', 0, 'mid', null]],
      edges: [['e1', 0, 0, 1, 'self']],
    };

    expect(parseStandardPresetText(JSON.stringify(compact), 'ArchitectureStandardData'))
      .toMatchObject({
        id: 'enterprise',
        nodes: [{ id: 'n1', description: '<b>Node</b><br/>• First<br/>• Second', domainClass: 'mid', zIndex: 10 }],
        edges: [{ id: 'e1', source: 'n1', target: 'n1', label: 'self' }],
      });
  });

  it.each([
    { compactStandardPresetVersion: 2, document: [], nodes: [], edges: [] },
    { compactStandardPresetVersion: 1, document: ['id'], nodes: [], edges: [] },
    { compactStandardPresetVersion: 1, document: ['id', 'n', 't', '1', {}, {}, {}, {}, ['core']], nodes: [['short']], edges: [] },
    { compactStandardPresetVersion: 1, document: ['id', 'n', 't', '1', {}, {}, {}, {}, ['core']], nodes: [], edges: [[1, 0, 0, 0, null]] },
    { compactStandardPresetVersion: 1, document: ['id', 'n', 't', '1', {}, {}, {}, {}, ['core']], nodes: [], edges: [], extra: true },
  ])('rejects malformed compact preset %#', compact => {
    expect(() => parseStandardPresetText(JSON.stringify(compact), 'ArchitectureStandardData'))
      .toThrow('Invalid compact standard preset');
  });

  it('fails closed when an emitted asset cannot be fetched', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    await expect(loadStandardPresetAsset('/preset.json', 'BlankCanvasStandardData'))
      .rejects.toThrow('Standard preset asset unavailable: BlankCanvasStandardData');
  });

  it('rejects an oversized declared asset before reading its body', async () => {
    const response = new Response(logisticsPresetSource, {
      headers: { 'content-length': String(1024 * 1024 + 1) },
    });
    const readBody = vi.spyOn(response, 'text');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    await expect(loadStandardPresetAsset('/preset.json', 'BlankCanvasStandardData'))
      .rejects.toThrow('Invalid standard preset asset: BlankCanvasStandardData');
    expect(readBody).not.toHaveBeenCalled();
  });
});
