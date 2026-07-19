import { describe, expect, it } from 'vitest';

import { loadStandardPresetById, parseStandardPresetModule } from '../presetLoader';

describe('loadStandardPresetById', () => {
  it('single-flights the canonical key and persisted diagram id', async () => {
    const byId = loadStandardPresetById('logistics-architecture-v1');
    const byKey = loadStandardPresetById('LogisticsStandardData');

    expect(byId).toBe(byKey);
    await expect(byId).resolves.toMatchObject({
      id: 'logistics-architecture-v1',
      type: 'logistics',
    });
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
});
