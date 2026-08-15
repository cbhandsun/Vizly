import { describe, expect, it } from 'vitest';

import { assertDisplayRoutingPerformanceBudget } from './display-routing-browser-performance.mjs';

const incremental = overrides => ({
  releaseToFinalMs: 400,
  workerToFinalMs: 300,
  response: { phaseTrace: [{ phase: 'local-route', durationMs: 100 }] },
  ...overrides,
});

describe('display routing browser performance budget', () => {
  it('returns the validated measurements', () => {
    expect(assertDisplayRoutingPerformanceBudget(
      { nodeId: 'wms' },
      { routeMs: 500 },
      incremental(),
    )).toEqual({
      initialRoute: 500,
      releaseToFinal: 400,
      workerToFinal: 300,
      localRoute: 100,
    });
  });

  it('fails closed for missing or over-budget measurements', () => {
    expect(() => assertDisplayRoutingPerformanceBudget(
      { nodeId: 'wms' },
      {},
      incremental({ releaseToFinalMs: 1_001 }),
    )).toThrow(/initialRoute|releaseToFinal/);
  });
});
