import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  getEdgePath,
  getRoutingObstacles,
  separateDetachedParallelOverlaps,
} from '../edgeDetachedOverlapRepair';
import { repairDetachedStrictCrossingBypasses } from '../edgeDetachedStrictCrossingRepair';
import {
  calculateEdgePathQualityScore,
  countStrictEdgeCrossings,
} from '../edgeStrictCrossingGuard';
import { countRoutingObstacleHits } from '../edgeWaypointCandidateRepair';

function node(id: string, x: number, y: number, width = 80, height = 48): Node {
  return {
    id,
    position: { x, y },
    measured: { width, height } as any,
    style: { width, height },
    data: {},
  };
}

function totalRoutingObstacleHits(edges: Edge[], nodes: Node[]): number {
  const obstacles = getRoutingObstacles(nodes);
  return edges.reduce((total, edge) => (
    total + countRoutingObstacleHits(getEdgePath(edge), edge, obstacles)
  ), 0);
}

describe('separateDetachedParallelOverlaps', () => {
  it('moves short logistics TMS outbound legs off the LOMS vertical trunk', () => {
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
        id: 'edge-loms-customs',
        source: 'l-oms',
        target: 'customs',
        data: {
          computedPath: [
            { x: 916, y: 653 },
            { x: 916, y: 750 },
            { x: 1428, y: 750 },
            { x: 1428, y: 822 },
          ],
        },
      },
      {
        id: 'edge-tms-carrier',
        source: 'tms',
        target: 'carrier-portal',
        data: {
          computedPath: [
            { x: 868, y: 811 },
            { x: 868, y: 755 },
            { x: 916, y: 755 },
            { x: 916, y: 729 },
            { x: 1227, y: 729 },
            { x: 1227, y: 203 },
          ],
        },
      },
      {
        id: 'edge-tms-downstream',
        source: 'tms',
        target: 'downstream',
        data: {
          computedPath: [
            { x: 964, y: 812 },
            { x: 964, y: 754 },
            { x: 916, y: 754 },
            { x: 916, y: 738 },
            { x: 1639, y: 738 },
            { x: 1639, y: 181 },
          ],
        },
      },
    ];

    const repaired = separateDetachedParallelOverlaps(edges, [
      node('l-oms', 826, 534, 179, 118),
      node('tms', 820, 812, 192, 118),
      node('customs', 1344, 822, 168, 118),
      node('carrier-portal', 1147, 84, 160, 118),
      node('downstream', 1540, 84, 200, 118),
    ], 16);
    const paths = repaired.map(edge => (edge.data as any).computedPath as Array<{ x: number; y: number }>);

    expect(maxOppositeDirectionOverlap(paths[0], paths[2])).toBeLessThan(16);
    expect(maxOppositeDirectionOverlap(paths[1], paths[2])).toBeLessThan(16);
    expect(maxOppositeDirectionOverlap(paths[0], paths[3])).toBeLessThan(16);
    expect(repaired.some(edge => (edge.data as any).detachedOverlapSeparated)).toBe(true);
  });

  it('separates short unrelated endpoint overlaps before they become shared visual trunks', () => {
    const edges: Edge[] = [
      {
        id: 'edge-oms-fulfill-wms-outbound',
        source: 'oms-fulfill',
        target: 'wms-outbound',
        data: {
          computedPath: [
            { x: 198, y: 1465 },
            { x: 198, y: 1503 },
            { x: 294, y: 1503 },
            { x: 294, y: 2051 },
            { x: 196, y: 2051 },
            { x: 196, y: 2123 },
          ],
        },
      },
      {
        id: 'edge-wms-inventory-oms-atc',
        source: 'wms-inventory',
        target: 'oms-atc',
        data: {
          computedPath: [
            { x: 196, y: 1964 },
            { x: 196, y: 2072 },
            { x: 86, y: 2072 },
            { x: 86, y: 1281 },
            { x: 134, y: 1281 },
            { x: 134, y: 1209 },
          ],
        },
      },
    ];

    const repaired = separateDetachedParallelOverlaps(edges, [
      node('oms-fulfill', 120, 1300, 160, 120),
      node('wms-outbound', 120, 2123, 160, 120),
      node('wms-inventory', 100, 1840, 160, 120),
      node('oms-atc', 80, 1089, 160, 120),
    ], 16);
    const first = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const second = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(maxParallelOverlap(first, second)).toBeLessThan(16);
    expect(repaired.some(edge => (edge.data as any).detachedOverlapSeparated)).toBe(true);
  });

  it('shifts a short internal segment off an unrelated reverse lane', () => {
    const edges: Edge[] = [
      {
        id: 'edge-4',
        source: 'a',
        target: 'b',
        data: {
          computedPath: [
            { x: 1200, y: 181 },
            { x: 1200, y: 255 },
            { x: 1328, y: 255 },
            { x: 1328, y: 2469 },
            { x: 830, y: 2469 },
            { x: 830, y: 2504 },
            { x: 670, y: 2504 },
            { x: 670, y: 2639 },
          ],
        },
      },
      {
        id: 'edge-22',
        source: 'c',
        target: 'd',
        data: {
          computedPath: [
            { x: 750, y: 3105 },
            { x: 750, y: 3050 },
            { x: 830, y: 3050 },
            { x: 830, y: 2047 },
            { x: 670, y: 2047 },
            { x: 670, y: 1992 },
          ],
        },
      },
    ];

    const repaired = separateDetachedParallelOverlaps(edges, [
      node('a', 1120, 100, 160, 80),
      node('b', 600, 2639, 160, 80),
      node('c', 670, 3105, 160, 80),
      node('d', 590, 1912, 160, 80),
    ], 16);
    const first = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const second = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(
      maxOppositeDirectionOverlap(first, second),
      JSON.stringify({ first, second }, null, 2),
    ).toBeLessThanOrEqual(16);
    expect(
      maxParallelOverlap(first, second),
      JSON.stringify({ first, second }, null, 2),
    ).toBeLessThanOrEqual(16);
    expect(repaired.some(edge => (edge.data as any).detachedOverlapSeparated)).toBe(true);
  });

  it('rejects a maze bypass that removes a crossing by entering a business node', () => {
    const edges: Edge[] = [
      {
        id: 'edge-master-data-wms',
        source: 'master-data',
        target: 'wms',
        data: {
          computedPath: [
            { x: 242, y: 2816 },
            { x: 242, y: 2720 },
            { x: -44, y: 2720 },
            { x: -44, y: 1374 },
            { x: 206, y: 1374 },
            { x: 206, y: 1290 },
          ],
        },
      },
      {
        id: 'edge-tms-oms-status',
        source: 'tms',
        target: 'oms',
        data: {
          computedPath: [
            { x: 178, y: 2330 },
            { x: 178, y: 2234 },
            { x: 149, y: 2234 },
            { x: 149, y: 2343 },
            { x: -32, y: 2343 },
            { x: -32, y: 900 },
            { x: 242, y: 900 },
            { x: 242, y: 804 },
          ],
        },
      },
    ];

    expect(countStrictEdgeCrossings(edges)).toBe(1);

    const repaired = repairDetachedStrictCrossingBypasses(edges, [
      node('master-data', 32, 2816, 420, 236),
      node('wms', -4, 1054, 420, 236),
      node('tms', 23, 1974, 420, 236),
      node('oms', 32, 568, 420, 236),
    ]);

    expect(
      countStrictEdgeCrossings(repaired),
      JSON.stringify(repaired.map(edge => ({ id: edge.id, path: (edge.data as any).computedPath })), null, 2),
    ).toBe(1);
    expect(
      totalRoutingObstacleHits(repaired, [
        node('master-data', 32, 2816, 420, 236),
        node('wms', -4, 1054, 420, 236),
        node('tms', 23, 1974, 420, 236),
        node('oms', 32, 568, 420, 236),
      ]),
      JSON.stringify(repaired.map(edge => ({ id: edge.id, path: getEdgePath(edge) })), null, 2),
    ).toBe(0);
  });

  it('uses a readable far-side return bridge without adding node hits', () => {
    const edges: Edge[] = [
      {
        id: 'edge-tms-carrier',
        source: 'tms',
        target: 'carrier',
        data: {
          computedPath: [
            { x: 1373, y: 1985 },
            { x: 1373, y: 1862 },
            { x: 517, y: 1862 },
            { x: 517, y: 499 },
            { x: 1250, y: 499 },
            { x: 1250, y: 181 },
          ],
        },
      },
      {
        id: 'edge-wms-tms-planning',
        source: 'wms',
        target: 'tms',
        data: {
          computedPath: [
            { x: 116, y: 1314 },
            { x: 116, y: 1398 },
            { x: 1357, y: 1398 },
            { x: 1357, y: 1707 },
          ],
        },
      },
      {
        id: 'edge-upstream-oms',
        source: 'upstream',
        target: 'oms',
        data: {
          computedPath: [
            { x: 322, y: 181 },
            { x: 322, y: 225 },
            { x: 322, y: 511 },
            { x: 260, y: 511 },
          ],
        },
      },
      {
        id: 'edge-wms-inbound-outbound',
        source: 'wms-inbound',
        target: 'wms-outbound',
        data: {
          computedPath: [
            { x: 88, y: 1080 },
            { x: 88, y: 1145 },
            { x: 116, y: 1145 },
            { x: 116, y: 1210 },
          ],
        },
      },
    ];

    const nodes = [
      node('tms', 1200, 1985, 300, 160),
      node('carrier', 1160, 40, 240, 140),
      node('wms', 0, 1240, 220, 160),
      node('upstream', 250, 40, 160, 140),
      node('oms', 200, 520, 160, 140),
      node('wms-inbound', 0, 1030, 160, 120),
      node('wms-outbound', 0, 1210, 160, 120),
    ];
    const baselineObstacleHits = totalRoutingObstacleHits(edges, nodes);
    expect(countStrictEdgeCrossings(edges)).toBe(1);

    const repaired = repairDetachedStrictCrossingBypasses(edges, nodes);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(
      countStrictEdgeCrossings(repaired),
      JSON.stringify(repaired.map(edge => ({ id: edge.id, path: (edge.data as any).computedPath })), null, 2),
    ).toBe(0);
    expect(
      totalRoutingObstacleHits(repaired, nodes),
      JSON.stringify(repaired.map(edge => ({ id: edge.id, path: getEdgePath(edge) })), null, 2),
    ).toBeLessThanOrEqual(baselineObstacleHits);
    expect(quality.nonOrthogonalSegments).toBe(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
  });

  it('keeps only the obstacle-safe subset of related strict-crossing bypasses', () => {
    const edges: Edge[] = [
      {
        id: 'edge-master-data-wms-inventory',
        source: 'master-data',
        target: 'wms-inventory',
        data: {
          computedPath: [
            { x: 125, y: 746 },
            { x: 125, y: 2074 },
            { x: 320, y: 2074 },
            { x: 320, y: 2170 },
          ],
        },
      },
      {
        id: 'edge-wms-inventory-oms-atc',
        source: 'wms-inventory',
        target: 'oms-atc',
        data: {
          computedPath: [
            { x: 310, y: 2329 },
            { x: 310, y: 2410 },
            { x: 112, y: 2410 },
            { x: 112, y: 1539 },
            { x: 154, y: 1539 },
            { x: 154, y: 1454 },
          ],
        },
      },
      {
        id: 'edge-oms-fulfill-wms-outbound',
        source: 'oms-fulfill',
        target: 'wms-outbound',
        data: {
          computedPath: [
            { x: 350, y: 1772 },
            { x: 350, y: 1950 },
            { x: 502, y: 1950 },
            { x: 502, y: 2388 },
            { x: 310, y: 2388 },
            { x: 310, y: 2488 },
          ],
        },
      },
      {
        id: 'edge-wms-outbound-oms-fulfill',
        source: 'wms-outbound',
        target: 'oms-fulfill',
        data: {
          computedPath: [
            { x: 427, y: 2647 },
            { x: 427, y: 2583 },
            { x: 490, y: 2583 },
            { x: 490, y: 2147 },
            { x: 338, y: 2147 },
            { x: 338, y: 1772 },
          ],
        },
      },
    ];

    const nodes = [
      node('master-data', 32, 590, 420, 156),
      node('oms-atc', 32, 1296, 420, 158),
      node('oms-fulfill', 32, 1614, 420, 158),
      node('wms-inventory', 32, 2171, 420, 158),
      node('wms-outbound', 32, 2489, 420, 158),
    ];
    const baselineObstacleHits = totalRoutingObstacleHits(edges, nodes);
    expect(countStrictEdgeCrossings(edges)).toBe(2);

    const repaired = repairDetachedStrictCrossingBypasses(edges, nodes);

    expect(
      countStrictEdgeCrossings(repaired),
      JSON.stringify(repaired.map(edge => ({ id: edge.id, path: (edge.data as any).computedPath })), null, 2),
    ).toBe(1);
    expect(
      totalRoutingObstacleHits(repaired, nodes),
      JSON.stringify(repaired.map(edge => ({ id: edge.id, path: getEdgePath(edge) })), null, 2),
    ).toBeLessThanOrEqual(baselineObstacleHits);
  });

  it('does not trade the WMS QC strict crossing for routes through business nodes', () => {
    const nodes = [
      node('operation', 3495.6, 776.5, 216, 73),
      node('qc-exec', 4054.6, 1003, 106, 60),
      node('loading-handover', 4042.6, 1223, 130, 60),
      node('wcs-integration', 4031.6, 1443, 152, 73),
    ];
    const edges: Edge[] = [
      {
        id: 'quality-check',
        source: 'operation',
        target: 'qc-exec',
        data: {
          computedPath: [
            { x: 3496, y: 829 },
            { x: 3441, y: 829 },
            { x: 3441, y: 847 },
            { x: 3496, y: 847 },
            { x: 3496, y: 1015 },
            { x: 3448, y: 1015 },
            { x: 3448, y: 1033 },
            { x: 4055, y: 1033 },
          ],
        },
      },
      {
        id: 'equipment-link',
        source: 'operation',
        target: 'wcs-integration',
        data: {
          computedPath: [
            { x: 3711.6, y: 849.5 },
            { x: 3711.6, y: 1480 },
            { x: 4031.6, y: 1480 },
          ],
        },
      },
    ];
    const baselineObstacleHits = totalRoutingObstacleHits(edges, nodes);

    expect(countStrictEdgeCrossings(edges)).toBe(1);
    expect(baselineObstacleHits).toBe(0);

    const repaired = repairDetachedStrictCrossingBypasses(edges, nodes);
    const repairedObstacleHits = totalRoutingObstacleHits(repaired, nodes);

    expect(
      repairedObstacleHits,
      JSON.stringify(repaired.map(edge => ({ id: edge.id, path: getEdgePath(edge) })), null, 2),
    ).toBeLessThanOrEqual(baselineObstacleHits);
  });

  it('still accepts an obstacle-safe strict-crossing bypass when a clear lane exists', () => {
    const nodes = [
      node('horizontal-source', -80, 76, 80, 48),
      node('horizontal-target', 300, 76, 80, 48),
      node('vertical-source', 126, -48, 48, 48),
      node('vertical-target', 126, 240, 48, 48),
    ];
    const edges: Edge[] = [
      {
        id: 'horizontal-flow',
        source: 'horizontal-source',
        target: 'horizontal-target',
        data: {
          computedPath: [
            { x: 0, y: 100 },
            { x: 40, y: 100 },
            { x: 40, y: 120 },
            { x: 260, y: 120 },
            { x: 260, y: 100 },
            { x: 300, y: 100 },
          ],
        },
      },
      {
        id: 'vertical-flow',
        source: 'vertical-source',
        target: 'vertical-target',
        data: {
          computedPath: [
            { x: 150, y: 0 },
            { x: 150, y: 240 },
          ],
        },
      },
    ];

    expect(countStrictEdgeCrossings(edges)).toBe(1);
    expect(totalRoutingObstacleHits(edges, nodes)).toBe(0);

    const repaired = repairDetachedStrictCrossingBypasses(edges, nodes);

    expect(
      countStrictEdgeCrossings(repaired),
      JSON.stringify(repaired.map(edge => ({ id: edge.id, path: getEdgePath(edge) })), null, 2),
    ).toBe(0);
    expect(totalRoutingObstacleHits(repaired, nodes)).toBe(0);
  });

  it('moves a WMS bridge edge to an adjacent lane instead of keeping a long reverse shared segment', () => {
    const edges: Edge[] = [
      {
        id: 'e_oms_so',
        source: 'oms',
        target: 'so',
        data: {
          computedPath: [
            { x: 255, y: 936 },
            { x: 351, y: 936 },
            { x: 351, y: 930 },
            { x: 5305, y: 930 },
            { x: 5305, y: 506 },
            { x: 5401, y: 506 },
          ],
        },
      },
      {
        id: 'e_so_inv',
        source: 'so',
        target: 'inventory',
        data: {
          computedPath: [
            { x: 5401, y: 541 },
            { x: 5312, y: 541 },
            { x: 5312, y: 930 },
            { x: 2493, y: 930 },
            { x: 2493, y: 906 },
            { x: 2475, y: 906 },
            { x: 2475, y: 205 },
            { x: 2386, y: 205 },
          ],
        },
      },
    ];

    const repaired = separateDetachedParallelOverlaps(edges, [], 16);
    const quality = calculateEdgePathQualityScore(repaired);
    const first = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const second = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(quality.nonOrthogonalSegments).toBe(0);
    expect(
      quality.strictCrossings,
      JSON.stringify(repaired.map(edge => ({ id: edge.id, path: getEdgePath(edge) })), null, 2),
    ).toBe(0);
    expect(
      quality.reverseOverlap,
      JSON.stringify(repaired.map(edge => ({ id: edge.id, path: (edge.data as any).computedPath })), null, 2),
    ).toBe(0);
    expect(maxOppositeDirectionOverlap(first, second)).toBeLessThan(16);
    expect(repaired.some(edge => (edge.data as any).detachedOverlapSeparated)).toBe(true);
  });

  it('uses a readable endpoint bypass for WMS inventory visual reverse lanes', () => {
    const edges: Edge[] = [
      {
        id: 'e_inv_cycle',
        source: 'inventory-view',
        target: 'cycle-count',
        data: {
          computedPath: [
            { x: 2386, y: 224 },
            { x: 2790, y: 224 },
          ],
        },
      },
      {
        id: 'e_move_inv',
        source: 'movement',
        target: 'inventory-view',
        data: {
          computedPath: [
            { x: 3872, y: 219 },
            { x: 3783, y: 219 },
            { x: 3783, y: 276 },
            { x: 2480, y: 276 },
            { x: 2480, y: 223 },
            { x: 2386, y: 223 },
          ],
        },
      },
    ];

    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = separateDetachedParallelOverlaps(edges, [], 16);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(baseline.reverseOverlap).toBeGreaterThan(0);
    expect(
      quality.reverseOverlap,
      JSON.stringify(repaired.map(edge => ({ id: edge.id, path: (edge.data as any).computedPath })), null, 2),
    ).toBe(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
  });

  it('charges residual candidate scoring to the shared quality-evaluation budget', () => {
    const edges: Edge[] = [
      {
        id: 'edge-forward',
        source: 'forward-source',
        target: 'forward-target',
        data: { computedPath: [{ x: 0, y: 40 }, { x: 240, y: 40 }] },
      },
      {
        id: 'edge-reverse',
        source: 'reverse-source',
        target: 'reverse-target',
        data: { computedPath: [{ x: 220, y: 40 }, { x: 20, y: 40 }] },
      },
    ];

    const budgetExhaustedAtResidualBaseline = separateDetachedParallelOverlaps(edges, [], 16, {
      maxIterations: 0,
      maxResidualPasses: 4,
      maxQualityEvaluations: 2,
    });
    const repairedWithinLargerBudget = separateDetachedParallelOverlaps(edges, [], 16, {
      maxIterations: 0,
      maxResidualPasses: 4,
      maxQualityEvaluations: 64,
    });

    expect(budgetExhaustedAtResidualBaseline).toEqual(edges);
    expect(calculateEdgePathQualityScore(edges).reverseOverlap).toBeGreaterThan(0);
    expect(calculateEdgePathQualityScore(repairedWithinLargerBudget).reverseOverlap).toBe(0);
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
