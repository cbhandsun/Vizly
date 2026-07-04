import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { repairEndpointLaneCrossings } from '../edgeEndpointLaneNudgeRepair';

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  position: { x, y },
  positionAbsolute: { x, y },
  measured: { width, height },
  data: {},
});

describe('repairEndpointLaneCrossings', () => {
  it('nudges a source point along the same node side when the first branch crosses an unrelated lane', () => {
    const tmsToBms: Edge = {
      id: 'edge-tms-bms',
      source: 'tms',
      target: 'bms',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 916, y: 931 },
          { x: 916, y: 1000 },
          { x: 660, y: 1000 },
          { x: 660, y: 1089 },
        ],
      },
    };
    const lomsToVisibility: Edge = {
      id: 'edge-loms-visibility',
      source: 'l-oms',
      target: 'visibility',
      data: {
        computedPath: [
          { x: 916, y: 653 },
          { x: 916, y: 781 },
          { x: 1272, y: 781 },
          { x: 1272, y: 928 },
          { x: 904, y: 928 },
          { x: 904, y: 1450 },
          { x: 1216, y: 1450 },
          { x: 1216, y: 1539 },
        ],
      },
    };

    const result = repairEndpointLaneCrossings([tmsToBms, lomsToVisibility], [
      node('tms', 820, 811, 192, 120),
      node('bms', 576, 1089, 168, 118),
      node('l-oms', 827, 534, 179, 119),
      node('visibility', 1100, 1539, 232, 119),
    ]);
    const repaired = result[0];
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).endpointLaneNudged).toBe(true);
    expect(path[0].y).toBe(931);
    expect(path[0].x).toBeLessThan(904);
    expect(segmentLength(path[0], path[1])).toBeGreaterThanOrEqual(48);
    expect(hasStrictCrossing(path, (result[1].data as any).computedPath)).toBe(false);
  });
});

function segmentLength(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function hasStrictCrossing(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): boolean {
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      const a1 = a[i];
      const a2 = a[i + 1];
      const b1 = b[j];
      const b2 = b[j + 1];
      const aH = Math.abs(a1.y - a2.y) < 1;
      const aV = Math.abs(a1.x - a2.x) < 1;
      const bH = Math.abs(b1.y - b2.y) < 1;
      const bV = Math.abs(b1.x - b2.x) < 1;
      if (aH === bH || (!aH && !aV) || (!bH && !bV)) continue;
      const h1 = aH ? a1 : b1;
      const h2 = aH ? a2 : b2;
      const v1 = aV ? a1 : b1;
      const v2 = aV ? a2 : b2;
      const x = v1.x;
      const y = h1.y;
      if (
        x > Math.min(h1.x, h2.x) + 1
        && x < Math.max(h1.x, h2.x) - 1
        && y > Math.min(v1.y, v2.y) + 1
        && y < Math.max(v1.y, v2.y) - 1
      ) return true;
    }
  }
  return false;
}
