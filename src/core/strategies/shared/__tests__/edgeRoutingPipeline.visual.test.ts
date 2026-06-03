import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { reduceEdgeCrossingsWithWaypoints } from '../edgeRoutingPipeline';

const node = (
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Node => ({
  id,
  type,
  position: { x, y },
  positionAbsolute: { x, y },
  measured: { width, height },
  width,
  height,
  data: {},
});

describe('reduceEdgeCrossingsWithWaypoints visual soft constraints', () => {
  it('moves a long lane away from a container boundary hug', () => {
    const nodes: Node[] = [
      node('subgroup-策略计算-初分逻辑', 'subGroup', 594, -22, 294, 1192),
      node('subgroup-策略计算-库存修正', 'subGroup', 1080, -22, 297, 1192),
      node('pool-a-entry', 'custom', 632, 550, 217, 96),
      node('calc-real-ratio', 'custom', 1132, 38, 192, 96),
      node('check-limit', 'custom', 616, 294, 249, 96),
    ];
    const huggingPath = [
      { x: 761, y: 550 },
      { x: 761, y: 414 },
      { x: 889, y: 414 },
      { x: 889, y: 214 },
      { x: 1228, y: 214 },
      { x: 1228, y: 134 },
    ];
    const edges: Edge[] = [{
      id: 'e7',
      source: 'pool-a-entry',
      target: 'calc-real-ratio',
      data: { computedPath: huggingPath },
    }];

    const [result] = reduceEdgeCrossingsWithWaypoints(edges, nodes, 'TB');
    const path = (result.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(path.length).toBeGreaterThanOrEqual(3);
    expect(path.some(point => Math.abs(point.x - 889) < 2)).toBe(false);
  });

  it('uses a compact one-bend target approach to avoid same-node in/out crossings', () => {
    const nodes: Node[] = [
      node('check-limit', 'custom', 616, 294, 249, 96),
      node('pool-b-entry', 'custom', 633, 806, 216, 96),
      node('merge-res', 'custom', 564, 1478, 211, 96),
    ];
    const edges: Edge[] = [
      {
        id: 'e6',
        source: 'check-limit',
        target: 'pool-b-entry',
        data: {
          computedPath: [
            { x: 248.5, y: 1850 },
            { x: 248.5, y: 1960 },
            { x: 785, y: 1960 },
            { x: 785, y: 2010 },
          ],
        },
      },
      {
        id: 'e15',
        source: 'pool-b-entry',
        target: 'merge-res',
        data: {
          computedPath: [
            { x: 677, y: 2058 },
            { x: 637, y: 2058 },
            { x: 637, y: 1962 },
            { x: 963, y: 1962 },
            { x: 963, y: 3142 },
            { x: 923, y: 3142 },
          ],
        },
      },
    ];

    const [incoming, outgoing] = reduceEdgeCrossingsWithWaypoints(edges, nodes, 'TB');
    const incomingPath = (incoming.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const outgoingPath = (outgoing.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(hasStrictCrossing(incomingPath, outgoingPath)).toBe(false);
    expect(outgoingPath.some(point => point.y > 2058)).toBe(true);
  });

  it('repairs same-source fan-out crossings before computed paths are rendered', () => {
    const nodes: Node[] = [
      node('pool-b-entry', 'custom', 650, 1960, 100, 60),
      node('calc-real-ratio', 'custom', 460, 2420, 100, 60),
      node('merge-res', 'custom', 900, 3130, 100, 60),
    ];
    const edges: Edge[] = [
      {
        id: 'e8',
        source: 'pool-b-entry',
        target: 'calc-real-ratio',
        data: {
          computedPath: [
            { x: 792, y: 2012 },
            { x: 792, y: 2223 },
            { x: 513, y: 2223 },
            { x: 513, y: 2435 },
          ],
        },
      },
      {
        id: 'e15',
        source: 'pool-b-entry',
        target: 'merge-res',
        data: {
          computedPath: [
            { x: 679, y: 2065 },
            { x: 659, y: 2065 },
            { x: 659, y: 2607 },
            { x: 943, y: 2607 },
            { x: 943, y: 3149 },
            { x: 923, y: 3149 },
          ],
        },
      },
    ];

    const [toRatio, toMerge] = reduceEdgeCrossingsWithWaypoints(edges, nodes, 'TB');
    const toRatioPath = (toRatio.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const toMergePath = (toMerge.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(hasStrictCrossing(toRatioPath, toMergePath)).toBe(false);
  });

  it('does a final hard-obstacle pass after visual waypoint optimization', () => {
    const nodes: Node[] = [
      node('check-rem', 'custom', -45, -30, 90, 60),
      node('task-direct-a', 'custom', -45, 300, 90, 60),
      node('sort-rem-round', 'custom', 35, 130, 60, 90),
    ];
    const edges: Edge[] = [{
      id: 'e13',
      source: 'check-rem',
      target: 'task-direct-a',
      data: {
        computedPath: [
          { x: 0, y: 0 },
          { x: 0, y: 100 },
          { x: 50, y: 100 },
          { x: 50, y: 260 },
          { x: 0, y: 260 },
          { x: 0, y: 300 },
        ],
      },
    }];

    const [result] = reduceEdgeCrossingsWithWaypoints(edges, nodes, 'TB');
    const path = (result.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(pathHitsRect(path, { x: 35, y: 130, width: 60, height: 90 })).toBe(false);
  });
});

function hasStrictCrossing(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      const a1 = a[i];
      const a2 = a[i + 1];
      const b1 = b[j];
      const b2 = b[j + 1];
      const aH = Math.abs(a1.y - a2.y) < 0.5;
      const aV = Math.abs(a1.x - a2.x) < 0.5;
      const bH = Math.abs(b1.y - b2.y) < 0.5;
      const bV = Math.abs(b1.x - b2.x) < 0.5;
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
      ) {
        return true;
      }
    }
  }
  return false;
}

function pathHitsRect(
  path: Array<{ x: number; y: number }>,
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const horizontal = Math.abs(a.y - b.y) < 0.5;
    const vertical = Math.abs(a.x - b.x) < 0.5;
    if (horizontal) {
      const y = a.y;
      if (y <= rect.y || y >= rect.y + rect.height) continue;
      if (Math.max(Math.min(a.x, b.x), rect.x) < Math.min(Math.max(a.x, b.x), rect.x + rect.width)) {
        return true;
      }
    }
    if (vertical) {
      const x = a.x;
      if (x <= rect.x || x >= rect.x + rect.width) continue;
      if (Math.max(Math.min(a.y, b.y), rect.y) < Math.min(Math.max(a.y, b.y), rect.y + rect.height)) {
        return true;
      }
    }
  }
  return false;
}
