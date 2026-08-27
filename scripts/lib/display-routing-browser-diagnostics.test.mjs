import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import {
  assertDisplayRoutingCommittedReuse,
  prepareDisplayRoutingIncrementalCapture,
  readDisplayRoutingCommittedReuseSnapshot,
  readDisplayRoutingRequestDriftProbe,
} from './display-routing-browser-diagnostics.mjs';

const prepareInContext = async routing => {
  const minimap = { style: { display: 'block' } };
  const window = {
    __vizlyBaseReactFlowDisplayRouting: routing,
    __vizlyRoutingRequests: [{ requestId: 'initial' }],
    __vizlyRoutingResponses: [{ requestId: 'initial' }],
    __vizlyRouteSamplingEnabled: true,
  };
  const context = vm.createContext({
    document: { querySelectorAll: () => [minimap] },
    Number,
    window,
  });
  const session = {
    evaluate: source => vm.runInContext(source, context),
  };

  await prepareDisplayRoutingIncrementalCapture(session);
  return { minimap, window };
};

describe('display routing browser diagnostics', () => {
  it('summarizes session-hit requests without exposing graph content', () => {
    const probe = readDisplayRoutingRequestDriftProbe({
      operation: 'incremental-route',
      baselineSessionRef: { sessionId: 'private-session-secret' },
      baselineInputGeometryDigest: 'private-baseline-signature',
      baselineOutputRouteSignature: 'private-route-signature',
      nextInputGeometryDigest: 'private-next-signature',
      mutableEdgeIds: ['private-edge-a'],
      contextEdgeIds: [],
      changeSet: {
        reason: 'node-drag',
        classification: 'geometry',
        topologyChanged: false,
        geometryChanged: true,
        changedNodeIds: ['private-node-a'],
        changedEdgeIds: [],
      },
      nodes: [{
        id: 'private-node-a',
        position: { x: 1.25, y: 2 },
        measured: { width: 100, height: 60 },
      }],
      edges: [{
        id: 'private-edge-a',
        source: 'private-node-a',
        target: 'private-node-b',
        data: { computedPath: [{ x: 1.25, y: 2 }, { x: 9, y: 2 }] },
      }],
    });
    expect(probe).toMatchObject({
      schema: 'routing-drift-v1',
      operation: 'incremental-route',
      baseline: {
        sessionRefPresent: true,
        inlineBootstrapPresent: false,
        nodeCount: 0,
        edgeCount: 0,
        patchCount: 0,
      },
      next: {
        nodeCount: 1,
        edgeCount: 1,
        fractionalGeometryCount: 1,
        nonFiniteGeometryCount: 0,
        measuredSizePresentCount: 1,
      },
      change: {
        reason: 'node-drag',
        classification: 'geometry',
        changedNodeCount: 1,
        mutableEdgeCount: 1,
      },
    });
    expect(probe.next.projectedGeometryDigest).toMatch(/^probe-v1:[0-9a-f]{32}$/);
    const serialized = JSON.stringify(probe);
    for (const sensitive of [
      'private-session-secret', 'private-baseline-signature', 'private-route-signature',
      'private-next-signature', 'private-edge-a', 'private-node-a', '1.25',
    ]) expect(serialized).not.toContain(sensitive);
  });

  it('fails closed to bounded empty summaries for malformed request fields', () => {
    expect(readDisplayRoutingRequestDriftProbe({
      operation: 'unsafe-operation',
      mutableEdgeIds: 'edge-a',
      nodes: null,
      edges: {},
      baselineNodes: Number.NaN,
      baselinePatches: 'patch',
    })).toMatchObject({
      schema: 'routing-drift-v1',
      operation: 'invalid',
      baseline: { nodeCount: 0, edgeCount: 0, patchCount: 0 },
      next: { nodeCount: 0, edgeCount: 0, nonFiniteGeometryCount: 0 },
      change: {
        reason: 'invalid',
        classification: 'invalid',
        mutableEdgeCount: 0,
        contextEdgeCount: 0,
      },
    });
  });

  it('remains self-contained when injected into a browser realm', () => {
    const context = vm.createContext({
      request: { operation: 'route', nodes: [{ id: 'node-a' }] },
    });
    const result = vm.runInContext(
      `(${readDisplayRoutingRequestDriftProbe.toString()})(request)`,
      context,
    );

    expect(result).toMatchObject({
      schema: 'routing-drift-v1',
      operation: 'route',
      next: { nodeCount: 1, edgeCount: 0 },
    });
  });

  it('captures cumulative Worker counters before resetting incremental probes', async () => {
    const { minimap, window } = await prepareInContext({
      workerStartCount: 1,
      workerAbortCount: 0,
    });

    expect(window.__vizlyIncrementalRoutingCounterBaseline).toEqual({
      workerStartCount: 1,
      workerAbortCount: 0,
    });
    expect(window.__vizlyRoutingRequests).toEqual([]);
    expect(window.__vizlyRoutingResponses).toEqual([]);
    expect(window.__vizlyRouteSamplingEnabled).toBe(false);
    expect(window.__vizlyInitialRoutingDriftProbe).toMatchObject({
      schema: 'routing-drift-v1',
      operation: 'invalid',
    });
    expect(minimap.style.display).toBe('none');
  });

  it('coerces malformed counter baselines to a safe zero', async () => {
    const { window } = await prepareInContext({
      workerStartCount: Number.NaN,
      workerAbortCount: Number.POSITIVE_INFINITY,
    });

    expect(window.__vizlyIncrementalRoutingCounterBaseline).toEqual({
      workerStartCount: 0,
      workerAbortCount: 0,
    });
  });

  it('reads a bounded exact-path digest for committed reuse browser checks', () => {
    const paths = [
      { getAttribute: () => 'M 10 0 L 20 0' },
      { getAttribute: () => 'M 0 0 L 5 0' },
    ];
    const context = vm.createContext({
      document: {
        querySelectorAll: selector => selector.includes('edge-path')
          ? paths
          : paths.map(path => ({ querySelector: () => path })),
      },
      window: {
        __vizlyBaseReactFlowDisplayRouting: {
          stage: 'final-applied',
          cacheTrustLevel: 'runtime-committed',
          signature: '123',
          inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
          outputRouteSignature: 'route-v1:123',
          workerStartCount: 0,
          workerAbortCount: 0,
        },
        __vizlyRoutingRequests: [],
        __vizlyRoutingResponses: [],
      },
    });
    const snapshot = vm.runInContext(
      `(${readDisplayRoutingCommittedReuseSnapshot.toString()})()`,
      context,
    );

    expect(snapshot).toMatchObject({
      renderedEdgeCount: 2,
      renderedEdgesWithPathCount: 2,
      renderedPathCount: 2,
      renderedPathDigest: expect.stringMatching(/^[0-9a-f]{8}$/),
      workerStartCount: 0,
      requestCount: 0,
    });
  });

  it('accepts only exact same-identity zero-Worker committed reuse', () => {
    const before = {
      stage: 'final-applied',
      inputSignature: '123',
      inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
      outputRouteSignature: 'route-v1:123',
      renderedPathCount: 2,
      renderedPathDigest: '1234abcd',
    };
    const after = {
      ...before,
      cacheTrustLevel: 'runtime-committed',
      workerStartCount: 0,
      workerAbortCount: 0,
      requestCount: 0,
      responseCount: 0,
      renderedEdgeCount: 2,
      renderedEdgesWithPathCount: 2,
      renderedPathCount: 2,
    };

    expect(() => assertDisplayRoutingCommittedReuse({ before, after, expectedEdgeCount: 2 }))
      .not.toThrow();
    expect(() => assertDisplayRoutingCommittedReuse({
      before,
      after: { ...after, workerStartCount: 1 },
      expectedEdgeCount: 2,
    })).toThrow(/after\.workerStartCount/);
    expect(() => assertDisplayRoutingCommittedReuse({
      before,
      after: { ...after, outputRouteSignature: 'route-v1:changed' },
      expectedEdgeCount: 2,
    })).toThrow(/after\.outputRouteSignature/);
  });
});
