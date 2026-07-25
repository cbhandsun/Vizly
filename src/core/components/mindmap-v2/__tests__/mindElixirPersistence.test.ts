import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '../../../types/plugin';
import { loadMindElixirData, saveMindElixirData } from '../mindElixirPersistence';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const context = (
  nodes: Array<Record<string, unknown>> = [],
  edges: Array<Record<string, unknown>> = [],
  setNodes = vi.fn(),
): PluginContext => ({
  getNodes: () => nodes,
  getEdges: () => edges,
  setNodes,
} as unknown as PluginContext);

describe('mindElixirPersistence', () => {
  it('returns a fresh bounded tree for an empty canvas', () => {
    const data = loadMindElixirData(context());

    expect(data.direction).toBe(2);
    expect(data.nodeData).toMatchObject({
      id: 'root',
      topic: '中心主题',
      root: true,
    });
  });

  it('loads only a validated v2 payload from the metadata node', () => {
    const data = loadMindElixirData(context([{
      id: '__mindmap_meta__',
      data: {
        mindmapV2: {
          _version: 'mindmap-v2',
          nodeData: { id: 'root-2', topic: 'Imported', root: true, children: [] },
          direction: 1,
          themeKey: 'ocean',
        },
      },
    }]));

    expect(data.nodeData).toMatchObject({ id: 'root-2', topic: 'Imported' });
    expect(data.direction).toBe(1);
  });

  it('replaces stale metadata with a sanitized single payload node', () => {
    const setNodes = vi.fn();
    saveMindElixirData(context([], [], setNodes), {
      getData: () => ({
        nodeData: { id: 'root', topic: 'Saved', root: true, children: [] },
        direction: Number.POSITIVE_INFINITY,
      }),
    } as unknown as Parameters<typeof saveMindElixirData>[1]);

    const updater = setNodes.mock.calls[0][0] as (nodes: Array<Record<string, unknown>>) => Array<Record<string, unknown>>;
    const next = updater([
      { id: 'keep', data: {} },
      { id: '__mindmap_meta__', data: { stale: true } },
    ]);

    expect(next.map(node => node.id)).toEqual(['keep', '__mindmap_meta__']);
    expect(next[1]).toMatchObject({
      hidden: true,
      data: {
        mindmapV2: {
          _version: 'mindmap-v2',
          direction: 2,
          nodeData: { id: 'root', topic: 'Saved' },
        },
      },
    });
  });
});
