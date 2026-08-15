export const DISPLAY_ROUTING_PERFORMANCE_BUDGET_MS = Object.freeze({
  initialRoute: 750,
  releaseToFinal: 1_000,
  workerToFinal: 750,
  localRoute: 250,
});

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
    initialPhaseTrace: initial?.phaseTrace ?? [],
    incrementalPhaseTrace: incremental?.response?.phaseTrace ?? [],
    budgets: DISPLAY_ROUTING_PERFORMANCE_BUDGET_MS,
    exceeded,
  }, null, 2)}`);
};
