import type { Edge, Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  anchorComputedDisplayEdgeEndpoints,
  compactOrthogonalPath,
  computeBaseReactFlowDisplayCacheSignature,
  computeBaseDisplayInputSignature,
  computeBaseReactFlowDisplayEdgeEpoch,
  computeBaseReactFlowEndpointGeometryKey,
  computeBaseReactFlowDisplayOutputRouteSignature,
  createBaseReactFlowFastDisplayEdges,
  normalizeBaseEdge,
  readBaseReactFlowDisplayEdgesCache,
  readBaseReactFlowDisplayEdgesCacheEntry,
  synthesizeStableFallbackPath,
  writeBaseReactFlowDisplayEdgesCache,
} from '../baseReactFlowDisplayEdgeCore';
import { anchorComputedDisplayEdgeEndpoints as anchorComputedDisplayEdgeEndpointsDirect } from '../baseReactFlowDisplayEndpointAnchoring';
import {
  compactOrthogonalPath as compactOrthogonalPathDirect,
  synthesizeStableFallbackPath as synthesizeStableFallbackPathDirect,
} from '../baseReactFlowDisplayEdgeGeometry';
import { fastDisplayHardSafetyIsClean } from '../baseReactFlowFastEdgeSafety';

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

afterEach(() => {
  vi.useRealTimers();
});

describe('baseReactFlowDisplayEdgeCore', () => {
  it('does not rewrite cross-container source-authored terminal sides', () => {
    const input: Edge = {
      id: 'manual-cross-container',
      source: 'source',
      target: 'target',
      sourceHandle: 'source-top-port-1',
      targetHandle: 'target-bottom-port-1',
      data: { manualHandleSides: ['source', 'target'] },
    };

    const result = normalizeBaseEdge({
      edge: input,
      nodeById: new Map(baseNodes.map(node => [node.id, node])),
      displayEdgeEpoch: 1,
    });

    expect(result.sourceHandle).toBe('source-top-port-1');
    expect(result.targetHandle).toBe('target-bottom-port-1');
  });

  it('allows router-owned runtime terminals to switch sides during auto reverse repair', () => {
    const input: Edge = {
      id: 'runtime-auto-reverse',
      source: 'source',
      target: 'target',
      sourceHandle: 'source-bottom-runtime',
      targetHandle: 'target-top-runtime',
      data: {
        auto: ['source', 'target'],
        runtimeHandleLock: { source: true, target: true },
      },
    };

    const result = normalizeBaseEdge({
      edge: input,
      nodeById: new Map(baseNodes.map(node => [node.id, node])),
      displayEdgeEpoch: 1,
    });

    expect(result.sourceHandle).toBe('right');
    expect(result.targetHandle).toBe('left');
  });

  it('preserves exact shorthand handles during base normalization', () => {
    const input: Edge = {
      id: 'manual-shorthand',
      source: 'source',
      target: 'target',
      sourceHandle: 'r',
      targetHandle: 'l',
      data: { manualHandles: true },
    };

    const result = normalizeBaseEdge({
      edge: input,
      nodeById: new Map(baseNodes.map(node => [node.id, node])),
      displayEdgeEpoch: 1,
    });

    expect(result.sourceHandle).toBe('r');
    expect(result.targetHandle).toBe('l');
  });

  it('re-exports split routing primitives without mutating caller inputs', () => {
    expect(anchorComputedDisplayEdgeEndpoints).toBe(anchorComputedDisplayEdgeEndpointsDirect);
    expect(compactOrthogonalPath).toBe(compactOrthogonalPathDirect);
    expect(synthesizeStableFallbackPath).toBe(synthesizeStableFallbackPathDirect);

    const path = [
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      { x: 0, y: 40 },
      { x: 30, y: 40 },
    ];
    const pathSnapshot = path.map(point => ({ ...point }));
    expect(compactOrthogonalPath(path)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 30, y: 40 },
    ]);
    expect(path).toEqual(pathSnapshot);

    const edge: Edge = {
      id: 'immutable-endpoint-input',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'bottom',
      data: {
        computedPath: [
          { x: 50, y: 261 },
          { x: 50, y: 320 },
          { x: 350, y: 320 },
          { x: 350, y: 60 },
        ],
      },
    };
    const edgeSnapshot = JSON.parse(JSON.stringify(edge));
    const nodesSnapshot = JSON.parse(JSON.stringify(baseNodes));
    anchorComputedDisplayEdgeEndpoints([edge], baseNodes);
    expect(edge).toEqual(edgeSnapshot);
    expect(baseNodes).toEqual(nodesSnapshot);
  });

  it('computes a cache signature from raw edge display inputs', () => {
    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'source',
        target: 'target',
        type: 'stablePath',
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

    const signatureA = computeBaseReactFlowDisplayCacheSignature({
      nodes: baseNodes,
      edges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const signatureB = computeBaseReactFlowDisplayCacheSignature({
      nodes: baseNodes,
      edges: [{
        ...edges[0],
        data: {
          ...(edges[0].data as Record<string, unknown>),
          computedPath: [
            { x: 50, y: 200 },
            { x: 80, y: 80 },
            { x: 350, y: 80 },
            { x: 350, y: 0 },
          ],
        },
      }],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const signatureC = computeBaseReactFlowDisplayCacheSignature({
      nodes: [{
        ...baseNodes[0],
        type: 'group',
        parentId: 'parent',
        data: { layoutDirection: 'LR' },
      } as Node, baseNodes[1]],
      edges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const signatureD = computeBaseReactFlowDisplayCacheSignature({
      nodes: baseNodes,
      edges: [{
        ...edges[0],
        data: {
          ...(edges[0].data as Record<string, unknown>),
          sourcePortPolicy: 'fixed-side',
          manualHandleSides: ['source'],
        },
      }],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const signatureE = computeBaseReactFlowDisplayCacheSignature({
      nodes: baseNodes,
      edges: [{
        ...edges[0],
        data: {
          ...(edges[0].data as Record<string, unknown>),
          treeRouting: {},
        },
      }],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });

    expect(signatureB).not.toBe(signatureA);
    expect(signatureC).not.toBe(signatureA);
    expect(signatureD).not.toBe(signatureA);
    expect(signatureE).not.toBe(signatureA);
  });

  it.each([
    ['runtime boolean lock', { runtimeHandleLock: true }],
    ['legacy runtime lock', { _runtimeHandleLock: { source: true } }],
    ['legacy manual handle', { _manualHandles: { target: true } }],
  ] as const)('invalidates both display identities for a %s', (_name, lockData) => {
    const edge: Edge = {
      id: 'identity-lock',
      source: 'source',
      target: 'target',
      sourceHandle: 'right-port-1',
      targetHandle: 'left-port-1',
      data: {},
    };
    const input = {
      nodes: baseNodes,
      edges: [edge],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    };
    const lockedInput = {
      ...input,
      edges: [{ ...edge, data: lockData }],
    };

    expect(computeBaseReactFlowDisplayCacheSignature(lockedInput)).not.toBe(
      computeBaseReactFlowDisplayCacheSignature(input),
    );
    expect(computeBaseDisplayInputSignature(lockedInput)).not.toBe(
      computeBaseDisplayInputSignature(input),
    );
  });

  it('invalidates display cache signatures for sub-pixel boundaries and fixed handle positions', () => {
    const edges: Edge[] = [{
      id: 'e1',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 50, y: 260 },
          { x: 50, y: 100 },
          { x: 350, y: 100 },
          { x: 350, y: 0 },
        ],
      },
    }];
    const signature = (nodes: Node[], nextEdges = edges) => computeBaseReactFlowDisplayCacheSignature({
      nodes,
      edges: nextEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const baseline = signature(baseNodes);

    expect(signature([
      {
        ...baseNodes[0],
        position: { x: 0.49, y: 200 },
        measured: { width: 100.49, height: 60.49 },
      },
      baseNodes[1],
    ])).not.toBe(baseline);
    expect(signature(baseNodes, [{
      ...edges[0],
      data: {
        ...(edges[0].data as Record<string, unknown>),
        manualHandlePositions: ['source'],
        sourceHandlePositionLocked: true,
      },
    }])).not.toBe(baseline);
  });

  it('keeps endpoint-anchor memoization sensitive to exact and parent-relative geometry', () => {
    const exactKey = computeBaseReactFlowEndpointGeometryKey(baseNodes);
    const subPixelKey = computeBaseReactFlowEndpointGeometryKey([
      { ...baseNodes[0], position: { x: 0.25, y: 200 } },
      baseNodes[1],
    ]);
    const parentRelativeKey = computeBaseReactFlowEndpointGeometryKey([
      { ...baseNodes[0], parentId: 'group' } as Node,
      baseNodes[1],
    ]);
    const absoluteKey = computeBaseReactFlowEndpointGeometryKey([
      { ...baseNodes[0], positionAbsolute: { x: 0, y: 200 } } as Node,
      baseNodes[1],
    ]);
    const resizedKey = computeBaseReactFlowEndpointGeometryKey([
      { ...baseNodes[0], measured: { width: 100.25, height: 60 } },
      baseNodes[1],
    ]);
    const nodeTypeKey = computeBaseReactFlowEndpointGeometryKey([
      { ...baseNodes[0], type: 'titleGroup' },
      baseNodes[1],
    ]);

    expect(subPixelKey).not.toBe(exactKey);
    expect(parentRelativeKey).not.toBe(exactKey);
    expect(absoluteKey).not.toBe(exactKey);
    expect(resizedKey).not.toBe(exactKey);
    expect(nodeTypeKey).not.toBe(exactKey);
    expect(computeBaseReactFlowEndpointGeometryKey(baseNodes.map(node => ({ ...node })))).toBe(exactKey);
  });

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

  it('creates fast display edges from existing locked paths without marking them finalized', () => {
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

    const result = createBaseReactFlowFastDisplayEdges({
      edges,
      nodes: baseNodes,
      enableSmartEdges: false,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 123,
    });

    expect(result[0].type).toBe('stablePath');
    expect((result[0].data as any).__baseDisplayFinalizedSignature).toBeUndefined();
  });

  it('falls back to the nearest node boundary when computed-path handle metadata drifts', () => {
    const result = createBaseReactFlowFastDisplayEdges({
      edges: [{
        id: 'detached-source',
        source: 'source',
        target: 'target',
        sourceHandle: 'right',
        targetHandle: 'top',
        type: 'stablePath',
        data: {
          computedPath: [
            { x: -20, y: 260 },
            { x: -20, y: 320 },
            { x: 350, y: 320 },
            { x: 350, y: 0 },
          ],
        },
      }],
      nodes: baseNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 127,
    });
    const path = (result[0].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(path[0]).toEqual({ x: 0, y: 260 });
    expect(path.at(-1)).toEqual({ x: 350, y: 0 });
    expect(path.every((point, index) => (
      index === 0 || point.x === path[index - 1].x || point.y === path[index - 1].y
    ))).toBe(true);
  });

  it('adds an outward stub when a terminal segment runs along the node boundary', () => {
    const [result] = anchorComputedDisplayEdgeEndpoints([{
      id: 'boundary-tangent',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 50, y: 260 },
          { x: 100, y: 260 },
          { x: 100, y: 360 },
          { x: 350, y: 360 },
          { x: 350, y: 0 },
        ],
      },
    }], baseNodes);
    const path = (result.data as any).computedPath as Array<{ x: number; y: number }>;

    expect(path.slice(0, 4)).toEqual([
      { x: 50, y: 260 },
      { x: 50, y: 308 },
      { x: 100, y: 308 },
      { x: 100, y: 360 },
    ]);
  });

  it('snaps a one-pixel normal endpoint gap when the terminal projects onto the node edge', () => {
    const [result] = anchorComputedDisplayEdgeEndpoints([{
      id: 'normal-gap',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'bottom',
      data: {
        computedPath: [
          { x: 50, y: 261 },
          { x: 50, y: 320 },
          { x: 350, y: 320 },
          { x: 350, y: 60 },
        ],
      },
    }], baseNodes);
    const path = (result.data as any).computedPath as Array<{ x: number; y: number }>;

    expect(path[0]).toEqual({ x: 50, y: 260 });
    expect(path.at(-1)).toEqual({ x: 350, y: 60 });
  });

  it('keeps a tangent terminal path orthogonal while snapping its normal endpoint gap', () => {
    const [result] = anchorComputedDisplayEdgeEndpoints([{
      id: 'tangent-normal-gap',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'bottom',
      data: {
        computedPath: [
          { x: 50, y: 261 },
          { x: 100, y: 261 },
          { x: 100, y: 320 },
          { x: 350, y: 320 },
          { x: 350, y: 60 },
        ],
      },
    }], baseNodes);
    const path = (result.data as any).computedPath as Array<{ x: number; y: number }>;

    expect(path[0].y).toBe(260);
    expect(path.every((point, index) => (
      index === 0 || point.x === path[index - 1].x || point.y === path[index - 1].y
    ))).toBe(true);
  });

  it('clamps a terminal that drifted along the extension of its requested node side', () => {
    const [result] = anchorComputedDisplayEdgeEndpoints([{
      id: 'extended-bottom-boundary',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'bottom',
      data: {
        manualHandleSides: ['source'],
        computedPath: [
          { x: 241, y: 261 },
          { x: 241, y: 320 },
          { x: 350, y: 320 },
          { x: 350, y: 60 },
        ],
      },
    }], baseNodes);
    const path = (result.data as any).computedPath as Array<{ x: number; y: number }>;

    expect(path[0]).toEqual({ x: 100, y: 260 });
    expect(path[1].x).toBe(100);
    expect(path.every((point, index) => (
      index === 0 || point.x === path[index - 1].x || point.y === path[index - 1].y
    ))).toBe(true);
  });

  it('switches a dominant-axis corner elbow to the adjacent source side', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 300, y: 0 }, data: {}, measured: { width: 100, height: 60 } },
      { id: 'target', position: { x: 0, y: 200 }, data: {}, measured: { width: 100, height: 60 } },
    ];
    const [result] = anchorComputedDisplayEdgeEndpoints([{
      id: 'left-dominant-corner-elbow',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        treeRouting: {
          effectiveSourceHandle: 'bottom',
          effectiveTargetHandle: 'top',
          points: [],
        },
        computedPath: [
          { x: 300, y: 60 },
          { x: 300, y: 108 },
          { x: 50, y: 108 },
          { x: 50, y: 200 },
        ],
      },
    }], nodes);

    expect(result.sourceHandle).toBe('left');
    expect((result.data as any).computedPath).toEqual([
      { x: 300, y: 44 },
      { x: 50, y: 44 },
      { x: 50, y: 200 },
    ]);
    expect((result.data as any).renderPortSideReason).toBe(
      'dominant-axis-avoidable-endpoint-elbow',
    );
    expect((result.data as any).treeRouting.effectiveSourceHandle).toBe('left');
    expect((result.data as any).treeRouting.points).toEqual((result.data as any).computedPath);
  });

  it('keeps explicit manual port sides fixed during corner-elbow scoring', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 300, y: 0 }, data: {}, measured: { width: 100, height: 60 } },
      { id: 'target', position: { x: 0, y: 200 }, data: {}, measured: { width: 100, height: 60 } },
    ];
    const originalPath = [
      { x: 300, y: 60 },
      { x: 300, y: 108 },
      { x: 50, y: 108 },
      { x: 50, y: 200 },
    ];
    const [result] = anchorComputedDisplayEdgeEndpoints([{
      id: 'manual-bottom-port',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: { computedPath: originalPath, manualHandleSides: ['source'] },
    }], nodes);

    expect(result.sourceHandle).toBe('bottom');
    expect((result.data as any).computedPath).toEqual(originalPath);
  });

  it('keeps an exact compound terminal id fixed during endpoint anchoring', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 300, y: 0 }, data: {}, measured: { width: 100, height: 60 } },
      { id: 'target', position: { x: 0, y: 200 }, data: {}, measured: { width: 100, height: 60 } },
    ];
    const originalPath = [
      { x: 300, y: 60 },
      { x: 300, y: 108 },
      { x: 50, y: 108 },
      { x: 50, y: 200 },
    ];
    const [result] = anchorComputedDisplayEdgeEndpoints([{
      id: 'manual-compound-bottom-port',
      source: 'source',
      target: 'target',
      sourceHandle: 'source-bottom-port-1',
      targetHandle: 'target-top-port-1',
      data: {
        computedPath: originalPath,
        manualHandles: { source: true, target: true },
      },
    }], nodes);

    expect(result.sourceHandle).toBe('source-bottom-port-1');
    expect(result.targetHandle).toBe('target-top-port-1');
    const path = (result.data as any).computedPath as Array<{ x: number; y: number }>;
    expect(path[0].y).toBe(60);
    expect(path.at(-1)?.y).toBe(200);
    expect(path.every((point, index) => (
      index === 0 || point.x === path[index - 1].x || point.y === path[index - 1].y
    ))).toBe(true);
  });

  it('lets endpoint anchoring refine a router-owned runtime side', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 300, y: 0 }, data: {}, measured: { width: 100, height: 60 } },
      { id: 'target', position: { x: 0, y: 200 }, data: {}, measured: { width: 100, height: 60 } },
    ];
    const [result] = anchorComputedDisplayEdgeEndpoints([{
      id: 'runtime-compound-bottom-port',
      source: 'source',
      target: 'target',
      sourceHandle: 'source-bottom-runtime',
      targetHandle: 'target-top-runtime',
      data: {
        runtimeHandleLock: { source: true, target: true },
        computedPath: [
          { x: 300, y: 60 },
          { x: 300, y: 108 },
          { x: 50, y: 108 },
          { x: 50, y: 200 },
        ],
      },
    }], nodes);

    expect(result.sourceHandle).toBe('left');
  });

  it('keeps fast fallback paths orthogonal when the locked layout contains diagonals', () => {
    const result = createBaseReactFlowFastDisplayEdges({
      edges: [{
        id: 'diagonal',
        source: 'source',
        target: 'target',
        type: 'advanced-smart-step',
        data: {
          layoutPathLocked: true,
          computedPath: [
            { x: 50, y: 200 },
            { x: 150, y: 100 },
            { x: 350, y: 0 },
          ],
        },
      }],
      nodes: baseNodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 124,
    });
    const path = (result[0].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(path.every((point, index) => (
      index === 0 || point.x === path[index - 1].x || point.y === path[index - 1].y
    ))).toBe(true);
    expect(fastDisplayHardSafetyIsClean(result, baseNodes)).toBe(true);
  });

  it('detours fast fallback paths around unrelated nodes', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, data: {}, measured: { width: 100, height: 60 } },
      { id: 'blocker', position: { x: 0, y: 140 }, data: {}, measured: { width: 100, height: 100 } },
      { id: 'target', position: { x: 300, y: 300 }, data: {}, measured: { width: 100, height: 60 } },
    ];
    const result = createBaseReactFlowFastDisplayEdges({
      edges: [{
        id: 'blocked',
        source: 'source',
        target: 'target',
        type: 'advanced-smart-step',
        data: {
          layoutPathLocked: true,
          computedPath: [
            { x: 50, y: 60 },
            { x: 50, y: 300 },
            { x: 350, y: 300 },
          ],
        },
      }],
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 125,
    });
    const path = (result[0].data as any).computedPath as Array<{ x: number; y: number }>;
    const crossesBlocker = path.slice(0, -1).some((point, index) => {
      const next = path[index + 1];
      if (point.x === next.x) {
        return point.x > -8 && point.x < 108
          && Math.max(point.y, next.y) > 132
          && Math.min(point.y, next.y) < 248;
      }
      return point.y > 132 && point.y < 248
        && Math.max(point.x, next.x) > -8
        && Math.min(point.x, next.x) < 108;
    });

    expect(crossesBlocker, JSON.stringify(path)).toBe(false);
    expect(fastDisplayHardSafetyIsClean(result, nodes)).toBe(true);
  });

  it('escapes locked waypoints that start inside an unrelated obstacle', () => {
    const nodes: Node[] = [
      { id: 'source', position: { x: 0, y: 300 }, data: {}, measured: { width: 100, height: 60 } },
      { id: 'blocker', position: { x: 140, y: 100 }, data: {}, measured: { width: 160, height: 120 } },
      { id: 'target', position: { x: 500, y: 0 }, data: {}, measured: { width: 100, height: 60 } },
    ];
    const result = createBaseReactFlowFastDisplayEdges({
      edges: [{
        id: 'inside-corner',
        source: 'source',
        target: 'target',
        type: 'advanced-smart-step',
        data: {
          layoutPathLocked: true,
          computedPath: [
            { x: 50, y: 300 },
            { x: 220, y: 260 },
            { x: 220, y: 180 },
            { x: 550, y: 180 },
            { x: 550, y: 60 },
          ],
        },
      }],
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 126,
    });

    expect(fastDisplayHardSafetyIsClean(result, nodes)).toBe(true);
  });

  it('round-trips cached final display edges and rejects invalid cached paths', () => {
    window.localStorage.clear();
    const signature = 'display-cache-roundtrip-test';
    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'source',
        target: 'target',
        type: 'stablePath',
        data: {
          computedPath: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        },
      },
    ];

    const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(edges);
    expect(outputRouteSignature).toMatch(/^route-v2:/);
    writeBaseReactFlowDisplayEdgesCache(signature, edges, {
      hardClean: true,
      outputRouteSignature: outputRouteSignature!,
    });
    const cached = readBaseReactFlowDisplayEdgesCache(signature);
    expect(cached).toEqual(edges);
    expect(cached).not.toBe(edges);
    expect(readBaseReactFlowDisplayEdgesCacheEntry(signature)).toEqual({
      edges,
      hardClean: true,
      outputRouteSignature,
    });

    const uncleanSignature = 'display-cache-unclean-test';
    writeBaseReactFlowDisplayEdgesCache(uncleanSignature, edges, { hardClean: false });
    expect(readBaseReactFlowDisplayEdgesCacheEntry(uncleanSignature)).toBeNull();
    expect(Array.from({ length: window.localStorage.length }, (_, index) => (
      window.localStorage.key(index)
    )).some(key => key?.endsWith(`:${uncleanSignature}`))).toBe(false);

    const validKey = Array.from({ length: window.localStorage.length }, (_, index) => (
      window.localStorage.key(index)
    )).find(key => key?.endsWith(`:${signature}`));
    expect(validKey).toBeTruthy();
    const validPayload = JSON.parse(window.localStorage.getItem(validKey!) || '{}');
    const invalidSignature = 'display-cache-invalid-test';
    const invalidKey = `${validKey!.slice(0, -signature.length)}${invalidSignature}`;
    window.localStorage.setItem(invalidKey, JSON.stringify({
      version: validPayload.version,
      signature: invalidSignature,
      edges: [
        {
          id: 'bad',
          source: 'source',
          target: 'target',
          data: {
            computedPath: [
              { x: 0, y: 0 },
              { x: Number.NaN, y: 1 },
            ],
          },
        },
      ],
    }));

    expect(readBaseReactFlowDisplayEdgesCache(invalidSignature)).toBeNull();
    expect(window.localStorage.getItem(invalidKey)).toBeNull();

    const unverifiedSignature = 'display-cache-unverified-payload-test';
    const unverifiedKey = `${validKey!.slice(0, -signature.length)}${unverifiedSignature}`;
    window.localStorage.setItem(unverifiedKey, JSON.stringify({
      ...validPayload,
      signature: unverifiedSignature,
      hardClean: false,
    }));
    expect(readBaseReactFlowDisplayEdgesCacheEntry(unverifiedSignature)).toBeNull();
    expect(window.localStorage.getItem(unverifiedKey)).toBeNull();

    const unsignedSignature = 'display-cache-unsigned-payload-test';
    const unsignedKey = `${validKey!.slice(0, -signature.length)}${unsignedSignature}`;
    const { outputRouteSignature: _removedOutputRouteSignature, ...unsignedPayload } = validPayload;
    window.localStorage.setItem(unsignedKey, JSON.stringify({
      ...unsignedPayload,
      signature: unsignedSignature,
      hardClean: true,
    }));
    expect(readBaseReactFlowDisplayEdgesCacheEntry(unsignedSignature)).toBeNull();
    expect(window.localStorage.getItem(unsignedKey)).toBeNull();
  });

  it('bounds exact cached output route signatures and rejects invalid routing geometry', () => {
    const valid: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [{ x: 0.25, y: -0 }, { x: 100.5, y: 0 }],
        treeRouting: {
          effectiveSourceHandle: 'right',
          effectiveTargetHandle: 'left',
          points: [{ x: 0.25, y: -0 }, { x: 100.5, y: 0 }],
        },
      },
    }];
    const signature = computeBaseReactFlowDisplayOutputRouteSignature(valid);

    expect(signature).toMatch(/^route-v2:1:4:[0-9a-f]{16}$/);
    expect(computeBaseReactFlowDisplayOutputRouteSignature(valid.map(edge => ({
      ...edge,
      data: JSON.parse(JSON.stringify(edge.data)),
    })))).toBe(signature); // JSON normalizes -0, which is geometrically identical to 0.
    expect(computeBaseReactFlowDisplayOutputRouteSignature([{
      ...valid[0],
      data: { computedPath: [{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }] },
    }])).toBeNull();
    expect(computeBaseReactFlowDisplayOutputRouteSignature([{
      ...valid[0],
      data: { computedPath: [{ x: 0, y: 0 }, { x: 1_000_000_001, y: 1 }] },
    }])).toBeNull();
    expect(computeBaseReactFlowDisplayOutputRouteSignature([{
      ...valid[0],
      data: {
        computedPath: Array.from({ length: 2_001 }, (_, index) => ({ x: index, y: 0 })),
      },
    }])).toBeNull();
    expect(computeBaseReactFlowDisplayOutputRouteSignature([{
      ...valid[0],
      sourceHandle: { unsafe: true } as unknown as string,
    }])).toBeNull();
    for (const intent of ['sharedTrunkSynthesized', 'sharedTrunkAware', 'isTreeBus'] as const) {
      expect(computeBaseReactFlowDisplayOutputRouteSignature([{
        ...valid[0],
        data: { ...(valid[0].data || {}), [intent]: true },
      }])).not.toBe(signature);
    }
    const withoutTreeRouting: Edge = {
      ...valid[0],
      data: { computedPath: (valid[0].data as any).computedPath },
    };
    expect(computeBaseReactFlowDisplayOutputRouteSignature([{
      ...withoutTreeRouting,
      data: { ...(withoutTreeRouting.data || {}), treeRouting: {} },
    }])).not.toBe(computeBaseReactFlowDisplayOutputRouteSignature([withoutTreeRouting]));

    const oversizedInputSignature = 'x'.repeat(501);
    writeBaseReactFlowDisplayEdgesCache(oversizedInputSignature, valid, {
      hardClean: true,
      outputRouteSignature: signature!,
    });
    expect(readBaseReactFlowDisplayEdgesCacheEntry(oversizedInputSignature)).toBeNull();
  });

  it('bounds display cache storage and removes only stale routing versions', () => {
    vi.useFakeTimers();
    window.localStorage.clear();
    window.localStorage.setItem('unrelated:setting', 'keep');
    window.localStorage.setItem('vizly:baseReactFlowDisplayEdges:old-version:stale', '{}');
    const edges: Edge[] = [{
      id: 'cached-edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    }];
    const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(edges);
    expect(outputRouteSignature).not.toBeNull();

    for (let index = 0; index < 13; index += 1) {
      vi.setSystemTime(new Date(1_000 + index));
      writeBaseReactFlowDisplayEdgesCache(`cache-life-${index}`, edges, {
        hardClean: true,
        outputRouteSignature: outputRouteSignature!,
      });
    }

    const keys = Array.from({ length: window.localStorage.length }, (_, index) => (
      window.localStorage.key(index)
    )).filter((key): key is string => typeof key === 'string');
    const displayKeys = keys.filter(key => key.startsWith('vizly:baseReactFlowDisplayEdges:'));

    expect(window.localStorage.getItem('unrelated:setting')).toBe('keep');
    expect(window.localStorage.getItem('vizly:baseReactFlowDisplayEdges:old-version:stale')).toBeNull();
    expect(displayKeys).toHaveLength(12);
    expect(displayKeys.some(key => key.endsWith(':cache-life-0'))).toBe(false);
    expect(readBaseReactFlowDisplayEdgesCache('cache-life-12')).toEqual(edges);
  });
});
