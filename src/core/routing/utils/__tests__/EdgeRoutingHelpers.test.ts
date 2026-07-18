import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  decideEdgeRouting: vi.fn(() => ({
    sourceHandle: 'r',
    targetHandle: 'l',
    type: 'step',
  })),
}));

import {
  EdgeRoutingCache,
  applyParallelOffset,
  clearEdgeRoutingCache,
  distributePortConnections,
  getEdgeRoutingCacheStats,
  incrementalEdgeRouting,
  pickHandlesByGeometry,
  separateParallelEdges,
  configureEdgeRoutingDecision,
} from '../EdgeRoutingHelpers';

describe('EdgeRoutingCache', () => {
  let cache: EdgeRoutingCache;

  beforeEach(() => {
    cache = new EdgeRoutingCache();
  });

  it('tracks node snapshot changes with a small movement tolerance', () => {
    const nodes = [{ id: 'a', position: { x: 0, y: 0 }, measured: { width: 100, height: 50 } }];

    expect(cache.updateNodeSnapshots(nodes)).toEqual(new Set(['a']));
    expect(cache.updateNodeSnapshots([{ ...nodes[0], position: { x: 0.2, y: 0.2 } }])).toEqual(new Set());
    expect(cache.updateNodeSnapshots([{ ...nodes[0], position: { x: 1, y: 0 } }])).toEqual(new Set(['a']));
  });

  it('maps changed nodes to affected edges and exposes stats', () => {
    cache.setCache('e1', {
      sourceHandle: 'r',
      targetHandle: 'l',
      type: 'step',
      sourceNodeId: 'a',
      targetNodeId: 'b',
    });

    expect(cache.getCache('e1')).toMatchObject({ sourceHandle: 'r', targetHandle: 'l', type: 'step' });
    expect(cache.hasValidCache('e1', new Set())).toBe(true);
    expect(cache.hasValidCache('e1', new Set(['e1']))).toBe(false);
    expect(cache.getAffectedEdgeIds(new Set(['a']))).toEqual(new Set(['e1']));
    expect(cache.getStats()).toEqual({ cachedEdges: 1, trackedNodes: 0 });

    cache.clear();
    expect(cache.getStats()).toEqual({ cachedEdges: 0, trackedNodes: 0 });
  });
});

describe('EdgeRoutingHelpers', () => {
  beforeEach(() => {
    clearEdgeRoutingCache();
    mocks.decideEdgeRouting.mockClear();
    configureEdgeRoutingDecision(mocks.decideEdgeRouting);
  });

  const nodes = [
    { id: 'a', position: { x: 0, y: 0 }, measured: { width: 100, height: 50 } },
    { id: 'b', position: { x: 200, y: 0 }, measured: { width: 100, height: 50 } },
  ];

  it('routes incrementally and reuses cached handles when nodes are unchanged', () => {
    const edges = [{ id: 'e1', source: 'a', target: 'b', data: { keep: true } }];

    const first = incrementalEdgeRouting(edges, nodes, {});
    const second = incrementalEdgeRouting(edges, nodes, {});

    expect(first[0]).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'step',
      data: { keep: true, fromCache: false },
    });
    expect(second[0]).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'step',
      data: { keep: true, fromCache: true },
    });
    expect(mocks.decideEdgeRouting).toHaveBeenCalledTimes(1);
    expect(getEdgeRoutingCacheStats().cachedEdges).toBe(1);
  });

  it('separates parallel edges with capped offsets', () => {
    const separated = separateParallelEdges([
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'a' },
      { id: 'e3', source: 'a', target: 'c' },
    ], 20);

    expect(separated[0].data).toMatchObject({ parallelOffset: -10, parallelIndex: 0, parallelTotal: 2 });
    expect(separated[1].data).toMatchObject({ parallelOffset: 10, parallelIndex: 1, parallelTotal: 2 });
    expect(separated[2].data).toMatchObject({ parallelOffset: 0, parallelIndex: 0, parallelTotal: 1 });
  });

  it('picks handles by dominant geometry and applies parallel offsets', () => {
    expect(pickHandlesByGeometry({ position: { x: 0, y: 0 } }, { position: { x: 100, y: 10 } }))
      .toEqual({ source: 'r', target: 'l' });
    expect(pickHandlesByGeometry({ position: { x: 0, y: 0 } }, { position: { x: 10, y: -100 } }))
      .toEqual({ source: 't', target: 'b' });
    expect(applyParallelOffset([{ x: 0, y: 0 }, { x: 10, y: 10 }], 5, 'horizontal'))
      .toEqual([{ x: 0, y: 5 }, { x: 10, y: 15 }]);
    expect(applyParallelOffset([{ x: 0, y: 0 }], 5, 'vertical')).toEqual([{ x: 5, y: 0 }]);
    expect(applyParallelOffset([{ x: 0, y: 0 }], 0)).toEqual([{ x: 0, y: 0 }]);
  });

  it('orders hub connections at source and target nodes', () => {
    const orderedEdges = [
      { id: 'e1', source: 'hub', target: 'right', data: {} },
      { id: 'e2', source: 'hub', target: 'left', data: {} },
      { id: 'e3', source: 'top', target: 'sink', data: {} },
      { id: 'e4', source: 'bottom', target: 'sink', data: {} },
    ];
    const orderedNodes = [
      { id: 'hub', position: { x: 0, y: 0 }, width: 100, height: 50 },
      { id: 'left', position: { x: -100, y: 200 }, width: 100, height: 50 },
      { id: 'right', position: { x: 100, y: 200 }, width: 100, height: 50 },
      { id: 'sink', position: { x: 500, y: 0 }, width: 100, height: 50 },
      { id: 'top', position: { x: 300, y: -100 }, width: 100, height: 50 },
      { id: 'bottom', position: { x: 300, y: 100 }, width: 100, height: 50 },
    ];

    const result = distributePortConnections(orderedEdges, orderedNodes);

    expect(result.find(edge => edge.id === 'e2')?.data).toMatchObject({ _orderIndexSource: 0, _orderTotalSource: 2 });
    expect(result.find(edge => edge.id === 'e1')?.data).toMatchObject({ _orderIndexSource: 1, _orderTotalSource: 2 });
    expect(result.find(edge => edge.id === 'e3')?.data).toMatchObject({ _orderIndexTarget: 0, _orderTotalTarget: 2 });
    expect(result.find(edge => edge.id === 'e4')?.data).toMatchObject({ _orderIndexTarget: 1, _orderTotalTarget: 2 });
  });
});
