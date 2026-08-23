export const summarizeDisplayRoutingWaitState = (routingValue, responseValue, edgeCountValue) => {
  const record = value => (
    typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
  );
  const finite = value => (
    typeof value === 'number' && Number.isFinite(value) ? value : undefined
  );
  const integer = value => (
    Number.isSafeInteger(value) && value >= 0 ? value : undefined
  );
  const token = value => (
    typeof value === 'string' && /^[a-z0-9:-]{1,64}$/i.test(value) ? value : undefined
  );
  const routing = record(routingValue);
  const responses = Array.isArray(responseValue) ? responseValue : [];
  const response = record(responses.at(-1));
  const report = record(response.hardReport);
  const quality = record(report.quality);
  const traces = Array.isArray(response.phaseTrace) ? response.phaseTrace.slice(-24) : [];
  const metric = key => finite(quality[key]);
  return {
    routing: {
      stage: token(routing.stage),
      workerResolution: token(routing.workerResolution),
      nodeCount: integer(routing.nodeCount),
      edgeCount: integer(routing.edgeCount),
      workerStartCount: integer(routing.workerStartCount),
      workerAbortCount: integer(routing.workerAbortCount),
      geometryBarrierResolution: token(routing.geometryBarrierResolution),
      geometryBarrierMs: finite(routing.geometryBarrierMs),
    },
    responseCount: responses.length,
    lastResponse: {
      routeResolution: token(response.routeResolution),
      hardClean: typeof response.hardClean === 'boolean' ? response.hardClean : undefined,
      workerDurationMs: finite(response.workerDurationMs),
      hardReport: {
        hardClean: typeof report.hardClean === 'boolean' ? report.hardClean : undefined,
        obstacleHits: integer(report.obstacleHits),
        terminalsAttached: typeof report.terminalsAttached === 'boolean'
          ? report.terminalsAttached : undefined,
        terminalsAnchored: typeof report.terminalsAnchored === 'boolean'
          ? report.terminalsAnchored : undefined,
        minimumClearanceViolations: integer(report.minimumClearanceViolations),
        quality: {
          nonOrthogonalSegments: metric('nonOrthogonalSegments'),
          strictCrossings: metric('strictCrossings'),
          reverseOverlap: metric('reverseOverlap'),
          unrelatedOverlap: metric('unrelatedOverlap'),
          unexplainedRelatedOverlap: metric('unexplainedRelatedOverlap'),
          shortEndpointStubs: metric('shortEndpointStubs'),
          tinyInteriorDoglegs: metric('tinyInteriorDoglegs'),
          hairpins: metric('hairpins'),
        },
      },
      phaseTrace: traces.map(value => {
        const trace = record(value);
        return {
          phase: token(trace.phase),
          parentPhase: token(trace.parentPhase),
          durationMs: finite(trace.durationMs),
          exclusiveDurationMs: finite(trace.exclusiveDurationMs),
          candidateCount: integer(trace.candidateCount),
          changedEdgeCount: integer(trace.changedEdgeCount),
          evaluationCount: integer(trace.evaluationCount),
          cacheHitCount: integer(trace.cacheHitCount),
          scannedNodeCount: integer(trace.scannedNodeCount),
          scannedSegmentCount: integer(trace.scannedSegmentCount),
          scannedEdgePairCount: integer(trace.scannedEdgePairCount),
          resolution: token(trace.resolution),
        };
      }),
    },
    renderedEdgeCount: integer(edgeCountValue),
  };
};
