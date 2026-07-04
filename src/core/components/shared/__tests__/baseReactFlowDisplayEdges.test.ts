import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  computeBaseReactFlowDisplayEdgeEpoch,
  createBaseReactFlowDisplayEdges,
} from '../baseReactFlowDisplayEdges';

const baseNodes: Node[] = [
  {
    id: 'source',
    position: { x: 0, y: 200 },
    data: { layoutDirection: 'TB' },
    measured: { width: 100, height: 60 },
  },
  {
    id: 'target',
    position: { x: 300, y: 0 },
    data: {},
    measured: { width: 100, height: 60 },
  },
];

describe('baseReactFlowDisplayEdges', () => {
  it('computes a stable epoch hash from node and edge layout inputs', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'source', target: 'target', type: 'default' },
    ];

    const epochA = computeBaseReactFlowDisplayEdgeEpoch({ nodes: baseNodes, edges });
    const epochB = computeBaseReactFlowDisplayEdgeEpoch({ nodes: baseNodes, edges });
    const movedNodes = [{ ...baseNodes[0], position: { x: 10, y: 200 } }, baseNodes[1]];
    const epochC = computeBaseReactFlowDisplayEdgeEpoch({ nodes: movedNodes, edges });

    expect(epochA).toBe(epochB);
    expect(epochC).not.toBe(epochA);
  });

  it('converts large-graph edges to canvas-ref while preserving original type metadata', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'source', target: 'target', type: 'advanced-smart-step' },
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes: baseNodes,
      enableSmartEdges: false,
      smartEdgePadding: 20,
      isLargeGraph: true,
      displayEdgeEpoch: 123,
    });

    expect(result[0].type).toBe('canvas-ref');
    expect((result[0].data as any).originalType).toBe('advanced-smart-step');
  });

  it('normalizes auto-reverse handles and patches smart edge padding', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'source',
        target: 'target',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        type: 'default',
        data: {
          auto: ['source', 'target'],
          computedPath: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        },
      },
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes: baseNodes,
      enableSmartEdges: true,
      smartEdgePadding: 24,
      isLargeGraph: false,
      displayEdgeEpoch: 456,
    });

    expect(result[0].type).toBe('advanced-smart-step');
    expect(result[0].sourceHandle).toBe('right');
    expect(result[0].targetHandle).toBe('left');
    expect((result[0].data as any).obstaclePadding).toBe(24);
    expect((result[0].data as any).edgeConfig.obstaclePadding).toBe(24);
    expect((result[0].data as any).runtimeHandleLock).toEqual({ source: true, target: true });
    expect((result[0].data as any).computedPath).toBeUndefined();
    expect((result[0].data as any)._layoutEpoch).toBe(456);
  });

  it('downgrades smart edge types back to built-in edge renderers when smart mode is disabled', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'source',
        target: 'target',
        type: 'advanced-smart-bezier',
        data: { label: 'Edge Label' },
      },
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes: baseNodes,
      enableSmartEdges: false,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 789,
    });

    expect(result[0].type).toBe('bezier');
    expect(result[0].label).toBe('Edge Label');
  });

  it('keeps layout-locked computed paths on the stable path renderer in basic mode', () => {
    const computedPath = [{ x: 50, y: 260 }, { x: 120, y: 260 }, { x: 350, y: 30 }];
    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'source',
        target: 'target',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'advanced-smart-step',
        data: {
          computedPath,
          layoutPathLocked: true,
          sharedTrunkAware: true,
          label: 'Locked path',
        },
      },
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes: baseNodes,
      enableSmartEdges: false,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 790,
    });

    expect(result[0].type).toBe('stablePath');
    const repairedPath = (result[0].data as any).computedPath;
    expect(repairedPath[0]).toEqual(computedPath[0]);
    expect(repairedPath[repairedPath.length - 1]).toEqual({ x: 350, y: 0 });
    expect((result[0].data as any).endpointOrthogonalRepaired).toBe(true);
    expect(result[0].label).toBe('Locked path');
  });

  it('keeps post-processed locked computed paths on the stable path renderer in smart mode', () => {
    const computedPath = [{ x: 50, y: 260 }, { x: 120, y: 260 }, { x: 350, y: 30 }];
    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'source',
        target: 'target',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'default',
        data: {
          computedPath,
          layoutPathLocked: true,
          sharedTrunkAware: true,
          label: 'Smart locked path',
        },
      },
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes: baseNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 792,
    });

    expect(result[0].type).toBe('stablePath');
    const repairedPath = (result[0].data as any).computedPath;
    expect(repairedPath[0]).toEqual(computedPath[0]);
    expect(repairedPath[repairedPath.length - 1]).toEqual({ x: 350, y: 0 });
    expect((result[0].data as any).endpointOrthogonalRepaired).toBe(true);
    expect(result[0].label).toBe('Smart locked path');
  });

  it('keeps ordinary locked paths on the stable path renderer in basic mode', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'source',
        target: 'target',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'advanced-smart-step',
        data: {
          computedPath: [{ x: 50, y: 260 }, { x: 350, y: 30 }],
          layoutPathLocked: true,
        },
      },
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes: baseNodes,
      enableSmartEdges: false,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 791,
    });

    expect(result[0].type).toBe('stablePath');
  });

  it('keeps finite locked paths even when browser measurements drift from layout anchors', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'source',
        target: 'target',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'advanced-smart-step',
        data: {
          computedPath: [{ x: -800, y: 1200 }, { x: -620, y: 1200 }, { x: 900, y: -400 }],
          layoutPathLocked: true,
        },
      },
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes: baseNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 795,
    });

    expect(result[0].type).toBe('stablePath');
  });

  it('repairs long detached overlaps in locked paths before rendering stable edges', () => {
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
    expect(maxParallelOverlap(first, second)).toBeLessThan(96);
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
    expect((result[0].data as any).computedPath).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 48 },
      { x: 200, y: 48 },
      { x: 200, y: 0 },
    ]);
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

  it('does not keep invalid locked paths on the stable path renderer', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'source',
        target: 'target',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'advanced-smart-step',
        data: {
          computedPath: [{ x: 50, y: 260 }, { x: Number.POSITIVE_INFINITY, y: 30 }],
          layoutPathLocked: true,
        },
      },
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes: baseNodes,
      enableSmartEdges: false,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 793,
    });

    expect(result[0].type).toBe('step');
  });

  it('keeps locked paths for nodes positioned inside parent containers', () => {
    const nodes: Node[] = [
      {
        id: 'group',
        type: 'titleGroup',
        position: { x: 100, y: 200 },
        data: {},
        measured: { width: 500, height: 300 },
      },
      {
        id: 'source',
        parentId: 'group',
        position: { x: 20, y: 30 },
        data: {},
        measured: { width: 100, height: 60 },
      },
      {
        id: 'target',
        parentId: 'group',
        position: { x: 300, y: 30 },
        data: {},
        measured: { width: 100, height: 60 },
      },
    ];
    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'source',
        target: 'target',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: 'advanced-smart-step',
        data: {
          computedPath: [{ x: 170, y: 290 }, { x: 450, y: 230 }],
          layoutPathLocked: true,
        },
      },
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 794,
    });

    expect(result[0].type).toBe('stablePath');
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
