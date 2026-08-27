const finiteMetric = value => Number.isFinite(value) && value >= 0 ? value : null;
const safeProbeDigest = value => (
  typeof value === 'string' && /^probe-v1:[0-9a-f]{32}$/.test(value) ? value : null
);

const projectDriftProbeSide = value => {
  if (!value || value.schema !== 'routing-drift-v1') return null;
  return {
    operation: ['route', 'validate-or-route', 'incremental-route', 'repair', 'invalid']
      .includes(value.operation) ? value.operation : 'invalid',
    baseline: {
      sessionRefPresent: value?.baseline?.sessionRefPresent === true,
      inlineBootstrapPresent: value?.baseline?.inlineBootstrapPresent === true,
      inputDigest: safeProbeDigest(value?.baseline?.inputDigest),
      routeDigest: safeProbeDigest(value?.baseline?.routeDigest),
    },
    next: {
      inputDigest: safeProbeDigest(value?.next?.inputDigest),
      projectedGeometryDigest: safeProbeDigest(value?.next?.projectedGeometryDigest),
      nodeGeometryDigest: safeProbeDigest(value?.next?.nodeGeometryDigest),
      edgeTopologyDigest: safeProbeDigest(value?.next?.edgeTopologyDigest),
      edgeSourcePathDigest: safeProbeDigest(value?.next?.edgeSourcePathDigest),
      nodeCount: finiteMetric(value?.next?.nodeCount),
      edgeCount: finiteMetric(value?.next?.edgeCount),
      fractionalGeometryCount: finiteMetric(value?.next?.fractionalGeometryCount),
      nonFiniteGeometryCount: finiteMetric(value?.next?.nonFiniteGeometryCount),
      absolutePositionPresentCount: finiteMetric(value?.next?.absolutePositionPresentCount),
      measuredSizePresentCount: finiteMetric(value?.next?.measuredSizePresentCount),
    },
    change: {
      reason: typeof value?.change?.reason === 'string'
        ? value.change.reason.slice(0, 32)
        : 'invalid',
      classification: typeof value?.change?.classification === 'string'
        ? value.change.classification.slice(0, 32)
        : 'invalid',
      changedNodeCount: finiteMetric(value?.change?.changedNodeCount),
      changedEdgeCount: finiteMetric(value?.change?.changedEdgeCount),
      mutableEdgeCount: finiteMetric(value?.change?.mutableEdgeCount),
      contextEdgeCount: finiteMetric(value?.change?.contextEdgeCount),
      changedSetDigest: safeProbeDigest(value?.change?.changedSetDigest),
      closureSetDigest: safeProbeDigest(value?.change?.closureSetDigest),
    },
  };
};

const projectDriftProbe = value => ({
  initial: projectDriftProbeSide(value?.initial),
  incremental: projectDriftProbeSide(value?.incremental),
});

const projectPhaseTrace = value => Array.isArray(value) ? value.slice(0, 128).flatMap(trace => {
  if (!trace || typeof trace.phase !== 'string' || trace.phase.length > 128) return [];
  const durationMs = finiteMetric(trace.durationMs);
  if (durationMs === null) return [];
  return [{
    phase: trace.phase,
    parentPhase: typeof trace.parentPhase === 'string' ? trace.parentPhase.slice(0, 128) : null,
    durationMs,
    exclusiveDurationMs: finiteMetric(trace.exclusiveDurationMs) ?? durationMs,
    resolution: typeof trace.resolution === 'string' ? trace.resolution.slice(0, 32) : null,
    evaluationCount: finiteMetric(trace.evaluationCount),
    cacheHitCount: finiteMetric(trace.cacheHitCount),
    scannedNodeCount: finiteMetric(trace.scannedNodeCount),
    scannedSegmentCount: finiteMetric(trace.scannedSegmentCount),
    scannedEdgePairCount: finiteMetric(trace.scannedEdgePairCount),
    workItemCount: finiteMetric(trace.workItemCount),
    budgetCount: finiteMetric(trace.budgetCount),
    underBudgetCount: finiteMetric(trace.underBudgetCount),
    minimumCandidateCount: finiteMetric(trace.minimumCandidateCount),
    maximumCandidateCount: finiteMetric(trace.maximumCandidateCount),
    candidateCount: finiteMetric(trace.candidateCount),
  }];
}) : [];

export const buildDisplayRoutingMachineResult = (results) => ({
  initialRouteMs: Array.isArray(results)
    ? results.map(result => finiteMetric(result?.initial?.routeMs))
    : [],
  initialRoutes: Array.isArray(results) ? results.map(result => ({
    nodeId: typeof result?.nodeId === 'string' ? result.nodeId.slice(0, 128) : '<invalid>',
    routeMs: finiteMetric(result?.initial?.routeMs),
    workerResolution: typeof result?.initial?.workerResolution === 'string'
      ? result.initial.workerResolution.slice(0, 32)
      : null,
    workerStartCount: finiteMetric(result?.initial?.workerStartCount),
    workerAbortCount: finiteMetric(result?.initial?.workerAbortCount),
    scheduledToWorkerMs: Number.isFinite(result?.initial?.scheduledAt)
      && Number.isFinite(result?.initial?.workerStartedAt)
      ? Math.max(0, result.initial.workerStartedAt - result.initial.scheduledAt)
      : null,
    workerRequestDelayMs: Number.isFinite(result?.initial?.workerStartedAt)
      && Number.isFinite(result?.initial?.workerRequestAt)
      ? Math.max(0, result.initial.workerRequestAt - result.initial.workerStartedAt)
      : null,
    workerRoundTripMs: Number.isFinite(result?.initial?.workerRequestAt)
      && Number.isFinite(result?.initial?.workerResponseAt)
      ? Math.max(0, result.initial.workerResponseAt - result.initial.workerRequestAt)
      : null,
    workerDurationMs: finiteMetric(result?.initial?.workerDurationMs),
    workerDeliveryWaitMs: Number.isFinite(result?.initial?.workerRequestAt)
      && Number.isFinite(result?.initial?.workerResponseAt)
      && Number.isFinite(result?.initial?.workerDurationMs)
      ? Math.max(
        0,
        result.initial.workerResponseAt
          - result.initial.workerRequestAt
          - result.initial.workerDurationMs,
      )
      : null,
    workerBoundaryParseMs: Number.isFinite(result?.initial?.workerResponseAt)
      && Number.isFinite(result?.initial?.workerResponseParsedAt)
      ? Math.max(0, result.initial.workerResponseParsedAt - result.initial.workerResponseAt)
      : null,
    parsedToFinalMs: Number.isFinite(result?.initial?.workerResponseParsedAt)
      && Number.isFinite(result?.initial?.finalAppliedAt)
      ? Math.max(0, result.initial.finalAppliedAt - result.initial.workerResponseParsedAt)
      : null,
    totalRouteMs: finiteMetric(result?.initial?.totalRouteMs),
    phaseTrace: projectPhaseTrace(result?.initial?.phaseTrace),
  })) : [],
  dragCases: Array.isArray(results) ? results.map((result) => {
    const localRoute = result?.incremental?.response?.phaseTrace
      ?.find(trace => trace?.phase === 'local-route');
    return {
      nodeId: typeof result?.nodeId === 'string' ? result.nodeId.slice(0, 128) : '<invalid>',
      releaseToFinalMs: finiteMetric(result?.incremental?.releaseToFinalMs),
      workerToFinalMs: finiteMetric(result?.incremental?.workerToFinalMs),
      workerRoundTripMs: finiteMetric(result?.incremental?.workerRoundTripMs),
      workerDurationMs: finiteMetric(result?.incremental?.response?.workerDurationMs),
      workerDeliveryWaitMs: finiteMetric(result?.incremental?.workerDeliveryWaitMs),
      workerLongTaskCount: finiteMetric(result?.incremental?.workerLongTaskCount),
      workerLongTaskTotalMs: finiteMetric(result?.incremental?.workerLongTaskTotalMs),
      workerLongTaskMaxMs: finiteMetric(result?.incremental?.workerLongTaskMaxMs),
      responseToFinalMs: finiteMetric(result?.incremental?.responseToFinalMs),
      workerBoundaryParseMs: finiteMetric(result?.incremental?.workerBoundaryParseMs),
      parsedToFinalMs: finiteMetric(result?.incremental?.parsedToFinalMs),
      localRouteMs: finiteMetric(localRoute?.durationMs),
      mutableEdgeCount: finiteMetric(result?.incremental?.mutableEdgeCount),
      affectedEdgeCount: finiteMetric(result?.incremental?.response?.affectedEdgeCount),
      fallbackLevel: result?.incremental?.response?.fallbackLevel === 'none' ? 'none' : 'full',
      workerStartCount: finiteMetric(result?.incremental?.routing?.workerStartCountDelta),
      workerAbortCount: finiteMetric(result?.incremental?.routing?.workerAbortCountDelta),
      driftProbe: projectDriftProbe(result?.incremental?.driftProbe),
      phaseTrace: projectPhaseTrace(result?.incremental?.response?.phaseTrace),
    };
  }) : [],
});

export const formatDisplayRoutingDragResult = (result) => {
  const phase = name => result.incremental.response.phaseTrace
    .find(trace => trace.phase === name);
  const clearanceRisks = result.incrementalRenderedObstacleAudit
    .commercialClearanceRisks ?? [];
  const clearanceSummary = clearanceRisks.length === 0
    ? 'none'
    : clearanceRisks.map(risk => (
      `${risk.edgeId}->${risk.nodeId}:${Number(risk.clearance).toFixed(1)}px`
    )).join(',');
  const safety = result.incremental.response.phaseTrace
    .filter(trace => trace.phase.startsWith('final-safety-')
      && trace.phase !== 'final-safety-closure')
    .map(trace => `${trace.phase.replace('final-safety-', '')}=${trace.durationMs}ms/${trace.resolution}`)
    .join(',');
  const localDetail = result.incremental.response.phaseTrace
    .filter(trace => trace.parentPhase === 'local-route')
    .map(trace => `${trace.phase.replace('local-', '')}=${trace.durationMs}ms/${trace.resolution}`)
    .join(',');
  return {
    clearanceRisks,
    line: `${result.nodeId}: initial=${result.initial.routeMs}ms, `
      + `releaseToFinal=${result.incremental.releaseToFinalMs}ms, `
      + `workerToFinal=${result.incremental.workerToFinalMs}ms, `
      + `workerRoundTrip=${result.incremental.workerRoundTripMs}ms, `
      + `workerCompute=${result.incremental.response.workerDurationMs}ms, `
      + `deliveryWait=${result.incremental.workerDeliveryWaitMs}ms, `
      + `longTasks=${result.incremental.workerLongTaskCount}/`
      + `${Number(result.incremental.workerLongTaskTotalMs ?? 0).toFixed(1)}ms/`
      + `${Number(result.incremental.workerLongTaskMaxMs ?? 0).toFixed(1)}ms, `
      + `responseToFinal=${result.incremental.responseToFinalMs}ms, `
      + `boundaryParse=${result.incremental.workerBoundaryParseMs}ms, `
      + `parsedToFinal=${result.incremental.parsedToFinalMs}ms, `
      + `local=${phase('local-route')?.durationMs}ms[${localDetail}], `
      + `finalizer=${phase('finalizer')?.durationMs}ms, `
      + `closure=${phase('final-safety-closure')?.durationMs}ms, safety=[${safety}], `
      + `mutable=${result.incremental.mutableEdgeCount}, `
      + `affected=${result.incremental.response.affectedEdgeCount}, `
      + `commercialClearanceDegrades=${clearanceRisks.length} (${clearanceSummary}).`,
  };
};
