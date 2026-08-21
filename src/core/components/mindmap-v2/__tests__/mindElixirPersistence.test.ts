import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '../../../types/plugin';
import {
  captureMindElixirPageState,
  createMindElixirPersistenceNodes,
  loadMindElixirData,
  saveMindElixirData,
} from '../mindElixirPersistence';

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

    expect(data.nodeData).toMatchObject({ id: 'root', topic: 'Imported' });
    expect(data.direction).toBe(1);
  });

  it('loads a validated legacy copy whose metadata node ID was remapped', () => {
    const data = loadMindElixirData(context([{
      id: 'node-page-copy-legacy-0',
      type: 'mindmap',
      hidden: true,
      data: {
        mindmapV2: {
          _version: 'mindmap-v2',
          nodeData: { id: 'root-2', topic: 'Copied topic', root: true, children: [] },
          direction: 2,
        },
      },
    }]));

    expect(data.nodeData).toMatchObject({ id: 'root', topic: 'Copied topic' });
  });

  it('uses a valid remapped payload when a stale canonical node is also present', () => {
    const data = loadMindElixirData(context([
      { id: '__mindmap_meta__', type: 'mindmap', hidden: true, data: { stale: true } },
      {
        id: 'node-page-copy-legacy-0',
        type: 'mindmap',
        hidden: true,
        data: {
          mindmapV2: {
            _version: 'mindmap-v2',
            nodeData: { id: 'root-2', topic: 'Recovered copy', root: true, children: [] },
            direction: 2,
          },
        },
      },
    ]));

    expect(data.nodeData).toMatchObject({ topic: 'Recovered copy' });
  });

  it('sanitizes malformed descendant topics before persisted data reaches the renderer', () => {
    const data = loadMindElixirData(context([{
      id: '__mindmap_meta__',
      data: {
        mindmapV2: {
          _version: 'mindmap-v2',
          nodeData: {
            id: 'legacy-root',
            topic: 'Imported',
            children: [{ id: 'child', topic: undefined, children: [] }],
          },
          direction: 2,
        },
      },
    }]));

    expect(data.nodeData.children?.[0]).toMatchObject({
      id: 'child',
      topic: 'Untitled node',
    });
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
        pageCopyIdPolicy: 'preserve',
        pageContentMetrics: { version: 1, nodeCount: 1, edgeCount: 0 },
        mindmapV2: {
          _version: 'mindmap-v2',
          direction: 2,
          nodeData: { id: 'root', topic: 'Saved' },
        },
      },
    });
  });

  it('normalizes remapped metadata to one canonical persistence node', () => {
    const next = createMindElixirPersistenceNodes([
      { id: 'keep', position: { x: 0, y: 0 }, data: {} },
      {
        id: 'node-page-copy-legacy-0',
        type: 'mindmap',
        hidden: true,
        position: { x: -9999, y: -9999 },
        data: {
          mindmapV2: {
            _version: 'mindmap-v2',
            nodeData: { id: 'legacy', topic: 'Legacy', root: true, children: [] },
            direction: 2,
          },
        },
      },
    ], {
      nodeData: {
        id: 'root',
        topic: 'Current',
        children: [{ id: 'child', topic: 'Child', children: [] }],
      },
      direction: 2,
    });

    expect(next.map(node => node.id)).toEqual(['keep', '__mindmap_meta__']);
    expect(next[1]?.data).toMatchObject({
      pageCopyIdPolicy: 'preserve',
      pageContentMetrics: { version: 1, nodeCount: 2, edgeCount: 0 },
    });
  });

  it('captures the live mind map synchronously before a page switch', () => {
    const existingNodes = [{ id: 'keep', position: { x: 0, y: 0 }, data: {} }];
    const existingEdges = [{ id: 'edge-1', source: 'a', target: 'b' }];
    const pageState = captureMindElixirPageState(
      context(existingNodes, existingEdges),
      {
        getData: () => ({
          nodeData: { id: 'root', topic: '第二页主题', root: true, children: [] },
          direction: 2,
        }),
      } as unknown as Parameters<typeof captureMindElixirPageState>[1],
    );

    expect(pageState.edges).toBe(existingEdges);
    expect(pageState.nodes.map(node => node.id)).toEqual(['keep', '__mindmap_meta__']);
    expect(pageState.nodes[1]).toMatchObject({
      data: {
        pageCopyIdPolicy: 'preserve',
        pageContentMetrics: { version: 1, nodeCount: 1, edgeCount: 0 },
        mindmapV2: {
          _version: 'mindmap-v2',
          nodeData: { id: 'root', topic: '第二页主题' },
        },
      },
    });
    expect(existingNodes).toHaveLength(1);
  });
});
