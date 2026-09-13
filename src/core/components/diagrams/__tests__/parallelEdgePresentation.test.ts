import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { applyParallelEdgePresentation } from '../parallelEdgePresentation';

const edge = (id: string, overrides: Partial<Edge> = {}): Edge => ({
  id,
  source: 'a',
  target: 'b',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: {},
  ...overrides,
});

const dataOf = (candidate: Edge): Record<string, unknown> => (
  candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data)
    ? candidate.data as Record<string, unknown>
    : {}
);

describe('applyParallelEdgePresentation', () => {
  it('assigns deterministic lane metadata and staggered label offsets to directed parallel edges', () => {
    const result = applyParallelEdgePresentation([
      edge('edge-2'),
      edge('edge-1'),
      edge('edge-3'),
    ]);

    const byId = new Map(result.map(candidate => [candidate.id, dataOf(candidate)]));
    expect(byId.get('edge-1')).toMatchObject({
      parallelLaneIndex: 0,
      parallelLaneCount: 3,
      labelOffset: { x: 0, y: -18 },
      autoParallelLabelOffset: true,
    });
    expect(byId.get('edge-2')).toMatchObject({
      parallelLaneIndex: 1,
      parallelLaneCount: 3,
      labelOffset: { x: 0, y: 0 },
      autoParallelLabelOffset: true,
    });
    expect(byId.get('edge-3')).toMatchObject({
      parallelLaneIndex: 2,
      parallelLaneCount: 3,
      labelOffset: { x: 0, y: 18 },
      autoParallelLabelOffset: true,
    });
  });

  it('uses horizontal label staggering for top or bottom terminal lanes', () => {
    const result = applyParallelEdgePresentation([
      edge('edge-a', { sourceHandle: 'bottom', targetHandle: 'top' }),
      edge('edge-b', { sourceHandle: 'bottom', targetHandle: 'top' }),
    ]);

    expect(dataOf(result[0]).labelOffset).toEqual({ x: -9, y: 0 });
    expect(dataOf(result[1]).labelOffset).toEqual({ x: 9, y: 0 });
  });

  it('preserves manual label offsets while still exposing lane metadata', () => {
    const result = applyParallelEdgePresentation([
      edge('edge-a', { data: { labelOffset: { x: 42, y: -7 } } }),
      edge('edge-b'),
    ]);

    expect(dataOf(result[0])).toMatchObject({
      parallelLaneIndex: 0,
      parallelLaneCount: 2,
      labelOffset: { x: 42, y: -7 },
    });
    expect(dataOf(result[0]).autoParallelLabelOffset).toBeUndefined();
    expect(dataOf(result[1])).toMatchObject({
      parallelLaneIndex: 1,
      parallelLaneCount: 2,
      autoParallelLabelOffset: true,
    });
  });

  it('removes stale automatic lane metadata after a group is no longer parallel', () => {
    const [parallel] = applyParallelEdgePresentation([
      edge('edge-a'),
      edge('edge-b'),
    ]);

    const [single] = applyParallelEdgePresentation([parallel]);
    expect(dataOf(single).parallelLaneIndex).toBeUndefined();
    expect(dataOf(single).parallelLaneCount).toBeUndefined();
    expect(dataOf(single).autoParallelLabelOffset).toBeUndefined();
    expect(dataOf(single).labelOffset).toBeUndefined();
  });
});
