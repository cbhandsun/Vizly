import { describe, expect, it } from 'vitest';
import {
  findDisplayRoutingRequestForResponse,
  isDisplayRoutingWorkerSessionContinuous,
  resolveDisplayRoutingFinalRouteSnapshot,
} from './display-routing-matrix-final-route.mjs';

const request = {
  requestId: 'layout:7',
  nodes: [{ id: 'a' }, { id: 'b' }],
  edges: [{ id: 'a-b' }],
};
const committedShape = { nodeCount: 2, edgeCount: 1 };

describe('new layout completion requires the whole transaction', () => {
  const options = (status, jobId = 7, responses = []) => ({
    routing: { ...committedShape, stage: 'final-applied', requestId: 'layout:7',
      renderAuthorityStatus: 'accepted', layoutTransactionJobId: jobId,
      layoutTransactionStatus: status,
      phaseProgressTrace: [{ phase: 'candidate-validation', resolution: 'hit' }] },
    requests: [request], responses, currentEdges: request.edges,
    renderedEdgeCount: 1, expectedRequestPrefix: 'layout:', minimumExclusiveLayoutJobId: 6,
  });
  const response = { requestId: 'layout:7', edges: request.edges,
    hardClean: true, hardReport: { hardClean: true } };
  const modes = [{ mode: 'candidate', responses: [] }, { mode: 'worker', responses: [response] }];

  it.each(modes)('does not accept $mode geometry before selection/transaction commit', ({ mode, responses }) => {
    for (const status of ['running', 'failed', undefined, null]) {
      expect(resolveDisplayRoutingFinalRouteSnapshot(options(status, 7, responses))).toBeNull();
    }
    const result = resolveDisplayRoutingFinalRouteSnapshot(options('committed', 7, responses));
    expect(result).not.toBeNull();
    if (mode === 'worker') expect(result.response).toBe(response);
    else expect(result.response.source).toBe('final-applied-candidate');
  });

  it.each(modes)('rejects old or mismatched transactions even with a clean $mode route', ({ responses }) => {
    for (const jobId of [6, 5, 8, NaN, Infinity, -1, 6.5, undefined]) {
      const input = options('committed', 7, responses);
      input.routing.layoutTransactionJobId = jobId;
      expect(resolveDisplayRoutingFinalRouteSnapshot(input)).toBeNull();
    }
    for (const boundary of [null, NaN, Infinity, -1, 6.5, '6']) {
      expect(resolveDisplayRoutingFinalRouteSnapshot({
        ...options('committed', 7, responses), minimumExclusiveLayoutJobId: boundary,
      })).toBeNull();
    }
  });
});

it('pairs reused request ids by request ordinal and Worker instance', () => {
  const first = {
    ...request,
    __browserWorkerInstanceId: 'worker-1',
    __browserRequestOrdinal: 7,
    __browserCapturedAt: 100,
  };
  const second = {
    ...request,
    __browserWorkerInstanceId: 'worker-1',
    __browserRequestOrdinal: 8,
    __browserCapturedAt: 200,
  };
  const response = {
    requestId: request.requestId,
    __browserWorkerInstanceId: 'worker-1',
    __browserRequestOrdinal: 7,
    __browserCapturedAt: 150,
  };

  expect(findDisplayRoutingRequestForResponse([first, second], response)).toBe(first);
  expect(findDisplayRoutingRequestForResponse([first, second], {
    ...response,
    __browserWorkerInstanceId: 'worker-2',
  })).toBeNull();
});

it('distinguishes a bounded follow-up route from a duplicate Worker instance', () => {
  const before = {
    request: { __browserWorkerInstanceId: 'worker-1' },
    routing: { workerStartCount: 1 },
  };
  expect(isDisplayRoutingWorkerSessionContinuous(before, {
    request: { __browserWorkerInstanceId: 'worker-1' },
    routing: { workerStartCount: 2 },
  })).toBe(true);
  expect(isDisplayRoutingWorkerSessionContinuous(before, {
    request: { __browserWorkerInstanceId: 'worker-2' },
    routing: { workerStartCount: 2 },
  })).toBe(false);
  expect(isDisplayRoutingWorkerSessionContinuous(before, {
    request: { __browserWorkerInstanceId: 'worker-1' },
    routing: { workerStartCount: 3 },
  })).toBe(false);
  expect(isDisplayRoutingWorkerSessionContinuous(before, {
    request: {}, routing: { workerStartCount: 1 },
  })).toBe(false);
});

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

it('accepts the committed layout response after a matching display route replaces global debug identity', () => {
  const currentEdges = [{
    id: 'a-b', source: 'a', target: 'b',
    data: { computedPath: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
  }];
  const response = {
    requestId: 'layout:7',
    hardClean: true,
    hardReport: { hardClean: true },
    edges: currentEdges,
  };
  const parity = (edges, patches) => edges === currentEdges && patches === response.edges;
  const result = resolveDisplayRoutingFinalRouteSnapshot({
    routing: {
      stage: 'final-applied', requestId: 'display:9', renderAuthorityStatus: 'accepted',
      layoutTransactionJobId: 7, layoutTransactionStatus: 'committed', ...committedShape,
    },
    requests: [request],
    responses: [response],
    currentEdges,
    renderedEdgeCount: 1,
    expectedRequestPrefix: 'layout:',
    minimumExclusiveLayoutJobId: 6,
    committedEdgesMatchWorkerPatches: parity,
  });
  expect(result?.request).toBe(request);
  expect(result?.response).toBe(response);
});

it('accepts the clean current display response that reroutes committed layout geometry', () => {
  const currentEdges = [{
    id: 'a-b', source: 'a', target: 'b',
    data: { computedPath: [{ x: 0, y: 0 }, { x: 20, y: 0 }] },
  }];
  const displayRequest = { ...request, requestId: 'display:9', edges: currentEdges };
  const displayResponse = {
    requestId: 'display:9', hardClean: true, hardReport: { hardClean: true }, edges: currentEdges,
    outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
  };
  const result = resolveDisplayRoutingFinalRouteSnapshot({
    routing: {
      stage: 'final-applied', requestId: 'display:9', renderAuthorityStatus: 'accepted',
      layoutTransactionJobId: 7, layoutTransactionStatus: 'committed', ...committedShape,
      outputRouteSignature: displayResponse.outputRouteSignature,
    },
    requests: [request, displayRequest],
    responses: [
      { requestId: 'layout:7', hardClean: true, hardReport: { hardClean: true }, edges: request.edges },
      displayResponse,
    ],
    currentEdges,
    renderedEdgeCount: 1,
    expectedRequestPrefix: 'layout:',
    minimumExclusiveLayoutJobId: 6,
    committedEdgesMatchWorkerPatches: () => false,
  });
  expect(result?.request).toBe(displayRequest);
  expect(result?.response).toBe(displayResponse);
});

it('materializes a clean current incremental response from committed edges', () => {
  const currentEdges = [{
    id: 'a-b', source: 'a', target: 'b',
    data: { computedPath: [{ x: 0, y: 0 }, { x: 20, y: 0 }] },
  }];
  const displayRequest = { ...request, requestId: 'display:9', edges: currentEdges };
  const routingPatches = [{
    id: 'a-b', data: { computedPath: currentEdges[0].data.computedPath },
  }];
  const displayResponse = {
    requestId: 'display:9', hardClean: true, hardReport: { hardClean: true }, routingPatches,
    outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
  };
  const result = resolveDisplayRoutingFinalRouteSnapshot({
    routing: {
      stage: 'final-applied', requestId: 'display:9', renderAuthorityStatus: 'accepted',
      layoutTransactionJobId: 7, layoutTransactionStatus: 'committed', ...committedShape,
      outputRouteSignature: displayResponse.outputRouteSignature,
    },
    requests: [request, displayRequest],
    responses: [displayResponse],
    currentEdges,
    renderedEdgeCount: 1,
    expectedRequestPrefix: 'layout:',
    minimumExclusiveLayoutJobId: 6,
    committedEdgesMatchWorkerPatches: (edges, patches) => (
      edges === currentEdges && patches === routingPatches
    ),
  });
  expect(result?.request).toBe(displayRequest);
  expect(result?.response).toMatchObject({
    source: 'current-edges-for-routing-patches',
    edges: currentEdges,
  });
});

it('rejects a stale layout response after display routing when committed edge parity is missing', () => {
  const currentEdges = [{ id: 'a-b', source: 'a', target: 'b' }];
  const input = {
    routing: {
      stage: 'final-applied', requestId: 'display:9', renderAuthorityStatus: 'accepted',
      layoutTransactionJobId: 7, layoutTransactionStatus: 'committed', ...committedShape,
    },
    requests: [request],
    responses: [{
      requestId: 'layout:7', hardClean: true, hardReport: { hardClean: true }, edges: request.edges,
    }],
    currentEdges,
    renderedEdgeCount: 1,
    expectedRequestPrefix: 'layout:',
    minimumExclusiveLayoutJobId: 6,
  };
  expect(resolveDisplayRoutingFinalRouteSnapshot(input)).toBeNull();
  expect(resolveDisplayRoutingFinalRouteSnapshot({
    ...input,
    committedEdgesMatchWorkerPatches: () => false,
  })).toBeNull();
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
