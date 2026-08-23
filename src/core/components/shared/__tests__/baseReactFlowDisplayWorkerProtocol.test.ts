import { describe, expect, it, vi } from 'vitest';

import {
  parseDisplayEdgesWorkerRequest,
  parseDisplayEdgesWorkerResponse,
} from '../baseReactFlowDisplayWorkerProtocol';
import {
  DISPLAY_ROUTING_PHASE_TRACE_LIMIT,
  finalizeDisplayRoutingPhaseTrace,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from '../baseReactFlowDisplayRoutingTrace';
import { createDisplayRoutingIdentity } from '../baseReactFlowDisplayRoutingSession';
import { createDisplayRoutingPhaseRecorder } from '../baseReactFlowDisplayWorkerTraceRecorder';
import { createDisplayEdgesTransportResponse } from '../baseReactFlowDisplayWorkerScope';

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
  repairMode: 'bounded',
} as const;

describe('baseReactFlowDisplayWorkerProtocol', () => {
  it('compacts incremental transport to routing patches and rejects ambiguous carriers', () => {
    const sourceEdges = validRepairRequest.edges.map(edge => ({
      ...edge,
      data: { ...edge.data },
    }));
    const routedEdges = [{
      ...sourceEdges[0],
      data: { computedPath: [{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }] },
    }];
    const compact = createDisplayEdgesTransportResponse({
      requestId: 'incremental-transport',
      edges: routedEdges,
      hardClean: true,
      routeResolution: 'incremental-route',
      affectedEdgeCount: 1,
      fallbackLevel: 'none',
    }, sourceEdges);
    expect(compact.edges).toBeUndefined();
    expect(compact.routingPatches).toEqual([expect.objectContaining({
      id: 'edge',
      data: { computedPath: routedEdges[0].data.computedPath },
    })]);
    expect(parseDisplayEdgesWorkerResponse(compact, 'incremental-transport')).toMatchObject(compact);
    expect(parseDisplayEdgesWorkerResponse({
      ...compact,
      edges: routedEdges,
    }, 'incremental-transport')).toBeNull();
    expect(createDisplayEdgesTransportResponse({
      requestId: 'mismatch',
      edges: routedEdges,
      hardClean: true,
      routeResolution: 'incremental-route',
    }, [])).toHaveProperty('edges', routedEdges);
  });

  it('buffers incremental phase trace without publishing progress messages', () => {
    const phaseTrace: DisplayRoutingPhaseTrace[] = [];
    const publish = vi.fn();
    const record = createDisplayRoutingPhaseRecorder({
      requestId: 'incremental-1',
      phaseTrace,
      publish,
      publishProgress: false,
    });
    const trace: DisplayRoutingPhaseTrace = {
      phase: 'local-route',
      durationMs: 12,
      candidateCount: 4,
      changedEdgeCount: 4,
      resolution: 'accepted',
    };
    record(trace);
    expect(phaseTrace).toEqual([trace]);
    expect(publish).not.toHaveBeenCalled();
  });

  const boundedPhaseTrace = Array.from(
    { length: DISPLAY_ROUTING_PHASE_TRACE_LIMIT },
    () => ({
      phase: 'quality-crossing-global-refine',
      durationMs: 1,
      candidateCount: 1,
      changedEdgeCount: 0,
      resolution: 'skip',
    } as const),
  );

  it('derives bounded parent and exclusive phase metrics without graph data', () => {
    const traces = finalizeDisplayRoutingPhaseTrace([{
      phase: 'quality',
      durationMs: 100,
      candidateCount: 14,
      changedEdgeCount: 14,
      resolution: 'accepted',
    }, {
      phase: 'quality-polish',
      durationMs: 60,
      candidateCount: 14,
      changedEdgeCount: 3,
      evaluationCount: 8,
      cacheHitCount: 2,
      scannedNodeCount: 12,
      scannedEdgePairCount: 91,
      resolution: 'accepted',
    }]);
    expect(traces).toEqual([expect.objectContaining({
      phase: 'quality',
      exclusiveDurationMs: 40,
    }), expect.objectContaining({
      phase: 'quality-polish',
      parentPhase: 'quality',
      exclusiveDurationMs: 60,
      evaluationCount: 8,
      cacheHitCount: 2,
    })]);
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'route-trace',
      edges: validRepairRequest.edges,
      hardClean: true,
      routeResolution: 'full-route',
      phaseTrace: traces,
    }, 'route-trace')).not.toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'route-trace',
      edges: validRepairRequest.edges,
      hardClean: true,
      routeResolution: 'full-route',
      phaseTrace: [{ ...traces[0], exclusiveDurationMs: 101 }],
    }, 'route-trace')).toBeNull();
  });

  it('records the bounded materialized candidate count discovered at phase completion', () => {
    const traces: DisplayRoutingPhaseTrace[] = [];
    startDisplayRoutingPhaseTrace({
      phase: 'local-reconnect-seed',
      candidateCount: 4,
      onTrace: trace => traces.push(trace),
    }).finish('accepted', 1, {
      candidateCount: 180,
      evaluationCount: 96,
      cacheHitCount: 84,
    });

    expect(traces).toEqual([expect.objectContaining({
      phase: 'local-reconnect-seed',
      parentPhase: 'local-route',
      candidateCount: 180,
      evaluationCount: 96,
      cacheHitCount: 84,
    })]);
  });

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
        classification: 'geometry',
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
      changeSet: {
        ...incrementalRequest.changeSet,
        classification: 'style-only',
      },
    })).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...incrementalRequest,
      changeSet: {
        ...incrementalRequest.changeSet,
        classification: 'topology',
      },
    })).toBeNull();
    const { classification: _classification, ...legacyChangeSet } = incrementalRequest.changeSet;
    expect(parseDisplayEdgesWorkerRequest({
      ...incrementalRequest,
      changeSet: legacyChangeSet,
    })).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...incrementalRequest,
      baselineInputGeometryDigest: 'invalid',
    })).toBeNull();
    const sessionOnlyRequest = {
      ...incrementalRequest,
      baselineNodes: undefined,
      baselineSourceEdges: undefined,
      baselinePatches: undefined,
    };
    const baselineSessionRef = {
      sessionId: 'display-session-v1:1',
      identity: createDisplayRoutingIdentity(
        incrementalRequest.baselineInputSignature,
        incrementalRequest.baselineInputGeometryDigest,
      ),
      outputRouteSignature: incrementalRequest.baselineOutputRouteSignature,
    };
    expect(parseDisplayEdgesWorkerRequest({
      ...sessionOnlyRequest,
      baselineSessionRef,
    })).toMatchObject({
      operation: 'incremental-route',
      baselineSessionRef,
    });
    expect(parseDisplayEdgesWorkerRequest(sessionOnlyRequest)).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...sessionOnlyRequest,
      baselineSessionRef: { ...baselineSessionRef, sessionId: '../escape' },
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
      repairMode: 'bounded',
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
      repairMode: 'bounded',
    })).toBeNull();
  });

  it('rejects missing or unknown repair modes at the worker boundary', () => {
    const { repairMode: _repairMode, ...missingMode } = validRepairRequest;
    expect(parseDisplayEdgesWorkerRequest(missingMode)).toBeNull();
    expect(parseDisplayEdgesWorkerRequest({
      ...validRepairRequest,
      repairMode: 'unbounded',
    })).toBeNull();
  });

  it('rejects conflicting, non-finite, cyclic, and forged response variants', () => {
    const validEdges = validRepairRequest.edges;
    const hardReport = {
      candidate: 'polished',
      hardClean: true,
      obstacleHits: 0,
      terminalsAttached: true,
      terminalsAnchored: true,
      minimumClearanceViolations: 0,
      minimumClearanceViolationEdgeIds: [],
      commercialClearanceViolations: 0,
      quality: {
        nonOrthogonalSegments: 0,
        strictCrossings: 0,
        reverseOverlap: 0,
        unrelatedOverlap: 0,
        relatedOverlap: 0,
        unexplainedRelatedOverlap: 0,
        shortEndpointStubs: 0,
        tinyInteriorDoglegs: 0,
        hairpins: 0,
        backtrackPenalty: 0,
        detourPenalty: 0,
        bends: 0,
        totalLength: 100,
      },
    } as const;
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      edges: validEdges,
      hardClean: true,
      hardReport,
      routeResolution: 'repair',
      workerDurationMs: 12.5,
    }, 'repair-1')).toMatchObject({ hardReport, workerDurationMs: 12.5 });
    for (const workerDurationMs of [Number.NaN, -1, 600_001, '12']) {
      expect(parseDisplayEdgesWorkerResponse({
        requestId: 'repair-1',
        edges: validEdges,
        hardClean: true,
        hardReport,
        routeResolution: 'repair',
        workerDurationMs,
      }, 'repair-1')).toBeNull();
    }
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      edges: validEdges,
      hardClean: true,
      hardReport: {
        ...hardReport,
        minimumClearanceViolationEdgeIds: ['x'.repeat(20_001)],
      },
      routeResolution: 'repair',
    }, 'repair-1')).toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      edges: validEdges,
      hardClean: true,
      hardReport: {
        ...hardReport,
        commercialClearanceViolations: 1,
      },
      routeResolution: 'repair',
    }, 'repair-1')).toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      edges: validEdges,
      hardClean: true,
      hardReport: {
        ...hardReport,
        commercialClearanceViolations: Number.POSITIVE_INFINITY,
      },
      routeResolution: 'repair',
    }, 'repair-1')).toBeNull();
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
      }, {
        phase: 'seed-interactive-route',
        durationMs: 8.5,
        candidateCount: 1,
        changedEdgeCount: 1,
        resolution: 'accepted',
      }, {
        phase: 'seed-interactive-terminal-cleanup',
        durationMs: 1.25,
        candidateCount: 1,
        changedEdgeCount: 0,
        resolution: 'skip',
      }, {
        phase: 'quality-polish-candidates',
        durationMs: 4,
        candidateCount: 1,
        changedEdgeCount: 1,
        resolution: 'accepted',
      }, {
        phase: 'quality-polish-selection',
        durationMs: 3,
        candidateCount: 2,
        changedEdgeCount: 1,
        resolution: 'accepted',
      }, {
        phase: 'quality-polish-local',
        durationMs: 1,
        candidateCount: 1,
        changedEdgeCount: 0,
        resolution: 'skip',
      }, {
        phase: 'quality-polish-detached',
        durationMs: 1,
        candidateCount: 1,
        changedEdgeCount: 0,
        resolution: 'skip',
      }, {
        phase: 'quality-polish-endpoint',
        durationMs: 1,
        candidateCount: 1,
        changedEdgeCount: 1,
        resolution: 'accepted',
      }, {
        phase: 'quality-polish-micro',
        durationMs: 1,
        candidateCount: 1,
        changedEdgeCount: 0,
        resolution: 'skip',
      }],
    }, 'route-1')).not.toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'route-1',
      edges: validEdges,
      hardClean: true,
      routeResolution: 'full-route',
      phaseTrace: boundedPhaseTrace,
    }, 'route-1')).not.toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'route-1',
      edges: validEdges,
      hardClean: true,
      routeResolution: 'full-route',
      phaseTrace: [...boundedPhaseTrace, boundedPhaseTrace[0]],
    }, 'route-1')).toBeNull();
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
