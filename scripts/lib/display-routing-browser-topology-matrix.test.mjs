import { describe, expect, it } from 'vitest';

import {
  assertDisplayRoutingTopologyOperationGroupResult,
  assertDisplayRoutingTopologyOperationResult,
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

  it('requires edge removal to avoid full fallback in the topology operation group', () => {
    const result = (id, fallbackLevel) => ({ id, classification: 'topology', fallbackLevel });
    expect(assertDisplayRoutingTopologyOperationGroupResult([
      result('edge-add', 'full'),
      result('port-policy', 'full'),
      result('edge-remove', 'none'),
    ])).toBeUndefined();
    expect(() => assertDisplayRoutingTopologyOperationGroupResult([
      result('edge-add', 'none'),
      result('port-policy', 'none'),
      result('edge-remove', 'full'),
    ])).toThrow(/edge-remove operation did not remain incremental/);
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
});
