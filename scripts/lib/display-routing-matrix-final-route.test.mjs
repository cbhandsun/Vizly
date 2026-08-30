import { describe, expect, it } from 'vitest';
import { resolveDisplayRoutingFinalRouteSnapshot } from './display-routing-matrix-final-route.mjs';

const request = {
  requestId: 'layout:7',
  nodes: [{ id: 'a' }, { id: 'b' }],
  edges: [{ id: 'a-b' }],
};
const committedShape = { nodeCount: 2, edgeCount: 1 };

it('accepts a hard-clean Worker response for the expected layout request', () => {
  const response = {
    requestId: 'layout:7',
    hardClean: true,
    hardReport: { hardClean: true },
    edges: [{ id: 'a-b', data: { computedPath: [[0, 0], [10, 0]] } }],
  };
  expect(resolveDisplayRoutingFinalRouteSnapshot({
    routing: {
      stage: 'final-applied', requestId: 'layout:7', renderAuthorityStatus: 'accepted',
      ...committedShape,
    },
    requests: [request],
    responses: [response],
    currentEdges: [],
    renderedEdgeCount: 1,
    expectedRequestPrefix: 'layout:',
  })?.response).toBe(response);
});

it('uses captured Worker and request ordinals when one job id has multiple attempts', () => {
  const firstRequest = {
    ...request,
    __browserWorkerInstanceId: 'worker-1',
    __browserRequestOrdinal: 4,
  };
  const committedRequest = {
    ...request,
    nodes: [{ id: 'a' }, { id: 'b' }],
    __browserWorkerInstanceId: 'worker-1',
    __browserRequestOrdinal: 5,
  };
  const response = {
    requestId: 'layout:7',
    hardClean: true,
    hardReport: { hardClean: true },
    edges: [{ id: 'a-b' }],
    __browserWorkerInstanceId: 'worker-1',
    __browserRequestOrdinal: 5,
  };
  const result = resolveDisplayRoutingFinalRouteSnapshot({
    routing: {
      stage: 'final-applied', requestId: 'layout:7', renderAuthorityStatus: 'accepted',
      ...committedShape,
    },
    requests: [firstRequest, committedRequest],
    responses: [response],
    currentEdges: [],
    renderedEdgeCount: 1,
    expectedRequestPrefix: 'layout:',
  });
  expect(result?.request).toBe(committedRequest);
});

it('reconstructs a candidate-validation hit that commits without a Worker response', () => {
  const currentEdges = [{ id: 'a-b', data: { computedPath: [[0, 0], [10, 0]] } }];
  const result = resolveDisplayRoutingFinalRouteSnapshot({
    routing: {
      stage: 'final-applied',
      requestId: 'layout:7',
      renderAuthorityStatus: 'accepted',
      workerResolution: 'repaired-candidate',
      phaseProgressTrace: [{ phase: 'candidate-validation', resolution: 'hit' }],
      ...committedShape,
    },
    requests: [request],
    responses: [],
    currentEdges,
    renderedEdgeCount: 1,
    expectedRequestPrefix: 'layout:',
  });
  expect(result?.request).toBe(request);
  expect(result?.response).toMatchObject({
    source: 'final-applied-candidate',
    resolution: 'repaired-candidate',
    edges: currentEdges,
  });
});

it('reconstructs a newer trusted runtime cache commit without a Worker request', () => {
  const currentNodes = [{ id: 'a' }, { id: 'b' }];
  const currentEdges = [{ id: 'a-b', data: { computedPath: [[0, 0], [10, 0]] } }];
  const result = resolveDisplayRoutingFinalRouteSnapshot({
    routing: {
      stage: 'final-applied',
      requestId: 'layout:9',
      renderAuthorityStatus: 'accepted',
      cacheTrustLevel: 'runtime-committed',
      layoutTransactionJobId: 9,
      layoutTransactionStatus: 'committed',
      ...committedShape,
    },
    requests: [],
    responses: [],
    currentNodes,
    currentEdges,
    renderedEdgeCount: 1,
    expectedRequestPrefix: 'layout:',
    minimumExclusiveLayoutJobId: 8,
  });
  expect(result).toMatchObject({
    request: { source: 'runtime-committed-cache', nodes: currentNodes },
    response: {
      source: 'runtime-committed-cache',
      routeResolution: 'runtime-committed-cache',
      edges: currentEdges,
    },
  });
});

describe('candidate-only completion is fail closed', () => {
  it('does not pair a target-layout response with an older committed node shape', () => {
    expect(resolveDisplayRoutingFinalRouteSnapshot({
      routing: {
        stage: 'final-applied',
        requestId: 'layout:7',
        renderAuthorityStatus: 'accepted',
        ...committedShape,
        nodeCount: 1,
        edgeCount: 1,
      },
      requests: [{
        ...request,
        requestId: 'layout:7',
        nodes: [{ id: 'source' }, { id: 'target' }],
      }],
      responses: [{
        requestId: 'layout:7',
        hardClean: true,
        hardReport: { hardClean: true },
        edges: [{ id: 'a-b' }],
      }],
      currentEdges: [{ id: 'a-b' }],
      renderedEdgeCount: 1,
      expectedRequestPrefix: 'layout:',
    })).toBeNull();
  });

  it('does not pair a newer prefixed response with an older final-applied request', () => {
    expect(resolveDisplayRoutingFinalRouteSnapshot({
      routing: {
        stage: 'final-applied',
        requestId: 'layout:7',
        renderAuthorityStatus: 'accepted',
      },
      requests: [request, { ...request, requestId: 'layout:8:candidate-repair' }],
      responses: [{
        requestId: 'layout:8:candidate-repair',
        hardClean: true,
        hardReport: { hardClean: true },
        edges: [{ id: 'a-b' }],
      }],
      currentEdges: [{ id: 'a-b' }],
      renderedEdgeCount: 1,
      expectedRequestPrefix: 'layout:',
    })).toBeNull();
  });

  it('does not fall back to another attempt when captured request identity is missing', () => {
    expect(resolveDisplayRoutingFinalRouteSnapshot({
      routing: {
        stage: 'final-applied', requestId: 'layout:7', renderAuthorityStatus: 'accepted',
        ...committedShape,
      },
      requests: [{
        ...request,
        __browserWorkerInstanceId: 'worker-1',
        __browserRequestOrdinal: 1,
      }],
      responses: [{
        requestId: 'layout:7',
        hardClean: true,
        hardReport: { hardClean: true },
        edges: [{ id: 'a-b' }],
        __browserWorkerInstanceId: 'worker-2',
        __browserRequestOrdinal: 2,
      }],
      currentEdges: [{ id: 'a-b' }],
      renderedEdgeCount: 1,
      expectedRequestPrefix: 'layout:',
    })).toBeNull();
  });

  it.each([
    ['no validation hit', {
      stage: 'final-applied', requestId: 'layout:7', renderAuthorityStatus: 'accepted', phaseProgressTrace: [],
    }, 1],
    ['edge count mismatch', {
      stage: 'final-applied',
      requestId: 'layout:7',
      renderAuthorityStatus: 'accepted',
      phaseProgressTrace: [{ phase: 'candidate-validation', resolution: 'hit' }],
    }, 0],
    ['not final', {
      stage: 'worker-routing',
      requestId: 'layout:7',
      renderAuthorityStatus: 'accepted',
      phaseProgressTrace: [{ phase: 'candidate-validation', resolution: 'hit' }],
    }, 1],
  ])('rejects %s', (_label, routing, renderedEdgeCount) => {
    expect(resolveDisplayRoutingFinalRouteSnapshot({
      routing,
      requests: [request],
      responses: [],
      currentEdges: [{ id: 'a-b' }],
      renderedEdgeCount,
      expectedRequestPrefix: 'layout:',
    })).toBeNull();
  });

  it.each([
    ['stale layout job', 8, 'runtime-committed', 8],
    ['untrusted cache', 9, 'external-candidate', 8],
    ['missing job boundary', 9, 'runtime-committed', undefined],
  ])('rejects a cache-only completion with %s', (
    _label,
    layoutTransactionJobId,
    cacheTrustLevel,
    minimumExclusiveLayoutJobId,
  ) => {
    expect(resolveDisplayRoutingFinalRouteSnapshot({
      routing: {
        stage: 'final-applied',
        requestId: 'layout:9',
        renderAuthorityStatus: 'accepted',
        layoutTransactionStatus: 'committed',
        layoutTransactionJobId,
        cacheTrustLevel,
        ...committedShape,
      },
      requests: [],
      responses: [],
      currentNodes: request.nodes,
      currentEdges: request.edges,
      renderedEdgeCount: 1,
      expectedRequestPrefix: 'layout:',
      minimumExclusiveLayoutJobId,
    })).toBeNull();
  });
});
