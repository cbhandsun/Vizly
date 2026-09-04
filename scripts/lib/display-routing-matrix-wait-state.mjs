export const summarizeDisplayRoutingWaitState = (
  routingValue,
  responseValue,
  edgeCountValue,
  requestValue = [],
) => {
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
  const boolean = value => (typeof value === 'boolean' ? value : undefined);
  const workerError = value => (
    ['display-edge-worker-invalid-request', 'display-edge-worker-failed'].includes(value) ? value : undefined
  );
  const projectSeedAudit = (value) => {
    const audit = record(value);
    return {
      terminalsAttached: boolean(audit.terminalsAttached),
      terminalsAnchored: boolean(audit.terminalsAnchored),
      obstacleHits: integer(audit.obstacleHits),
      strictCrossings: integer(audit.strictCrossings),
    };
  };
  const requestKind = value => (
    typeof value !== 'string'
      ? undefined
      : value.startsWith('layout:')
        ? 'layout'
        : 'display'
  );
  const routing = record(routingValue);
  const layoutSeedStageAudits = record(routing.layoutSeedStageAudits);
  const responses = Array.isArray(responseValue) ? responseValue : [];
  const requests = Array.isArray(requestValue) ? requestValue : [];
  const response = record([...responses].reverse().find(value => (
    typeof record(value).hardClean === 'boolean' || typeof record(value).error === 'string'
  )) ?? responses.at(-1));
  const report = record(response.hardReport);
  const quality = record(report.quality);
  const traces = Array.isArray(response.phaseTrace) ? response.phaseTrace.slice(-24) : [];
  const responseProgressTraces = responses.flatMap(value => {
    const trace = record(value).phaseProgress;
    return typeof trace === 'object' && trace !== null ? [trace] : [];
  });
  const availableProgressTraces = responseProgressTraces.length > 0
    ? responseProgressTraces
    : Array.isArray(routing.phaseProgressTrace)
      ? routing.phaseProgressTrace
      : [];
  const progressTraces = availableProgressTraces.length <= 48
    ? availableProgressTraces
    : [
      ...availableProgressTraces.slice(0, 16),
      ...availableProgressTraces.slice(-32),
    ];
  const completedResponses = responses.filter(value => {
    const candidate = record(value);
    return typeof candidate.hardClean === 'boolean'
      || typeof candidate.routeResolution === 'string'
      || typeof candidate.error === 'string';
  });
  const metric = key => finite(quality[key]);
  const identityToken = value => (
    typeof value === 'string'
      && (/^\d{1,10}$/.test(value) || /^geometry-v1:[0-9a-f]{32}$/.test(value))
      ? value
      : undefined
  );
  const opaqueFingerprint = value => {
    let hash = 2166136261;
    const text = JSON.stringify(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return String(hash >>> 0);
  };
  const nodeGeometryFingerprint = value => !Array.isArray(value) ? undefined : opaqueFingerprint(
    value.map((item) => {
      const node = record(item);
      const position = record(node.positionAbsolute ?? node.position);
      const measured = record(node.measured);
      const style = record(node.style);
      return [
        node.id,
        node.type,
        node.parentId,
        position.x,
        position.y,
        measured.width ?? node.width ?? style.width,
        measured.height ?? node.height ?? style.height,
      ];
    }),
  );
  const edgeRouteFingerprint = value => !Array.isArray(value) ? undefined : opaqueFingerprint(
    value.map((item) => {
      const edge = record(item);
      const data = record(edge.data);
      return [
        edge.id,
        edge.source,
        edge.target,
        edge.sourceHandle,
        edge.targetHandle,
        edge.type,
        data.computedPath,
      ];
    }),
  );
  const projectTrace = (value) => {
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
      workItemCount: integer(trace.workItemCount),
      resolution: token(trace.resolution),
    };
  };
  return {
    routing: {
      stage: token(routing.stage),
      requestId: token(routing.requestId),
      requestKind: requestKind(routing.requestId),
      renderAuthorityStatus: token(routing.renderAuthorityStatus),
      workerResolution: token(routing.workerResolution),
      nodeCount: integer(routing.nodeCount),
      edgeCount: integer(routing.edgeCount),
      workerStartCount: integer(routing.workerStartCount),
      workerAbortCount: integer(routing.workerAbortCount),
      geometryBarrierResolution: token(routing.geometryBarrierResolution),
      geometryBarrierMs: finite(routing.geometryBarrierMs),
      stagedLayoutPrimarySignature: identityToken(routing.stagedLayoutPrimarySignature),
      stagedLayoutPrimaryGeometryDigest: identityToken(
        routing.stagedLayoutPrimaryGeometryDigest,
      ),
      stagedLayoutSourceSignature: identityToken(routing.stagedLayoutSourceSignature),
      stagedLayoutSourceGeometryDigest: identityToken(
        routing.stagedLayoutSourceGeometryDigest,
      ),
      layoutSeedTerminalsAttached: boolean(routing.layoutSeedTerminalsAttached),
      layoutSeedTerminalsAnchored: boolean(routing.layoutSeedTerminalsAnchored),
      layoutSeedObstacleHits: integer(routing.layoutSeedObstacleHits),
      layoutSeedStrictCrossings: integer(routing.layoutSeedStrictCrossings),
      layoutSeedStageAudits: Object.fromEntries(
        [
          'raw',
          'anchored',
          'detached-fallback',
          'axis-repaired',
          'geometry-normalized',
          'final',
        ].flatMap(stage => Object.prototype.hasOwnProperty.call(layoutSeedStageAudits, stage)
          ? [[stage, projectSeedAudit(layoutSeedStageAudits[stage])]]
          : []),
      ),
      layoutTransactionJobId: integer(routing.layoutTransactionJobId),
      layoutTransactionStatus: token(routing.layoutTransactionStatus),
      layoutTransactionAttemptCount: integer(routing.layoutTransactionAttemptCount),
      layoutTransactionErrorCode: token(routing.layoutTransactionErrorCode),
      phaseProgressTrace: progressTraces.map(projectTrace),
    },
    responseCount: responses.length,
    responseTrace: completedResponses.slice(-16).map((value) => {
      const candidate = record(value);
      const identity = record(candidate.nextIdentity ?? record(candidate.sessionRef).identity);
      return {
        requestId: token(candidate.requestId),
        requestKind: requestKind(candidate.requestId),
        error: workerError(candidate.error),
        routeResolution: token(candidate.routeResolution),
        hardClean: typeof candidate.hardClean === 'boolean' ? candidate.hardClean : undefined,
        inputSignature: identityToken(identity.inputSignature),
        inputGeometryDigest: identityToken(identity.inputGeometryDigest),
        edgeRouteFingerprint: edgeRouteFingerprint(candidate.edges),
        edgeObjectFingerprint: Array.isArray(candidate.edges)
          ? opaqueFingerprint(candidate.edges)
          : undefined,
      };
    }),
    requestTrace: requests.slice(-16).map((value) => {
      const request = record(value);
      const layoutSeedAudit = record(request.__browserLayoutSeedAudit);
      return {
        requestId: token(request.requestId),
        requestKind: requestKind(request.requestId),
        operation: token(request.operation),
        changeClassification: token(record(request.changeSet).classification),
        changeReason: token(record(request.changeSet).reason),
        changedNodeCount: Array.isArray(record(request.changeSet).changedNodeIds)
          ? integer(record(request.changeSet).changedNodeIds.length)
          : undefined,
        mutableEdgeCount: Array.isArray(request.mutableEdgeIds)
          ? integer(request.mutableEdgeIds.length)
          : undefined,
        contextEdgeCount: Array.isArray(request.contextEdgeIds)
          ? integer(request.contextEdgeIds.length)
          : undefined,
        inputSignature: identityToken(request.inputSignature ?? request.nextInputSignature),
        inputGeometryDigest: identityToken(
          request.inputGeometryDigest ?? request.nextInputGeometryDigest,
        ),
        nodeCount: Array.isArray(request.nodes) ? integer(request.nodes.length) : undefined,
        edgeCount: Array.isArray(request.edges) ? integer(request.edges.length) : undefined,
        layoutSeedAudit: projectSeedAudit(layoutSeedAudit),
        nodeGeometryFingerprint: nodeGeometryFingerprint(request.nodes),
        edgeRouteFingerprint: edgeRouteFingerprint(request.edges),
        nodeObjectFingerprint: Array.isArray(request.nodes)
          ? opaqueFingerprint(request.nodes)
          : undefined,
        edgeObjectFingerprint: Array.isArray(request.edges)
          ? opaqueFingerprint(request.edges)
          : undefined,
      };
    }),
    lastResponse: {
      requestId: token(response.requestId),
      requestKind: requestKind(response.requestId),
      error: workerError(response.error),
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
        commercialClearanceViolations: integer(report.commercialClearanceViolations),
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
      phaseTrace: traces.map(projectTrace),
    },
    renderedEdgeCount: integer(edgeCountValue),
  };
};

const TERMINAL_FAILURE_STAGES = new Set([
  'final-quality-rejected',
  'latest-shape-mismatch',
  'worker-error',
  'worker-message-error',
  'worker-rejected',
  'worker-response-error',
  'worker-timeout',
]);

export const displayRoutingWaitStateHasTerminalFailure = state => (
  TERMINAL_FAILURE_STAGES.has(state?.routing?.stage)
  || state?.routing?.layoutTransactionStatus === 'failed'
);
