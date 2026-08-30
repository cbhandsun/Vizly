export const resolveDisplayRoutingLayoutPhaseCompletedAt = (phaseTrace, phase) => {
  if (!Array.isArray(phaseTrace) || typeof phase !== 'string') return null;
  const match = [...phaseTrace].reverse().find(item => (
    item?.phase === phase
    && item?.status === 'completed'
    && Number.isFinite(item?.startedAt)
    && Number.isFinite(item?.durationMs)
    && item.durationMs >= 0
  ));
  if (!match) return null;
  const completedAt = match.startedAt + match.durationMs;
  return Number.isFinite(completedAt) ? completedAt : null;
};

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
  const seedStageAudits = routing.layoutSeedStageAudits
    && typeof routing.layoutSeedStageAudits === 'object'
    && !Array.isArray(routing.layoutSeedStageAudits)
    ? routing.layoutSeedStageAudits
    : {};
  const projectSeedAudit = (value) => {
    const audit = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      terminalsAttached: typeof audit.terminalsAttached === 'boolean'
        ? audit.terminalsAttached : null,
      terminalsAnchored: typeof audit.terminalsAnchored === 'boolean'
        ? audit.terminalsAnchored : null,
      obstacleHits: boundedCount(audit.obstacleHits),
      strictCrossings: boundedCount(audit.strictCrossings),
    };
  };
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
    layoutSeedStageAudits: Object.fromEntries(
      [
        'raw',
        'anchored',
        'detached-fallback',
        'axis-repaired',
        'geometry-normalized',
        'final',
      ].flatMap(stage => Object.prototype.hasOwnProperty.call(seedStageAudits, stage)
        ? [[stage, projectSeedAudit(seedStageAudits[stage])]]
        : []),
    ),
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
