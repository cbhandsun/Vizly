import { resolveDisplayRoutingLayoutPhaseCompletedAt } from './display-routing-layout-diagnostics.mjs';

const firstEvent = (events, type, value, minimumAt) => events.find(event => (
  event?.type === type
  && event?.value === value
  && Number.isFinite(event?.sampledAt)
  && event.sampledAt >= minimumAt
));

const lastEvent = (events, type, minimumAt) => [...events].reverse().find(event => (
  event?.type === type
  && Number.isFinite(event?.sampledAt)
  && event.sampledAt >= minimumAt
));

const delta = (event, origin) => (
  event && Number.isFinite(origin) ? event.sampledAt - origin : null
);

export const assertDisplayRoutingLayoutProgressTimeline = (timeline, label) => {
  if (
    !Number.isFinite(timeline?.progressStartedFromInputMs)
    || !Number.isFinite(timeline?.progressClearedFromCommitMs)
  ) {
    throw new Error(`${label} did not show and clear the layout progress indicator`);
  }
};

export const assertDisplayRoutingLayoutFitTimeline = (timeline, label) => {
  const dispatchedAfterCommit = timeline?.fitDispatchedFromLayoutStateCommitMs;
  if (!Number.isFinite(dispatchedAfterCommit) || dispatchedAfterCommit < 0) {
    throw new Error(`${label} did not dispatch fit after the layout state commit`);
  }
};

/**
 * Projects aggregate browser observations into phase deltas. No diagram ids,
 * node geometry, paths, or viewport coordinates leave the browser.
 */
export const summarizeDisplayRoutingLayoutVisualTimeline = ({
  events: eventsValue,
  inputAt,
  layoutPhaseTrace,
  routingCommitAt,
  visualStableAt,
}) => {
  const layoutStateCommitAt = resolveDisplayRoutingLayoutPhaseCompletedAt(
    layoutPhaseTrace,
    'state-commit',
  );
  const events = Array.isArray(eventsValue)
    ? eventsValue.filter(event => Number.isFinite(event?.sampledAt) && event.sampledAt >= inputAt)
    : [];
  const committingStarted = firstEvent(events, 'layout-committing', true, inputAt);
  const committingCleared = firstEvent(
    events,
    'layout-committing',
    false,
    committingStarted?.sampledAt ?? inputAt,
  );
  const busyStarted = firstEvent(events, 'layout-busy', true, inputAt);
  const busyCleared = firstEvent(
    events,
    'layout-busy',
    false,
    busyStarted?.sampledAt ?? inputAt,
  );
  const progressStarted = firstEvent(events, 'layout-progress', true, inputAt);
  const progressCleared = firstEvent(
    events,
    'layout-progress',
    false,
    progressStarted?.sampledAt ?? inputAt,
  );
  const fitDispatched = lastEvent(events, 'fit-dispatched', inputAt);
  const fitListenersReturned = firstEvent(
    events,
    'fit-listeners-returned',
    true,
    fitDispatched?.sampledAt ?? inputAt,
  );
  const firstViewportChange = firstEvent(
    events,
    'viewport-change',
    true,
    fitDispatched?.sampledAt ?? inputAt,
  );
  const lastViewportChange = lastEvent(
    events,
    'viewport-change',
    fitDispatched?.sampledAt ?? inputAt,
  );
  const lastPathChange = lastEvent(events, 'route-path-change', routingCommitAt);
  const diagnosticBacklogDrained = lastEvent(
    events,
    'diagnostic-clone-backlog-drained',
    routingCommitAt,
  );
  return {
    committingStartedFromInputMs: delta(committingStarted, inputAt),
    committingClearedFromCommitMs: delta(committingCleared, routingCommitAt),
    busyStartedFromInputMs: delta(busyStarted, inputAt),
    busyClearedFromCommitMs: delta(busyCleared, routingCommitAt),
    progressStartedFromInputMs: delta(progressStarted, inputAt),
    progressClearedFromCommitMs: delta(progressCleared, routingCommitAt),
    fitDispatchedFromLayoutStateCommitMs: delta(fitDispatched, layoutStateCommitAt),
    fitDispatchedFromCommitMs: delta(fitDispatched, routingCommitAt),
    fitListenerDispatchDurationMs: delta(fitListenersReturned, fitDispatched?.sampledAt),
    viewportFirstChangeFromFitMs: delta(firstViewportChange, fitDispatched?.sampledAt),
    viewportFirstChangeFromFitReturnMs: delta(
      firstViewportChange,
      fitListenersReturned?.sampledAt,
    ),
    viewportLastChangeFromFitMs: delta(lastViewportChange, fitDispatched?.sampledAt),
    pathLastChangeFromCommitMs: delta(lastPathChange, routingCommitAt),
    diagnosticBacklogDrainedFromCommitMs: delta(diagnosticBacklogDrained, routingCommitAt),
    visualStableAfterViewportLastMs: delta(
      Number.isFinite(visualStableAt) ? { sampledAt: visualStableAt } : null,
      lastViewportChange?.sampledAt,
    ),
    visualStableAfterBusyClearMs: delta(
      Number.isFinite(visualStableAt) ? { sampledAt: visualStableAt } : null,
      busyCleared?.sampledAt,
    ),
    visualStableAfterDiagnosticBacklogMs: delta(
      Number.isFinite(visualStableAt) ? { sampledAt: visualStableAt } : null,
      diagnosticBacklogDrained?.sampledAt,
    ),
  };
};
