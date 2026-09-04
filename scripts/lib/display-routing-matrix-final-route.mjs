/**
 * Resolves the browser-visible final route. A validated candidate can commit
 * without a new Worker response, so that path is reconstructed from the
 * captured request and the current React Flow edges, then audited independently.
 */
export const findDisplayRoutingRequestForResponse = (requests, response) => {
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!Array.isArray(requests) || !isRecord(response) || typeof response.requestId !== 'string') {
    return null;
  }
  return [...requests].reverse().find(request => (
    isRecord(request)
    && request.requestId === response.requestId
    && (
      !Number.isSafeInteger(response.__browserRequestOrdinal)
      || request.__browserRequestOrdinal === response.__browserRequestOrdinal
    )
    && (
      typeof response.__browserWorkerInstanceId !== 'string'
      || request.__browserWorkerInstanceId === response.__browserWorkerInstanceId
    )
    && (
      !Number.isFinite(request.__browserCapturedAt)
      || !Number.isFinite(response.__browserCapturedAt)
      || request.__browserCapturedAt <= response.__browserCapturedAt
    )
  )) ?? null;
};

/**
 * Layout may require one post-render routing pass after React Flow normalizes
 * compound geometry. That is still the same long-lived Worker session; a new
 * Worker instance or an unbounded number of follow-up jobs is not.
 */
export const isDisplayRoutingWorkerSessionContinuous = (
  beforeRoute,
  afterRoute,
  maxAdditionalRoutingStarts = 1,
) => {
  const beforeInstanceId = beforeRoute?.request?.__browserWorkerInstanceId;
  const afterInstanceId = afterRoute?.request?.__browserWorkerInstanceId;
  const beforeStartCount = beforeRoute?.routing?.workerStartCount;
  const afterStartCount = afterRoute?.routing?.workerStartCount;
  return typeof beforeInstanceId === 'string'
    && beforeInstanceId.length > 0
    && beforeInstanceId === afterInstanceId
    && Number.isSafeInteger(beforeStartCount)
    && Number.isSafeInteger(afterStartCount)
    && Number.isSafeInteger(maxAdditionalRoutingStarts)
    && maxAdditionalRoutingStarts >= 0
    && afterStartCount >= beforeStartCount
    && afterStartCount <= beforeStartCount + maxAdditionalRoutingStarts;
};

export const resolveDisplayRoutingFinalRouteSnapshot = ({
  routing,
  requests,
  responses,
  currentNodes,
  currentEdges,
  renderedEdgeCount,
  expectedRequestPrefix,
  minimumExclusiveLayoutJobId,
  committedEdgesMatchWorkerPatches,
}) => {
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
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
  // Geometry can be applied before the command finishes restoring selection
  // and releasing its preview. A new-layout waiter must observe the complete
  // transaction, including on Worker-response and validated-candidate paths.
  if (expectedRequestPrefix === 'layout:' && minimumExclusiveLayoutJobId !== undefined) {
    const jobId = routing.layoutTransactionJobId;
    const requestPrefix = `layout:${jobId}`;
    const routingClaimsLayoutRequest = routing.requestId.startsWith('layout:');
    if (!Number.isSafeInteger(minimumExclusiveLayoutJobId) || minimumExclusiveLayoutJobId < 0
      || !Number.isSafeInteger(jobId) || jobId <= minimumExclusiveLayoutJobId
      || routing.layoutTransactionStatus !== 'committed'
      || (routingClaimsLayoutRequest
        && routing.requestId !== requestPrefix
        && !routing.requestId.startsWith(`${requestPrefix}:`))) {
      return null;
    }
  }
  const safeRequests = Array.isArray(requests) ? requests : [];
  const safeResponses = Array.isArray(responses) ? responses : [];
  const committedLayoutPrefix = expectedRequestPrefix === 'layout:'
    && Number.isSafeInteger(routing.layoutTransactionJobId)
    ? `layout:${routing.layoutTransactionJobId}`
    : null;
  const routingUsesCommittedLayoutRequest = Boolean(
    committedLayoutPrefix
    && (routing.requestId === committedLayoutPrefix
      || routing.requestId.startsWith(`${committedLayoutPrefix}:`)),
  );
  const requestMatchesPrefix = request => (
    isRecord(request)
    && typeof request.requestId === 'string'
    && (committedLayoutPrefix
      ? request.requestId === committedLayoutPrefix
        || request.requestId.startsWith(`${committedLayoutPrefix}:`)
      : expectedRequestPrefix
        ? request.requestId.startsWith(expectedRequestPrefix)
        : true)
  );
  const responseMatchesExpectedRequest = item => (
    isRecord(item)
    && typeof item.requestId === 'string'
    && (committedLayoutPrefix
      ? item.requestId === routing.requestId
        || item.requestId === committedLayoutPrefix
        || item.requestId.startsWith(`${committedLayoutPrefix}:`)
      : !expectedRequestPrefix || item.requestId.startsWith(expectedRequestPrefix))
  );
  const responseMatchesCommittedOutput = item => (
    typeof item?.outputRouteSignature === 'string'
    && typeof routing.outputRouteSignature === 'string'
    && item.outputRouteSignature === routing.outputRouteSignature
  );
  const response = [...safeResponses].reverse().find(item => (
    responseMatchesExpectedRequest(item)
    && item.hardClean === true
    && (Array.isArray(item.edges) || Array.isArray(item.routingPatches))
    && isRecord(item.hardReport)
    && item.hardReport.hardClean === true
    && (
      item.requestId === routing.requestId
        && (
          !committedLayoutPrefix
          || routingUsesCommittedLayoutRequest
          || responseMatchesCommittedOutput(item)
          || (
            typeof committedEdgesMatchWorkerPatches === 'function'
            && committedEdgesMatchWorkerPatches(currentEdges, item.routingPatches ?? item.edges)
          )
        )
      || (
        committedLayoutPrefix
        && typeof committedEdgesMatchWorkerPatches === 'function'
        && committedEdgesMatchWorkerPatches(currentEdges, item.routingPatches ?? item.edges)
      )
    )
  ));
  if (response) {
    const request = findDisplayRoutingRequestForResponse(safeRequests, response);
    const responseEdges = Array.isArray(response.edges) ? response.edges : currentEdges;
    return requestMatchesCommittedShape(request)
      && Array.isArray(responseEdges)
      && responseEdges.length === request.edges.length
      && renderedEdgeCount === responseEdges.length
      ? {
        routing,
        request,
        response: Array.isArray(response.edges)
          ? response
          : { ...response, edges: responseEdges, source: 'current-edges-for-routing-patches' },
        renderedEdgeCount,
      }
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
