/**
 * Resolves the browser-visible final route. A validated candidate can commit
 * without a new Worker response, so that path is reconstructed from the
 * captured request and the current React Flow edges, then audited independently.
 */
export const resolveDisplayRoutingFinalRouteSnapshot = ({
  routing,
  requests,
  responses,
  currentNodes,
  currentEdges,
  renderedEdgeCount,
  expectedRequestPrefix,
  minimumExclusiveLayoutJobId,
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
  const requestMatchesResponseIdentity = (request, response) => (
    isRecord(request)
    && isRecord(response)
    && request.requestId === response.requestId
    && (
      !Number.isSafeInteger(response.__browserRequestOrdinal)
      || request.__browserRequestOrdinal === response.__browserRequestOrdinal
    )
    && (
      typeof response.__browserWorkerInstanceId !== 'string'
      || request.__browserWorkerInstanceId === response.__browserWorkerInstanceId
    )
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
      requestMatchesResponseIdentity(item, response)
    ));
    return requestMatchesCommittedShape(request)
      && renderedEdgeCount === response.edges.length
      ? { routing, request, response, renderedEdgeCount }
      : null;
  }

  const trustedRuntimeCommit = expectedRequestPrefix === 'layout:'
    && Number.isSafeInteger(minimumExclusiveLayoutJobId)
    && Number.isSafeInteger(routing.layoutTransactionJobId)
    && routing.layoutTransactionJobId > minimumExclusiveLayoutJobId
    && routing.layoutTransactionStatus === 'committed'
    && routing.cacheTrustLevel === 'runtime-committed'
    && routing.requestId.startsWith(expectedRequestPrefix)
    && Array.isArray(currentNodes)
    && Array.isArray(currentEdges)
    && currentNodes.length > 0
    && currentEdges.length > 0
    && routing.nodeCount === currentNodes.length
    && routing.edgeCount === currentEdges.length
    && renderedEdgeCount === currentEdges.length;
  if (trustedRuntimeCommit && safeRequests.length === 0 && safeResponses.length === 0) {
    return {
      routing,
      request: {
        requestId: routing.requestId,
        nodes: currentNodes,
        edges: currentEdges,
        source: 'runtime-committed-cache',
      },
      response: {
        requestId: routing.requestId,
        hardClean: true,
        hardReport: { hardClean: true },
        edges: currentEdges,
        routeResolution: 'runtime-committed-cache',
        resolution: 'runtime-committed-cache',
        source: 'runtime-committed-cache',
      },
      renderedEdgeCount,
    };
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
