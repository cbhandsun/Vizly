import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { repairEndpointLaneCrossings } from '../edgeEndpointLaneNudgeRepair';

const node = (
  id: string, x: number, y: number, width: number, height: number,
): Node & { positionAbsolute: { x: number; y: number } } => ({
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

  it('repairs strict crossings between same-source logistics branches', () => {
    const tmsToCarrier: Edge = {
      id: 'edge-tms-carrier',
      source: 'tms',
      target: 'carrier',
      sourceHandle: 'top',
      targetHandle: 'bottom',
      data: {
        computedPath: [
          { x: 1323, y: 961 },
          { x: 1323, y: 877 },
          { x: 1769, y: 877 },
          { x: 1769, y: 278 },
        ],
      },
    };
    const tmsToDownstream: Edge = {
      id: 'edge-tms-downstream',
      source: 'tms',
      target: 'downstream',
      sourceHandle: 'top',
      targetHandle: 'bottom',
      data: {
        computedPath: [
          { x: 1323, y: 962 },
          { x: 1323, y: 872 },
          { x: 2274, y: 872 },
          { x: 2274, y: 239 },
        ],
      },
    };

    const result = repairEndpointLaneCrossings([tmsToCarrier, tmsToDownstream], [
      node('tms', 1192, 961, 262, 238),
      node('carrier', 1689, 159, 160, 119),
      node('downstream', 2155, 120, 238, 119),
    ]);
    const carrierPath = (result[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const downstreamPath = (result[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(
      hasStrictCrossing(carrierPath, downstreamPath),
      JSON.stringify({ carrierPath, downstreamPath }),
    ).toBe(false);
    expect(result.some(edge => (edge.data as any).endpointLaneNudged)).toBe(true);
  });

  it('nudges a flow-through source lane away from a reverse incoming lane on the same node', () => {
    const lomsToTms: Edge = {
      id: 'edge-loms-tms',
      source: 'l-oms',
      target: 'tms',
      data: {
        computedPath: [
          { x: 916, y: 653 },
          { x: 916, y: 811 },
        ],
      },
    };
    const lomsToCustoms: Edge = {
      id: 'edge-loms-customs',
      source: 'l-oms',
      target: 'customs',
      data: {
        computedPath: [
          { x: 916, y: 653 },
          { x: 916, y: 742 },
          { x: 1428, y: 742 },
          { x: 1428, y: 822 },
        ],
      },
    };
    const tmsToCarrier: Edge = {
      id: 'edge-tms-carrier',
      source: 'tms',
      target: 'carrier',
      data: {
        computedPath: [
          { x: 916, y: 812 },
          { x: 916, y: 738 },
          { x: 1227, y: 738 },
          { x: 1227, y: 203 },
        ],
      },
    };
    const tmsToDownstream: Edge = {
      id: 'edge-tms-downstream',
      source: 'tms',
      target: 'downstream',
      data: {
        computedPath: [
          { x: 928, y: 812 },
          { x: 928, y: 741 },
          { x: 1639, y: 741 },
          { x: 1639, y: 181 },
        ],
      },
    };

    const result = repairEndpointLaneCrossings([lomsToTms, lomsToCustoms, tmsToCarrier, tmsToDownstream], [
      node('l-oms', 827, 534, 179, 119),
      node('tms', 820, 812, 192, 120),
      node('carrier', 1060, 45, 334, 158),
      node('customs', 1348, 822, 160, 118),
      node('downstream', 1550, 45, 220, 158),
    ]);
    const incomingPath = (result[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const customsPath = (result[1].data as any).computedPath as Array<{ x: number; y: number }>;
    const outgoingPath = (result[2].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(maxOppositeDirectionOverlap(incomingPath, outgoingPath)).toBeLessThan(16);
    expect(hasStrictCrossing(customsPath, outgoingPath)).toBe(false);
    expect(outgoingPath.some((point, index) => index > 0 && Math.abs(point.y - 741) <= 1)).toBe(true);
    expect((result[2].data as any).endpointLaneNudged).toBe(true);
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

function maxOppositeDirectionOverlap(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): number {
  let maxOverlap = 0;
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      if (segmentDirection(a[i], a[i + 1]) * segmentDirection(b[j], b[j + 1]) >= 0) continue;
      maxOverlap = Math.max(maxOverlap, segmentOverlap(a[i], a[i + 1], b[j], b[j + 1]));
    }
  }
  return maxOverlap;
}

function segmentDirection(a: { x: number; y: number }, b: { x: number; y: number }): number {
  if (Math.abs(a.x - b.x) < 1) return Math.sign(b.y - a.y);
  if (Math.abs(a.y - b.y) < 1) return Math.sign(b.x - a.x);
  return 0;
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
