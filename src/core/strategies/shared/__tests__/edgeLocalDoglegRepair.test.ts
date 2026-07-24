import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { repairLocalDoglegArtifacts } from '../edgeLocalDoglegRepair';
import {
  countCrossings,
  countParallelOverlap,
  countUnrelatedObstacleHits,
  createEdgeObstacleInteractionContext,
  createEdgePathInteractionContext,
  segmentIntersectsRect,
  toSegments,
} from '../edgeLocalDoglegGeometry';
import * as edgeStrictCrossingGuard from '../edgeStrictCrossingGuard';

const baseNodes: Node[] = [
  { id: 'source', position: { x: -80, y: -30 }, data: {}, measured: { width: 60, height: 60 } },
  { id: 'target', position: { x: 220, y: -30 }, data: {}, measured: { width: 60, height: 60 } },
];

describe('edgeLocalDoglegRepair', () => {
  it('flattens a short return notch when the direct lane is clear', () => {
    const edges: Edge[] = [
      {
        id: 'edge-source-target',
        source: 'source',
        target: 'target',
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

    const [repaired] = repairLocalDoglegArtifacts(edges, baseNodes);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 56 },
      { x: 200, y: 56 },
      { x: 200, y: 0 },
    ]);
  });

  it('keeps a short return notch when it routes around an unrelated node', () => {
    const nodes: Node[] = [
      ...baseNodes,
      { id: 'blocker', position: { x: 88, y: -18 }, data: {}, measured: { width: 28, height: 36 } },
    ];
    const computedPath = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 40 },
      { x: 124, y: 40 },
      { x: 124, y: 0 },
      { x: 200, y: 0 },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-source-target',
        source: 'source',
        target: 'target',
        data: {
          layoutPathLocked: true,
          computedPath,
        },
      },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, nodes);

    expect((repaired.data as any).computedPath).toEqual(computedPath);
    expect((repaired.data as any).localDoglegRepaired).toBeUndefined();
  });

  it('keeps endpoint-adjacent notches so endpoint stubs remain visible', () => {
    const computedPath = [
      { x: 0, y: 0 },
      { x: 0, y: -48 },
      { x: 12, y: -48 },
      { x: 12, y: 48 },
      { x: 200, y: 48 },
      { x: 200, y: 0 },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-source-target',
        source: 'source',
        target: 'target',
        data: {
          layoutPathLocked: true,
          computedPath,
        },
      },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, baseNodes);

    expect((repaired.data as any).computedPath).toEqual(computedPath);
    expect((repaired.data as any).localDoglegRepaired).toBeUndefined();
  });

  it('extends very short terminal stubs when the longer terminal lane is clear', () => {
    const edges: Edge[] = [
      {
        id: 'edge-tms-wms-wave',
        source: 'tms-planning',
        target: 'wms-outbound',
        data: {
          layoutPathLocked: true,
          computedPath: [
            { x: 851, y: 1058 },
            { x: 851, y: 1154 },
            { x: 606, y: 1154 },
            { x: 606, y: 1907 },
            { x: 302, y: 1907 },
            { x: 302, y: 1900 },
          ],
        },
      },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, [
      { id: 'tms-planning', position: { x: 760, y: 900 }, data: {}, measured: { width: 180, height: 120 } },
      { id: 'wms-outbound', position: { x: 220, y: 1900 }, data: {}, measured: { width: 180, height: 120 } },
    ]);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;
    const end = path[path.length - 1];
    const previous = path[path.length - 2];

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(Math.abs(end.x - previous.x) + Math.abs(end.y - previous.y)).toBeGreaterThanOrEqual(56);
  });

  it('flattens a broad return detour when the direct trunk is clear and reduces crossings', () => {
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
            { x: 1272, y: 928 },
            { x: 904, y: 928 },
            { x: 904, y: 1450 },
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
    const nodes: Node[] = [
      { id: 'l-oms', position: { x: 827, y: 534 }, data: {}, measured: { width: 179, height: 119 } },
      { id: 'visibility', position: { x: 1100, y: 1539 }, data: {}, measured: { width: 232, height: 119 } },
      { id: 'tms', position: { x: 820, y: 811 }, data: {}, measured: { width: 192, height: 120 } },
      { id: 'bms', position: { x: 576, y: 1089 }, data: {}, measured: { width: 168, height: 118 } },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, nodes);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(path).toEqual([
      { x: 916, y: 653 },
      { x: 916, y: 781 },
      { x: 1272, y: 781 },
      { x: 1272, y: 1450 },
      { x: 1216, y: 1450 },
      { x: 1216, y: 1539 },
    ]);
  });

  it('collapses a narrow side notch on a long vertical lane', () => {
    const edges: Edge[] = [
      {
        id: 'edge-master-data-wms-inventory',
        source: 'master-data',
        target: 'wms-inventory',
        data: {
          computedPath: [
            { x: 196, y: 625 },
            { x: 196, y: 680 },
            { x: 320, y: 680 },
            { x: 320, y: 698 },
            { x: 332, y: 698 },
            { x: 332, y: 1690 },
            { x: 320, y: 1690 },
            { x: 320, y: 1708 },
            { x: 200, y: 1708 },
            { x: 200, y: 1797 },
            { x: 196, y: 1797 },
            { x: 196, y: 1867 },
          ],
        },
      },
    ];
    const nodes: Node[] = [
      { id: 'master-data', position: { x: 0, y: 500 }, data: {}, measured: { width: 400, height: 125 } },
      { id: 'wms-inventory', position: { x: 0, y: 1867 }, data: {}, measured: { width: 400, height: 125 } },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, nodes);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(path).not.toContainEqual({ x: 332, y: 698 });
    expect(path).not.toContainEqual({ x: 332, y: 1690 });
  });

  it('widens a tiny side step when flattening it would create a crossing', () => {
    const edges: Edge[] = [
      {
        id: 'edge-with-readable-offset',
        source: 'source',
        target: 'target',
        data: {
          computedPath: [
            { x: 320, y: 0 },
            { x: 320, y: 20 },
            { x: 332, y: 20 },
            { x: 332, y: 200 },
            { x: 320, y: 200 },
            { x: 320, y: 220 },
          ],
        },
      },
      {
        id: 'edge-blocking-flat-lane',
        source: 'other-a',
        target: 'other-b',
        data: {
          computedPath: [
            { x: 300, y: 100 },
            { x: 326, y: 100 },
          ],
        },
      },
    ];
    const nodes: Node[] = [
      { id: 'source', position: { x: 260, y: -80 }, data: {}, measured: { width: 120, height: 80 } },
      { id: 'target', position: { x: 260, y: 220 }, data: {}, measured: { width: 120, height: 80 } },
      { id: 'other-a', position: { x: 240, y: 60 }, data: {}, measured: { width: 60, height: 60 } },
      { id: 'other-b', position: { x: 326, y: 60 }, data: {}, measured: { width: 60, height: 60 } },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, nodes);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    const widenedLane = path.find(point => point.y === 20 && point.x > 332);
    expect(widenedLane?.x ?? 0).toBeGreaterThanOrEqual(368);
    expect(path).not.toContainEqual({ x: 332, y: 20 });
    expect(path).not.toContainEqual({ x: 332, y: 200 });
  });

  it('collapses a monotonic staircase into one readable bridge', () => {
    const edges: Edge[] = [
      {
        id: 'edge-with-staircase',
        source: 'source',
        target: 'target',
        data: {
          computedPath: [
            { x: 0, y: 0 },
            { x: 0, y: 56 },
            { x: 96, y: 56 },
            { x: 96, y: 72 },
            { x: 160, y: 72 },
            { x: 160, y: 220 },
          ],
        },
      },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, baseNodes);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 56 },
      { x: 160, y: 56 },
      { x: 160, y: 220 },
    ]);
  });

  it('collapses a tiny interior bridge before the target-side run', () => {
    const edges: Edge[] = [
      {
        id: 'edge-tms-execution-wms-outbound',
        source: 'tms-execution',
        target: 'wms-outbound',
        data: {
          computedPath: [
            { x: 131, y: 2635 },
            { x: 131, y: 2563 },
            { x: 100, y: 2563 },
            { x: 100, y: 2395 },
            { x: 208, y: 2395 },
            { x: 208, y: 2293 },
            { x: 196, y: 2293 },
            { x: 196, y: 2221 },
          ],
        },
      },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, [
      { id: 'tms-execution', position: { x: 0, y: 2635 }, data: {}, measured: { width: 400, height: 125 } },
      { id: 'wms-outbound', position: { x: 0, y: 2063 }, data: {}, measured: { width: 390, height: 158 } },
    ]);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(path).toEqual([
      { x: 131, y: 2635 },
      { x: 131, y: 2563 },
      { x: 100, y: 2563 },
      { x: 100, y: 2293 },
      { x: 196, y: 2293 },
      { x: 196, y: 2221 },
    ]);
  });

  it('collapses a tiny bridge between same-direction vertical runs', () => {
    const edges: Edge[] = [
      {
        id: 'edge-wms-outbound-oms-fulfill',
        source: 'wms-outbound',
        target: 'oms-fulfill',
        data: {
          computedPath: [
            { x: 291, y: 2123 },
            { x: 291, y: 2051 },
            { x: 294, y: 2051 },
            { x: 294, y: 1561 },
            { x: 198, y: 1561 },
            { x: 198, y: 1465 },
          ],
        },
      },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, [
      { id: 'wms-outbound', position: { x: 120, y: 2123 }, data: {}, measured: { width: 350, height: 125 } },
      { id: 'oms-fulfill', position: { x: 0, y: 1340 }, data: {}, measured: { width: 390, height: 125 } },
    ]);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(path).toEqual([
      { x: 291, y: 2123 },
      { x: 291, y: 1561 },
      { x: 198, y: 1561 },
      { x: 198, y: 1465 },
    ]);
  });

  it('widens a tiny bridge when collapsing it would create a crossing', () => {
    const edges: Edge[] = [
      {
        id: 'edge-wms-outbound-oms-fulfill',
        source: 'wms-outbound',
        target: 'oms-fulfill',
        data: {
          computedPath: [
            { x: 291, y: 2123 },
            { x: 291, y: 2051 },
            { x: 294, y: 2051 },
            { x: 294, y: 1561 },
            { x: 198, y: 1561 },
            { x: 198, y: 1465 },
          ],
        },
      },
      {
        id: 'edge-blocking-collapse-lane',
        source: 'other-a',
        target: 'other-b',
        data: {
          computedPath: [
            { x: 285, y: 1800 },
            { x: 293, y: 1800 },
          ],
        },
      },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, [
      { id: 'other-a', position: { x: 250, y: 1760 }, data: {}, measured: { width: 20, height: 20 } },
      { id: 'other-b', position: { x: 310, y: 1760 }, data: {}, measured: { width: 20, height: 20 } },
    ]);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(interiorTinySegments(path)).toEqual([]);
    expect(hasStrictCrossing(path, (edges[1].data as any).computedPath)).toBe(false);
  });

  it('routes a tiny corner around an unrelated obstacle instead of keeping unreadable doglegs', () => {
    const edges: Edge[] = [
      {
        id: 'edge-blocking-left-lane',
        source: 'left-a',
        target: 'left-b',
        data: {
          computedPath: [
            { x: 90, y: 692 },
            { x: 90, y: 1523 },
          ],
        },
      },
      {
        id: 'edge-blocking-direct-corner',
        source: 'other-a',
        target: 'other-b',
        data: {
          computedPath: [
            { x: 90, y: 1523 },
            { x: 172, y: 1523 },
          ],
        },
      },
      {
        id: 'edge-wms-inventory-oms-atc',
        source: 'wms-inventory',
        target: 'oms-atc',
        data: {
          computedPath: [
            { x: 156, y: 1867 },
            { x: 156, y: 1535 },
            { x: 111, y: 1535 },
            { x: 111, y: 1523 },
            { x: 100, y: 1523 },
            { x: 100, y: 1281 },
            { x: 134, y: 1281 },
            { x: 134, y: 1209 },
          ],
        },
      },
    ];
    const nodes: Node[] = [
      { id: 'wms-inventory', position: { x: 0, y: 1867 }, data: {}, measured: { width: 400, height: 125 } },
      { id: 'oms-atc', position: { x: 0, y: 1111 }, data: {}, measured: { width: 268, height: 98 } },
      { id: 'oms-fulfill', position: { x: 110.4, y: 1368 }, data: {}, measured: { width: 176, height: 96 } },
      { id: 'left-a', position: { x: 80, y: 680 }, data: {}, measured: { width: 10, height: 10 } },
      { id: 'left-b', position: { x: 80, y: 1530 }, data: {}, measured: { width: 10, height: 10 } },
      { id: 'other-a', position: { x: 80, y: 1480 }, data: {}, measured: { width: 10, height: 10 } },
      { id: 'other-b', position: { x: 180, y: 1480 }, data: {}, measured: { width: 10, height: 10 } },
    ];

    const repaired = repairLocalDoglegArtifacts(edges, nodes);
    const path = (repaired[2].data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired[2].data as any).localDoglegRepaired).toBe(true);
    expect(interiorTinySegments(path)).toEqual([]);
    expect(hasStrictCrossing(path, (repaired[0].data as any).computedPath)).toBe(false);
    expect(hasStrictCrossing(path, (repaired[1].data as any).computedPath)).toBe(false);
    expect(path.some(point => point.x >= 298)).toBe(true);
  });

  it('collapses an endpoint-adjacent carrier notch into a single vertical run', () => {
    const edges: Edge[] = [
      {
        id: 'edge-tms-carrier',
        source: 'tms',
        target: 'carrier',
        data: {
          computedPath: [
            { x: 916, y: 811 },
            { x: 916, y: 743 },
            { x: 904, y: 743 },
            { x: 904, y: 740 },
            { x: 916, y: 740 },
            { x: 916, y: 722 },
            { x: 1227, y: 722 },
            { x: 1227, y: 203 },
          ],
        },
      },
    ];
    const nodes: Node[] = [
      { id: 'tms', position: { x: 898, y: 811 }, data: {}, measured: { width: 334, height: 158 } },
      { id: 'carrier', position: { x: 1060, y: 45 }, data: {}, measured: { width: 334, height: 158 } },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, nodes);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(path).toEqual([
      { x: 916, y: 811 },
      { x: 916, y: 722 },
      { x: 1227, y: 722 },
      { x: 1227, y: 203 },
    ]);
  });

  it('slides a target endpoint to remove a tiny trailing bridge', () => {
    const edges: Edge[] = [
      {
        id: 'edge-tms-execution-wms-outbound',
        source: 'tms-execution',
        target: 'wms-outbound',
        data: {
          computedPath: [
            { x: 131, y: 2635 },
            { x: 131, y: 2563 },
            { x: 100, y: 2563 },
            { x: 100, y: 2395 },
            { x: 208, y: 2395 },
            { x: 208, y: 2293 },
            { x: 196, y: 2293 },
            { x: 196, y: 2221 },
          ],
        },
      },
    ];
    const nodes: Node[] = [
      { id: 'tms-execution', position: { x: 0, y: 2635 }, data: {}, measured: { width: 260, height: 120 } },
      { id: 'wms-outbound', position: { x: 40, y: 2221 }, data: {}, measured: { width: 320, height: 120 } },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, nodes);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(interiorTinySegments(path)).toEqual([]);
    expect(
      Math.abs(path[path.length - 1].x - path[path.length - 2].x)
      + Math.abs(path[path.length - 1].y - path[path.length - 2].y),
    ).toBeGreaterThanOrEqual(32);
  });

  it('collapses a five-segment endpoint hairpin when the direct lane is clear', () => {
    const edges: Edge[] = [
      {
        id: 'edge-wms-bms',
        source: 'wms',
        target: 'bms',
        data: {
          computedPath: [
            { x: 154, y: 931 },
            { x: 154, y: 1020 },
            { x: 632, y: 1020 },
            { x: 632, y: 943 },
            { x: 660, y: 943 },
            { x: 660, y: 1089 },
          ],
        },
      },
    ];
    const nodes: Node[] = [
      { id: 'wms', position: { x: 0, y: 800 }, data: {}, measured: { width: 320, height: 131 } },
      { id: 'bms', position: { x: 540, y: 1089 }, data: {}, measured: { width: 240, height: 120 } },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, nodes);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(path).toEqual([
      { x: 154, y: 931 },
      { x: 154, y: 1020 },
      { x: 660, y: 1020 },
      { x: 660, y: 1089 },
    ]);
  });

  it('collapses a broad endpoint hairpin with a long return bridge when the direct lane is clear', () => {
    const edges: Edge[] = [
      {
        id: 'edge-wms-bms',
        source: 'wms',
        target: 'bms',
        data: {
          computedPath: [
            { x: 154, y: 931 },
            { x: 154, y: 1020 },
            { x: 190, y: 1020 },
            { x: 190, y: 943 },
            { x: 660, y: 943 },
            { x: 660, y: 1089 },
          ],
        },
      },
    ];
    const nodes: Node[] = [
      { id: 'wms', position: { x: 0, y: 800 }, data: {}, measured: { width: 320, height: 131 } },
      { id: 'bms', position: { x: 540, y: 1089 }, data: {}, measured: { width: 240, height: 120 } },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, nodes);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(countTestHairpins(path)).toBe(0);
    expect(path).toEqual([
      { x: 154, y: 931 },
      { x: 154, y: 1020 },
      { x: 660, y: 1020 },
      { x: 660, y: 1089 },
    ]);
  });

  it('collapses nested WMS process hairpins into a shorter readable route', () => {
    const edges: Edge[] = [
      {
        id: 'e-atp',
        source: 'order-promise',
        target: 'inventory-check',
        data: {
          computedPath: [
            { x: 1114, y: 1418 },
            { x: 1186, y: 1418 },
            { x: 1186, y: 1346 },
            { x: 1258, y: 1346 },
            { x: 1258, y: 1458 },
            { x: 1282, y: 1458 },
            { x: 1282, y: 1000 },
            { x: 1440, y: 1000 },
          ],
        },
      },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, []);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(countTestHairpins(path)).toBe(0);
    expect(pathManhattanLength(path)).toBeLessThan(pathManhattanLength((edges[0].data as any).computedPath));
  });

  it('collapses a near-return WMS reservation loop into the continuing lane', () => {
    const edges: Edge[] = [
      {
        id: 'e-reservation',
        source: 'order-promise',
        target: 'reservation',
        data: {
          computedPath: [
            { x: 1114, y: 1418 },
            { x: 808, y: 1418 },
            { x: 808, y: 1370 },
            { x: 1103, y: 1370 },
            { x: 1103, y: 1466 },
            { x: 1388, y: 1466 },
            { x: 1388, y: 1233 },
            { x: 1444, y: 1233 },
          ],
        },
      },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, []);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(countTestHairpins(path)).toBe(0);
    expect(path).toEqual([
      { x: 1114, y: 1418 },
      { x: 1114, y: 1466 },
      { x: 1388, y: 1466 },
      { x: 1388, y: 1233 },
      { x: 1444, y: 1233 },
    ]);
  });

  it('slides an endpoint along the node side to remove a tiny offset step', () => {
    const edges: Edge[] = [
      {
        id: 'edge-wms-wcs',
        source: 'wms',
        target: 'wcs',
        data: {
          computedPath: [
            { x: 154, y: 931 },
            { x: 154, y: 1000 },
            { x: 144, y: 1000 },
            { x: 144, y: 1089 },
          ],
        },
      },
    ];
    const nodes: Node[] = [
      { id: 'wms', position: { x: 0, y: 800 }, data: {}, measured: { width: 320, height: 131 } },
      { id: 'wcs', position: { x: 0, y: 1089 }, data: {}, measured: { width: 320, height: 131 } },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, nodes);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(path).toHaveLength(2);
    expect(path[0].x).toBe(path[1].x);
    expect(path[0].y).toBe(931);
    expect(path[1].y).toBe(1089);
  });

  it('collapses a tiny endpoint offset when side metadata cannot validate the slide', () => {
    const edges: Edge[] = [
      {
        id: 'edge-upstream-oms',
        source: 'upstream',
        target: 'oms',
        data: {
          computedPath: [
            { x: 541, y: 157 },
            { x: 541, y: 213 },
            { x: 536, y: 213 },
            { x: 536, y: 489 },
          ],
        },
      },
    ];

    const [repaired] = repairLocalDoglegArtifacts(edges, []);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(path).toEqual([
      { x: 536, y: 157 },
      { x: 536, y: 489 },
    ]);
  });

  it('preserves the input array identity when no local path changes', () => {
    const edges: Edge[] = [{
      id: 'already-clean',
      source: 'source',
      target: 'target',
      data: {
        computedPath: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
        ],
      },
    }];

    expect(repairLocalDoglegArtifacts(edges, baseNodes)).toBe(edges);
  });

  it('skips global quality evaluation for a clean multi-segment path', () => {
    const qualityContextSpy = vi.spyOn(
      edgeStrictCrossingGuard,
      'createEdgePathQualityEvaluationContext',
    );
    const edges: Edge[] = [{
      id: 'already-clean-multi-segment',
      source: 'source',
      target: 'target',
      data: {
        computedPath: [
          { x: 0, y: 0 },
          { x: 0, y: 80 },
          { x: 160, y: 80 },
          { x: 160, y: 160 },
        ],
      },
    }];

    expect(repairLocalDoglegArtifacts(edges, baseNodes)).toBe(edges);
    expect(qualityContextSpy).not.toHaveBeenCalled();

    const riskyEdges: Edge[] = [{
      id: 'tiny-step-still-evaluated',
      source: 'source',
      target: 'target',
      data: {
        computedPath: [
          { x: 0, y: 0 },
          { x: 0, y: 80 },
          { x: 12, y: 80 },
          { x: 12, y: 160 },
        ],
      },
    }];
    const [repaired] = repairLocalDoglegArtifacts(riskyEdges, baseNodes);

    expect((repaired.data as any).localDoglegRepaired).toBe(true);
    expect(qualityContextSpy).toHaveBeenCalled();
    qualityContextSpy.mockRestore();
  });

  it('keeps cached other-path segment metrics identical to the direct counters', () => {
    const otherCrossing = [
      { x: 50, y: -20 },
      { x: 50, y: 120 },
    ];
    const pathByEdgeKey = new Map([
      ['current', [{ x: 0, y: 0 }, { x: 100, y: 0 }]],
      ['other-crossing', otherCrossing],
      ['other-overlap', [{ x: 20, y: 0 }, { x: 80, y: 0 }]],
      ['other-diagonal', [{ x: 0, y: 0 }, { x: 20, y: 20 }]],
    ]);
    const candidates = [
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      [{ x: 40, y: -50 }, { x: 40, y: 50 }],
      [{ x: 0, y: 20 }, { x: 100, y: 20 }],
    ];
    const context = createEdgePathInteractionContext('current', pathByEdgeKey);

    for (const candidate of candidates) {
      const segments = toSegments(candidate);
      expect(context.countCrossings(segments)).toBe(countCrossings(candidate, 'current', pathByEdgeKey));
      expect(context.countParallelOverlap(segments)).toBe(countParallelOverlap(candidate, 'current', pathByEdgeKey));
    }

    const capturedCrossings = context.countCrossings(toSegments(candidates[0]));
    otherCrossing[0].x = 150;
    otherCrossing[1].x = 150;
    const refreshedContext = createEdgePathInteractionContext('current', pathByEdgeKey);
    expect(context.countCrossings(toSegments(candidates[0]))).toBe(capturedCrossings);
    expect(refreshedContext.countCrossings(toSegments(candidates[0])))
      .toBe(countCrossings(candidates[0], 'current', pathByEdgeKey));
    expect(refreshedContext.countCrossings(toSegments(candidates[0]))).not.toBe(capturedCrossings);
  });

  it('keeps cached obstacle hits identical across axes, strict tangency, exclusions, and multiple segments', () => {
    const edge: Edge = { id: 'current', source: 'source', target: 'target' };
    const obstacles = new Map([
      ['source', { x: -20, y: -20, width: 40, height: 40 }],
      ['target', { x: 180, y: -20, width: 40, height: 40 }],
      ['middle', { x: 50, y: 50, width: 40, height: 40 }],
      ['right', { x: 120, y: 20, width: 20, height: 20 }],
    ]);
    const paths = [
      [{ x: 0, y: 60 }, { x: 200, y: 60 }],
      [{ x: 60, y: 0 }, { x: 60, y: 120 }],
      [{ x: 0, y: 42 }, { x: 42, y: 42 }],
      [{ x: 0, y: 42 }, { x: 43, y: 42 }],
      [
        { x: 0, y: 60 },
        { x: 130, y: 60 },
        { x: 130, y: 0 },
      ],
    ];
    const context = createEdgeObstacleInteractionContext(edge, obstacles);
    const legacyCount = (path: Array<{ x: number; y: number }>) => {
      let hits = 0;
      for (let index = 0; index < path.length - 1; index += 1) {
        for (const [nodeId, rect] of obstacles) {
          if (nodeId === edge.source || nodeId === edge.target) continue;
          if (segmentIntersectsRect(path[index], path[index + 1], rect)) hits += 1;
        }
      }
      return hits;
    };

    for (const path of paths) {
      const expected = legacyCount(path);
      expect(context.countPathHits(path)).toBe(expected);
      expect(context.countSegmentHits(toSegments(path))).toBe(expected);
      expect(countUnrelatedObstacleHits(path, edge, obstacles)).toBe(expected);
    }
    expect(context.countPathHits(paths[2])).toBe(0);
    expect(context.countPathHits(paths[3])).toBe(1);
    expect(context.countPathHits([{ x: -30, y: 0 }, { x: 230, y: 0 }])).toBe(0);
  });

  it('keeps obstacle bounds as an immutable snapshot after Map and Rect mutations', () => {
    const edge: Edge = { id: 'current', source: 'source', target: 'target' };
    const capturedRect = { x: 50, y: 50, width: 40, height: 40 };
    const obstacles = new Map([['captured', capturedRect]]);
    const path = [{ x: 0, y: 60 }, { x: 100, y: 60 }];
    const context = createEdgeObstacleInteractionContext(edge, obstacles);

    expect(context.countPathHits(path)).toBe(1);
    capturedRect.x = 500;
    obstacles.delete('captured');
    obstacles.set('replacement', { x: 0, y: 500, width: 100, height: 40 });

    expect(context.countPathHits(path)).toBe(1);
    expect(createEdgeObstacleInteractionContext(edge, obstacles).countPathHits(path)).toBe(0);
  });

});

function interiorTinySegments(path: Array<{ x: number; y: number }>): Array<[{ x: number; y: number }, { x: number; y: number }]> {
  const tiny: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
  for (let index = 1; index < path.length - 2; index += 1) {
    const current = path[index];
    const next = path[index + 1];
    const length = Math.abs(next.x - current.x) + Math.abs(next.y - current.y);
    if (length > 0 && length < 24) tiny.push([current, next]);
  }
  return tiny;
}

function hasStrictCrossing(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): boolean {
  for (let i = 0; i < a.length - 1; i += 1) {
    for (let j = 0; j < b.length - 1; j += 1) {
      if (strictSegmentCrossing(a[i], a[i + 1], b[j], b[j + 1])) return true;
    }
  }
  return false;
}

function countTestHairpins(path: Array<{ x: number; y: number }>): number {
  const segments: Array<{ axis: 'h' | 'v'; direction: number; length: number }> = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const current = path[index];
    const next = path[index + 1];
    const horizontal = Math.abs(current.y - next.y) < 1 && Math.abs(current.x - next.x) > 1;
    const vertical = Math.abs(current.x - next.x) < 1 && Math.abs(current.y - next.y) > 1;
    if (!horizontal && !vertical) continue;
    segments.push({
      axis: horizontal ? 'h' : 'v',
      direction: horizontal ? Math.sign(next.x - current.x) : Math.sign(next.y - current.y),
      length: Math.abs(next.x - current.x) + Math.abs(next.y - current.y),
    });
  }
  let total = 0;
  for (let index = 0; index + 2 < segments.length; index += 1) {
    const first = segments[index];
    const middle = segments[index + 1];
    const last = segments[index + 2];
    if (
      first.axis === last.axis
      && first.direction !== 0
      && first.direction === -last.direction
      && middle.length < 140
    ) {
      total += 1;
    }
  }
  return total;
}

function pathManhattanLength(path: Array<{ x: number; y: number }>): number {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    total += Math.abs(path[index].x - path[index - 1].x) + Math.abs(path[index].y - path[index - 1].y);
  }
  return total;
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
  if (aHorizontal && bVertical) {
    return b1.x > Math.min(a1.x, a2.x) + 1
      && b1.x < Math.max(a1.x, a2.x) - 1
      && a1.y > Math.min(b1.y, b2.y) + 1
      && a1.y < Math.max(b1.y, b2.y) - 1;
  }
  if (aVertical && bHorizontal) {
    return a1.x > Math.min(b1.x, b2.x) + 1
      && a1.x < Math.max(b1.x, b2.x) - 1
      && b1.y > Math.min(a1.y, a2.y) + 1
      && b1.y < Math.max(a1.y, a2.y) - 1;
  }
  return false;
}
