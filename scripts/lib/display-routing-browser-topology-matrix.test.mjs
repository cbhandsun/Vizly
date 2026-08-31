import { describe, expect, it } from 'vitest';

import {
  assertDisplayRoutingTopologyOperationGroupResult,
  assertDisplayRoutingTopologyOperationResult,
  countDisplayRoutingTopologyFinalResponses,
  displayRoutingCommittedEdgesMatchWorkerPatches,
  findDisplayRoutingTopologyFinalResponse,
  displayRoutingTopologyRequestMatchesResponse,
  displayRoutingTopologyRenderIsCommitted,
  displayRoutingTopologyTransactionIsCommitted,
  projectDisplayRoutingTopologyAssertionDiagnostics,
  projectDisplayRoutingTopologyDiagnostics,
} from './display-routing-browser-topology-matrix.mjs';

const topologyCase = Object.freeze({
  id: 'edge-add',
  classification: 'topology',
  reason: 'edge-add',
  edgeDelta: 1,
});

const validResult = overrides => ({
  requestOperation: 'incremental-route',
  capturedRequestCount: 1,
  capturedResponseCount: 1,
  changeSet: { classification: 'topology', reason: 'edge-add' },
  requestEdgeCount: 15,
  responseEdgeCount: 15,
  renderedEdgeCount: 15,
  response: {
    hardClean: true,
    hardReport: { hardClean: true },
    fallbackLevel: 'full',
  },
  routing: {
    workerStartCount: 8,
    workerAbortCount: 2,
    fallbackLevel: 'full',
    outputRouteSignature: 'route-v2:15:64:abcd',
  },
  ...overrides,
});

const assertValid = result => assertDisplayRoutingTopologyOperationResult({
  operationCase: topologyCase,
  result,
  counterBaseline: { workerStartCount: 7, workerAbortCount: 2 },
  baselineEdgeCount: 14,
});

describe('display routing browser topology matrix', () => {
  it('waits for the committed render authority after the final routing state is published', () => {
    expect(displayRoutingTopologyRenderIsCommitted({
      stage: 'final-applied',
      renderAuthorityStatus: 'missing-commit',
      outputRouteSignature: 'route-v2:14:64:abcd',
    })).toBe(false);
    expect(displayRoutingTopologyRenderIsCommitted({
      stage: 'final-applied',
      renderAuthorityStatus: 'accepted',
      outputRouteSignature: 'route-v2:14:64:abcd',
    })).toBe(true);
    expect(displayRoutingTopologyRenderIsCommitted({
      stage: 'worker-response',
      renderAuthorityStatus: 'accepted',
      outputRouteSignature: 'route-v2:14:64:abcd',
    })).toBe(false);
  });

  it('pairs repeated request ids by captured attempt and Worker identity', () => {
    const request = {
      requestId: 'route-request',
      __browserRequestOrdinal: 4,
      __browserAttemptOrdinal: 2,
      __browserWorkerInstanceId: 'worker-2',
    };
    expect(displayRoutingTopologyRequestMatchesResponse(request, {
      ...request,
      __browserResponseOrdinal: 9,
    })).toBe(true);
    expect(displayRoutingTopologyRequestMatchesResponse(request, {
      ...request,
      __browserRequestOrdinal: 3,
    })).toBe(false);
    expect(displayRoutingTopologyRequestMatchesResponse(request, {
      ...request,
      __browserAttemptOrdinal: 1,
    })).toBe(false);
    expect(displayRoutingTopologyRequestMatchesResponse(request, {
      ...request,
      __browserWorkerInstanceId: 'worker-1',
    })).toBe(false);
  });

  it('keeps the complete final response authoritative when later phase messages arrive', () => {
    const request = {
      requestId: 'route-request',
      __browserRequestOrdinal: 4,
      __browserAttemptOrdinal: 2,
      __browserWorkerInstanceId: 'worker-2',
    };
    const finalResponse = {
      ...request,
      hardClean: true,
      hardReport: { hardClean: true },
      routingPatches: [],
    };
    const latePhase = { ...request, phaseTrace: [{ phase: 'session-commit' }] };

    expect(findDisplayRoutingTopologyFinalResponse(request, [finalResponse, latePhase]))
      .toBe(finalResponse);
    expect(countDisplayRoutingTopologyFinalResponses(request, [finalResponse, latePhase])).toBe(1);
    expect(countDisplayRoutingTopologyFinalResponses(
      request,
      [finalResponse, latePhase, structuredClone(finalResponse)],
    )).toBe(2);
    expect(findDisplayRoutingTopologyFinalResponse(request, [latePhase])).toBeNull();
    expect(findDisplayRoutingTopologyFinalResponse(request, null)).toBeNull();
    expect(countDisplayRoutingTopologyFinalResponses(request, null)).toBe(0);
  });

  it('accepts only an exactly signed trusted committed reuse after request evidence is cleared', () => {
    const outputRouteSignature = 'route-v2:14:64:0123456789abcdef';
    const request = {
      requestId: 'route-request',
      __browserRequestOrdinal: 4,
      __browserAttemptOrdinal: 1,
      __browserWorkerInstanceId: 'worker-1',
    };
    const response = {
      requestId: request.requestId,
      __browserRequestOrdinal: request.__browserRequestOrdinal,
      __browserAttemptOrdinal: request.__browserAttemptOrdinal,
      __browserWorkerInstanceId: request.__browserWorkerInstanceId,
      outputRouteSignature,
      commitReceipt: { outputRouteSignature },
    };
    expect(displayRoutingTopologyTransactionIsCommitted({
      requestId: request.requestId,
      outputRouteSignature,
    }, request, response)).toBe(true);
    expect(displayRoutingTopologyTransactionIsCommitted({
      requestId: undefined,
      cacheTrustLevel: 'runtime-committed',
      outputRouteSignature,
    }, request, response)).toBe(true);
    expect(displayRoutingTopologyTransactionIsCommitted({
      requestId: undefined,
      cacheTrustLevel: 'runtime-committed',
      outputRouteSignature: 'route-v2:14:64:fedcba9876543210',
    }, request, response)).toBe(false);
    expect(displayRoutingTopologyTransactionIsCommitted({
      requestId: undefined,
      cacheTrustLevel: 'unverified',
      outputRouteSignature,
    }, request, response)).toBe(false);
    expect(displayRoutingTopologyTransactionIsCommitted({
      requestId: undefined,
      cacheTrustLevel: 'runtime-committed',
      outputRouteSignature,
    }, request, { ...response, commitReceipt: undefined })).toBe(false);
  });

  it('waits until React Flow has applied routing handles and paths from the Worker patch', () => {
    const edge = {
      id: 'edge', source: 'source', target: 'target', type: 'stablePath',
      sourceHandle: 'right', targetHandle: 'left',
      data: { computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }] },
    };
    const patch = structuredClone(edge);

    expect(displayRoutingCommittedEdgesMatchWorkerPatches([edge], [patch])).toBe(true);
    expect(displayRoutingCommittedEdgesMatchWorkerPatches([{
      ...edge,
      sourceHandle: 'top',
    }], [patch])).toBe(false);
    expect(displayRoutingCommittedEdgesMatchWorkerPatches([{
      ...edge,
      data: { computedPath: [{ x: 100, y: 30 }, { x: 100, y: 90 }] },
    }], [patch])).toBe(false);
    expect(displayRoutingCommittedEdgesMatchWorkerPatches([edge], [])).toBe(false);
    expect(displayRoutingCommittedEdgesMatchWorkerPatches(null, [patch])).toBe(false);
  });

  it('projects timeout diagnostics without route geometry or user content', () => {
    const projected = projectDisplayRoutingTopologyDiagnostics({
      routing: {
        stage: 'final-quality-rejected',
        renderAuthorityStatus: 'missing-commit',
        requestId: 'secret-request-id',
        outputRouteSignature: 'secret-route-signature',
      },
      requests: [{
        requestId: 'secret-request-id',
        operation: 'incremental-route',
        changeSet: {
          classification: 'geometry',
          reason: 'unknown',
          changedNodeIds: ['customer-node-name'],
          changedEdgeIds: ['customer-edge-name'],
        },
        nodes: [{ id: 'customer-node-name', data: { label: 'private label' } }],
        edges: [{ id: 'customer-edge-name', computedPath: 'M 1 2 L 3 4' }],
        mutableEdgeIds: ['customer-edge-name'],
      }],
      responses: [{
        requestId: 'secret-request-id',
        hardClean: false,
        edges: [{ id: 'customer-edge-name', computedPath: 'M 1 2 L 3 4' }],
        hardReport: { hardClean: false, obstacleHits: 1, quality: { strictCrossings: 2 } },
      }],
    });
    const serialized = JSON.stringify(projected);

    expect(projected.requests[0]).toMatchObject({
      changedNodeCount: 1,
      changedEdgeCount: 1,
      mutableEdgeCount: 1,
      nodeCount: 1,
      edgeCount: 1,
      hasRequestId: true,
    });
    expect(projected.routing.renderAuthorityStatus).toBe('missing-commit');
    expect(projected.responses[0]).toMatchObject({
      hardClean: false,
      patchCount: 1,
      hasRequestId: true,
      hardReport: { obstacleHits: 1, quality: { strictCrossings: 2 } },
    });
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('customer');
    expect(serialized).not.toContain('private label');
    expect(serialized).not.toContain('M 1 2');
  });

  it('projects assertion diagnostics without captured route payloads', () => {
    const projected = projectDisplayRoutingTopologyAssertionDiagnostics({
      operationCase: topologyCase,
      result: validResult({
        changeSet: {
          classification: 'topology',
          reason: 'edge-add',
          changedNodeIds: ['private-node'],
          changedEdgeIds: ['private-edge'],
        },
        request: {
          mutableEdgeIds: ['private-edge'],
          edges: [{ id: 'private-edge', data: { computedPath: 'M 1 2 L 3 4' } }],
        },
        response: {
          ...validResult().response,
          edges: [{ id: 'private-edge', label: 'private label' }],
        },
      }),
      counterBaseline: { workerStartCount: 1, workerAbortCount: 0 },
      baselineEdgeCount: 14,
    });
    const serialized = JSON.stringify(projected);

    expect(projected.result.changeSet).toMatchObject({
      changedNodeCount: 1,
      changedEdgeCount: 1,
    });
    expect(serialized).not.toContain('private');
    expect(serialized).not.toContain('M 1 2');
  });

  it('accepts hard-clean topology operations with or without in-job fallback', () => {
    expect(assertValid(validResult())).toBeUndefined();
    expect(assertValid(validResult({
      response: { ...validResult().response, fallbackLevel: 'none' },
      routing: { ...validResult().routing, fallbackLevel: 'none' },
    }))).toBeUndefined();
  });

  it('rejects stale classification or non-atomic Worker delivery', () => {
    expect(() => assertValid(validResult({
      changeSet: { classification: 'geometry', reason: 'node-resize' },
    }))).toThrow(/misclassified/);
    expect(() => assertValid(validResult({ capturedRequestCount: 2 })))
      .toThrow(/one atomic Worker transaction/);
    expect(() => assertValid(validResult({ capturedResponseCount: 2 })))
      .toThrow(/one atomic Worker transaction/);
    expect(() => assertValid(validResult({
      routing: { ...validResult().routing, workerAbortCount: 3 },
    }))).toThrow(/one atomic Worker transaction/);
  });

  it('rejects partial geometry and inconsistent topology fallback reporting', () => {
    expect(() => assertValid(validResult({ renderedEdgeCount: 14 })))
      .toThrow(/hard-clean complete route/);
    expect(() => assertValid(validResult({
      response: { ...validResult().response, fallbackLevel: 'none' },
    }))).toThrow(/invalid fallback level/);
    expect(() => assertValid(validResult({
      response: { ...validResult().response, fallbackLevel: 'partial' },
      routing: { ...validResult().routing, fallbackLevel: 'partial' },
    }))).toThrow(/invalid fallback level/);
  });

  it('requires safe removal and edge-add operations to avoid full fallback', () => {
    const result = (id, fallbackLevel) => ({ id, classification: 'topology', fallbackLevel });
    expect(assertDisplayRoutingTopologyOperationGroupResult([
      result('node-add', 'none'),
      result('node-remove', 'none'),
      result('edge-add', 'none'),
      result('port-policy', 'none'),
      result('edge-remove', 'none'),
      result('container-collapse', 'full'),
      result('container-expand', 'none'),
    ])).toBeUndefined();
    expect(() => assertDisplayRoutingTopologyOperationGroupResult([
      result('node-add', 'none'),
      result('node-remove', 'none'),
      result('edge-add', 'none'),
      result('port-policy', 'none'),
      result('edge-remove', 'full'),
      result('container-collapse', 'full'),
      result('container-expand', 'none'),
    ])).toThrow(/edge-remove operation did not remain incremental/);
    expect(() => assertDisplayRoutingTopologyOperationGroupResult([
      result('node-add', 'none'),
      result('node-remove', 'full'),
      result('edge-add', 'none'),
      result('port-policy', 'none'),
      result('edge-remove', 'none'),
      result('container-collapse', 'full'),
      result('container-expand', 'none'),
    ])).toThrow(/node-remove operation did not remain incremental/);
  });

  it('requires a hard-clean collapsed container to route only visible edges', () => {
    expect(assertDisplayRoutingTopologyOperationResult({
      operationCase: {
        id: 'container-collapse',
        classification: 'topology',
        reason: 'container-change',
        edgeDelta: 0,
        expectedRoutableEdgeCount: 3,
      },
      result: validResult({
        changeSet: { classification: 'topology', reason: 'container-change' },
        requestEdgeCount: 3,
        responseEdgeCount: 3,
        renderedEdgeCount: 3,
      }),
      counterBaseline: { workerStartCount: 7, workerAbortCount: 2 },
      baselineEdgeCount: 14,
    })).toBeUndefined();
  });

  it('allows a geometry resize to remain local', () => {
    const operationCase = {
      id: 'node-resize',
      classification: 'geometry',
      reason: 'node-resize',
      edgeDelta: 0,
    };
    const result = validResult({
      changeSet: { classification: 'geometry', reason: 'node-resize' },
      requestEdgeCount: 14,
      responseEdgeCount: 14,
      renderedEdgeCount: 14,
      response: { ...validResult().response, fallbackLevel: 'none' },
      routing: { ...validResult().routing, fallbackLevel: 'none' },
    });
    expect(assertDisplayRoutingTopologyOperationResult({
      operationCase,
      result,
      counterBaseline: { workerStartCount: 7, workerAbortCount: 2 },
      baselineEdgeCount: 14,
    })).toBeUndefined();
  });

  it('requires a multi-node drag to keep the exact selected set and bounded closure', () => {
    const operationCase = {
      id: 'multi-node-move',
      classification: 'geometry',
      reason: 'node-drag',
      edgeDelta: 0,
      expectedChangedNodeIds: ['l-oms', 'wms'],
      maximumMutableEdgeCount: 8,
    };
    const result = validResult({
      changeSet: {
        classification: 'geometry',
        reason: 'node-drag',
        changedNodeIds: ['l-oms', 'wms'],
      },
      request: { mutableEdgeIds: Array.from({ length: 8 }, (_, index) => `edge-${index}`) },
      requestEdgeCount: 14,
      responseEdgeCount: 14,
      renderedEdgeCount: 14,
      response: { ...validResult().response, fallbackLevel: 'none' },
      routing: { ...validResult().routing, fallbackLevel: 'none' },
    });
    const assertMultiNode = overrides => assertDisplayRoutingTopologyOperationResult({
      operationCase,
      result: { ...result, ...overrides },
      counterBaseline: { workerStartCount: 7, workerAbortCount: 2 },
      baselineEdgeCount: 14,
    });

    expect(assertMultiNode()).toBeUndefined();
    expect(() => assertMultiNode({
      changeSet: { ...result.changeSet, changedNodeIds: ['wms'] },
    })).toThrow(/unexpected node set/);
    expect(() => assertMultiNode({
      request: { mutableEdgeIds: Array.from({ length: 9 }, (_, index) => `edge-${index}`) },
    })).toThrow(/mutable-edge budget/);
  });

  it('requires a compound subtree move to remain incremental', () => {
    const operationCase = {
      id: 'compound-subtree-move',
      classification: 'geometry',
      reason: 'unknown',
      edgeDelta: 0,
      expectedChangedNodeIds: ['container', 'descendant'],
      maximumMutableEdgeCount: 2,
      requiredFallbackLevel: 'none',
    };
    const result = validResult({
      changeSet: {
        classification: 'geometry',
        reason: 'unknown',
        changedNodeIds: ['container', 'descendant'],
      },
      request: { mutableEdgeIds: ['internal', 'boundary'] },
      requestEdgeCount: 14,
      responseEdgeCount: 14,
      renderedEdgeCount: 14,
      response: { ...validResult().response, fallbackLevel: 'none' },
      routing: { ...validResult().routing, fallbackLevel: 'none' },
    });
    const assertCompound = overrides => assertDisplayRoutingTopologyOperationResult({
      operationCase,
      result: { ...result, ...overrides },
      counterBaseline: { workerStartCount: 7, workerAbortCount: 2 },
      baselineEdgeCount: 14,
    });

    expect(assertCompound()).toBeUndefined();
    expect(() => assertCompound({
      response: { ...result.response, fallbackLevel: 'full' },
      routing: { ...result.routing, fallbackLevel: 'full' },
    })).toThrow(/fallback budget/);
  });
});
