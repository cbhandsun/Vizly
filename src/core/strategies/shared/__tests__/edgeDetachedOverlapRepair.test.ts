import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createDetachedOverlapStateEvaluationContext,
  edgesWithPaths,
  getEdgePath,
  getRoutingObstacles,
  scoreDetachedOverlapState,
  separateDetachedParallelOverlaps,
} from '../edgeDetachedOverlapRepair';
import { repairDetachedStrictCrossingBypasses } from '../edgeDetachedStrictCrossingRepair';
import {
  calculateEdgePathQualityScore,
  countStrictEdgeCrossings,
  createEdgePathQualityEvaluationContext,
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

describe('separateDetachedParallelOverlaps', () => {
  it.each([
    {
      name: 'single-edge',
      changedPaths: [
        [{ x: 0, y: 40 }, { x: 200, y: 40 }],
        [{ x: 240, y: 72 }, { x: 40, y: 72 }],
        [{ x: 100, y: -40 }, { x: 100, y: 120 }],
      ],
    },
    {
      name: 'two-edge',
      changedPaths: [
        [{ x: 0, y: 24 }, { x: 200, y: 24 }],
        [{ x: 240, y: 40 }, { x: 40, y: 40 }],
        [{ x: 180, y: -40 }, { x: 180, y: 120 }],
      ],
    },
  ])('keeps incremental quality parity for $name detached candidates', ({ changedPaths }) => {
    const edges: Edge[] = [
      {
        id: 'edge-a',
        source: 'source-a',
        target: 'target-a',
        data: { computedPath: [{ x: 0, y: 40 }, { x: 200, y: 40 }] },
      },
      {
        id: 'edge-b',
        source: 'source-b',
        target: 'target-b',
        data: { computedPath: [{ x: 240, y: 40 }, { x: 40, y: 40 }] },
      },
      {
        id: 'edge-c',
        source: 'source-c',
        target: 'target-c',
        data: { computedPath: [{ x: 100, y: -40 }, { x: 100, y: 120 }] },
      },
    ];
    const baselinePaths = edges.map(edge => (
      ((edge.data as any).computedPath as Array<{ x: number; y: number }>).map(point => ({ ...point }))
    ));
    const baseline = edgesWithPaths(edges, baselinePaths);
    const context = createEdgePathQualityEvaluationContext(baseline);
    const expectedCandidate = edgesWithPaths(
      edges.map(edge => ({ ...edge, data: { ...(edge.data || {}) } })),
      changedPaths.map(path => path.map(point => ({ ...point }))),
    );
    const expected = calculateEdgePathQualityScore(expectedCandidate);
    const candidate = edgesWithPaths(edges, changedPaths);
    const detachedScoreContext = createDetachedOverlapStateEvaluationContext(baselinePaths, edges, []);
    const changedIndexes = changedPaths.map((_, index) => index);
    const expectedDetachedScore = scoreDetachedOverlapState(changedPaths, edges, []);

    expect(context.evaluate(candidate)).toEqual(expected);
    expect(detachedScoreContext.evaluate(changedPaths)).toBeCloseTo(expectedDetachedScore, 8);
    expect(detachedScoreContext.evaluateChanged(changedPaths, changedIndexes)).toBeCloseTo(expectedDetachedScore, 8);
    expect(detachedScoreContext.evaluateChanged(changedPaths, changedIndexes)).toBeCloseTo(expectedDetachedScore, 8);

    const nextPaths = changedPaths.map(path => path.map(point => ({ ...point })));
    nextPaths[0][0].y += 1;
    expect(detachedScoreContext.evaluateChanged(nextPaths, changedIndexes)).toBeCloseTo(
      scoreDetachedOverlapState(nextPaths, edges, []),
      8,
    );
  });

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

  it('preserves a long same-target true trunk and its target-side endpoints', () => {
    const edges: Edge[] = [
      {
        id: 'edge-master-data-oms',
        source: 'master-data',
        target: 'logistics-oms',
        data: {
          computedPath: [
            { x: 347, y: 2800 },
            { x: 347, y: 2181 },
            { x: 295, y: 2181 },
            { x: 295, y: 804 },
          ],
        },
      },
      {
        id: 'edge-tms-oms-status',
        source: 'tms-execution',
        target: 'logistics-oms',
        data: {
          computedPath: [
            { x: 178, y: 2330 },
            { x: 178, y: 2181 },
            { x: 295, y: 2181 },
            { x: 295, y: 804 },
          ],
        },
      },
    ];

    const repaired = separateDetachedParallelOverlaps(edges, [
      node('master-data', 300, 2800, 90, 60),
      node('tms-execution', 130, 2300, 90, 60),
      node('logistics-oms', 200, 744, 180, 60),
    ], 24);
    const first = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const second = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(maxParallelOverlap(first, second)).toBe(1377);
    expect(calculateEdgePathQualityScore(repaired).unexplainedRelatedOverlap).toBe(0);
    expect(repaired.some(edge => (edge.data as any).detachedOverlapSeparated)).toBe(false);
    expect(first[first.length - 1].y).toBe(804);
    expect(second[second.length - 1].y).toBe(804);
  });

  it('separates long reverse-flow overlaps that would make direction ambiguous', () => {
    const edges: Edge[] = [
      {
        id: 'edge-oms-fulfill-wms-outbound',
        source: 'oms-fulfill',
        target: 'wms-outbound',
        data: {
          computedPath: [
            { x: 314, y: 1772 },
            { x: 314, y: 1820 },
            { x: 130, y: 1820 },
            { x: 130, y: 2392 },
            { x: 310, y: 2392 },
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
            { x: 193, y: 2488 },
            { x: 193, y: 2392 },
            { x: 130, y: 2392 },
            { x: 130, y: 1914 },
            { x: 314, y: 1914 },
            { x: 314, y: 1772 },
          ],
        },
      },
    ];

    const repaired = separateDetachedParallelOverlaps(edges, [
      node('oms-fulfill', 220, 1700, 180, 72),
      node('wms-outbound', 220, 2488, 180, 72),
    ], 16);
    const first = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const second = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(maxParallelOverlap(first, second)).toBeLessThan(96);
    expect(maxOppositeDirectionOverlap(first, second)).toBeLessThan(24);
    expect(repaired.some(edge => (edge.data as any).detachedOverlapSeparated)).toBe(true);
  });

  it('slides a flow-through endpoint lane instead of leaving same-node in/out overlap', () => {
    const edges: Edge[] = [
      {
        id: 'edge-planning-execution',
        source: 'planning',
        target: 'execution',
        data: {
          computedPath: [
            { x: 100, y: 80 },
            { x: 100, y: 240 },
          ],
        },
      },
      {
        id: 'edge-execution-outbound',
        source: 'execution',
        target: 'outbound',
        data: {
          computedPath: [
            { x: 100, y: 240 },
            { x: 100, y: 144 },
            { x: 260, y: 144 },
            { x: 260, y: 40 },
          ],
        },
      },
    ];

    const repaired = separateDetachedParallelOverlaps(edges, [
      node('planning', 0, 32, 220, 48),
      node('execution', 0, 240, 220, 72),
      node('outbound', 220, -8, 120, 48),
    ], 16);
    const first = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const second = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(maxOppositeDirectionOverlap(first, second)).toBeLessThan(16);
    expect(repaired.some(edge => (edge.data as any).detachedOverlapSeparated)).toBe(true);
  });

  it('separates a logistics flow-through lane that enters and exits the same node', () => {
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
        data: {
          computedPath: [
            { x: 916, y: 812 },
            { x: 916, y: 738 },
            { x: 1227, y: 738 },
            { x: 1227, y: 203 },
          ],
        },
      },
    ];

    const repaired = separateDetachedParallelOverlaps(edges, [
      node('l-oms', 827, 534, 179, 119),
      node('tms', 820, 812, 192, 120),
      node('carrier', 1060, 45, 334, 158),
    ], 16);
    const first = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const second = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(maxOppositeDirectionOverlap(first, second)).toBeLessThan(16);
    expect(repaired.some(edge => (edge.data as any).detachedOverlapSeparated)).toBe(true);
  });

  it('slides unrelated endpoint stubs away from short reverse overlaps', () => {
    const edges: Edge[] = [
      {
        id: 'edge-endpoint-stub',
        source: 'source',
        target: 'target',
        data: {
          computedPath: [
            { x: 100, y: 100 },
            { x: 100, y: 40 },
            { x: 220, y: 40 },
          ],
        },
      },
      {
        id: 'edge-unrelated-reverse',
        source: 'other-a',
        target: 'other-b',
        data: {
          computedPath: [
            { x: 100, y: 28 },
            { x: 100, y: 76 },
          ],
        },
      },
    ];

    const repaired = separateDetachedParallelOverlaps(edges, [
      node('source', 0, 100, 240, 80),
      node('target', 220, 0, 120, 80),
      node('other-a', 60, 0, 80, 40),
      node('other-b', 60, 88, 80, 40),
    ], 16);
    const first = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const second = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(maxOppositeDirectionOverlap(first, second)).toBeLessThan(16);
    expect(first[0]).not.toEqual({ x: 100, y: 100 });
    expect(repaired.some(edge => (edge.data as any).detachedOverlapSeparated)).toBe(true);
  });

  it('slides short opposite endpoint lanes apart in rendered systems paths', () => {
    const edges: Edge[] = [
      {
        id: 'edge-master-data-tms-planning',
        source: 'master-data',
        target: 'tms-planning',
        data: {
          computedPath: [
            { x: 196, y: 625 },
            { x: 196, y: 680 },
            { x: 78, y: 680 },
            { x: 78, y: 2269 },
            { x: 196, y: 2269 },
            { x: 196, y: 2379 },
          ],
        },
      },
      {
        id: 'edge-tms-execution-wms-outbound',
        source: 'tms-execution',
        target: 'wms-outbound',
        data: {
          computedPath: [
            { x: 131, y: 2635 },
            { x: 131, y: 2563 },
            { x: 100, y: 2563 },
            { x: 100, y: 2293 },
            { x: 196, y: 2293 },
            { x: 196, y: 2221 },
          ],
        },
      },
    ];

    const repaired = separateDetachedParallelOverlaps(edges, [
      node('master-data', 100, 500, 420, 125),
      node('tms-planning', 141, 2379, 338, 125),
      node('tms-execution', 0, 2635, 400, 125),
      node('wms-outbound', 115, 2063, 390, 158),
    ], 16);
    const first = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const second = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(maxOppositeDirectionOverlap(first, second)).toBeLessThan(16);
    expect(hasStrictCrossing(first, second)).toBe(false);
    expect(repaired.some(edge => (edge.data as any).detachedOverlapSeparated)).toBe(true);
  });

  it('separates short unrelated reverse middle overlaps in logistics planning paths', () => {
    const edges: Edge[] = [
      {
        id: 'edge-4',
        source: 'carrier-portal',
        target: 'dock-scheduling',
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
        source: 'billing',
        target: 'inventory-planning',
        data: {
          computedPath: [
            { x: 670, y: 3105 },
            { x: 670, y: 3050 },
            { x: 830, y: 3050 },
            { x: 830, y: 2047 },
            { x: 670, y: 2047 },
            { x: 670, y: 1992 },
          ],
        },
      },
    ];

    const repaired = separateDetachedParallelOverlaps(edges, [
      node('carrier-portal', 1120, 80, 160, 100),
      node('dock-scheduling', 590, 2639, 160, 100),
      node('billing', 590, 3105, 160, 100),
      node('inventory-planning', 590, 1892, 160, 100),
    ], 16);
    const first = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const second = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(maxOppositeDirectionOverlap(first, second)).toBeLessThan(16);
    expect(hasStrictCrossing(first, second)).toBe(false);
    expect(repaired.some(edge => (edge.data as any).detachedOverlapSeparated)).toBe(true);
  });

  it('does not split explicitly synthesized shared trunks when fixing endpoint overlaps', () => {
    const edges: Edge[] = [
      {
        id: 'edge-shared',
        source: 'hub',
        target: 'execution',
        data: {
          sharedTrunkSynthesized: true,
          computedPath: [
            { x: 100, y: 80 },
            { x: 100, y: 240 },
          ],
        },
      },
      {
        id: 'edge-neighbor',
        source: 'execution',
        target: 'outbound',
        data: {
          computedPath: [
            { x: 100, y: 240 },
            { x: 100, y: 144 },
            { x: 260, y: 144 },
            { x: 260, y: 40 },
          ],
        },
      },
    ];

    const repaired = separateDetachedParallelOverlaps(edges, [
      node('hub', 0, 32, 220, 48),
      node('execution', 0, 240, 220, 72),
      node('outbound', 220, -8, 120, 48),
    ], 16);

    expect((repaired[0].data as any).computedPath).toEqual((edges[0].data as any).computedPath);
    expect((repaired[1].data as any).computedPath).not.toEqual((edges[1].data as any).computedPath);
  });

  it('separates rendered systems-interaction reverse middle overlap', () => {
    const edges: Edge[] = [
      {
        id: 'edge-master-data-wms-inventory',
        source: 'master-data',
        target: 'wms-inventory',
        data: {
          computedPath: [
            { x: 310, y: 746 },
            { x: 310, y: 842 },
            { x: 512, y: 842 },
            { x: 512, y: 2040 },
            { x: 334, y: 2040 },
            { x: 334, y: 2170 },
          ],
        },
      },
      {
        id: 'edge-oms-fulfill-wms-outbound',
        source: 'oms-fulfill',
        target: 'wms-outbound',
        data: {
          computedPath: [
            { x: 338, y: 1772 },
            { x: 338, y: 2040 },
            { x: 490, y: 2040 },
            { x: 490, y: 2392 },
            { x: 326, y: 2392 },
            { x: 326, y: 2488 },
          ],
        },
      },
    ];

    const repaired = separateDetachedParallelOverlaps(edges, [
      node('master-data', 100, 587, 420, 158),
      node('oms-fulfill', 148, 1613, 332, 158),
      node('wms-inventory', 142, 2171, 336, 158),
      node('wms-outbound', 115, 2489, 390, 158),
    ], 16);
    const first = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const second = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(maxOppositeDirectionOverlap(first, second)).toBeLessThan(24);
    expect(repaired.some(edge => (edge.data as any).detachedOverlapSeparated)).toBe(true);
  });

  it('bypasses strict crossings introduced while separating rendered systems overlaps', () => {
    const edges: Edge[] = [
      {
        id: 'edge-oms-fulfill-wms-outbound',
        source: 'oms-fulfill',
        target: 'wms-outbound',
        data: {
          computedPath: [
            { x: 338, y: 1772 },
            { x: 338, y: 2040 },
            { x: 130, y: 2040 },
            { x: 130, y: 2393 },
            { x: 310, y: 2393 },
            { x: 310, y: 2489 },
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
            { x: 310, y: 2413 },
            { x: 314, y: 2413 },
            { x: 314, y: 1454 },
          ],
        },
      },
    ];

    const repaired = repairDetachedStrictCrossingBypasses(edges, [
      node('oms-fulfill', 148, 1613, 332, 158),
      node('wms-inventory', 142, 2171, 336, 158),
      node('wms-outbound', 115, 2489, 390, 158),
      node('oms-atc', 140, 1295, 347, 158),
    ]);
    const first = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const second = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(hasStrictCrossing(first, second)).toBe(false);
    expect(repaired.some(edge => (edge.data as any).detachedOverlapSeparated)).toBe(true);
  });

  it('bypasses a rendered systems reverse-pair crossing without leaving a shared direction segment', () => {
    const edges: Edge[] = [
      {
        id: 'edge-oms-fulfill-wms-outbound',
        source: 'oms-fulfill',
        target: 'wms-outbound',
        data: {
          computedPath: [
            { x: 178, y: 1772 },
            { x: 178, y: 1868 },
            { x: 130, y: 1868 },
            { x: 130, y: 2403 },
            { x: 310, y: 2403 },
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
            { x: 193, y: 2647 },
            { x: 193, y: 2743 },
            { x: 118, y: 2743 },
            { x: 118, y: 1998 },
            { x: 338, y: 1998 },
            { x: 338, y: 1772 },
          ],
        },
      },
    ];

    const overlapRepaired = separateDetachedParallelOverlaps(edges, [
      node('oms-fulfill', 148, 1613, 332, 158),
      node('wms-outbound', 115, 2489, 390, 158),
    ], 16);
    const repaired = repairDetachedStrictCrossingBypasses(overlapRepaired, [
      node('oms-fulfill', 148, 1613, 332, 158),
      node('wms-outbound', 115, 2489, 390, 158),
    ]);
    const first = (repaired[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const second = (repaired[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(hasStrictCrossing(first, second)).toBe(false);
    expect(maxOppositeDirectionOverlap(first, second)).toBeLessThan(24);
    expect(repaired.some(edge => (edge.data as any).detachedOverlapSeparated)).toBe(true);
  });

  it('does not trade a logistics bundle crossing for routes through business nodes', () => {
    const edges: Edge[] = [
      {
        id: 'edge-loms-customs',
        source: 'logistics-oms',
        target: 'customs',
        data: {
          computedPath: [
            { x: 1323, y: 803 },
            { x: 1323, y: 885 },
            { x: 2063, y: 885 },
            { x: 2063, y: 981 },
          ],
        },
      },
      {
        id: 'edge-loms-tms',
        source: 'logistics-oms',
        target: 'tms',
        data: {
          computedPath: [
            { x: 1323, y: 803 },
            { x: 1323, y: 962 },
          ],
        },
      },
      {
        id: 'edge-loms-visibility',
        source: 'logistics-oms',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 1323, y: 803 },
            { x: 1323, y: 887 },
            { x: -6, y: 887 },
            { x: -6, y: 1849 },
            { x: 1790, y: 1849 },
            { x: 1790, y: 1921 },
          ],
        },
      },
      {
        id: 'edge-loms-wms',
        source: 'logistics-oms',
        target: 'wms',
        data: {
          computedPath: [
            { x: 1323, y: 803 },
            { x: 1323, y: 887 },
            { x: 252, y: 887 },
            { x: 252, y: 961 },
          ],
        },
      },
      {
        id: 'edge-tms-carrier',
        source: 'tms',
        target: 'carrier',
        data: {
          computedPath: [
            { x: 1227, y: 961 },
            { x: 1227, y: 939 },
            { x: 1311, y: 939 },
            { x: 1311, y: 865 },
            { x: 1769, y: 865 },
            { x: 1769, y: 278 },
          ],
        },
      },
      {
        id: 'edge-tms-downstream',
        source: 'tms',
        target: 'downstream',
        data: {
          computedPath: [
            { x: 1323, y: 962 },
            { x: 1323, y: 873 },
            { x: 2274, y: 873 },
            { x: 2274, y: 239 },
          ],
        },
      },
    ];

    const nodes = [
      node('logistics-oms', 1181, 644, 284, 158),
      node('tms', 1060, 961, 334, 158),
      node('customs', 1945, 981, 236, 158),
      node('wms', 100, 961, 304, 158),
      node('visibility', 1645, 1921, 288, 158),
      node('carrier', 1650, 120, 240, 158),
      node('downstream', 2150, 80, 248, 158),
    ];
    const obstacles = getRoutingObstacles(nodes);
    const baselineObstacleHits = edges.reduce((total, edge) => (
      total + countRoutingObstacleHits(getEdgePath(edge), edge, obstacles)
    ), 0);
    const repaired = repairDetachedStrictCrossingBypasses(edges, nodes);
    const repairedObstacleHits = repaired.reduce((total, edge) => (
      total + countRoutingObstacleHits(getEdgePath(edge), edge, obstacles)
    ), 0);

    expect(
      repairedObstacleHits,
      JSON.stringify(repaired.map(edge => ({ id: edge.id, path: getEdgePath(edge) })), null, 2),
    ).toBeLessThanOrEqual(baselineObstacleHits);
    expect(countStrictEdgeCrossings(repaired)).toBeLessThanOrEqual(countStrictEdgeCrossings(edges));
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

function hasStrictCrossing(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): boolean {
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      const crossing = strictSegmentCrossing(a[i], a[i + 1], b[j], b[j + 1]);
      if (crossing) return true;
    }
  }
  return false;
}

function strictSegmentCrossing(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): boolean {
  const aHorizontal = Math.abs(a1.y - a2.y) < 1 && Math.abs(a1.x - a2.x) > 1;
  const aVertical = Math.abs(a1.x - a2.x) < 1 && Math.abs(a1.y - a2.y) > 1;
  const bHorizontal = Math.abs(b1.y - b2.y) < 1 && Math.abs(b1.x - b2.x) > 1;
  const bVertical = Math.abs(b1.x - b2.x) < 1 && Math.abs(b1.y - b2.y) > 1;
  if (aHorizontal && bVertical) return segmentCrosses(a1, a2, b1, b2);
  if (aVertical && bHorizontal) return segmentCrosses(b1, b2, a1, a2);
  return false;
}

function segmentCrosses(
  horizontalA: { x: number; y: number },
  horizontalB: { x: number; y: number },
  verticalA: { x: number; y: number },
  verticalB: { x: number; y: number },
): boolean {
  const x = verticalA.x;
  const y = horizontalA.y;
  return x > Math.min(horizontalA.x, horizontalB.x) + 1
    && x < Math.max(horizontalA.x, horizontalB.x) - 1
    && y > Math.min(verticalA.y, verticalB.y) + 1
    && y < Math.max(verticalA.y, verticalB.y) - 1;
}
