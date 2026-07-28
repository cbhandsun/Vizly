import { describe, expect, it } from 'vitest';

import {
  parseDisplayEdgesWorkerRequest,
  parseDisplayEdgesWorkerResponse,
} from '../baseReactFlowDisplayWorkerProtocol';

const nodes = [
  { id: 'source', position: { x: 0, y: 0 }, data: {} },
  { id: 'target', position: { x: 100, y: 0 }, data: {} },
];

const validRepairRequest = {
  operation: 'repair',
  requestId: 'repair-1',
  edges: [{
    id: 'edge',
    source: 'source',
    target: 'target',
    data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
  }],
  nodes,
} as const;

describe('baseReactFlowDisplayWorkerProtocol', () => {
  it('parses validate-or-route candidates and degrades malformed candidates to a reroute', () => {
    const valid = parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      operation: 'validate-or-route',
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      qualityMode: 'full',
      candidateEdges: validRepairRequest.edges,
      candidateSource: 'persistent',
    });
    expect(valid).toMatchObject({
      operation: 'validate-or-route',
      candidateEdges: validRepairRequest.edges,
      candidateSource: 'persistent',
    });
    const validPatches = parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      operation: 'validate-or-route',
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      qualityMode: 'full',
      candidatePatches: validRepairRequest.edges,
      candidateSource: 'precompiled',
    });
    expect(validPatches).toMatchObject({
      operation: 'validate-or-route',
      candidateEdges: null,
      candidatePatches: validRepairRequest.edges,
      candidateSource: 'precompiled',
    });
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      operation: 'validate-or-route',
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      qualityMode: 'full',
      candidateEdges: validRepairRequest.edges,
      candidatePatches: validRepairRequest.edges,
      candidateSource: 'persistent',
    })).toBeNull();

    const malformed = parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      operation: 'validate-or-route',
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      qualityMode: 'full',
      candidateSource: 'persistent',
      candidateEdges: [{
        id: 'edge',
        source: 'source',
        target: 'target',
        data: { computedPath: [{ x: Number.NaN, y: 0 }] },
      }],
    });
    expect(malformed).toMatchObject({
      operation: 'validate-or-route',
      candidateEdges: null,
      candidateSource: 'persistent',
    });
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      operation: 'validate-or-route',
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      qualityMode: 'full',
      candidateEdges: validRepairRequest.edges,
      candidateSource: 'forged',
    })).toBeNull();
  });

  it('parses bounded incremental requests and rejects incomplete change hints', () => {
    const incrementalRequest = {
      operation: 'incremental-route',
      requestId: 'incremental-1',
      edges: validRepairRequest.edges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 2,
      qualityMode: 'full',
      baselineInputSignature: '123',
      baselineInputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
      baselineNodes: nodes,
      baselineSourceEdges: validRepairRequest.edges,
      baselinePatches: validRepairRequest.edges,
      baselineOutputRouteSignature: `route-v2:1:2:${'b'.repeat(16)}`,
      nextInputSignature: '456',
      nextInputGeometryDigest: `geometry-v1:${'c'.repeat(32)}`,
      changeSet: {
        reason: 'node-drag',
        changedNodeIds: ['source'],
        changedEdgeIds: [],
        topologyChanged: false,
        geometryChanged: true,
      },
      mutableEdgeIds: ['edge'],
      contextEdgeIds: [],
    };
    expect(parseDisplayEdgesWorkerRequest(incrementalRequest)).toMatchObject({
      operation: 'incremental-route',
      changeSet: {
        reason: 'node-drag',
        changedNodeIds: ['source'],
      },
      mutableEdgeIds: ['edge'],
    });
    expect(parseDisplayEdgesWorkerRequest({
      ...incrementalRequest,
      changeSet: {
        ...incrementalRequest.changeSet,
        changedNodeIds: ['source', 'source'],
      },
    })).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...incrementalRequest,
      baselineInputGeometryDigest: 'invalid',
    })).toBeNull();
  });

  it('validates graph shape, finite node geometry, and bounded dimensions', () => {
    expect(parseDisplayEdgesWorkerRequest(validRepairRequest)?.operation).toBe('repair');
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      nodes: [{
        id: 'source',
        position: { x: 0, y: 0 },
        positionAbsolute: { x: 10, y: 20 },
        width: 120,
        height: 80,
        measured: { width: 120, height: 80 },
        style: { width: '120px', height: '50%' },
        data: {},
      }],
    })).not.toBeNull();
    expect(parseDisplayEdgesWorkerRequest({ ...validRepairRequest, operation: 'unknown' })).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      nodes: [{ id: 'source', position: { x: Number.NaN, y: 0 }, data: {} }],
    })).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      nodes: [{
        id: 'source',
        position: { x: 0, y: 0 },
        positionAbsolute: { x: Number.POSITIVE_INFINITY, y: 0 },
        data: {},
      }],
    })).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      nodes: [{
        id: 'source',
        position: { x: 0, y: 0 },
        measured: { width: Number.NaN, height: 20 },
        data: {},
      }],
    })).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      nodes: [{ id: 'source', position: { x: 0, y: 0 }, width: -1, data: {} }],
    })).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      nodes: [{
        id: 'source',
        position: { x: 0, y: 0 },
        style: { width: 'Infinitypx', height: 20 },
        data: {},
      }],
    })).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      edges: [{
        id: 'edge',
        source: 'source',
        target: 'target',
        data: { computedPath: [{ x: Number.POSITIVE_INFINITY, y: 0 }] },
      }],
    })).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      edges: [{
        id: 'edge',
        source: 'source',
        target: 'target',
        data: {
          sharedTrunkAware: 'yes',
          computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        },
      }],
    })).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      edges: Array.from({ length: 10_001 }, (_, index) => ({
        id: `edge-${index}`,
        source: 'source',
        target: 'target',
      })),
    })).toBeNull();
  });

  it('rejects cyclic, overly deep, oversized, and over-budget edge data', () => {
    const request = (data: Record<string, unknown>) => ({
      operation: 'repair',
      requestId: 'bounded-data',
      edges: [{ id: 'edge', source: 'source', target: 'target', data }],
      nodes,
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(parseDisplayEdgesWorkerRequest(request(cyclic))).toBeNull();

    let deep: Record<string, unknown> = { value: true };
    for (let depth = 0; depth < 9; depth += 1) deep = { nested: deep };
    expect(parseDisplayEdgesWorkerRequest(request(deep))).toBeNull();
    expect(parseDisplayEdgesWorkerRequest(request({
      values: Array.from({ length: 2_001 }, () => 1),
    }))).toBeNull();
    expect(parseDisplayEdgesWorkerRequest(request(Object.fromEntries(
      Array.from({ length: 121 }, (_, index) => [`key-${index}`, index]),
    )))).toBeNull();

    const overPointBudgetEdges = Array.from({ length: 101 }, (_, edgeIndex) => ({
      id: `edge-${edgeIndex}`,
      source: 'source',
      target: 'target',
      data: {
        computedPath: Array.from({ length: 2_000 }, (_, pointIndex) => ({
          x: pointIndex,
          y: edgeIndex,
        })),
      },
    }));
    expect(parseDisplayEdgesWorkerRequest({
      operation: 'repair',
      requestId: 'point-budget',
      edges: overPointBudgetEdges,
      nodes,
    })).toBeNull();
  });

  it('rejects conflicting, non-finite, cyclic, and forged response variants', () => {
    const validEdges = validRepairRequest.edges;
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      edges: validEdges,
      hardClean: true,
      routeResolution: 'repair',
    }, 'repair-1')).not.toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'route-1',
      edges: validEdges,
      hardClean: true,
      routeResolution: 'full-route-repaired',
      phaseTrace: [{
        phase: 'measured-repair',
        durationMs: 12.34,
        candidateCount: 1,
        changedEdgeCount: 1,
        resolution: 'accepted',
      }],
    }, 'route-1')).not.toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'candidate-1',
      edges: validEdges,
      hardClean: true,
      routeResolution: 'repaired-candidate',
      phaseTrace: [],
    }, 'candidate-1')).toMatchObject({
      routeResolution: 'repaired-candidate',
    });
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'incremental-1',
      edges: validEdges,
      hardClean: true,
      routeResolution: 'incremental-route',
      affectedEdgeCount: 1,
      fallbackLevel: 'none',
      phaseTrace: [],
    }, 'incremental-1')).toMatchObject({
      affectedEdgeCount: 1,
      fallbackLevel: 'none',
    });
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'incremental-1',
      edges: validEdges,
      hardClean: true,
      routeResolution: 'incremental-route',
      affectedEdgeCount: -1,
      fallbackLevel: 'none',
      phaseTrace: [],
    }, 'incremental-1')).toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'incremental-1',
      phaseProgress: {
        phase: 'local-route',
        durationMs: 4,
        candidateCount: 6,
        changedEdgeCount: 6,
        resolution: 'accepted',
      },
    }, 'incremental-1')).toMatchObject({
      phaseProgress: {
        phase: 'local-route',
        candidateCount: 6,
      },
    });
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'route-1',
      edges: validEdges,
      hardClean: true,
      routeResolution: 'full-route',
      phaseTrace: [{
        phase: 'unknown',
        durationMs: 1,
        candidateCount: 1,
        changedEdgeCount: 1,
        resolution: 'accepted',
      }],
    }, 'route-1')).toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'route-1',
      edges: validEdges,
      hardClean: true,
      routeResolution: 'full-route',
      phaseTrace: [{
        phase: 'seed',
        durationMs: Number.POSITIVE_INFINITY,
        candidateCount: 1,
        changedEdgeCount: 1,
        resolution: 'accepted',
      }],
    }, 'route-1')).toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      edges: validEdges,
      hardClean: true,
      routeResolution: 'repair',
      error: 'conflict',
    }, 'repair-1')).toBeNull();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      edges: [{ id: 'edge', source: 'source', target: 'target', data: cyclic }],
      hardClean: true,
      routeResolution: 'repair',
    }, 'repair-1')).toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      edges: [{
        ...validEdges[0],
        data: { computedPath: [{ x: 1e100, y: 0 }] },
      }],
      hardClean: true,
      routeResolution: 'repair',
    }, 'repair-1')).toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      edges: validEdges,
      hardClean: true,
      routeResolution: 'unknown',
    }, 'repair-1')).toBeNull();
  });
});
