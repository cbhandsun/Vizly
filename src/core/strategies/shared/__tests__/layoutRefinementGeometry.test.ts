import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  assignLayers,
  buildNodeRects,
  countCrossings,
  estimateDetourRatio,
  findBlockingNodes,
  rectsOverlap,
} from '../layoutRefinementGeometry';

describe('layout refinement geometry', () => {
  it('normalizes invalid coordinates and dimensions at the node boundary', () => {
    const nodes = [{
      id: 'invalid',
      data: {},
      position: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      measured: { width: -1, height: 0 },
    }] as Node[];

    expect(buildNodeRects(nodes)).toEqual([{
      id: 'invalid', x: 0, y: 0, w: 200, h: 100,
    }]);
  });

  it('assigns vertical and horizontal layers with a bounded tolerance', () => {
    const rects = buildNodeRects([
      { id: 'a', data: {}, position: { x: 0, y: 0 } },
      { id: 'b', data: {}, position: { x: 20, y: 5 } },
      { id: 'c', data: {}, position: { x: 200, y: 100 } },
    ] as Node[]);

    expect(assignLayers(rects, 10, false).map(layer => layer.nodeIds)).toEqual([['a', 'b'], ['c']]);
    expect(assignLayers(rects, Number.NaN, true).map(layer => layer.nodeIds)).toEqual([['a'], ['b'], ['c']]);
    expect(assignLayers([], 10, false)).toEqual([]);
  });

  it('counts proper crossings while ignoring edges with shared endpoints', () => {
    const rects = new Map(buildNodeRects([
      { id: 'a', data: {}, position: { x: 0, y: 0 }, width: 10, height: 10 },
      { id: 'b', data: {}, position: { x: 100, y: 100 }, width: 10, height: 10 },
      { id: 'c', data: {}, position: { x: 0, y: 100 }, width: 10, height: 10 },
      { id: 'd', data: {}, position: { x: 100, y: 0 }, width: 10, height: 10 },
    ] as Node[]).map(rect => [rect.id, rect]));
    const edges: Edge[] = [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'cd', source: 'c', target: 'd' },
      { id: 'ac', source: 'a', target: 'c' },
    ];

    expect(countCrossings(edges, rects)).toBe(1);
  });

  it('finds corridor blockers and keeps overlap margins non-negative', () => {
    const [source, blocker, target] = buildNodeRects([
      { id: 'source', data: {}, position: { x: 0, y: 0 }, width: 20, height: 20 },
      { id: 'blocker', data: {}, position: { x: 50, y: 0 }, width: 20, height: 20 },
      { id: 'target', data: {}, position: { x: 100, y: 0 }, width: 20, height: 20 },
    ] as Node[]);

    expect(findBlockingNodes(source, target, [source, blocker, target])).toEqual([blocker]);
    expect(estimateDetourRatio(source, target, [source, blocker, target])).toBeGreaterThan(1);
    expect(rectsOverlap(source, target, -100)).toBe(false);
  });
});
