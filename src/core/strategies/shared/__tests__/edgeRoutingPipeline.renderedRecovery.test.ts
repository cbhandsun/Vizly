import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { repairEndpointLaneCrossings } from '../edgeEndpointLaneNudgeRepair';
import {
  reduceEdgeCrossingsWithWaypoints,
} from '../edgeRoutingPipeline';
import { repairLocalDoglegArtifacts } from '../edgeLocalDoglegRepair';
import {
  hasStrictCrossing,
  pathHitsRect,
  terminalStubLength,
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

describe('rendered edge routing recovery and obstacle constraints', () => {
  it('slides the outbound source lane far enough to avoid the rendered inventory return crossing', () => {
    const nodes: Node[] = [
      node('wms-inventory', 'custom', 142, 2171, 336, 158),
      node('wms-outbound', 'custom', 115, 2489, 390, 158),
      node('oms-atc', 'custom', 104, 1295, 220, 158),
      node('oms-fulfill', 'custom', 148, 1613, 332, 158),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-wms-inventory-oms-atc',
        source: 'wms-inventory',
        target: 'oms-atc',
        data: {
          computedPath: [
            { x: 310, y: 2329 },
            { x: 310, y: 2406 },
            { x: 302, y: 2414 },
            { x: 144, y: 2414 },
            { x: 136, y: 2406 },
            { x: 136, y: 1546 },
            { x: 144, y: 1538 },
            { x: 306, y: 1538 },
            { x: 314, y: 1530 },
            { x: 314, y: 1454 },
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
            { x: 193, y: 2400 },
            { x: 185, y: 2392 },
            { x: 138, y: 2392 },
            { x: 130, y: 2384 },
            { x: 130, y: 2156 },
            { x: 138, y: 2148 },
            { x: 288, y: 2148 },
            { x: 296, y: 2140 },
            { x: 296, y: 1920 },
            { x: 302, y: 1914 },
            { x: 308, y: 1914 },
            { x: 314, y: 1908 },
            { x: 314, y: 1772 },
          ],
        },
      },
    ];

    const [inventory, outbound] = repairEndpointLaneCrossings(edges, nodes);
    const inventoryPath = (inventory.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const outboundPath = (outbound.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(
      hasStrictCrossing(inventoryPath, outboundPath),
      JSON.stringify(outboundPath),
    ).toBe(false);
    expect(outboundPath[0].y).toBe(2488);
    expect(outboundPath[0].x).not.toBe(193);
  });

  it('slides the fulfillment source lane after a crossing migrates onto the source leg', () => {
    const nodes: Node[] = [
      node('master-data', 'custom', 100, 587, 420, 158),
      node('oms-fulfill', 'custom', 148, 1613, 332, 158),
      node('wms-inventory', 'custom', 142, 2171, 336, 158),
      node('wms-outbound', 'custom', 115, 2489, 390, 158),
      node('oms-atc', 'custom', 141, 1295, 347, 158),
    ];
    const edges: Edge[] = [
      {
        id: 'edge-master-data-wms-inventory',
        source: 'master-data',
        target: 'wms-inventory',
        data: {
          computedPath: [
            { x: 310, y: 746 },
            { x: 310, y: 842 },
            { x: 508, y: 842 },
            { x: 508, y: 2074 },
            { x: 334, y: 2074 },
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
            { x: 338, y: 2086 },
            { x: 490, y: 2086 },
            { x: 490, y: 2392 },
            { x: 310, y: 2392 },
            { x: 310, y: 2488 },
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
            { x: 310, y: 2389 },
            { x: 314, y: 2389 },
            { x: 314, y: 1454 },
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
            { x: 130, y: 2147 },
            { x: 314, y: 2147 },
            { x: 314, y: 1772 },
          ],
        },
      },
    ];

    const result = repairEndpointLaneCrossings(edges, nodes);
    const masterDataPath = (result.find(edge => edge.id === 'edge-master-data-wms-inventory')?.data as any).computedPath;
    const fulfillmentPath = (result.find(edge => edge.id === 'edge-oms-fulfill-wms-outbound')?.data as any).computedPath;

    expect(
      hasStrictCrossing(masterDataPath, fulfillmentPath),
      JSON.stringify(fulfillmentPath),
    ).toBe(false);
  });

  it('uses an outer bypass when source sliding alone cannot clear a migrated crossing', () => {
    const nodes: Node[] = [
      node('master-data', 'custom', 100, 587, 420, 158),
      node('oms-fulfill', 'custom', 148, 1613, 332, 158),
      node('wms-inventory', 'custom', 142, 2171, 336, 158),
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
            { x: 310, y: 842 },
            { x: 508, y: 842 },
            { x: 508, y: 2074 },
            { x: 334, y: 2074 },
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
            { x: 338, y: 2086 },
            { x: 490, y: 2086 },
            { x: 490, y: 2392 },
            { x: 310, y: 2392 },
            { x: 310, y: 2488 },
          ],
        },
      },
    ];

    const result = repairEndpointLaneCrossings(edges, nodes);
    const masterDataPath = (result[0].data as any).computedPath;
    const fulfillmentPath = (result[1].data as any).computedPath;

    expect(
      hasStrictCrossing(masterDataPath, fulfillmentPath),
      JSON.stringify(fulfillmentPath),
    ).toBe(false);
  });

  it('extends short terminal stubs after local dogleg cleanup', () => {
    const edges: Edge[] = [
      {
        id: 'edge-master-data-wms-inventory',
        source: 'master-data',
        target: 'wms-inventory',
        data: {
          computedPath: [
            { x: 310, y: 746 },
            { x: 310, y: 842 },
            { x: 508, y: 842 },
            { x: 508, y: 2040 },
            { x: 320, y: 2040 },
            { x: 320, y: 2152 },
            { x: 310, y: 2152 },
            { x: 310, y: 2170 },
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
            { x: 130, y: 1790 },
            { x: 314, y: 1790 },
            { x: 314, y: 1772 },
          ],
        },
      },
    ];

    const [inventory, outbound] = repairLocalDoglegArtifacts(edges, []);
    const inventoryPath = (inventory.data?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const outboundPath = (outbound.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(inventoryPath[0]).toEqual({ x: 310, y: 746 });
    expect(inventoryPath[inventoryPath.length - 1]).toEqual({ x: 310, y: 2170 });
    expect(terminalStubLength(inventoryPath, false)).toBeGreaterThanOrEqual(56);
    expect(outboundPath[0]).toEqual({ x: 193, y: 2488 });
    expect(outboundPath[outboundPath.length - 1]).toEqual({ x: 314, y: 1772 });
    expect(terminalStubLength(outboundPath, false)).toBeGreaterThanOrEqual(56);
  });

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

  it('allows bridge edges to shorten protected trunks and use an outer lane around obstacles', () => {
    const nodes: Node[] = [
      node('source', 'custom', 100, 100, 120, 80),
      node('visibility', 'custom', 420, 700, 120, 80),
      node('other-target', 'custom', 0, 700, 120, 80),
      node('other-source', 'custom', 700, 700, 120, 80),
      node('middle-obstacle', 'custom', 140, 240, 80, 260),
    ];
    const edges: Edge[] = [
      {
        id: 'source-visibility',
        source: 'source',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 160, y: 180 },
            { x: 160, y: 560 },
            { x: 480, y: 560 },
            { x: 480, y: 700 },
          ],
        },
      },
      {
        id: 'source-other',
        source: 'source',
        target: 'other-target',
        data: {
          computedPath: [
            { x: 160, y: 180 },
            { x: 160, y: 228 },
            { x: 60, y: 228 },
            { x: 60, y: 700 },
          ],
        },
      },
      {
        id: 'other-visibility',
        source: 'other-source',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 760, y: 700 },
            { x: 760, y: 652 },
            { x: 480, y: 652 },
            { x: 480, y: 700 },
          ],
        },
      },
    ];

    const [bridge] = reduceEdgeCrossingsWithWaypoints(edges, nodes, 'TB');
    const path = (bridge.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(pathHitsRect(path, { x: 140, y: 240, width: 80, height: 260 })).toBe(false);
    expect(path[1].y - path[0].y).toBeLessThan(120);
    expect(path.some(point => point.x > 250)).toBe(true);
  });

  it('does not preserve a same-source trunk when that trunk crosses an unrelated node', () => {
    const nodes: Node[] = [
      node('source', 'custom', 100, 100, 120, 80),
      node('target-a', 'custom', 420, 700, 120, 80),
      node('target-b', 'custom', 0, 700, 120, 80),
      node('middle-obstacle', 'custom', 140, 240, 80, 260),
    ];
    const edges: Edge[] = [
      {
        id: 'source-target-a',
        source: 'source',
        target: 'target-a',
        data: {
          computedPath: [
            { x: 160, y: 180 },
            { x: 160, y: 560 },
            { x: 480, y: 560 },
            { x: 480, y: 700 },
          ],
        },
      },
      {
        id: 'source-target-b',
        source: 'source',
        target: 'target-b',
        data: {
          computedPath: [
            { x: 160, y: 180 },
            { x: 160, y: 228 },
            { x: 60, y: 228 },
            { x: 60, y: 700 },
          ],
        },
      },
    ];

    const [result] = reduceEdgeCrossingsWithWaypoints(edges, nodes, 'TB');
    const path = (result.data?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(pathHitsRect(path, { x: 140, y: 240, width: 80, height: 260 })).toBe(false);
    expect(path[1].y - path[0].y).toBeLessThan(120);
  });
});
