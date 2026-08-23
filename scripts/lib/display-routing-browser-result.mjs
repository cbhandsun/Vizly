const finiteMetric = value => Number.isFinite(value) && value >= 0 ? value : null;

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
    candidateCount: finiteMetric(trace.candidateCount),
  }];
}) : [];

export const buildDisplayRoutingMachineResult = (results) => ({
  initialRouteMs: Array.isArray(results)
    ? results.map(result => finiteMetric(result?.initial?.routeMs))
    : [],
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
      workerAbortCount: finiteMetric(result?.incremental?.routing?.workerAbortCount),
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
