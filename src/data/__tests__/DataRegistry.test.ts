import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataRegistry, normalizeLocalDiagramForRegistry } from '../DataRegistry';
import { localDB } from '../../services/IndexedDBStorage';
import * as presetLoader from '../standardized/presetLoader';
import type { StandardDiagramData } from '@vizly/core/types';

const makeLocalDiagram = (overrides: Record<string, unknown> = {}) => ({
  id: 'local-diagram',
  name: 'Local Diagram',
  type: 'flowchart',
  version: '1.0.0',
  nodes: [{
    id: 'node-1',
    description: 'Node 1',
    domain: 'ops',
    constructor: { polluted: true },
  }],
  edges: [],
  metadata: {
    title: 'Local Diagram',
    __proto__: { polluted: true },
  },
  layout: {
    type: 'custom',
    direction: 'LR',
    spacing: { horizontal: 100, vertical: 80 },
    padding: { horizontal: 20, vertical: 20 },
  },
  theme: { name: 'light', displayName: 'Light', domains: {} },
  ...overrides,
});

describe('DataRegistry local diagram normalization', () => {
  afterEach(() => { vi.restoreAllMocks(); dataRegistry.reset(); });
  it('propagates local storage read failures and allows initialization to retry', async () => {
    dataRegistry.reset();
    const failure = new Error('controlled local storage failure');
    vi.spyOn(presetLoader, 'loadStandardPresetById').mockResolvedValue(makeLocalDiagram() as unknown as StandardDiagramData);
    const read = vi.spyOn(localDB, 'listDiagrams').mockRejectedValueOnce(failure).mockResolvedValue([]);
    await expect(dataRegistry.initialize()).rejects.toBe(failure);
    expect(read).toHaveBeenCalledOnce();
    await expect(dataRegistry.initialize()).resolves.toBeUndefined();
    expect(read).toHaveBeenCalledTimes(2);
    await dataRegistry.initialize();
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('sanitizes persisted local diagrams before registry insertion', () => {
    const diagram = normalizeLocalDiagramForRegistry(makeLocalDiagram());

    expect(diagram.id).toBe('local-diagram');
    expect(Object.hasOwn(diagram.nodes[0], 'constructor')).toBe(false);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('merges built-in layout defaults for persisted built-in copies', () => {
    const builtIn = makeLocalDiagram({
      id: 'built-in',
      layout: {
        type: 'custom',
        direction: 'TB',
        spacing: { horizontal: 220, vertical: 140 },
        padding: { horizontal: 40, vertical: 32 },
        generateDomainGroups: true,
      },
    }) as unknown as StandardDiagramData;

    const diagram = normalizeLocalDiagramForRegistry(makeLocalDiagram({
      id: 'built-in',
      layout: {
        direction: 'LR',
      },
    }), builtIn);

    expect(diagram.layout).toMatchObject({
      type: 'custom',
      direction: 'LR',
      spacing: { horizontal: 220, vertical: 140 },
      padding: { horizontal: 40, vertical: 32 },
      generateDomainGroups: true,
    });
  });

  it('rejects invalid persisted local diagrams', () => {
    expect(() => normalizeLocalDiagramForRegistry({
      id: 'bad-local',
      name: 'Bad Local',
      nodes: 'not-an-array',
      edges: [],
    })).toThrow('Remote diagram is invalid');
  });
});
