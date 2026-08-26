import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import {
  prepareDisplayRoutingIncrementalCapture,
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
});
