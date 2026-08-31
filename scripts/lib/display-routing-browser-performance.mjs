/** Count transaction replies, not the phase notifications retained for diagnosis.
 * Unknown/mixed envelopes remain counted so they cannot hide duplicate replies.
 * Self-contained because the browser verifier injects this function into CDP.
 */
export const countDisplayRoutingTransactionResponses = responses => {
  if (!Array.isArray(responses)) throw new TypeError('Worker responses must be an array');
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const terminalKeys = [
    'hardClean', 'hardReport', 'routeResolution', 'error', 'edges', 'routingPatches',
    'boundedCandidate', 'phaseTrace', 'affectedEdgeCount', 'fallbackLevel',
    'nextIdentity', 'outputRouteSignature', 'sessionRef', 'commitReceipt', 'workerDurationMs',
  ];
  return responses.filter(response => {
    const phase = isRecord(response) ? response.phaseProgress : null;
    const isPhaseNotification = isRecord(phase)
      && typeof response.requestId === 'string' && response.requestId.length > 0
      && response.requestId.length <= 500
      && typeof phase.phase === 'string' && /^[a-z][a-z0-9-]{0,127}$/.test(phase.phase)
      && ['hit', 'skip', 'accepted', 'rejected', 'fallback'].includes(phase.resolution)
      && Number.isFinite(phase.durationMs) && phase.durationMs >= 0 && phase.durationMs <= 600_000
      && [phase.candidateCount, phase.changedEdgeCount].every(value => (
        Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000
      ))
      && terminalKeys.every(key => typeof response[key] === 'undefined');
    return !isPhaseNotification;
  }).length;
};

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

export const isDisplayRoutingClosurePhase = trace => {
  const phase = typeof trace?.phase === 'string' ? trace.phase : '';
  return [
    'final-safety-closure',
    'final-commercial-safety-closure',
    'final-safety-hard-gate',
    'final-safety-stubs',
    'final-safety-endpoint-order',
    'final-safety-passage-order',
  ].includes(phase);
};

export const parseDisplayRoutingBrowserVerificationMode = (rawArgs) => {
  const args = Array.isArray(rawArgs) ? rawArgs : [];
  if (args.length === 0) return 'full';
  if (args.length === 1 && args[0] === '--interaction-only') return 'interaction';
  throw new Error('Display-routing browser verifier accepts only --interaction-only');
};

export const selectDisplayRoutingDragCases = (value, availableCases) => {
  if (!Array.isArray(availableCases) || availableCases.length === 0) return [];
  if (typeof value === 'undefined' || String(value).trim() === '') return availableCases;
  if (typeof value !== 'string' || value.length > 128) {
    throw new Error('DISPLAY_ROUTING_BROWSER_CASES must be a bounded comma-separated string');
  }
  const requestedIds = [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
  const casesById = new Map(availableCases.map(item => [item?.nodeId, item]));
  if (
    requestedIds.length === 0
    || requestedIds.length > availableCases.length
    || requestedIds.some(nodeId => !casesById.has(nodeId))
  ) throw new Error('DISPLAY_ROUTING_BROWSER_CASES contains an unsupported case');
  return requestedIds.map(nodeId => casesById.get(nodeId));
};

export const parseDisplayRoutingSampleIndex = (value) => {
  if (typeof value === 'undefined' || String(value).trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error('DISPLAY_ROUTING_BROWSER_SAMPLE_INDEX must be an integer from 1 to 100');
  }
  return parsed;
};

export const rotateDisplayRoutingDragCases = (casesValue, sampleIndex) => {
  if (!Array.isArray(casesValue) || casesValue.length <= 1 || sampleIndex === null) {
    return casesValue;
  }
  if (!Number.isSafeInteger(sampleIndex) || sampleIndex < 1 || sampleIndex > 100) {
    throw new Error('Display-routing sample index must be an integer from 1 to 100');
  }
  const offset = (sampleIndex - 1) % casesValue.length;
  if (offset === 0) return casesValue;
  return [...casesValue.slice(offset), ...casesValue.slice(0, offset)];
};

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
) => {
  const diagnostics = JSON.stringify({
    expected: {
      mutableEdgeCount: dragCase?.expectedMutableCount,
      affectedEdgeCount: dragCase?.expectedAffectedCount,
    },
    observed: {
      mutableEdgeCount: result?.mutableEdgeCount,
      capturedRequestCount: result?.capturedRequestCount,
      capturedResponseCount: result?.capturedResponseCount,
      response: {
        hardClean: result?.response?.hardClean,
        routeResolution: result?.response?.routeResolution,
        affectedEdgeCount: result?.response?.affectedEdgeCount,
        fallbackLevel: result?.response?.fallbackLevel,
        edgeCount: result?.response?.edgeCount,
        phaseTrace: result?.response?.phaseTrace,
      },
      routing: {
        fallbackLevel: result?.routing?.fallbackLevel,
        workerStartCountDelta: result?.routing?.workerStartCountDelta,
        workerAbortCount: result?.routing?.workerAbortCount,
        workerAbortCountDelta: result?.routing?.workerAbortCountDelta,
      },
      renderedEdgeCount: result?.renderedEdgeCount,
      renderedEdgesWithPathCount: result?.renderedEdgesWithPathCount,
      outputRouteSignaturePresent: typeof result?.routing?.outputRouteSignature === 'string',
    },
    driftProbe: result?.driftProbe,
  }, null, 2);
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
    || !['incremental-closure', 'local-route', 'hard-gate'].every(phase => (
      result.response.phaseTrace.find(trace => trace.phase === phase)?.resolution === 'accepted'
    ))
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
      evaluationCount: Number.isFinite(trace.evaluationCount) ? trace.evaluationCount : null,
      cacheHitCount: Number.isFinite(trace.cacheHitCount) ? trace.cacheHitCount : null,
      scannedNodeCount: Number.isFinite(trace.scannedNodeCount) ? trace.scannedNodeCount : null,
      scannedSegmentCount: Number.isFinite(trace.scannedSegmentCount)
        ? trace.scannedSegmentCount
        : null,
      scannedEdgePairCount: Number.isFinite(trace.scannedEdgePairCount)
        ? trace.scannedEdgePairCount
        : null,
      workItemCount: Number.isFinite(trace.workItemCount) ? trace.workItemCount : null,
      candidateCount: Number.isFinite(trace.candidateCount) ? trace.candidateCount : null,
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

export const summarizeDisplayRoutingOutlierSamples = (
  samplesValue,
  nodeId,
  limit = 5,
) => {
  if (
    !Array.isArray(samplesValue)
    || typeof nodeId !== 'string'
    || nodeId.length === 0
    || nodeId.length > 128
    || !Number.isSafeInteger(limit)
    || limit < 1
    || limit > 20
  ) return [];
  const finiteMetric = value => (
    Number.isFinite(value) && value >= 0 && value <= 600_000 ? value : null
  );
  const digest = value => (
    typeof value === 'string' && /^probe-v1:[0-9a-f]{32}$/.test(value) ? value : null
  );
  return samplesValue.flatMap((sample, sampleIndex) => {
    const dragCase = Array.isArray(sample?.dragCases)
      ? sample.dragCases.find(item => item?.nodeId === nodeId)
      : null;
    if (!dragCase) return [];
    const caseOrder = Array.isArray(sample?.dragCases)
      ? sample.dragCases.flatMap(item => (
        typeof item?.nodeId === 'string' && item.nodeId.length <= 128 ? [item.nodeId] : []
      ))
      : [];
    const casePosition = caseOrder.indexOf(nodeId);
    const phaseTrace = Array.isArray(dragCase.phaseTrace) ? dragCase.phaseTrace : [];
    const localRoute = phaseTrace.find(trace => trace?.phase === 'local-route');
    const generation = phaseTrace.find(
      trace => trace?.phase === 'local-reconnect-path-generation',
    );
    return [{
      sampleIndex: sampleIndex + 1,
      caseOrder,
      casePosition: casePosition >= 0 ? casePosition + 1 : null,
      elapsedMs: finiteMetric(sample?.benchmark?.elapsedMs),
      releaseToFinalMs: finiteMetric(dragCase.releaseToFinalMs),
      workerComputeMs: finiteMetric(dragCase.workerDurationMs),
      workerDeliveryWaitMs: finiteMetric(dragCase.workerDeliveryWaitMs),
      workerLongTaskTotalMs: finiteMetric(dragCase.workerLongTaskTotalMs),
      workerLongTaskMaxMs: finiteMetric(dragCase.workerLongTaskMaxMs),
      localRouteMs: finiteMetric(localRoute?.durationMs),
      nodeGeometryDigest: digest(
        dragCase?.driftProbe?.incremental?.next?.nodeGeometryDigest,
      ),
      generation: {
        candidateCount: finiteMetric(generation?.candidateCount),
        underBudgetCount: finiteMetric(generation?.underBudgetCount),
        minimumCandidateCount: finiteMetric(generation?.minimumCandidateCount),
        maximumCandidateCount: finiteMetric(generation?.maximumCandidateCount),
      },
      slowestPhases: summarizeSlowestDisplayRoutingPhases(phaseTrace, 4),
    }];
  }).sort((left, right) => (
    (right.localRouteMs ?? -1) - (left.localRouteMs ?? -1)
    || (right.releaseToFinalMs ?? -1) - (left.releaseToFinalMs ?? -1)
    || left.sampleIndex - right.sampleIndex
  )).slice(0, limit);
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
