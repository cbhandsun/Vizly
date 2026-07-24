import { describe, expect, it } from 'vitest';

import { optimizeTreeBusRouting } from '../advancedTreeBusRouting';

const finitePath = (edge: { data?: unknown }): boolean => {
  const data = edge.data as { computedPath?: Array<{ x: number; y: number }> } | undefined;
  return Boolean(data?.computedPath?.every(point =>
    Number.isFinite(point.x) && Number.isFinite(point.y)
  ));
};

describe('advancedTreeBusRouting boundary', () => {
  it('normalizes invalid node geometry and extreme numeric options', () => {
    const edges = [
      { id: 'e1', source: '__proto__', target: 'a', data: 'not-an-object' },
      { id: 'e2', source: '__proto__', target: 'b', data: null },
    ];
    const nodes = [
      {
        id: '__proto__',
        position: { x: Number.NaN, y: Infinity },
        measured: { width: -10, height: Infinity },
      },
      { id: 'a', position: { x: 0, y: 300 }, measured: { width: 100, height: 50 } },
      { id: 'b', position: { x: 20, y: 400 }, measured: { width: 100, height: 50 } },
    ];

    const result = optimizeTreeBusRouting(edges, nodes, {
      minBusSize: Number.NaN,
      trunkLength: Number.POSITIVE_INFINITY,
      layoutDirection: 'TB',
    });

    expect(result).toHaveLength(2);
    expect(result.every(finitePath)).toBe(true);
    expect(result[0].data).toMatchObject({ isTreeBus: true });
    expect(result[0].data).not.toHaveProperty('0');
  });

  it('returns unchanged edges when disabled and tolerates a malformed node collection', () => {
    const edges = [
      { id: 'e1', source: 'hub', target: 'a' },
      { id: 'e2', source: 'hub', target: 'b' },
    ];

    expect(optimizeTreeBusRouting(edges, [], { enabled: false })).toBe(edges);

    const malformedResult = optimizeTreeBusRouting(edges, null, {
      minBusSize: -100,
      trunkLength: 1e100,
      layoutDirection: 'unexpected',
    });
    expect(malformedResult).toEqual(edges);
    expect(malformedResult[0]).toBe(edges[0]);
  });
});
