import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  calculateEdgePathQualityScore,
  MIN_EDGE_PATH_PENALIZED_OVERLAP,
} from '../../../strategies/shared/edgeStrictCrossingGuard';
import { scoreNodeClearanceRisk } from '../../../strategies/shared/edgeWaypointCandidateRepair';
import {
  createBaseReactFlowDisplayEdges,
  createBaseReactFlowInteractiveDisplayEdges,
  createBaseReactFlowPreDisplayFinalEdges,
  repairBoundedReverseParallelOverlaps,
} from '../baseReactFlowDisplayEdges';
import {
  countHairpins,
  edgeNodeObstacleHits,
  edgeOverlapProblems,
  lockedEdge,
  maxOppositeDirectionOverlap,
  node,
  renderedSystemsInteractionDisplayEdges,
  shortEndpointSegments,
  strictPathCrossings,
  tinyInteriorSegments,
} from './baseReactFlowDisplayEdges.testUtils';

describe('baseReactFlowDisplayEdges local repairs', () => {
  it('keeps related same-target trunks free of forbidden overlap after final display routing', () => {
    const nodes: Node[] = [
      { id: 'master-data', position: { x: 300, y: 2800 }, data: {}, measured: { width: 90, height: 60 } },
      { id: 'tms-execution', position: { x: 130, y: 2300 }, data: {}, measured: { width: 90, height: 60 } },
      { id: 'logistics-oms', position: { x: 200, y: 744 }, data: {}, measured: { width: 180, height: 60 } },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-master-data-oms',
        source: 'master-data',
        target: 'logistics-oms',
        data: {
          layoutPathLocked: true,
          computedPath: [
            { x: 347, y: 2816 },
            { x: 347, y: 2507 },
            { x: 443, y: 2507 },
            { x: 443, y: 1972 },
            { x: 347, y: 1972 },
            { x: 347, y: 804 },
          ],
        },
      },
      {
        id: 'edge-tms-oms-status',
        source: 'tms-execution',
        target: 'logistics-oms',
        data: {
          layoutPathLocked: true,
          computedPath: [
            { x: 178, y: 2330 },
            { x: 178, y: 2181 },
            { x: 443, y: 2181 },
            { x: 443, y: 1972 },
            { x: 242, y: 1972 },
            { x: 242, y: 804 },
          ],
        },
      },
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 796,
    });
    const first = (result[0].data as any).computedPath;
    const second = (result[1].data as any).computedPath;

    expect(result[0].type).toBe('stablePath');
    expect(result[1].type).toBe('stablePath');
    const quality = calculateEdgePathQualityScore(result);
    expect(quality.reverseOverlap, JSON.stringify({ quality, first, second }, null, 2)).toBe(0);
    expect(quality.unrelatedOverlap, JSON.stringify({ quality, first, second }, null, 2)).toBe(0);
    expect(quality.unexplainedRelatedOverlap, JSON.stringify({ quality, first, second }, null, 2)).toBe(0);
  });

  it('flattens local return notches in locked paths before rendering stable edges', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: -30, y: -60 }, data: {}, measured: { width: 60, height: 60 } },
      { id: 'target', position: { x: 170, y: -60 }, data: {}, measured: { width: 60, height: 60 } },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-source-target',
        source: 'source',
        target: 'target',
        type: 'advanced-smart-step',
        data: {
          layoutPathLocked: true,
          computedPath: [
            { x: 0, y: 0 },
            { x: 0, y: 40 },
            { x: 80, y: 40 },
            { x: 80, y: 68 },
            { x: 120, y: 68 },
            { x: 120, y: 40 },
            { x: 200, y: 40 },
            { x: 200, y: 0 },
          ],
        },
      },
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 797,
    });

    expect(result[0].type).toBe('stablePath');
    const repairedPath = (result[0].data as any).computedPath as Array<{ x: number; y: number }>;
    expect(repairedPath).toHaveLength(4);
    expect(repairedPath[0]).toEqual({ x: 0, y: 0 });
    expect(repairedPath[3]).toEqual({ x: 200, y: 0 });
    expect(repairedPath[1]?.x).toBe(0);
    expect(repairedPath[2]?.x).toBe(200);
    expect(repairedPath[1]?.y).toBe(repairedPath[2]?.y);
    expect(repairedPath[1]?.y).toBeGreaterThanOrEqual(48);
    expect(calculateEdgePathQualityScore(result).tinyInteriorDoglegs).toBe(0);
    expect((result[0].data as any).localDoglegRepaired).toBe(true);
  });

  it('keeps shared source trunks readable after final display post-processing', () => {
    const nodes: Node[] = [
      { id: 'hub', position: { x: 0, y: 0 }, data: {}, measured: { width: 160, height: 120 } },
      { id: 'left', position: { x: -240, y: 360 }, data: {}, measured: { width: 160, height: 120 } },
      { id: 'right', position: { x: 240, y: 360 }, data: {}, measured: { width: 160, height: 120 } },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-hub-left',
        source: 'hub',
        target: 'left',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'advanced-smart-step',
        data: {
          layoutPathLocked: true,
          computedPath: [
            { x: 80, y: 120 },
            { x: 80, y: 126 },
            { x: -160, y: 126 },
            { x: -160, y: 360 },
          ],
        },
      },
      {
        id: 'edge-hub-right',
        source: 'hub',
        target: 'right',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'advanced-smart-step',
        data: {
          layoutPathLocked: true,
          computedPath: [
            { x: 80, y: 120 },
            { x: 80, y: 126 },
            { x: 320, y: 126 },
            { x: 320, y: 360 },
          ],
        },
      },
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes,
      enableSmartEdges: false,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 798,
    });
    const leftPath = (result[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const rightPath = (result[1].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(result[0].type).toBe('stablePath');
    expect(result[1].type).toBe('stablePath');
    expect(leftPath[1]).toEqual(rightPath[1]);
    expect(leftPath[1].y - leftPath[0].y).toBeGreaterThanOrEqual(90);
    expect(rightPath[1].y - rightPath[0].y).toBeGreaterThanOrEqual(90);
  });

  it('detaches reverse target-trunk backtracks before final display rendering', () => {
    const nodes: Node[] = [
      { id: 'subgroup-logistics', type: 'subGroup', position: { x: 400, y: 1700 }, data: {}, measured: { width: 620, height: 1100 } },
      node('wms-outbound', 600, 1844, 220, 158),
      node('tms-execution', 600, 2480, 220, 158),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-tms-execution-wms-outbound',
        source: 'tms-execution',
        target: 'wms-outbound',
        type: 'advanced-smart-step',
        data: {
          layoutPathLocked: true,
          layoutDirection: 'TB',
          computedPath: [
            { x: 701, y: 2638 },
            { x: 701, y: 2692 },
            { x: 521, y: 2692 },
            { x: 521, y: 1748 },
            { x: 701, y: 1748 },
            { x: 701, y: 1844 },
          ],
        },
      },
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 800,
    });
    const path = (result[0].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(result[0].type).toBe('stablePath');
    expect(path[1].y).toBeLessThan(path[0].y);
    expect(path[path.length - 2].y).toBeGreaterThan(path[path.length - 1].y);
    expect(path.length).toBeLessThanOrEqual(4);
  });

  it('moves long feedback edges to directional outer lanes instead of crossing master-data trunks', () => {
    const nodes: Node[] = [
      node('sales-channels', 50, 69.5, 336, 119),
      node('master-data', 706, 50, 420, 158),
      node('oms-order', 174.05, 440, 364, 158),
      node('oms-atc', 182.55, 758, 347, 158),
      node('oms-fulfill', 190.05, 1076, 332, 158),
      node('wms-inventory', 532.925, 1526, 336, 158),
      node('wms-outbound', 505.925, 1844, 390, 158),
      node('tms-planning', 531.925, 2162, 338, 158),
      node('tms-execution', 491.425, 2480, 419, 158),
    ];
    const edges: Edge[] = [
      lockedEdge('edge-master-data-oms-order', 'master-data', 'oms-order', [
        { x: 916, y: 50 },
        { x: 916, y: 620 },
        { x: 356, y: 620 },
        { x: 356, y: 598 },
      ]),
      lockedEdge('edge-master-data-wms-inventory', 'master-data', 'wms-inventory', [
        { x: 916, y: 208 },
        { x: 916, y: 1430 },
        { x: 821, y: 1430 },
        { x: 821, y: 1526 },
      ]),
      lockedEdge('edge-master-data-tms-planning', 'master-data', 'tms-planning', [
        { x: 916, y: 208 },
        { x: 916, y: 2066 },
        { x: 730, y: 2066 },
        { x: 730, y: 2162 },
      ]),
      lockedEdge('edge-tms-execution-oms-order', 'tms-execution', 'oms-order', [
        { x: 885, y: 2480 },
        { x: 885, y: 2128 },
        { x: 965, y: 2128 },
        { x: 965, y: 634 },
        { x: 915, y: 634 },
        { x: 915, y: 616 },
        { x: 356, y: 616 },
        { x: 356, y: 598 },
      ]),
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 802,
    });
    const resultPaths = result.map((edge) => ({
      id: edge.id,
      path: (edge.data as any).computedPath as Array<{ x: number; y: number }>,
    }));
    const feedbackPath = resultPaths.find(path => path.id === 'edge-tms-execution-oms-order')?.path ?? [];

    expect(strictPathCrossings(resultPaths), JSON.stringify(resultPaths, null, 2)).toEqual([]);
    expect(edgeNodeObstacleHits(result, nodes), JSON.stringify(resultPaths, null, 2)).toEqual([]);
    expect(Math.min(...feedbackPath.map(point => point.x))).toBeLessThan(174);
    expect(feedbackPath[1].y).toBeLessThan(feedbackPath[0].y);
    expect(
      feedbackPath[feedbackPath.length - 2].y,
      JSON.stringify(feedbackPath, null, 2),
    ).toBeGreaterThan(feedbackPath[feedbackPath.length - 1].y);
  }, 45_000);

  it('extends source stubs before moving long feedback edges past same-source blockers', () => {
    const nodes: Node[] = [
      node('master-data', 706, 50, 420, 158),
      node('oms-order', 174.05, 440, 364, 158),
      node('wms-outbound', 505.925, 1844, 390, 158),
      node('tms-planning', 531.925, 2162, 338, 158),
      node('tms-execution', 491.425, 2480, 419, 158),
    ];
    const edges: Edge[] = [
      lockedEdge('edge-master-data-tms-planning', 'master-data', 'tms-planning', [
        { x: 916, y: 208 },
        { x: 916, y: 2066 },
        { x: 730, y: 2066 },
        { x: 730, y: 2162 },
      ]),
      lockedEdge('edge-tms-execution-wms-outbound', 'tms-execution', 'wms-outbound', [
        { x: 605, y: 2480 },
        { x: 605, y: 2384 },
        { x: 520, y: 2384 },
        { x: 520, y: 2098 },
        { x: 605, y: 2098 },
        { x: 605, y: 2002 },
      ]),
      lockedEdge('edge-tms-execution-oms-order', 'tms-execution', 'oms-order', [
        { x: 885, y: 2480 },
        { x: 885, y: 2128 },
        { x: 965, y: 2128 },
        { x: 965, y: 634 },
        { x: 915, y: 634 },
        { x: 915, y: 616 },
        { x: 356, y: 616 },
        { x: 356, y: 598 },
      ]),
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 803,
    });
    const resultPaths = result.map((edge) => ({
      id: edge.id,
      path: (edge.data as any).computedPath as Array<{ x: number; y: number }>,
    }));
    const feedbackPath = resultPaths.find(path => path.id === 'edge-tms-execution-oms-order')?.path ?? [];

    expect(strictPathCrossings(resultPaths), JSON.stringify(resultPaths, null, 2)).toEqual([]);
    expect(edgeNodeObstacleHits(result, nodes), JSON.stringify(resultPaths, null, 2)).toEqual([]);
    expect(
      Math.max(...feedbackPath.map(point => point.x)),
      JSON.stringify(feedbackPath, null, 2),
    ).toBeLessThanOrEqual(910);
    expect(Math.max(...feedbackPath.map(point => point.y))).toBeLessThanOrEqual(feedbackPath[0].y);
    expect(
      Math.min(...feedbackPath.map(point => point.x)),
      JSON.stringify(feedbackPath, null, 2),
    ).toBeLessThanOrEqual(356);
  }, 45_000);

  it('keeps same-half feedback bypasses on the endpoint side during final display repair', () => {
    const nodes: Node[] = [
      node('wms-outbound', 505.925, 1844, 390, 158),
      node('tms-planning', 531.925, 2162, 338, 158),
      node('tms-execution', 491.425, 2480, 419, 158),
    ];
    const edges: Edge[] = [
      lockedEdge('edge-tms-execution-wms-outbound', 'tms-execution', 'wms-outbound', [
        { x: 605, y: 2480 },
        { x: 605, y: 2384 },
        { x: 900, y: 2384 },
        { x: 900, y: 2098 },
        { x: 605, y: 2098 },
        { x: 605, y: 2002 },
      ]),
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 804,
    });
    const path = (result[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const internalXValues = path.slice(1, -1).map(point => point.x);

    expect(edgeNodeObstacleHits(result, nodes), JSON.stringify(path, null, 2)).toEqual([]);
    expect(Math.min(...internalXValues), JSON.stringify(path, null, 2)).toBeLessThan(605);
    expect(Math.max(...internalXValues), JSON.stringify(path, null, 2)).toBeLessThanOrEqual(605);
  }, 45_000);

  it('removes strict crossings from the rendered systems-interaction locked paths before display', () => {
    const nodes: Node[] = [
      node('sales-channels', 148.725, 80, 335.998, 118.993),
      node('master-data', 100, 587, 420, 157.995),
      node('oms-order', 132.2, 977, 363.993, 157.995),
      node('oms-atc', 140.7, 1295, 346.997, 157.995),
      node('oms-fulfill', 148.2, 1613, 331.997, 157.995),
      node('wms-inventory', 142.161, 2171, 335.998, 157.995),
      node('wms-outbound', 115.161, 2489, 390, 157.995),
      node('tms-planning', 141.161, 2807, 337.995, 157.995),
      node('tms-execution', 100.661, 3125, 418.993, 157.995),
      node('carrier-partner', 213.266, 3683, 222.995, 67.995),
      node('customer', 234.266, 3911, 180.998, 67.995),
    ];
    const edges = renderedSystemsInteractionDisplayEdges();

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 799,
    });
    const paths = result.map((edge) => ({
      id: edge.id,
      path: (edge.data as any).computedPath as Array<{ x: number; y: number }>,
    }));
    const quality = calculateEdgePathQualityScore(result);

    expect(
      strictPathCrossings(paths),
      JSON.stringify({
        quality,
        paths: paths.filter(path => [
          'edge-master-data-wms-inventory',
          'edge-oms-fulfill-wms-outbound',
          'edge-wms-inventory-oms-atc',
          'edge-wms-outbound-oms-fulfill',
        ].includes(path.id)),
      }, null, 2),
    ).toEqual([]);
    expect(
      maxOppositeDirectionOverlap(
        paths.find(path => path.id === 'edge-master-data-wms-inventory')?.path ?? [],
        paths.find(path => path.id === 'edge-oms-fulfill-wms-outbound')?.path ?? [],
      ),
      JSON.stringify(paths.filter(path => [
        'edge-master-data-wms-inventory',
        'edge-oms-fulfill-wms-outbound',
      ].includes(path.id)), null, 2),
    ).toBeLessThanOrEqual(MIN_EDGE_PATH_PENALIZED_OVERLAP);

    const inventoryEdge = result.find(edge => edge.id === 'edge-master-data-wms-inventory');
    const inventoryPath = paths.find(path => path.id === 'edge-master-data-wms-inventory')?.path ?? [];
    const inventoryClearanceRisk = inventoryEdge
      ? scoreNodeClearanceRisk(inventoryPath, nodes, inventoryEdge, 48)
      : Number.POSITIVE_INFINITY;
    expect(tinyInteriorSegments(inventoryPath)).toEqual([]);
    expect(inventoryClearanceRisk, JSON.stringify(paths, null, 2)).toBe(0);
    expect(inventoryPath.length, JSON.stringify(paths, null, 2)).toBeLessThanOrEqual(10);
  }, 45_000);

  it('keeps interactive systems-interaction display paths on readable outer lanes', () => {
    const nodes: Node[] = [
      node('sales-channels', 148.725, 80, 335.998, 118.993),
      node('master-data', 100, 587, 420, 157.995),
      node('oms-order', 132.2, 977, 363.993, 157.995),
      node('oms-atc', 140.7, 1295, 346.997, 157.995),
      node('oms-fulfill', 148.2, 1613, 331.997, 157.995),
      node('wms-inventory', 142.161, 2171, 335.998, 157.995),
      node('wms-outbound', 115.161, 2489, 390, 157.995),
      node('tms-planning', 141.161, 2807, 337.995, 157.995),
      node('tms-execution', 100.661, 3125, 418.993, 157.995),
      node('carrier-partner', 213.266, 3683, 222.995, 67.995),
      node('customer', 234.266, 3911, 180.998, 67.995),
    ];
    const edges = renderedSystemsInteractionDisplayEdges();

    const result = createBaseReactFlowInteractiveDisplayEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 801,
    });
    const paths = result.map((edge) => ({
      id: edge.id,
      path: (edge.data as any).computedPath as Array<{ x: number; y: number }>,
    }));
    const returnPath = paths.find(path => path.id === 'edge-tms-execution-oms-order')?.path ?? [];

    expect(strictPathCrossings(paths), JSON.stringify(paths, null, 2)).toEqual([]);
    expect(edgeNodeObstacleHits(result, nodes), JSON.stringify(paths, null, 2)).toEqual([]);
    expect(tinyInteriorSegments(returnPath)).toEqual([]);
    expect(shortEndpointSegments(returnPath)).toEqual([]);
    expect(Math.min(...returnPath.map(point => point.x))).toBeLessThanOrEqual(120);
  }, 45_000);

  it('separates unrelated BMS and YMS middle lanes in the pre-display final path', () => {
    const nodes: Node[] = [
      node('tms', 132, 278, 371, 194),
      node('wms', 132, 628, 371, 208),
      node('bms', 805, 137, 334, 174),
      node('yms', 800, 479, 344, 178),
    ];
    const edges: Edge[] = [
      lockedEdge('wms-bms', 'wms', 'bms', [
        { x: 318, y: 628 }, { x: 318, y: 580 }, { x: 645, y: 580 },
        { x: 645, y: 359 }, { x: 972, y: 359 }, { x: 972, y: 311 },
      ]),
      lockedEdge('tms-yms', 'tms', 'yms', [
        { x: 318, y: 472 }, { x: 318, y: 520 }, { x: 645, y: 520 },
        { x: 645, y: 568 }, { x: 800, y: 568 },
      ]),
    ];

    const baseline = calculateEdgePathQualityScore(edges);
    expect(baseline.reverseOverlap).toBeGreaterThan(0);
    expect(baseline.unrelatedOverlap).toBeGreaterThan(0);

    const result = createBaseReactFlowPreDisplayFinalEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 802,
    });
    const quality = calculateEdgePathQualityScore(result);
    expect({
      nonOrthogonalSegments: quality.nonOrthogonalSegments,
      strictCrossings: quality.strictCrossings,
      reverseOverlap: quality.reverseOverlap,
      unrelatedOverlap: quality.unrelatedOverlap,
      unexplainedRelatedOverlap: quality.unexplainedRelatedOverlap,
    }).toEqual({
      nonOrthogonalSegments: 0,
      strictCrossings: 0,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
      unexplainedRelatedOverlap: 0,
    });
    expect(edgeNodeObstacleHits(result, nodes)).toEqual([]);
  }, 45_000);

  it('repairs bounded opposite-direction WMS overlaps without adding strict crossings', () => {
    const edges: Edge[] = [
      lockedEdge('reservation', 'allocation', 'reservation-node', [
        { x: 1114, y: 1418 }, { x: 1114, y: 1466 }, { x: 1385, y: 1466 },
        { x: 1385, y: 1233 }, { x: 1444, y: 1233 },
      ]),
      lockedEdge('feedback', 'labor', 'allocation', [
        { x: 1257, y: 60 }, { x: 1257, y: 1306 }, { x: 1209, y: 1306 },
        { x: 1209, y: 1466 }, { x: 1115, y: 1466 },
      ]),
      lockedEdge('replenish', 'task', 'replenish-node', [
        { x: 1960, y: 1198 }, { x: 2032, y: 1198 }, { x: 2032, y: 1225 },
        { x: 2232, y: 1225 }, { x: 2232, y: 1020 }, { x: 2287, y: 1020 },
      ]),
      lockedEdge('taskgroup', 'task', 'taskgroup-node', [
        { x: 1961, y: 1246 }, { x: 2032, y: 1246 }, { x: 2032, y: 972 },
        { x: 2578, y: 972 }, { x: 2578, y: 1253 }, { x: 2650, y: 1253 },
      ]),
    ];
    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairBoundedReverseParallelOverlaps(edges, [], 8);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(baseline.reverseOverlap).toBe(121);
    expect(quality.reverseOverlap, JSON.stringify(edgeOverlapProblems(repaired), null, 2)).toBe(0);
    expect(quality.strictCrossings).toBe(0);
  });

  it('keeps feedback target stubs from crossing nearby allocation trunks', () => {
    const nodes: Node[] = [
      node('allocation', 969, 1418, 146, 96),
      node('task-generate', 1823, 1198, 172, 96),
      node('labor-schedule-feedback', 5365, 1514, 240, 136),
    ];
    const edges: Edge[] = [
      {
        ...lockedEdge('e-allocation-task', 'allocation', 'task-generate', [
        { x: 1103, y: 1460 },
        { x: 1103, y: 1594 },
        { x: 1751, y: 1594 },
        { x: 1751, y: 1246 },
        { x: 1823, y: 1246 },
        ]),
        sourceHandle: 'right',
        targetHandle: 'left',
      },
      {
        ...lockedEdge('e-labor-alloc-fb', 'labor-schedule-feedback', 'allocation', [
        { x: 5365, y: 1582 },
        { x: 5365, y: 1510 },
        { x: 4862, y: 1510 },
        { x: 4862, y: 73 },
        { x: 1257, y: 73 },
        { x: 1257, y: 1301 },
        { x: 1059, y: 1301 },
        { x: 1059, y: 1466 },
        { x: 1115, y: 1466 },
        ]),
        sourceHandle: 'left',
        targetHandle: 'right',
      },
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 804,
    });
    const resultPaths = result.map((edge) => ({
      id: edge.id,
      path: (edge.data as any).computedPath as Array<{ x: number; y: number }>,
    }));
    const feedbackPath = resultPaths.find(path => path.id === 'e-labor-alloc-fb')?.path ?? [];
    const allocationPath = resultPaths.find(path => path.id === 'e-allocation-task')?.path ?? [];

    expect(strictPathCrossings(resultPaths), JSON.stringify(resultPaths, null, 2)).toEqual([]);
    expect(allocationPath[1]?.y).toBe(allocationPath[0]?.y);
    expect(allocationPath[1]?.x).toBeGreaterThan(allocationPath[0]?.x ?? Number.POSITIVE_INFINITY);
    expect(
      Math.abs((allocationPath[1]?.x ?? 0) - (allocationPath[0]?.x ?? 0)),
    ).toBeGreaterThanOrEqual(48);
    expect(countHairpins(feedbackPath)).toBe(0);
    expect(shortEndpointSegments(feedbackPath)).toEqual([]);
    expect(feedbackPath.at(-2)?.x).toBeGreaterThan(feedbackPath.at(-1)?.x ?? Number.POSITIVE_INFINITY);
    expect(feedbackPath.at(-2)?.y).toBe(feedbackPath.at(-1)?.y);
  }, 45_000);
});
