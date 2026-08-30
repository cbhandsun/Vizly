/** Builds a bounded, content-free layout diagnostic summary for the matrix. */
export const readDisplayRoutingLayoutDiagnostics = ({
  routingValue,
  heartbeatValue,
  clickedAt,
  confirmedAt,
}) => {
  const routing = routingValue && typeof routingValue === 'object' ? routingValue : {};
  const finite = value => (Number.isFinite(value) ? value : null);
  const phaseTrace = Array.isArray(routing.layoutPhaseTrace)
    ? routing.layoutPhaseTrace.slice(-32).map(trace => ({
      sequence: Number.isSafeInteger(trace?.sequence) && trace.sequence >= 0
        ? trace.sequence : null,
      phase: typeof trace?.phase === 'string' ? trace.phase.slice(0, 64) : null,
      status: typeof trace?.status === 'string' ? trace.status.slice(0, 32) : null,
      startedAt: finite(trace?.startedAt),
      durationMs: finite(trace?.durationMs),
    }))
    : [];
  const heartbeats = Array.isArray(heartbeatValue)
    ? heartbeatValue.filter(item => (
      Number.isFinite(item?.sampledAt)
      && Number.isFinite(clickedAt)
      && Number.isFinite(confirmedAt)
      && item.sampledAt >= clickedAt
      && item.sampledAt <= confirmedAt
    )).slice(-128)
    : [];
  const boundedCount = value => (
    Number.isSafeInteger(value) && value >= 0 && value <= 100_000 ? value : null
  );
  return {
    phaseTrace,
    layoutSeedAudit: {
      terminalsAttached: typeof routing.layoutSeedTerminalsAttached === 'boolean'
        ? routing.layoutSeedTerminalsAttached : null,
      terminalsAnchored: typeof routing.layoutSeedTerminalsAnchored === 'boolean'
        ? routing.layoutSeedTerminalsAnchored : null,
      obstacleHits: boundedCount(routing.layoutSeedObstacleHits),
      strictCrossings: boundedCount(routing.layoutSeedStrictCrossings),
    },
    workerHeartbeatCount: heartbeats.length,
    workerHeartbeatMaxElapsedMs: Math.max(
      0,
      ...heartbeats.map(item => item.elapsedMs).filter(Number.isFinite),
    ),
    workerInstanceCount: new Set(
      heartbeats.map(item => item.workerInstanceId).filter(value => (
        typeof value === 'string' && value.length <= 64
      )),
    ).size,
  };
};
