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
});
