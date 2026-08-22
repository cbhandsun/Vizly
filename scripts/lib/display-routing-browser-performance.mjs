export const DISPLAY_ROUTING_PERFORMANCE_BUDGET_MS = Object.freeze({
  initialRoute: 750,
  releaseToFinal: 1_000,
  workerToFinal: 750,
  localRoute: 250,
});

export const EXPECTED_INCREMENTAL_DISPLAY_ROUTING_PHASES = Object.freeze([
  'incremental-closure',
  'local-route',
  'hard-gate',
  'final-clearance',
  'final-hard-safety',
  'final-endpoint-seed',
  'final-endpoint-topology',
  'final-endpoint-order',
  'final-endpoint-closure',
  'final-safety-hard-gate',
  'final-safety-stubs',
  'final-safety-endpoint-order',
  'final-safety-passage-order',
  'final-safety-closure',
  'final-endpoint-seed',
  'final-endpoint-topology',
  'final-endpoint-order',
  'final-endpoint-closure',
  'final-commercial-clearance',
  'final-commercial-terminal-preserving',
  'final-commercial-terminal-changing',
  'final-commercial-source-stairs',
  'final-commercial-evaluation',
  'final-commercial-safety-closure',
  'finalizer',
  'session-commit',
]);

export const summarizeSlowestDisplayRoutingPhases = (phaseTrace, limit = 5) => {
  if (!Array.isArray(phaseTrace) || !Number.isInteger(limit) || limit <= 0) return [];
  return phaseTrace
    .filter(trace => (
      trace
      && typeof trace.phase === 'string'
      && Number.isFinite(trace.durationMs)
      && trace.durationMs >= 0
    ))
    .slice()
    .sort((left, right) => (
      (Number.isFinite(right.exclusiveDurationMs)
        ? right.exclusiveDurationMs
        : right.durationMs)
      - (Number.isFinite(left.exclusiveDurationMs)
        ? left.exclusiveDurationMs
        : left.durationMs)
    ))
    .slice(0, limit)
    .map(trace => ({
      phase: trace.phase,
      parentPhase: typeof trace.parentPhase === 'string' ? trace.parentPhase : null,
      durationMs: Number.isFinite(trace.exclusiveDurationMs)
        ? trace.exclusiveDurationMs
        : trace.durationMs,
      inclusiveDurationMs: trace.durationMs,
      resolution: typeof trace.resolution === 'string' ? trace.resolution : null,
    }));
};

const percentile = (sorted, percentileValue) => {
  if (sorted.length === 0) return null;
  const rank = Math.max(0, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[Math.min(rank, sorted.length - 1)];
};

export const summarizeDisplayRoutingSamples = (values) => {
  if (!Array.isArray(values)) return null;
  const sorted = values
    .filter(value => Number.isFinite(value) && value >= 0 && value <= 600_000)
    .slice()
    .sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  return {
    sampleCount: sorted.length,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1),
  };
};

export const assertDisplayRoutingPerformanceBudget = (
  dragCase,
  initial,
  incremental,
) => {
  const localRoute = incremental?.response?.phaseTrace
    ?.find(trace => trace?.phase === 'local-route');
  const measurements = {
    initialRoute: initial?.routeMs,
    releaseToFinal: incremental?.releaseToFinalMs,
    workerToFinal: incremental?.workerToFinalMs,
    localRoute: localRoute?.durationMs,
  };
  const exceeded = Object.entries(DISPLAY_ROUTING_PERFORMANCE_BUDGET_MS)
    .filter(([name, budget]) => (
      !Number.isFinite(measurements[name]) || measurements[name] > budget
    ));
  if (exceeded.length === 0) return measurements;
  throw new Error(`Routing performance budget exceeded:\n${JSON.stringify({
    dragCase,
    measurements,
    incrementalRouting: incremental?.routing ?? null,
    initialPhaseTrace: initial?.phaseTrace ?? [],
    incrementalPhaseTrace: incremental?.response?.phaseTrace ?? [],
    budgets: DISPLAY_ROUTING_PERFORMANCE_BUDGET_MS,
    exceeded,
  }, null, 2)}`);
};
