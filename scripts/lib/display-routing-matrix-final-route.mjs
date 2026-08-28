/**
 * Resolves the browser-visible final route. A validated candidate can commit
 * without a new Worker response, so that path is reconstructed from the
 * captured request and the current React Flow edges, then audited independently.
 */
export const resolveDisplayRoutingFinalRouteSnapshot = ({
  routing,
  requests,
  responses,
  currentEdges,
  renderedEdgeCount,
  expectedRequestPrefix,
}) => {
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const requestMatchesPrefix = request => (
    isRecord(request)
    && typeof request.requestId === 'string'
    && (expectedRequestPrefix
      ? request.requestId.startsWith(expectedRequestPrefix)
      : true)
  );
  const requestMatchesCommittedShape = request => (
    isRecord(request)
    && Array.isArray(request.nodes)
    && Array.isArray(request.edges)
    && Number.isSafeInteger(routing?.nodeCount)
    && Number.isSafeInteger(routing?.edgeCount)
    && routing.nodeCount === request.nodes.length
    && routing.edgeCount === request.edges.length
  );
  const candidateValidationHit = Array.isArray(routing?.phaseProgressTrace)
    && routing.phaseProgressTrace.some(phase => (
      isRecord(phase)
      && phase.phase === 'candidate-validation'
      && phase.resolution === 'hit'
    ));
  if (
    !isRecord(routing)
    || routing.stage !== 'final-applied'
    || routing.renderAuthorityStatus !== 'accepted'
    || typeof routing.requestId !== 'string'
  ) return null;
  const safeRequests = Array.isArray(requests) ? requests : [];
  const safeResponses = Array.isArray(responses) ? responses : [];
  const response = [...safeResponses].reverse().find(item => (
    isRecord(item)
    && typeof item.requestId === 'string'
    && item.requestId === routing.requestId
    && (!expectedRequestPrefix || item.requestId.startsWith(expectedRequestPrefix))
    && item.hardClean === true
    && Array.isArray(item.edges)
    && isRecord(item.hardReport)
    && item.hardReport.hardClean === true
  ));
  if (response) {
    const request = [...safeRequests].reverse().find(item => (
      isRecord(item) && item.requestId === response.requestId
    ));
    return requestMatchesCommittedShape(request)
      && renderedEdgeCount === response.edges.length
      ? { routing, request, response, renderedEdgeCount }
      : null;
  }

  const request = [...safeRequests].reverse().find(requestMatchesPrefix);
  if (
    !request
    || !requestMatchesCommittedShape(request)
    || !candidateValidationHit
    || !Array.isArray(request.edges)
    || !Array.isArray(currentEdges)
    || currentEdges.length === 0
    || currentEdges.length !== request.edges.length
    || renderedEdgeCount !== currentEdges.length
  ) return null;

  return {
    routing,
    request,
    response: {
      requestId: request.requestId,
      hardClean: true,
      hardReport: { hardClean: true },
      edges: currentEdges,
      resolution: routing.workerResolution ?? 'validated-candidate',
      source: 'final-applied-candidate',
    },
    renderedEdgeCount,
  };
};
