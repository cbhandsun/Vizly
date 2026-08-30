import { describe, expect, it } from 'vitest';

import {
  assertDisplayRoutingLayoutFitTimeline,
  assertDisplayRoutingLayoutProgressTimeline,
  summarizeDisplayRoutingLayoutVisualTimeline,
} from './display-routing-layout-visual-timeline.mjs';

describe('display routing layout visual timeline', () => {
  it('separates preview release, fit motion, busy release, and visual stability', () => {
    expect(summarizeDisplayRoutingLayoutVisualTimeline({
      inputAt: 1_000,
      layoutPhaseTrace: [{
        phase: 'state-commit', status: 'completed', startedAt: 1_440, durationMs: 10,
      }],
      routingCommitAt: 1_500,
      visualStableAt: 2_100,
      events: [
        { type: 'layout-busy', value: true, sampledAt: 1_010 },
        { type: 'layout-progress', value: true, sampledAt: 1_015 },
        { type: 'layout-committing', value: true, sampledAt: 1_200 },
        { type: 'layout-committing', value: false, sampledAt: 1_550 },
        { type: 'layout-busy', value: false, sampledAt: 1_560 },
        { type: 'layout-progress', value: false, sampledAt: 1_565 },
        { type: 'fit-dispatched', value: true, sampledAt: 1_570 },
        { type: 'fit-listeners-returned', value: true, sampledAt: 1_575 },
        { type: 'viewport-change', value: true, sampledAt: 1_580 },
        { type: 'route-path-change', value: 26, sampledAt: 1_620 },
        { type: 'diagnostic-clone-backlog-drained', value: true, sampledAt: 1_900 },
        { type: 'viewport-change', value: true, sampledAt: 2_000 },
      ],
    })).toEqual({
      committingStartedFromInputMs: 200,
      committingClearedFromCommitMs: 50,
      busyStartedFromInputMs: 10,
      busyClearedFromCommitMs: 60,
      progressStartedFromInputMs: 15,
      progressClearedFromCommitMs: 65,
      fitDispatchedFromLayoutStateCommitMs: 120,
      fitDispatchedFromCommitMs: 70,
      fitListenerDispatchDurationMs: 5,
      viewportFirstChangeFromFitMs: 10,
      viewportFirstChangeFromFitReturnMs: 5,
      viewportLastChangeFromFitMs: 430,
      pathLastChangeFromCommitMs: 120,
      diagnosticBacklogDrainedFromCommitMs: 400,
      visualStableAfterViewportLastMs: 100,
      visualStableAfterBusyClearMs: 540,
      visualStableAfterDiagnosticBacklogMs: 200,
    });
  });

  it('returns null deltas for missing or malformed observations', () => {
    expect(summarizeDisplayRoutingLayoutVisualTimeline({
      inputAt: 100,
      routingCommitAt: 200,
      visualStableAt: 300,
      events: [{ type: 'viewport-change', value: true, sampledAt: Number.NaN }],
    })).toEqual(Object.fromEntries([
      'committingStartedFromInputMs',
      'committingClearedFromCommitMs',
      'busyStartedFromInputMs',
      'busyClearedFromCommitMs',
      'progressStartedFromInputMs',
      'progressClearedFromCommitMs',
      'fitDispatchedFromLayoutStateCommitMs',
      'fitDispatchedFromCommitMs',
      'fitListenerDispatchDurationMs',
      'viewportFirstChangeFromFitMs',
      'viewportFirstChangeFromFitReturnMs',
      'viewportLastChangeFromFitMs',
      'pathLastChangeFromCommitMs',
      'diagnosticBacklogDrainedFromCommitMs',
      'visualStableAfterViewportLastMs',
      'visualStableAfterBusyClearMs',
      'visualStableAfterDiagnosticBacklogMs',
    ].map(key => [key, null])));
  });

  it('rejects a production layout that never shows or clears its progress status', () => {
    expect(() => assertDisplayRoutingLayoutProgressTimeline({
      progressStartedFromInputMs: 12,
      progressClearedFromCommitMs: null,
    }, 'domain-lanes-lr')).toThrow(
      'domain-lanes-lr did not show and clear the layout progress indicator',
    );
  });

  it('rejects a fit event missing or preceding the layout state commit', () => {
    expect(() => assertDisplayRoutingLayoutFitTimeline({
      fitDispatchedFromLayoutStateCommitMs: -1,
    }, 'domain-lanes-lr')).toThrow(
      'domain-lanes-lr did not dispatch fit after the layout state commit',
    );
  });
});
