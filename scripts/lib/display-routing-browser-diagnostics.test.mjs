import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { prepareDisplayRoutingIncrementalCapture } from './display-routing-browser-diagnostics.mjs';

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
