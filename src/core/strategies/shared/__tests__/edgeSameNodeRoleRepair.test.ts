import { describe, expect, it } from 'vitest';
import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import { repairSameNodeInOutCrossings } from '../edgeSameNodeRoleRepair';

type Point = { x: number; y: number };

function node(
  id: string,
  x: number,
  y: number,
  width = 420,
  height = 236,
): ReactFlowNode & { positionAbsolute: Point } {
  return {
    id,
    position: { x, y },
    positionAbsolute: { x, y },
    measured: { width, height } as any,
    style: { width, height },
    data: {},
  };
}

function maxParallelOverlap(first: Point[], second: Point[]): number {
  let max = 0;
  for (let i = 0; i < first.length - 1; i += 1) {
    for (let j = 0; j < second.length - 1; j += 1) {
      const a = first[i];
      const b = first[i + 1];
      const c = second[j];
      const d = second[j + 1];
      const firstVertical = a.x === b.x;
      const secondVertical = c.x === d.x;
      const firstHorizontal = a.y === b.y;
      const secondHorizontal = c.y === d.y;
      if (firstVertical && secondVertical && a.x === c.x) {
        max = Math.max(max, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
          - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)));
      }
      if (firstHorizontal && secondHorizontal && a.y === c.y) {
        max = Math.max(max, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
          - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
      }
    }
  }
  return max;
}

describe('repairSameNodeInOutCrossings', () => {
  it('splits an outgoing same-side port away from an incoming target trunk', () => {
    const incoming: Edge = {
      id: 'edge-tms-visibility',
      source: 'tms',
      target: 'visibility',
      data: {
        computedPath: [
          { x: 1323, y: 1199 },
          { x: 1323, y: 1295 },
          { x: 1895, y: 1295 },
          { x: 1895, y: 1835 },
          { x: 1790, y: 1835 },
          { x: 1790, y: 1921 },
        ],
      },
    };
    const outgoing: Edge = {
      id: 'edge-visibility-downstream',
      source: 'visibility',
      target: 'downstream',
      data: {
        computedPath: [
          { x: 1790, y: 1921 },
          { x: 1790, y: 1881 },
          { x: 2474, y: 1873 },
          { x: 2474, y: 981 },
          { x: 2418, y: 981 },
          { x: 2418, y: 239 },
        ],
      },
    };

    const result = repairSameNodeInOutCrossings([incoming, outgoing], [
      node('tms', 1113, 962),
      node('visibility', 1579, 1921),
      node('downstream', 2250, 119, 336, 119),
    ]);
    const incomingPath = (result[0].data as any).computedPath as Point[];
    const outgoingPath = (result[1].data as any).computedPath as Point[];

    expect(outgoingPath[0].y).toBe(1921);
    expect(outgoingPath[0].x).not.toBe(1790);
    expect(outgoingPath[1].x).toBe(outgoingPath[0].x);
    expect(outgoingPath[0].y - outgoingPath[1].y).toBeGreaterThanOrEqual(48);
    expect(maxParallelOverlap(incomingPath, outgoingPath)).toBeLessThan(24);
    expect((result[1].data as any).sameNodeInOutCrossingRepaired).toBe(true);
  });
});
