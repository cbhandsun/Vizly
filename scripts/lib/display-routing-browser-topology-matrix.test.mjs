import { describe, expect, it } from 'vitest';

import {
  assertDisplayRoutingTopologyOperationGroupResult,
  assertDisplayRoutingTopologyOperationResult,
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
  it('projects timeout diagnostics without route geometry or user content', () => {
    const projected = projectDisplayRoutingTopologyDiagnostics({
      routing: {
        stage: 'final-quality-rejected',
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
      result('port-policy', 'full'),
      result('edge-remove', 'none'),
      result('container-collapse', 'full'),
      result('container-expand', 'full'),
    ])).toBeUndefined();
    expect(() => assertDisplayRoutingTopologyOperationGroupResult([
      result('node-add', 'none'),
      result('node-remove', 'none'),
      result('edge-add', 'none'),
      result('port-policy', 'none'),
      result('edge-remove', 'full'),
      result('container-collapse', 'full'),
      result('container-expand', 'full'),
    ])).toThrow(/edge-remove operation did not remain incremental/);
    expect(() => assertDisplayRoutingTopologyOperationGroupResult([
      result('node-add', 'none'),
      result('node-remove', 'full'),
      result('edge-add', 'none'),
      result('port-policy', 'full'),
      result('edge-remove', 'none'),
      result('container-collapse', 'full'),
      result('container-expand', 'full'),
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
});
