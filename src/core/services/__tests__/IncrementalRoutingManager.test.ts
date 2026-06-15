import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { IncrementalRoutingManager } from '../IncrementalRoutingManager';
import type { PathFindingResult } from '../../types/routing';

const node = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 60
): Node => ({
  id,
  position: { x, y },
  data: {},
  measured: { width, height },
});

const edge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
});

const result = (edgeId: string, points: Array<{ x: number; y: number }>): PathFindingResult => ({
  jobId: edgeId,
  edgeId,
  path: '',
  points,
  labelX: 0,
  labelY: 0,
});

describe('IncrementalRoutingManager', () => {
  let manager: IncrementalRoutingManager;

  beforeEach(() => {
    manager = new IncrementalRoutingManager();
  });

  it('calculates buffered affected bounds and handles empty changes', () => {
    expect(manager.calculateAffectedBounds([], [], 50)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      buffer: 0,
    });

    expect(manager.calculateAffectedBounds([
      node('a', 100, 200, 80, 40),
      node('b', 300, 500, 120, 90),
    ], [], 25)).toEqual({
      x: 75,
      y: 175,
      width: 370,
      height: 440,
      buffer: 25,
    });
  });

  it('identifies directly connected edges and cached paths intersecting affected bounds', () => {
    manager.cachePath('cached-hit', result('cached-hit', [
      { x: 500, y: 500 },
      { x: 550, y: 550 },
    ]));
    manager.cachePath('cached-miss', result('cached-miss', [
      { x: 900, y: 900 },
      { x: 950, y: 950 },
    ]));

    const nodes = [
      node('changed', 100, 100),
      node('near', 130, 120),
      node('far', 900, 900),
      node('cache-source', 0, 0),
      node('cache-target', 10, 10),
    ];
    const edges = [
      edge('direct', 'changed', 'far'),
      edge('node-hit', 'near', 'far'),
      edge('cached-hit', 'cache-source', 'cache-target'),
      edge('cached-miss', 'far', 'cache-source'),
    ];
    const bounds = { x: 90, y: 90, width: 520, height: 520, buffer: 0 };

    const { affected, unchanged } = manager.identifyAffectedEdges(
      edges,
      nodes,
      new Set(['changed']),
      bounds
    );

    expect(affected.map(e => e.id).sort()).toEqual(['cached-hit', 'direct', 'node-hit']);
    expect(unchanged.map(e => e.id)).toEqual(['cached-miss']);
  });

  it('caches valid paths, ignores invalid paths, invalidates entries, and estimates stats', () => {
    manager.cachePath('too-short', result('too-short', [{ x: 0, y: 0 }]));
    expect(manager.getCachedPath('too-short')).toBeUndefined();

    manager.cachePath('edge-a', result('edge-a', [
      { x: 10, y: 20 },
      { x: 30, y: 60 },
      { x: 50, y: 40 },
    ]));

    expect(manager.getCachedPath('edge-a')).toMatchObject({
      edgeId: 'edge-a',
      bounds: { x: 10, y: 20, width: 40, height: 40 },
    });
    expect(manager.getStats()).toMatchObject({
      cachedPaths: 1,
      trackedNodes: 0,
      cacheMemoryEstimate: 148,
    });

    manager.invalidateEdges(['edge-a', 'missing']);
    expect(manager.getCachedPath('edge-a')).toBeUndefined();
  });

  it('creates context with cached unchanged edges only', () => {
    const nodes = [node('a', 0, 0), node('b', 300, 0), node('c', 700, 0)];
    const edges = [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')];
    manager.cachePath('bc', result('bc', [
      { x: 300, y: 30 },
      { x: 700, y: 30 },
    ]));

    const context = manager.createContext([nodes[0]], nodes, edges);

    expect(context.affectedNodeIds).toEqual(new Set(['a']));
    expect(context.unchangedEdges).toEqual(new Set(['bc']));
    expect(context.pathSegmentCache.has('bc')).toBe(true);
    expect(context.forceFullReroute).toBe(false);
  });

  it('tracks position changes, clears cache, and prunes oldest cached paths', () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(300);

    expect(manager.trackNodePosition('n1', { x: 0, y: 0 })).toBe(true);
    expect(manager.trackNodePosition('n1', { x: 0, y: 0 })).toBe(false);
    expect(manager.trackNodePosition('n1', { x: 1, y: 0 })).toBe(true);

    manager.cachePath('old', result('old', [{ x: 0, y: 0 }, { x: 1, y: 1 }]));
    manager.cachePath('middle', result('middle', [{ x: 0, y: 0 }, { x: 2, y: 2 }]));
    manager.cachePath('new', result('new', [{ x: 0, y: 0 }, { x: 3, y: 3 }]));

    expect(manager.pruneCache(2)).toBe(1);
    expect(manager.getCachedPath('old')).toBeUndefined();
    expect(manager.getCachedPath('middle')).toBeDefined();
    expect(manager.pruneCache(3)).toBe(0);

    manager.clearCache();
    expect(manager.getStats()).toMatchObject({ cachedPaths: 0, trackedNodes: 0 });
  });
});
