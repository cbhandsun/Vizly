import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import {
  refineGlobalEdgeWaypoints,
} from '../edgeGlobalWaypointRefinement';
import { repairSameNodeInOutCrossings } from '../edgeSameNodeRoleRepair';
import { repairLocalDoglegArtifacts } from '../edgeLocalDoglegRepair';
import { getEdgePath } from '../edgeGlobalWaypointGeometry';
import {
  hasStrictCrossing,
  maxParallelOverlap,
  pathLength,
  renderedSystemsInteractionEdges,
} from './edgeRoutingPipelineVisualTestHelpers';

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
} as Node & { positionAbsolute: { x: number; y: number } });

describe('global waypoint path input boundary', () => {
  it('coerces finite coordinates and rejects malformed route points', () => {
    const boundaryEdge = {
      id: 'boundary',
      source: 'source',
      target: 'target',
      data: {
        computedPath: [
          { x: '12.5', y: 4 },
          { x: 7, y: '-3' },
          null,
          'invalid',
          { x: '', y: 2 },
          { x: Number.NaN, y: 2 },
          { x: Number.POSITIVE_INFINITY, y: 2 },
          { x: '1e999', y: 2 },
        ],
      },
    } as unknown as Edge;

    expect(getEdgePath(boundaryEdge)).toEqual([
      { x: 12.5, y: 4 },
      { x: 7, y: -3 },
    ]);
    expect(getEdgePath({
      ...boundaryEdge,
      data: { computedPath: 'invalid', treeRouting: { points: [{ x: 1, y: 2 }] } },
    } as unknown as Edge)).toEqual([{ x: 1, y: 2 }]);
    expect(getEdgePath({ ...boundaryEdge, data: null } as unknown as Edge)).toEqual([]);
  });
});

describe('reduceEdgeCrossingsWithWaypoints visual soft constraints', () => {
  it('repairs strict in/out crossings even when the two edges share a node', () => {
    const edges: Edge[] = [
      {
        id: 'hub-outgoing',
        source: 'hub',
        target: 'downstream',
        data: {
          computedPath: [
            { x: 100, y: 100 },
            { x: 100, y: 130 },
            { x: 160, y: 130 },
            { x: 160, y: 220 },
            { x: 100, y: 220 },
            { x: 100, y: 250 },
          ],
        },
      },
      {
        id: 'incoming-hub',
        source: 'upstream',
        target: 'hub',
        data: {
          computedPath: [
            { x: 260, y: 160 },
            { x: 100, y: 160 },
            { x: 100, y: 100 },
          ],
        },
      },
    ];

    const [outgoing, incoming] = refineGlobalEdgeWaypoints(edges, [
      node('hub', 'task', 50, 50, 100, 50),
      node('upstream', 'task', 240, 136, 80, 48),
      node('downstream', 'task', 120, 250, 80, 48),
    ]);
    const outgoingPath = (outgoing.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const incomingPath = (incoming.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(hasStrictCrossing(outgoingPath, incomingPath)).toBe(false);
  });

  it('uses global waypoint refinement to pull an over-extended dogleg away from avoidable crossings', () => {
    const edges: Edge[] = [
      {
        id: 'dogleg',
        source: 'source',
        target: 'target',
        data: {
          computedPath: [
            { x: 100, y: 100 },
            { x: 260, y: 100 },
            { x: 260, y: 240 },
            { x: 110, y: 240 },
          ],
        },
      },
      {
        id: 'vertical-a',
        source: 'a-source',
        target: 'a-target',
        data: {
          computedPath: [
            { x: 220, y: 60 },
            { x: 220, y: 150 },
          ],
        },
      },
      {
        id: 'vertical-b',
        source: 'b-source',
        target: 'b-target',
        data: {
          computedPath: [
            { x: 230, y: 210 },
            { x: 230, y: 280 },
          ],
        },
      },
    ];

    const [refined, verticalA, verticalB] = refineGlobalEdgeWaypoints(edges, []);
    const refinedPath = (refined.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect((refined.data as any).globalWaypointRefined).toBe(true);
    expect(refinedPath[0]).toEqual({ x: 100, y: 100 });
    expect(refinedPath[refinedPath.length - 1]).toEqual({ x: 110, y: 240 });
    expect(refinedPath[1].x).toBeLessThan(220);
    expect(hasStrictCrossing(refinedPath, (verticalA.data?.computedPath ?? []) as Array<{ x: number; y: number }>)).toBe(false);
    expect(hasStrictCrossing(refinedPath, (verticalB.data?.computedPath ?? []) as Array<{ x: number; y: number }>)).toBe(false);
    expect(refinedPath.every((point, index) => (
      index === 0
      || Math.abs(point.x - refinedPath[index - 1].x) < 0.5
      || Math.abs(point.y - refinedPath[index - 1].y) < 0.5
    ))).toBe(true);
  });

  it('moves an interior shared-trunk spine away from an unrelated hub lane crossing', () => {
    const edges: Edge[] = [
      {
        id: 'edge-loms-visibility',
        source: 'loms',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 916, y: 653 },
            { x: 916, y: 793 },
            { x: 820, y: 793 },
            { x: 820, y: 1450 },
            { x: 1216, y: 1450 },
            { x: 1216, y: 1539 },
          ],
        },
      },
      {
        id: 'edge-tms-bms',
        source: 'tms',
        target: 'bms',
        data: {
          computedPath: [
            { x: 916, y: 931 },
            { x: 916, y: 1000 },
            { x: 660, y: 1000 },
            { x: 660, y: 1089 },
          ],
        },
      },
    ];

    const [refined, hubLane] = refineGlobalEdgeWaypoints(edges, []);
    const refinedPath = (refined.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const hubLanePath = (hubLane.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect((refined.data as any).globalWaypointRefined).toBe(true);
    expect(refinedPath[0]).toEqual({ x: 916, y: 653 });
    expect(refinedPath[refinedPath.length - 1]).toEqual({ x: 1216, y: 1539 });
    expect(refinedPath.some(point => point.x === 820 && point.y > 793 && point.y < 1450)).toBe(false);
    expect(hasStrictCrossing(refinedPath, hubLanePath)).toBe(false);
  });

  it('skips channel-shift candidates for endpoint crossing segments', () => {
    const edges: Edge[] = [
      {
        id: 'endpoint-segment-crossing',
        source: 'source',
        target: 'target',
        data: {
          computedPath: [
            { x: 100, y: 100 },
            { x: 100, y: 220 },
            { x: 220, y: 220 },
          ],
        },
      },
      {
        id: 'crossing-lane',
        source: 'lane-source',
        target: 'lane-target',
        data: {
          computedPath: [
            { x: 60, y: 150 },
            { x: 160, y: 150 },
          ],
        },
      },
    ];

    expect(() => refineGlobalEdgeWaypoints(edges, [])).not.toThrow();
  });

  it('moves an internal lane away from an unrelated endpoint-stub crossing', () => {
    const edges: Edge[] = [
      {
        id: 'edge-master-data-tms-planning',
        source: 'master-data',
        target: 'tms-planning',
        data: {
          computedPath: [
            { x: 310, y: 746 },
            { x: 310, y: 842 },
            { x: 0, y: 842 },
            { x: 0, y: 3124 },
            { x: 40, y: 3124 },
            { x: 40, y: 2710 },
            { x: 254, y: 2710 },
            { x: 254, y: 2806 },
          ],
        },
      },
      {
        id: 'edge-tms-execution-wms-outbound',
        source: 'tms-execution',
        target: 'wms-outbound',
        data: {
          computedPath: [
            { x: 240, y: 3124 },
            { x: 240, y: 3028 },
            { x: 106, y: 3028 },
            { x: 106, y: 2744 },
            { x: 310, y: 2744 },
            { x: 310, y: 2648 },
          ],
        },
      },
    ];

    const [planning, outbound] = refineGlobalEdgeWaypoints(edges, []);
    const planningPath = (planning.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const outboundPath = (outbound.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(hasStrictCrossing(planningPath, outboundPath)).toBe(false);
  });

  it('slides a target endpoint on the same side to avoid an unrelated crossing', () => {
    const nodes: Node[] = [
      node('master-data', 'custom', 100, 549, 420, 197),
      node('tms-planning', 'custom', 156, 2806, 420, 236),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-master-data-tms-planning',
        source: 'master-data',
        target: 'tms-planning',
        data: {
          computedPath: [
            { x: 310, y: 746 },
            { x: 310, y: 842 },
            { x: 0, y: 842 },
            { x: 0, y: 3124 },
            { x: 40, y: 3124 },
            { x: 40, y: 2710 },
            { x: 254, y: 2710 },
            { x: 254, y: 2806 },
          ],
        },
      },
      {
        id: 'edge-tms-execution-wms-outbound',
        source: 'tms-execution',
        target: 'wms-outbound',
        data: {
          computedPath: [
            { x: 240, y: 3124 },
            { x: 240, y: 3028 },
            { x: 106, y: 3028 },
            { x: 106, y: 2744 },
            { x: 310, y: 2744 },
            { x: 310, y: 2648 },
          ],
        },
      },
    ];

    const [planning, outbound] = refineGlobalEdgeWaypoints(edges, nodes);
    const planningPath = (planning.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const outboundPath = (outbound.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(planningPath[planningPath.length - 1].y).toBe(2806);
    expect(hasStrictCrossing(planningPath, outboundPath)).toBe(false);
  });

  it('separates unrelated long vertical overlaps without touching shared endpoints', () => {
    const edges: Edge[] = [
      {
        id: 'edge-master-data-tms-planning',
        source: 'master-data',
        target: 'tms-planning',
        data: {
          computedPath: [
            { x: 310, y: 746 },
            { x: 310, y: 842 },
            { x: 0, y: 842 },
            { x: 0, y: 3124 },
            { x: 40, y: 3124 },
            { x: 40, y: 2710 },
            { x: 254, y: 2710 },
            { x: 254, y: 2806 },
          ],
        },
      },
      {
        id: 'edge-tms-execution-oms-order',
        source: 'tms-execution',
        target: 'oms-order',
        data: {
          computedPath: [
            { x: 380, y: 3124 },
            { x: 380, y: 3036 },
            { x: 330, y: 3028 },
            { x: 322, y: 3116 },
            { x: 48, y: 3124 },
            { x: 40, y: 1240 },
            { x: 306, y: 1232 },
            { x: 314, y: 1136 },
          ],
        },
      },
    ];

    const [planning, omsOrder] = refineGlobalEdgeWaypoints(edges, []);
    const planningPath = (planning.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const omsOrderPath = (omsOrder.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(maxParallelOverlap(planningPath, omsOrderPath)).toBeLessThan(96);
  });

  it('moves an internal lane away from an unrelated upper-level crossing', () => {
    const edges: Edge[] = [
      {
        id: 'edge-master-data-wms-inventory',
        source: 'master-data',
        target: 'wms-inventory',
        data: {
          computedPath: [
            { x: 310, y: 746 },
            { x: 310, y: 834 },
            { x: 512, y: 842 },
            { x: 520, y: 2480 },
            { x: 360, y: 2488 },
            { x: 352, y: 2160 },
            { x: 316, y: 2152 },
            { x: 310, y: 2170 },
          ],
        },
      },
      {
        id: 'edge-sales-oms-order',
        source: 'sales',
        target: 'oms-order',
        data: {
          computedPath: [
            { x: 317, y: 200 },
            { x: 317, y: 281 },
            { x: 632, y: 289 },
            { x: 640, y: 872 },
            { x: 323, y: 880 },
            { x: 315, y: 976 },
          ],
        },
      },
    ];

    const [inventory, salesOrder] = refineGlobalEdgeWaypoints(edges, []);
    const inventoryPath = (inventory.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const salesOrderPath = (salesOrder.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(hasStrictCrossing(inventoryPath, salesOrderPath)).toBe(false);
  });

  it('normalizes rounded-corner waypoints before moving an internal lane away from a crossing', () => {
    const edges: Edge[] = [
      {
        id: 'edge-master-data-wms-inventory',
        source: 'master-data',
        target: 'wms-inventory',
        data: {
          computedPath: [
            { x: 310, y: 746 },
            { x: 310, y: 834 },
            { x: 318, y: 842 },
            { x: 512, y: 842 },
            { x: 520, y: 850 },
            { x: 520, y: 2480 },
            { x: 512, y: 2488 },
            { x: 360, y: 2488 },
            { x: 352, y: 2480 },
            { x: 352, y: 2160 },
            { x: 344, y: 2152 },
            { x: 316, y: 2152 },
            { x: 310, y: 2158 },
            { x: 310, y: 2170 },
          ],
        },
      },
      {
        id: 'edge-sales-oms-order',
        source: 'sales',
        target: 'oms-order',
        data: {
          computedPath: [
            { x: 317, y: 200 },
            { x: 317, y: 281 },
            { x: 325, y: 289 },
            { x: 632, y: 289 },
            { x: 640, y: 297 },
            { x: 640, y: 872 },
            { x: 632, y: 880 },
            { x: 323, y: 880 },
            { x: 315, y: 888 },
            { x: 315, y: 976 },
          ],
        },
      },
    ];

    const [inventory, salesOrder] = refineGlobalEdgeWaypoints(edges, []);
    const inventoryPath = (inventory.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const salesOrderPath = (salesOrder.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(hasStrictCrossing(inventoryPath, salesOrderPath)).toBe(false);
    expect(inventoryPath.every((point, index) => {
      const next = inventoryPath[index + 1];
      return !next || point.x === next.x || point.y === next.y;
    })).toBe(true);
  });

  it('separates a same-node incoming and outgoing pair above the shared node', () => {
    const nodes: Node[] = [
      node('wms-inventory', 'custom', 142, 2171, 336, 158),
      node('wms-outbound', 'custom', 115, 2489, 390, 158),
      node('oms-fulfill', 'custom', 148, 1613, 332, 158),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-wms-inventory-outbound',
        source: 'wms-inventory',
        target: 'wms-outbound',
        data: {
          computedPath: [
            { x: 310, y: 2330 },
            { x: 310, y: 2392 },
            { x: 245, y: 2392 },
            { x: 245, y: 2488 },
          ],
        },
      },
      {
        id: 'edge-wms-outbound-oms-fulfill',
        source: 'wms-outbound',
        target: 'oms-fulfill',
        data: {
          computedPath: [
            { x: 310, y: 2488 },
            { x: 310, y: 2404 },
            { x: 100, y: 2404 },
            { x: 100, y: 1914 },
            { x: 314, y: 1914 },
            { x: 314, y: 1772 },
          ],
        },
      },
    ];

    const [incoming, outgoing] = repairSameNodeInOutCrossings(edges, nodes);
    const incomingPath = (incoming.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const outgoingPath = (outgoing.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(hasStrictCrossing(incomingPath, outgoingPath)).toBe(false);
  });

  it('removes a shallow opposite-return U turn before a target approach', () => {
    const edges: Edge[] = [{
      id: 'edge-master-data-tms-planning',
      source: 'master-data',
      target: 'tms-planning',
      data: {
        computedPath: [
          { x: 310, y: 746 },
          { x: 310, y: 842 },
          { x: 0, y: 842 },
          { x: 0, y: 3124 },
          { x: 40, y: 3124 },
          { x: 40, y: 2711 },
          { x: 310, y: 2711 },
          { x: 310, y: 2807 },
        ],
      },
    }];

    const originalPath = (edges[0].data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const [repaired] = repairLocalDoglegArtifacts(edges, []);
    const path = (repaired.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(path).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ x: 40, y: 3124 }),
    ]));
    expect(pathLength(path)).toBeLessThan(pathLength(originalPath) - 600);
  });

  it('keeps the final global sweep from leaving a shallow U turn behind', () => {
    const edges: Edge[] = [{
      id: 'edge-master-data-tms-planning',
      source: 'master-data',
      target: 'tms-planning',
      data: {
        computedPath: [
          { x: 310, y: 746 },
          { x: 310, y: 842 },
          { x: 0, y: 842 },
          { x: 0, y: 3124 },
          { x: 40, y: 3124 },
          { x: 40, y: 2711 },
          { x: 310, y: 2711 },
          { x: 310, y: 2807 },
        ],
      },
    }];

    const [afterGlobal] = refineGlobalEdgeWaypoints(edges, []);
    const [finalEdge] = repairLocalDoglegArtifacts([afterGlobal], []);
    const path = (finalEdge.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(path).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ x: 40, y: 3124 }),
    ]));
  });

  it('removes a broad opposite-return loop from the rendered master-data to TMS planning route', () => {
    const nodes: Node[] = [
      node('master-data', 'custom', 100, 587, 420, 158),
      node('wms-inventory', 'custom', 142, 2171, 336, 158),
      node('wms-outbound', 'custom', 115, 2489, 390, 158),
      node('tms-planning', 'custom', 141, 2807, 338, 158),
    ];
    const edges: Edge[] = [{
      id: 'edge-master-data-tms-planning',
      source: 'master-data',
      target: 'tms-planning',
      data: {
        computedPath: [
          { x: 205, y: 746 },
          { x: 205, y: 882 },
          { x: 96, y: 882 },
          { x: 96, y: 2820 },
          { x: 300, y: 2820 },
          { x: 300, y: 2710 },
          { x: 366, y: 2710 },
          { x: 366, y: 2806 },
        ],
      },
    }];

    const originalPath = (edges[0].data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const [repaired] = repairLocalDoglegArtifacts(edges, nodes);
    const path = (repaired.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(path).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ x: 300, y: 2820 }),
    ]));
    expect(pathLength(path)).toBeLessThan(pathLength(originalPath) - 180);
  });

  it('pulls a boundary-hugging outer lane back to the nearest safe channel', () => {
    const nodes: Node[] = [
      node('master-data', 'custom', 100, 587, 420, 158),
      node('wms-inventory', 'custom', 142, 2171, 336, 158),
      node('wms-outbound', 'custom', 115, 2489, 390, 158),
      node('tms-planning', 'custom', 141, 2807, 338, 158),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-master-data-tms-planning',
        source: 'master-data',
        target: 'tms-planning',
        data: {
          computedPath: [
            { x: 310, y: 746 },
            { x: 310, y: 842 },
            { x: 0, y: 842 },
            { x: 0, y: 2711 },
            { x: 310, y: 2711 },
            { x: 310, y: 2807 },
          ],
        },
      },
      {
        id: 'edge-sales-oms-order',
        source: 'sales',
        target: 'oms-order',
        data: {
          computedPath: [
            { x: 200, y: 200 },
            { x: 200, y: 289 },
            { x: 64, y: 289 },
            { x: 64, y: 890 },
            { x: 314, y: 890 },
            { x: 314, y: 976 },
          ],
        },
      },
    ];

    const [planning, salesOrder] = repairLocalDoglegArtifacts(edges, nodes);
    const planningPath = (planning.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const salesPath = (salesOrder.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(planningPath).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ x: 0 }),
    ]));
    expect(hasStrictCrossing(planningPath, salesPath)).toBe(false);
  });

  it('removes the remaining full-graph rendered crossing between inventory master data and sales order', () => {
    const edges = renderedSystemsInteractionEdges();

    const refined = refineGlobalEdgeWaypoints(edges, []);
    const inventoryPath = (refined.find(edge => edge.id === 'edge-master-data-wms-inventory')?.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const salesPath = (refined.find(edge => edge.id === 'edge-sales-oms-order')?.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(hasStrictCrossing(inventoryPath, salesPath)).toBe(false);
  });

  it('moves the rendered inventory master-data lane away from the outbound fulfillment lane', () => {
    const nodes: Node[] = [
      node('master-data', 'custom', 100, 587, 420, 158),
      node('wms-inventory', 'custom', 142, 2171, 336, 158),
      node('oms-fulfill', 'custom', 148, 1613, 332, 158),
      node('wms-outbound', 'custom', 115, 2489, 390, 158),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-master-data-wms-inventory',
        source: 'master-data',
        target: 'wms-inventory',
        data: {
          computedPath: [
            { x: 310, y: 746 },
            { x: 310, y: 834 },
            { x: 318, y: 842 },
            { x: 500, y: 842 },
            { x: 508, y: 850 },
            { x: 508, y: 2066 },
            { x: 500, y: 2074 },
            { x: 342, y: 2074 },
            { x: 334, y: 2082 },
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
            { x: 338, y: 2020 },
            { x: 346, y: 2028 },
            { x: 482, y: 2028 },
            { x: 490, y: 2036 },
            { x: 490, y: 2384 },
            { x: 482, y: 2392 },
            { x: 318, y: 2392 },
            { x: 310, y: 2400 },
            { x: 310, y: 2488 },
          ],
        },
      },
    ];

    const [inventory, outbound] = refineGlobalEdgeWaypoints(edges, nodes);
    const inventoryPath = (inventory.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const outboundPath = (outbound.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(hasStrictCrossing(inventoryPath, outboundPath)).toBe(false);
  });

});
