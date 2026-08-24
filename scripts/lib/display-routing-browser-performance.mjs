export const DISPLAY_ROUTING_PERFORMANCE_BUDGET_MS = Object.freeze({
  initialRoute: 750,
  releaseToFinal: 1_000,
  workerToFinal: 750,
  localRoute: 250,
});

export const DISPLAY_ROUTING_P95_BUDGET_MS = Object.freeze({
  initialRoute: 750,
  releaseToFinal: 300,
  workerToFinal: 300,
  localRoute: 150,
});

const FAST_INCREMENTAL_DISPLAY_ROUTING_PHASES = Object.freeze([
  'incremental-closure',
  'local-route',
  'hard-gate',
  'final-clearance',
  'final-hard-safety',
  'final-safety-hard-gate',
  'final-safety-stubs',
  'final-safety-endpoint-order',
  'final-safety-passage-order',
  'final-endpoint-seed',
  'final-endpoint-topology',
  'final-endpoint-order',
  'final-endpoint-closure',
  'final-safety-closure',
  'final-commercial-clearance',
  'final-commercial-terminal-preserving',
  'final-commercial-terminal-changing',
  'final-commercial-source-stairs',
  'final-commercial-evaluation',
  'final-commercial-safety-closure',
  'finalizer',
  'session-commit',
]);

const REPAIRED_INCREMENTAL_DISPLAY_ROUTING_PHASES = Object.freeze([
  ...FAST_INCREMENTAL_DISPLAY_ROUTING_PHASES.slice(0, 13),
  'final-safety-hard-gate',
  'final-safety-stubs',
  'final-safety-endpoint-order',
  'final-safety-passage-order',
  'final-safety-closure',
  'final-endpoint-seed',
  'final-endpoint-topology',
  'final-endpoint-order',
  'final-endpoint-closure',
  ...FAST_INCREMENTAL_DISPLAY_ROUTING_PHASES.slice(14),
]);

export const EXPECTED_INCREMENTAL_DISPLAY_ROUTING_PHASE_SEQUENCES = Object.freeze([
  FAST_INCREMENTAL_DISPLAY_ROUTING_PHASES,
  REPAIRED_INCREMENTAL_DISPLAY_ROUTING_PHASES,
]);

const REQUIRED_INCREMENTAL_DISPLAY_ROUTING_PHASES = new Set(
  EXPECTED_INCREMENTAL_DISPLAY_ROUTING_PHASE_SEQUENCES.flat(),
);

export const displayRoutingIncrementalPhaseTraceIsComplete = phaseTrace => {
  if (!Array.isArray(phaseTrace)) return false;
  const phases = [];
  for (const trace of phaseTrace) {
    if (!trace || typeof trace.phase !== 'string') return false;
    if (REQUIRED_INCREMENTAL_DISPLAY_ROUTING_PHASES.has(trace.phase)) {
      phases.push(trace.phase);
      continue;
    }
    // Defect-driven subphases can grow independently from the stable phase
    // contract. Only explicit child traces are supplemental; unknown root
    // phases still fail closed.
    if (typeof trace.parentPhase !== 'string' || trace.parentPhase.length === 0) {
      return false;
    }
  }
  return EXPECTED_INCREMENTAL_DISPLAY_ROUTING_PHASE_SEQUENCES.some(expected => (
    phases.length === expected.length
    && expected.every((phase, index) => phases[index] === phase)
  ));
};

export const assertDisplayRoutingDragResult = (
  dragCase,
  result,
  { includeRequestDiagnostics = false } = {},
) => {
  const diagnostics = JSON.stringify(includeRequestDiagnostics
    ? { dragCase, debugRequest: result?.debugRequest, boundedCandidates: result?.boundedCandidates }
    : { dragCase, result }, null, 2);
  if (result?.mutableEdgeCount !== dragCase?.expectedMutableCount) {
    throw new Error(`Unexpected mutable closure:\n${diagnostics}`);
  }
  if (
    result?.response?.hardClean !== true
    || result.response.routeResolution !== 'incremental-route'
    || result.response.fallbackLevel !== 'none'
    || result?.routing?.fallbackLevel !== 'none'
    || result.routing.workerAbortCount !== 0
  ) {
    throw new Error(`Incremental route did not commit cleanly:\n${diagnostics}`);
  }
  if (
    result.capturedRequestCount !== 1
    || result.capturedResponseCount !== 1
    || result.routing.workerStartCountDelta !== 1
    || result.routing.workerAbortCountDelta !== 0
  ) {
    throw new Error(`Incremental route was not a single Worker transaction:\n${diagnostics}`);
  }
  if (
    dragCase.expectedAffectedCount !== undefined
    && result.response.affectedEdgeCount !== dragCase.expectedAffectedCount
  ) {
    throw new Error(`Unexpected affected edge count:\n${diagnostics}`);
  }
  if (
    result.response.edgeCount !== 14
    || result.renderedEdgeCount !== 14
    || result.renderedEdgesWithPathCount !== 14
    || !/^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/.test(
      result.routing.outputRouteSignature || '',
    )
  ) {
    throw new Error(`Final render did not match the committed route:\n${diagnostics}`);
  }
  if (
    !displayRoutingIncrementalPhaseTraceIsComplete(result.response.phaseTrace)
    || !result.response.phaseTrace.slice(0, 3)
      .every(trace => trace.resolution === 'accepted')
  ) {
    throw new Error(`Incremental phase trace was incomplete:\n${diagnostics}`);
  }
};

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

export const assertDisplayRoutingPerformanceSummaryBudget = summary => {
  const expectedSampleCount = Number.isInteger(summary?.sampleCount)
    && summary.sampleCount > 0
    ? summary.sampleCount
    : null;
  const measurements = [
    ['initialRoute', summary?.initialRoute?.p95Ms, DISPLAY_ROUTING_P95_BUDGET_MS.initialRoute],
  ];
  for (const [nodeId, dragCase] of Object.entries(summary?.dragCases ?? {})) {
    for (const name of ['releaseToFinal', 'workerToFinal', 'localRoute']) {
      measurements.push([
        `${nodeId}.${name}`,
        dragCase?.[name]?.p95Ms,
        DISPLAY_ROUTING_P95_BUDGET_MS[name],
      ]);
    }
  }
  const exceeded = measurements.filter(([, value, budget]) => (
    !Number.isFinite(value) || value > budget
  ));
  const lifecycleViolations = Object.entries(summary?.dragCases ?? {}).flatMap(
    ([nodeId, dragCase]) => [
      dragCase?.workerStartCount === expectedSampleCount
        ? null
        : [`${nodeId}.workerStartCount`, dragCase?.workerStartCount, expectedSampleCount],
      dragCase?.abortCount === 0
        ? null
        : [`${nodeId}.abortCount`, dragCase?.abortCount, 0],
      dragCase?.fallbackCount === 0
        ? null
        : [`${nodeId}.fallbackCount`, dragCase?.fallbackCount, 0],
    ].filter(Boolean),
  );
  if (exceeded.length === 0 && lifecycleViolations.length === 0) return measurements;
  throw new Error(`Routing performance or lifecycle budget exceeded:\n${JSON.stringify({
    sampleCount: summary?.sampleCount ?? null,
    budgets: DISPLAY_ROUTING_P95_BUDGET_MS,
    exceeded,
    lifecycleViolations,
  }, null, 2)}`);
};
