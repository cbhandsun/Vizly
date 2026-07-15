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
  it('uses only a shallow opposite-sector stub when a logistics top exit is blocked', () => {
    const compactTopPath = [
      { x: 1323, y: 962 },
      { x: 1323, y: 873 },
      { x: 2418, y: 873 },
      { x: 2418, y: 238 },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-under-test',
        source: 'tms',
        target: 'downstream',
        sourceHandle: 'source-top-runtime-port-1',
        targetHandle: 'bottom',
        data: {
          computedPath: compactTopPath,
          runtimeHandleLock: { source: true },
        },
      },
      {
        id: 'same-source-bottom-branch',
        source: 'tms',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 1323, y: 1198 },
            { x: 1323, y: 1921 },
            { x: 1789, y: 1921 },
            { x: 1789, y: 1922 },
          ],
        },
      },
      {
        id: 'unrelated-reverse-route',
        source: 'reverse-source',
        target: 'reverse-target',
        data: { computedPath: [...compactTopPath].reverse() },
      },
      {
        id: 'unrelated-crossing-route',
        source: 'crossing-source',
        target: 'crossing-target',
        data: {
          computedPath: [
            { x: 1600, y: 800 },
            { x: 1600, y: 930 },
          ],
        },
      },
    ];

    const result = repairReverseFlowBypassCrossings(edges, [
      node('tms', 1113, 962, 420, 236),
      node('downstream', 2250, 119, 336, 119),
      node('right-top-corridor-blocker', 1400, 840, 80, 60),
      node('left-top-corridor-blocker', 1200, 840, 80, 60),
    ]);
    const repaired = result[0];
    const repairedPath = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect(hasStrictCrossing(compactTopPath, (edges[3].data as any).computedPath)).toBe(true);
    expect(repaired.sourceHandle).toBe('bottom');
    expect((repaired.data as any).reverseFlowBypassRepaired).toBe(true);
    expect(hasStrictCrossing(repairedPath, (edges[3].data as any).computedPath)).toBe(false);
    expect(Math.max(...repairedPath.map(point => point.y))).toBeLessThanOrEqual(1246);
    expect(repairedPath[1].y - repairedPath[0].y).toBe(48);
    const length = repairedPath.slice(1).reduce((total, point, index) => (
      total + Math.abs(point.x - repairedPath[index].x) + Math.abs(point.y - repairedPath[index].y)
    ), 0);
    const direct = Math.abs(repairedPath.at(-1)!.x - repairedPath[0].x)
      + Math.abs(repairedPath.at(-1)!.y - repairedPath[0].y);
    expect(length / direct).toBeLessThanOrEqual(1.2);
  });

  it('does not switch or canonicalize a source-authored side handle', () => {
    const compactTopPath = [
      { x: 1323, y: 962 },
      { x: 1323, y: 873 },
      { x: 2418, y: 873 },
      { x: 2418, y: 238 },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-under-test',
        source: 'tms',
        target: 'downstream',
        sourceHandle: 'source-top-side-port-1',
        targetHandle: 'bottom',
        data: {
          computedPath: compactTopPath,
          manualHandleSides: ['source'],
        },
      },
      {
        id: 'same-source-bottom-branch',
        source: 'tms',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 1323, y: 1198 },
            { x: 1323, y: 1921 },
            { x: 1789, y: 1921 },
            { x: 1789, y: 1922 },
          ],
        },
      },
      {
        id: 'unrelated-reverse-route',
        source: 'reverse-source',
        target: 'reverse-target',
        data: { computedPath: [...compactTopPath].reverse() },
      },
      {
        id: 'unrelated-crossing-route',
        source: 'crossing-source',
        target: 'crossing-target',
        data: {
          computedPath: [
            { x: 1600, y: 800 },
            { x: 1600, y: 930 },
          ],
        },
      },
    ];

    const result = repairReverseFlowBypassCrossings(edges, [
      node('tms', 1113, 962, 420, 236),
      node('downstream', 2250, 119, 336, 119),
      node('right-top-corridor-blocker', 1400, 840, 80, 60),
      node('left-top-corridor-blocker', 1200, 840, 80, 60),
    ]);

    expect(result[0].sourceHandle).toBe('source-top-side-port-1');
    expect((result[0].data as any).computedPath).toEqual(compactTopPath);
    expect((result[0].data as any).reverseFlowBypassRepaired).toBeUndefined();
  });

  it('keeps top exits when fixing only opposite overlap would create a large backtrack', () => {
    const edges: Edge[] = [
      {
        id: 'edge-loms-tms',
        source: 'l-oms',
        target: 'tms',
        data: {
          computedPath: [
            { x: 916, y: 653 },
            { x: 916, y: 811 },
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
            { x: 916, y: 812 },
            { x: 916, y: 742 },
            { x: 1227, y: 742 },
            { x: 1227, y: 203 },
          ],
        },
      },
    ];

    const result = repairReverseFlowBypassCrossings(edges, [
      node('l-oms', 827, 534, 179, 119),
      node('tms', 820, 812, 192, 118),
      node('carrier', 1147, 84, 160, 118),
    ]);
    const incomingPath = (result[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const carrier = result[1];
    const carrierPath = (carrier.data as any).computedPath as Array<{ x: number; y: number }>;

    expect(carrier.sourceHandle).toBe('top');
    expect((carrier.data as any).reverseFlowBypassRepaired).toBeUndefined();
    expect(carrierPath).toEqual([
      { x: 916, y: 812 },
      { x: 916, y: 742 },
      { x: 1227, y: 742 },
      { x: 1227, y: 203 },
    ]);
    expect(maxOppositeDirectionOverlap(incomingPath, carrierPath)).toBeGreaterThanOrEqual(16);
  });

  it('prefers top-preserving outer lanes for blocked reverse-flow top exits', () => {
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
        sourceHandle: 'source-top-manual-port-1',
        targetHandle: 'bottom',
        data: {
          manualHandles: { source: true },
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

    expect(carrier.sourceHandle).toBe('source-top-manual-port-1');
    expect((carrier.data as any).reverseFlowBypassRepaired).toBe(true);
    expect(path[0]).toEqual({ x: 900, y: 811 });
    expect(path[1].y).toBeLessThan(path[0].y);
    expect(hasStrictCrossing(path, (result[0].data as any).computedPath)).toBe(false);
    expect(mainAxisBacktrackDistance(path)).toBe(0);
  });
});

function mainAxisBacktrackDistance(path: Array<{ x: number; y: number }>): number {
  if (path.length < 2) return 0;
  const start = path[0];
  const end = path[path.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const horizontalDominant = Math.abs(dx) >= Math.abs(dy);
  const mainDelta = horizontalDominant ? dx : dy;
  if (Math.abs(mainDelta) < 1) return 0;
  const expectedDirection = mainDelta > 0 ? 1 : -1;
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    const horizontal = Math.abs(a.y - b.y) < 1;
    const vertical = Math.abs(a.x - b.x) < 1;
    if ((horizontalDominant && !horizontal) || (!horizontalDominant && !vertical)) continue;
    const direction = horizontalDominant ? Math.sign(b.x - a.x) : Math.sign(b.y - a.y);
    if (direction !== 0 && direction !== expectedDirection) {
      total += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }
  }
  return total;
}

function maxOppositeDirectionOverlap(
  a: Array<{ x: number; y: number }>,
  b: Array<{ x: number; y: number }>,
): number {
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
