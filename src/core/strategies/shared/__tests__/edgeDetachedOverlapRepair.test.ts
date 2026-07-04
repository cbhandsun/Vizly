import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { separateDetachedParallelOverlaps } from '../edgeDetachedOverlapRepair';

function node(id: string, x: number, y: number, width = 80, height = 48): Node {
  return {
    id,
    position: { x, y },
    measured: { width, height } as any,
    style: { width, height },
    data: {},
  };
}

describe('separateDetachedParallelOverlaps', () => {
  it('keeps same-source endpoint trunks shared after source stubs', () => {
    const edges: Edge[] = [
      {
        id: 'edge-source-a',
        source: 'source',
        target: 'a',
        data: {
          computedPath: [
            { x: 40, y: 50 },
            { x: 40, y: 90 },
            { x: 260, y: 90 },
            { x: 260, y: 180 },
          ],
        },
      },
      {
        id: 'edge-source-b',
        source: 'source',
        target: 'b',
        data: {
          computedPath: [
            { x: 60, y: 50 },
            { x: 60, y: 90 },
            { x: 260, y: 90 },
            { x: 260, y: 280 },
          ],
        },
      },
    ];

    const repaired = separateDetachedParallelOverlaps(edges, [
      node('source', 0, 0),
      node('a', 220, 180),
      node('b', 220, 280),
    ], 24);

    expect((repaired[0].data as any).computedPath).toEqual((edges[0].data as any).computedPath);
    expect((repaired[1].data as any).computedPath).toEqual((edges[1].data as any).computedPath);
    expect((repaired[0].data as any).detachedOverlapSeparated).toBeUndefined();
    expect((repaired[1].data as any).detachedOverlapSeparated).toBeUndefined();
  });

  it('still separates unrelated detached middle overlaps', () => {
    const edges: Edge[] = [
      {
        id: 'edge-a',
        source: 'source-a',
        target: 'target-a',
        data: {
          computedPath: [
            { x: 0, y: 0 },
            { x: 0, y: 80 },
            { x: 220, y: 80 },
            { x: 220, y: 180 },
          ],
        },
      },
      {
        id: 'edge-b',
        source: 'source-b',
        target: 'target-b',
        data: {
          computedPath: [
            { x: 20, y: 20 },
            { x: 20, y: 80 },
            { x: 240, y: 80 },
            { x: 240, y: 200 },
          ],
        },
      },
    ];

    const repaired = separateDetachedParallelOverlaps(edges, [
      node('source-a', -40, -40),
      node('target-a', 180, 180),
      node('source-b', -20, -20),
      node('target-b', 200, 200),
    ], 24);
    const first = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const second = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(maxParallelOverlap(first, second)).toBeLessThan(80);
    expect(repaired.some(edge => (edge.data as any).detachedOverlapSeparated)).toBe(true);
  });
});

function maxParallelOverlap(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): number {
  let maxOverlap = 0;
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      maxOverlap = Math.max(maxOverlap, segmentOverlap(a[i], a[i + 1], b[j], b[j + 1]));
    }
  }
  return maxOverlap;
}

function segmentOverlap(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): number {
  const aVertical = Math.abs(a1.x - a2.x) < 1;
  const bVertical = Math.abs(b1.x - b2.x) < 1;
  if (aVertical !== bVertical) return 0;
  if (aVertical) {
    if (Math.abs(a1.x - b1.x) > 1) return 0;
    return Math.max(0, Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y))
      - Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y)));
  }
  if (Math.abs(a1.y - b1.y) > 1) return 0;
  return Math.max(0, Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x))
    - Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x)));
}
