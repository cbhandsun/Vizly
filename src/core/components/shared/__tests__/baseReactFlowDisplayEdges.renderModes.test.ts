import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createBaseReactFlowDisplayEdges } from '../baseReactFlowDisplayEdges';
import { computeBaseReactFlowDisplayEdgeEpoch } from '../baseReactFlowDisplayEdgeCore';
import { resolveDisplayQualityBudget } from '../baseReactFlowDisplayEvaluation';
import { finalizeDisplayEdgesForRenderMode } from '../baseReactFlowDisplayRenderPipeline';
import { displayEdgesHaveNodeAnchoredTerminals } from '../baseReactFlowTerminalAxisRepair';
import { baseNodes } from './baseReactFlowDisplayEdges.testUtils';

describe('baseReactFlowDisplayEdges render modes', () => {
  it('converts large-graph edges to canvas-ref while preserving original type metadata', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'source',
        target: 'target',
        type: 'advanced-smart-step',
        data: {
          layoutPathLocked: true,
          computedPath: [
            { x: 50, y: 200 },
            { x: 50, y: 80 },
            { x: 350, y: 80 },
            { x: 350, y: 0 },
          ],
        },
      },
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

  it('keeps a large-graph outer lane at least 96px from a parallel container boundary', () => {
    const nodes: Node[] = [
      {
        id: 'source',
        position: { x: 0, y: 20 },
        data: {},
        measured: { width: 80, height: 60 },
      },
      {
        id: 'target',
        position: { x: 0, y: 240 },
        data: {},
        measured: { width: 80, height: 60 },
      },
      {
        id: 'peer-target',
        position: { x: -240, y: 50 },
        data: {},
        measured: { width: 80, height: 60 },
      },
      {
        id: 'domain',
        type: 'titleGroup',
        position: { x: 240, y: 0 },
        data: {},
        measured: { width: 400, height: 320 },
      },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-near-container',
        source: 'source',
        target: 'target',
        type: 'advanced-smart-step',
        data: {
          computedPath: [
            { x: 80, y: 50 },
            { x: 160, y: 50 },
            { x: 160, y: 270 },
            { x: 80, y: 270 },
          ],
          layoutPathLocked: true,
          sharedTrunkAware: true,
          sharedTrunkSynthesized: true,
        },
      },
      {
        id: 'edge-opposite-sector',
        source: 'source',
        target: 'peer-target',
        type: 'advanced-smart-step',
        data: {
          computedPath: [
            { x: 0, y: 50 },
            { x: -96, y: 50 },
            { x: -96, y: 80 },
            { x: -160, y: 80 },
          ],
          layoutPathLocked: true,
        },
      },
    ];

    const result = finalizeDisplayEdgesForRenderMode({
      finalQualityEdges: edges,
      rawEdges: edges,
      repairNodes: nodes,
      renderNodes: nodes,
      enableSmartEdges: false,
      smartEdgePadding: 20,
      isLargeGraph: true,
      layoutDirection: 'TB',
      inputSignature: 'large-container-clearance',
      qualityBudget: resolveDisplayQualityBudget(edges, nodes, true),
    });
    const boundedResult = finalizeDisplayEdgesForRenderMode({
      finalQualityEdges: edges,
      rawEdges: edges,
      repairNodes: nodes,
      renderNodes: nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      layoutDirection: 'TB',
      inputSignature: 'bounded-container-clearance',
      qualityBudget: {
        mode: 'bounded',
        soft: { maxEdges: 2, maxCandidatesPerEdge: 16, maxQualityEvaluations: 18 },
        finalSoft: { maxEdges: 2, maxCandidatesPerEdge: 16, maxQualityEvaluations: 18 },
      },
    });
    const resultPaths = [result, boundedResult].map(candidate => {
      const data = candidate[0].data;
      return data && Array.isArray(data.computedPath)
        ? data.computedPath as Array<{ x: number; y: number }>
        : [];
    });

    expect(result[0].type).toBe('canvas-ref');
    expect(boundedResult[0].type).toBe('stablePath');
    for (const path of resultPaths) {
      const parallelLaneX = path[1]?.x;
      expect(parallelLaneX).toBeLessThanOrEqual(144);
      expect(240 - parallelLaneX).toBeGreaterThanOrEqual(96);
    }
  });

  it('reuses finalized display edges on the second render pass', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'source', target: 'target', type: 'advanced-smart-step' },
    ];
    const first = createBaseReactFlowDisplayEdges({
      edges,
      nodes: baseNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({ nodes: baseNodes, edges }),
    });

    const second = createBaseReactFlowDisplayEdges({
      edges: first,
      nodes: baseNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: computeBaseReactFlowDisplayEdgeEpoch({ nodes: baseNodes, edges: first }),
    });

    expect(
      second,
      JSON.stringify({ first: first[0], second: second[0] }, null, 2),
    ).toBe(first);
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

  it('synthesizes a locked orthogonal path for stablePath edges missing computedPath', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'source',
        target: 'target',
        type: 'stablePath',
        data: { label: 'Existing stable edge' },
      },
    ];

    const result = createBaseReactFlowDisplayEdges({
      edges,
      nodes: baseNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 790,
    });
    const path = (result[0].data as any).computedPath;

    expect(result[0].type).toBe('stablePath');
    expect((result[0].data as any).layoutPathLocked).toBe(true);
    expect((result[0].data as any)._layoutPathLocked).toBe(true);
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path.every((point: any) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  });

  it('keeps layout-locked computed paths on the stable path renderer in basic mode while selecting a legal target side', () => {
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
    expect(result[0].targetHandle).toBe('bottom');
    expect(repairedPath[repairedPath.length - 1]).toEqual({ x: 350, y: 60 });
    expect(displayEdgesHaveNodeAnchoredTerminals(result, baseNodes)).toBe(true);
    expect((result[0].data as any).endpointOrthogonalRepaired).toBe(true);
    expect(result[0].label).toBe('Locked path');
  });

  it('keeps post-processed locked computed paths on the stable path renderer in smart mode while selecting a legal target side', () => {
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
    expect(result[0].targetHandle).toBe('bottom');
    expect(repairedPath[repairedPath.length - 1]).toEqual({ x: 350, y: 60 });
    expect(displayEdgesHaveNodeAnchoredTerminals(result, baseNodes)).toBe(true);
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
