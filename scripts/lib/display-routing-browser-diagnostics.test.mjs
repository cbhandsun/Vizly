import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import {
  assertDisplayRoutingCommittedReuse,
  prepareDisplayRoutingIncrementalCapture,
  readDisplayRoutingCommittedReuseSnapshot,
  readDisplayRoutingRequestDebugSnapshot,
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
  it('projects session-hit requests without requiring bootstrap baselines', () => {
    expect(readDisplayRoutingRequestDebugSnapshot({
      mutableEdgeIds: ['edge-a'],
      nodes: [{ id: 'node-a', position: { x: 1, y: 2 } }],
      edges: [{ id: 'edge-a', source: 'node-a', target: 'node-b' }],
    })).toMatchObject({
      mutableEdgeIds: ['edge-a'],
      contextEdgeIds: [],
      nodes: [{ id: 'node-a', position: { x: 1, y: 2 } }],
      baselineNodes: [],
      edges: [{ id: 'edge-a', source: 'node-a', target: 'node-b' }],
      baselinePatches: [],
    });
  });

  it('fails closed to empty collections for malformed request fields', () => {
    expect(readDisplayRoutingRequestDebugSnapshot({
      mutableEdgeIds: 'edge-a',
      nodes: null,
      edges: {},
      baselineNodes: Number.NaN,
      baselinePatches: 'patch',
    })).toMatchObject({
      mutableEdgeIds: [],
      contextEdgeIds: [],
      nodes: [],
      baselineNodes: [],
      edges: [],
      baselinePatches: [],
    });
  });

  it('remains self-contained when injected into a browser realm', () => {
    const context = vm.createContext({ request: { nodes: [{ id: 'node-a' }] } });
    const result = vm.runInContext(
      `(${readDisplayRoutingRequestDebugSnapshot.toString()})(request)`,
      context,
    );

    expect(result.nodes).toEqual([{ id: 'node-a' }]);
    expect(result.baselineNodes).toEqual([]);
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
