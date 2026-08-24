import { describe, expect, it } from 'vitest';

import { finalizeDisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';

describe('baseReactFlowDisplayGlobalRouteTrace', () => {
  it('derives exclusive global-route work from waypoint and detached phases', () => {
    const traces = finalizeDisplayRoutingPhaseTrace([{
      phase: 'quality-global-route',
      durationMs: 120,
      candidateCount: 14,
      changedEdgeCount: 14,
      resolution: 'accepted',
    }, {
      phase: 'quality-global-route-waypoint',
      durationMs: 90,
      candidateCount: 660,
      changedEdgeCount: 14,
      resolution: 'accepted',
    }, {
      phase: 'quality-global-route-detached',
      durationMs: 20,
      candidateCount: 14,
      changedEdgeCount: 0,
      resolution: 'skip',
    }]);

    expect(traces[0]).toMatchObject({ exclusiveDurationMs: 10 });
    expect(traces.slice(1).every(({ parentPhase }) => (
      parentPhase === 'quality-global-route'
    ))).toBe(true);
  });
});
