import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { repairReverseFlowBypassCrossings } from '../edgeReverseFlowBypassRepair';

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  position: { x, y },
  positionAbsolute: { x, y },
  measured: { width, height },
  data: {},
});

describe('repairReverseFlowBypassCrossings', () => {
  it('reuses an existing same-source outer lane for blocked reverse-flow top exits', () => {
    const edges: Edge[] = [
      {
        id: 'edge-loms-visibility',
        source: 'l-oms',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 916, y: 653 },
            { x: 916, y: 781 },
            { x: 1272, y: 781 },
          ],
        },
      },
      {
        id: 'edge-tms-carrier',
        source: 'tms',
        target: 'carrier',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        data: {
          computedPath: [
            { x: 900, y: 811 },
            { x: 900, y: 722 },
            { x: 1227, y: 722 },
            { x: 1227, y: 203 },
          ],
        },
      },
      {
        id: 'edge-tms-downstream',
        source: 'tms',
        target: 'downstream',
        sourceHandle: 'bottom',
        targetHandle: 'bottom',
        data: {
          computedPath: [
            { x: 916, y: 930 },
            { x: 916, y: 1019 },
            { x: 1699, y: 1019 },
            { x: 1699, y: 169 },
            { x: 1711, y: 237 },
            { x: 1711, y: 181 },
          ],
        },
      },
    ];

    const result = repairReverseFlowBypassCrossings(edges, [
      node('tms', 820, 811, 192, 119),
      node('carrier', 1147, 84, 160, 119),
      node('downstream', 1627, 106, 168, 73),
      node('l-oms', 827, 534, 179, 119),
      node('visibility', 1100, 1539, 232, 119),
    ]);
    const carrier = result.find(edge => edge.id === 'edge-tms-carrier')!;
    const path = (carrier.data as any).computedPath as Array<{ x: number; y: number }>;

    expect(carrier.sourceHandle).toBe('bottom');
    expect((carrier.data as any).reverseFlowBypassRepaired).toBe(true);
    expect(path).toEqual(expect.arrayContaining([{ x: 1699, y: 1019 }]));
    expect(hasStrictCrossing(path, (result[0].data as any).computedPath)).toBe(false);
  });
});

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
