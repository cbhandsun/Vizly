import { describe, expect, it } from 'vitest';

import {
  finalizeDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from '../baseReactFlowDisplayRoutingTrace';

describe('baseReactFlowDisplayGlobalRouteTrace', () => {
  it('keeps nested commercial repair work inside its evaluation phase', () => {
    const trace = (
      phase: DisplayRoutingPhaseTrace['phase'],
      durationMs: number,
    ): DisplayRoutingPhaseTrace => ({
      phase,
      durationMs,
      candidateCount: 14,
      changedEdgeCount: 0,
      resolution: 'skip',
    });
    const traces = finalizeDisplayRoutingPhaseTrace([
      trace('finalizer', 140),
      trace('final-commercial-evaluation', 100),
      trace('final-commercial-clearance', 20),
      trace('final-commercial-terminal-preserving', 15),
      trace('final-commercial-source-stairs', 10),
      trace('final-commercial-terminal-changing', 5),
      trace('final-commercial-safety-closure', 20),
    ]);

    expect(traces[0]).toMatchObject({ exclusiveDurationMs: 20 });
    expect(traces[1]).toMatchObject({
      parentPhase: 'finalizer',
      exclusiveDurationMs: 50,
    });
    expect(traces.slice(2, 6).every(({ parentPhase }) => (
      parentPhase === 'final-commercial-evaluation'
    ))).toBe(true);
    expect(traces[6]).toMatchObject({
      parentPhase: 'finalizer',
      exclusiveDurationMs: 20,
    });
    expect(traces.reduce((total, item) => (
      total + (item.exclusiveDurationMs ?? item.durationMs)
    ), 0)).toBe(140);
  });

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
