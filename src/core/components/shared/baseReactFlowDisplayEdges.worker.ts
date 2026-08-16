import {
  lockFinalDisplayComputedPaths,
  withDisplayAbsolutePositions,
} from './baseReactFlowDisplayEdgeCore';
import {
  createBaseReactFlowDisplayExactReport,
  finalizeBaseReactFlowDisplayEdgesWithReport,
  type BaseReactFlowDisplayExactReport,
} from './baseReactFlowDisplayFinalizer';
import { createBaseReactFlowFullRouteEdges } from './baseReactFlowDisplayFullRoutePipeline';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import { repairBaseReactFlowMeasuredDisplayEdgesWithReport } from './baseReactFlowDisplayMeasuredRepair';
import { baseReactFlowDisplayHardQualityIsClean } from './baseReactFlowDisplayQualityGates';
import { baseReactFlowDisplayCommercialQualityIsClean } from './baseReactFlowDisplayCommercialQuality';
import { createBaseReactFlowInteractiveDisplayEdges } from './baseReactFlowDisplayQualitySeedPipeline';
import { createBaseReactFlowPreDisplayFinalEdges } from './baseReactFlowDisplayPreDisplayPipeline';
import { sanitizeBaseReactFlowPrecompiledRoutePatches } from './baseReactFlowPrecompiledRouteArtifact';
import {
  doBaseReactFlowDisplayRoutesMatchExactly,
  mergeBaseReactFlowDisplayEdgePatches,
  sanitizeBaseReactFlowDisplayCachePatches,
} from './baseReactFlowDisplayRoutingTransaction';
import {
  parseDisplayEdgesWorkerRequest,
  readDisplayEdgesWorkerRequestId,
  type DisplayEdgesWorkerRequest,
  type DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import { createBaseReactFlowIncrementalDisplayEdges } from './baseReactFlowDisplayIncrementalRoute';
import { repairDisplayContainerBoundaryClearanceRisks } from '../../strategies/shared/edgeDisplaySoftQualityRepair';
import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
} from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { scoreNodeClearanceRisk } from '../../strategies/shared/edgeWaypointCandidateRepair';
import {
  repairBaseReactFlowFinalCommercialDetours,
  repairBaseReactFlowFinalEndpointOrder,
} from './baseReactFlowDisplayFinalEndpointOrder';
import { repairBaseReactFlowFinalSafetyClosure } from './baseReactFlowDisplayFinalSafetyClosure';
import { closeBaseReactFlowDisplayFinalHardContract } from './baseReactFlowDisplayFinalHardContract';
import {
  fastDisplayHardSafetyIsClean,
  repairFastDisplayHardSafety,
} from './baseReactFlowFastEdgeSafety';
import { getDisplayComputedPath } from './baseReactFlowDisplayGeometry';
import { commercialEdgeDetoursDoNotRegress } from './baseReactFlowDisplayCommercialDetourGuard';

interface DisplayEdgesWorkerScope {
  postMessage: (response: DisplayEdgesWorkerResponse) => void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}

const displayEdgesWorkerScope = typeof self !== 'undefined'
  && !('document' in self)
  ? self as unknown as DisplayEdgesWorkerScope
  : null;

const postDisplayEdgesResponse = (response: DisplayEdgesWorkerResponse): void => {
  displayEdgesWorkerScope?.postMessage(response);
};

const doesDisplayCandidateMatchSourceGraph = (
  sourceEdges: DisplayEdgesWorkerRequest['edges'],
  candidateEdges: DisplayEdgesWorkerRequest['edges'],
): boolean => (
  sourceEdges.length === candidateEdges.length
  && sourceEdges.every((edge, index) => {
    const candidate = candidateEdges[index];
    return candidate?.id === edge.id
      && candidate.source === edge.source
      && candidate.target === edge.target;
  })
);

const precompiledCandidateCommercialClearanceIsClean = (
  edges: DisplayEdgesWorkerRequest['edges'],
  nodes: DisplayEdgesWorkerRequest['nodes'],
): boolean => edges.every(edge => scoreNodeClearanceRisk(
  getDisplayComputedPath(edge),
  nodes,
  edge,
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
) <= 0.5);

const eligibleCommercialClearanceDoesNotRegress = (
  baselineEdges: DisplayEdgesWorkerRequest['edges'],
  candidateEdges: DisplayEdgesWorkerRequest['edges'],
  nodes: DisplayEdgesWorkerRequest['nodes'],
  eligibleEdgeIds: ReadonlySet<string> | undefined,
): boolean => {
  if (!eligibleEdgeIds || eligibleEdgeIds.size === 0) return true;
  const candidateById = new Map(candidateEdges.map(edge => [edge.id, edge] as const));
  return baselineEdges.every((edge) => {
    if (!eligibleEdgeIds.has(edge.id)) return true;
    const candidate = candidateById.get(edge.id);
    if (!candidate) return false;
    return scoreNodeClearanceRisk(
      getDisplayComputedPath(candidate),
      nodes,
      candidate,
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    ) <= scoreNodeClearanceRisk(
      getDisplayComputedPath(edge),
      nodes,
      edge,
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    ) + 0.5;
  });
};

const finalDisplayRenderContractIsLocked = (
  sourceEdges: DisplayEdgesWorkerRequest['edges'],
  lockedEdges: DisplayEdgesWorkerRequest['edges'],
): boolean => sourceEdges.length === lockedEdges.length
  && lockedEdges.every((edge, index) => edge === sourceEdges[index]);

const finalizeContainerClearanceResponse = (
  response: DisplayEdgesWorkerResponse,
  nodes: DisplayEdgesWorkerRequest['nodes'],
  options: {
    commercialStabilizationPass?: number;
    eligibleEdgeIds?: ReadonlySet<string>;
    isLargeGraph: boolean;
    onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
    preferredEdges?: ReadonlyArray<DisplayEdgesWorkerRequest['edges'][number]>;
  },
): DisplayEdgesWorkerResponse => {
  if (!response.edges) return response;
  const repairNodes = withDisplayAbsolutePositions(
    nodes,
    new Map(nodes.map(node => [node.id, node] as const)),
  );
  const clearanceTimer = startDisplayRoutingPhaseTrace({
    phase: 'final-clearance',
    candidateCount: response.edges.length,
    onTrace: options.onPhaseTrace,
  });
  const clearanceEdges = repairDisplayContainerBoundaryClearanceRisks(
    response.edges,
    repairNodes,
    {
      eligibleEdgeIds: options.eligibleEdgeIds,
      maxEdges: options.isLargeGraph ? 4 : 8,
      maxQualityEvaluations: options.isLargeGraph ? 16 : 32,
    },
  );
  clearanceTimer.finish(clearanceEdges === response.edges ? 'skip' : 'accepted');
  const hardSafetyTimer = startDisplayRoutingPhaseTrace({
    phase: 'final-hard-safety',
    candidateCount: clearanceEdges.length,
    onTrace: options.onPhaseTrace,
  });
  const safeClearanceEdges = fastDisplayHardSafetyIsClean(clearanceEdges, repairNodes)
    ? clearanceEdges
    : repairFastDisplayHardSafety(clearanceEdges, repairNodes);
  hardSafetyTimer.finish(safeClearanceEdges === clearanceEdges ? 'skip' : 'accepted');
  if (response.routeResolution === 'validated-candidate') {
    // A trusted candidate has already passed both hard and commercial gates.
    // If the boundary/hard-safety closure did not change it, preserve it
    // byte-for-byte. Re-running the legacy detour repair here can choose a
    // different (and longer) legal corridor, making a freshly generated
    // precompiled route non-idempotent at runtime.
    const lockedSafeClearanceEdges = lockFinalDisplayComputedPaths(
      safeClearanceEdges,
      repairNodes,
    );
    if (
      finalDisplayRenderContractIsLocked(safeClearanceEdges, lockedSafeClearanceEdges)
      && (
        safeClearanceEdges === response.edges
        || doBaseReactFlowDisplayRoutesMatchExactly(response.edges, safeClearanceEdges)
      )
    ) return response;
  }
  const endpointOrderedCandidate = repairBaseReactFlowFinalEndpointOrder(
    safeClearanceEdges,
    repairNodes,
    {
      eligibleEdgeIds: options.eligibleEdgeIds,
      onPhaseTrace: options.onPhaseTrace,
      preferredEdges: options.preferredEdges,
    },
  );
  const orderedEdges = baseReactFlowDisplayHardQualityIsClean(
    safeClearanceEdges,
    repairNodes,
  ) && !baseReactFlowDisplayHardQualityIsClean(endpointOrderedCandidate, repairNodes)
    ? safeClearanceEdges
    : endpointOrderedCandidate;
  const closureTimer = startDisplayRoutingPhaseTrace({
    phase: 'final-safety-closure',
    candidateCount: orderedEdges.length,
    onTrace: options.onPhaseTrace,
  });
  const safetyClosedEdges = repairBaseReactFlowFinalSafetyClosure(
    orderedEdges,
    repairNodes,
    { eligibleEdgeIds: options.eligibleEdgeIds },
  );
  closureTimer.finish(safetyClosedEdges === orderedEdges ? 'skip' : 'accepted');
  const safetyClosedHardClean = baseReactFlowDisplayHardQualityIsClean(
    safetyClosedEdges,
    repairNodes,
  );
  // The safety closure may discover a hard-clean candidate whose automatic
  // side choices no longer reflect the source-authored bundle. Re-apply only
  // the fully gated preferred-trunk transaction after closure, when it can no
  // longer be overwritten by another repair stage.
  const closureChangedRoutes = safetyClosedEdges !== orderedEdges
    && !doBaseReactFlowDisplayRoutesMatchExactly(orderedEdges, safetyClosedEdges);
  const shouldReapplyPreferredOrder = safetyClosedHardClean
    && Boolean(options.preferredEdges)
    && closureChangedRoutes;
  if (
    safetyClosedEdges.length >= 2
    && safetyClosedHardClean
    && options.preferredEdges
    && !shouldReapplyPreferredOrder
  ) {
    for (const phase of [
      'final-endpoint-seed',
      'final-endpoint-topology',
      'final-endpoint-order',
      'final-endpoint-closure',
    ] as const) {
      startDisplayRoutingPhaseTrace({
        phase,
        candidateCount: safetyClosedEdges.length,
        onTrace: options.onPhaseTrace,
      }).finish('skip');
    }
  }
  const preferredOrderCandidate = shouldReapplyPreferredOrder
    ? repairBaseReactFlowFinalEndpointOrder(
      safetyClosedEdges,
      repairNodes,
      {
        eligibleEdgeIds: options.eligibleEdgeIds,
        onPhaseTrace: options.onPhaseTrace,
        preferredEdges: options.preferredEdges,
      },
    )
    : safetyClosedEdges;
  const orderedAfterClosure = safetyClosedHardClean
    && !baseReactFlowDisplayHardQualityIsClean(preferredOrderCandidate, repairNodes)
    ? safetyClosedEdges
    : preferredOrderCandidate;
  const latePolishBaseline = baseReactFlowDisplayHardQualityIsClean(
    orderedAfterClosure,
    repairNodes,
  )
    ? orderedAfterClosure
    : safetyClosedEdges;
  const commercialCandidate = repairBaseReactFlowFinalCommercialDetours(
    orderedAfterClosure,
    repairNodes,
    {
      eligibleEdgeIds: options.eligibleEdgeIds,
      // Hard-clean only proves collision/crossing safety. A freshly computed
      // full route still needs the bounded commercial shortcut pass before it
      // can become a reusable precompiled candidate. Cache hits and
      // incremental/repair responses already passed their own bounded quality
      // work, so keep their latency-sensitive fast path.
      // The middle stabilization pass is allowed to settle endpoint order,
      // but the terminal pass must re-apply bounded commercial shortening:
      // otherwise that middle pass can restore an older, longer corridor and
      // there is no later polish stage to remove it again.
      skipLoopShortcut: (options.commercialStabilizationPass ?? 0) === 1
        || !(
          response.routeResolution === 'full-route'
          || response.routeResolution === 'full-route-repaired'
          || response.routeResolution === 'validated-candidate'
          || response.routeResolution === 'repaired-candidate'
        ),
    },
  );
  // Commercial shortening is soft quality. If it reopens a strict crossing
  // after the atomic endpoint/trunk closure, retain the last hard-clean route
  // instead of asking a later local repair to break that newly restored trunk.
  const commercialEdges = baseReactFlowDisplayHardQualityIsClean(
    commercialCandidate,
    repairNodes,
  )
    ? commercialCandidate
    : latePolishBaseline;
  // Endpoint/trunk restoration and commercial detour shortening are allowed
  // to move corridors after the earlier strict-crossing pass. Close the hard
  // contract once more on the exact route that will be rendered, while using
  // that route as the true-trunk baseline so legitimate shared stems remain
  // atomic. Nothing may rewrite geometry after this point except path locking.
  const finalCommercialSafetyClosedEdges = repairBaseReactFlowFinalSafetyClosure(
    commercialEdges,
    repairNodes,
    { eligibleEdgeIds: options.eligibleEdgeIds },
  );
  const finalHardOutcome = closeBaseReactFlowDisplayFinalHardContract(
    finalCommercialSafetyClosedEdges,
    nodes,
    options.onPhaseTrace,
  );
  const finalHardContractEdges = finalHardOutcome.report.hardClean
    && eligibleCommercialClearanceDoesNotRegress(
      response.edges,
      finalHardOutcome.edges,
      repairNodes,
      options.eligibleEdgeIds,
    )
    ? finalHardOutcome.edges
    : response.edges;
  const finalHardClean = finalHardContractEdges === finalHardOutcome.edges
    ? finalHardOutcome.report.hardClean
    : response.hardClean;
  const edges = lockFinalDisplayComputedPaths(finalHardContractEdges, repairNodes);
  const renderContractWasAlreadyLocked = finalDisplayRenderContractIsLocked(
    finalHardContractEdges,
    edges,
  );
  const finalizedResponse: DisplayEdgesWorkerResponse = (
    renderContractWasAlreadyLocked
    && (
      finalHardContractEdges === response.edges
      || doBaseReactFlowDisplayRoutesMatchExactly(response.edges, finalHardContractEdges)
    )
  )
    ? response
    : {
      ...response,
      edges,
      hardClean: finalHardClean,
      routeResolution: response.routeResolution === 'validated-candidate'
        ? 'repaired-candidate'
        : response.routeResolution,
    };
  if (
    (options.commercialStabilizationPass ?? 0) < 2
    && finalizedResponse !== response
    && (
      response.routeResolution === 'full-route'
      || response.routeResolution === 'full-route-repaired'
      || response.routeResolution === 'validated-candidate'
      || response.routeResolution === 'repaired-candidate'
    )
  ) {
    const stabilizedResponse = finalizeContainerClearanceResponse(finalizedResponse, nodes, {
      ...options,
      commercialStabilizationPass: (options.commercialStabilizationPass ?? 0) + 1,
      // Stabilization must start from the last accepted route. Reusing the
      // original preferred geometry here can restore a longer pre-polish
      // corridor on pass two even though the commercial transaction kept the
      // exact endpoint roles and legal true-trunk membership intact.
      preferredEdges: finalizedResponse.edges,
    });
    const stabilizedEdges = stabilizedResponse.edges;
    return stabilizedEdges
      && stabilizedResponse.hardClean !== false
      && commercialEdgeDetoursDoNotRegress(
        finalizedResponse.edges ?? [],
        stabilizedEdges,
        Array.from(stabilizedEdges.keys()),
      )
      ? stabilizedResponse
      : finalizedResponse;
  }
  return finalizedResponse;
};

export const computeBaseReactFlowDisplayEdgesWorkerResponse = (
  request: DisplayEdgesWorkerRequest,
  onBoundedCandidate?: (report: BaseDisplayBoundedCandidateReport) => void,
): DisplayEdgesWorkerResponse => {
  const phaseTrace: DisplayRoutingPhaseTrace[] = [];
  const recordPhaseTrace = (trace: DisplayRoutingPhaseTrace): void => {
    if (phaseTrace.length < 32) phaseTrace.push(trace);
    postDisplayEdgesResponse({
      requestId: request.requestId,
      phaseProgress: trace,
    });
  };
  if (request.operation === 'repair') {
    const repairTimer = startDisplayRoutingPhaseTrace({
      phase: 'measured-repair',
      candidateCount: request.edges.length,
      onTrace: recordPhaseTrace,
    });
    const repaired = repairBaseReactFlowMeasuredDisplayEdgesWithReport(
      request.edges,
      request.nodes,
    );
    repairTimer.finish(repaired.report.hardClean ? 'accepted' : 'rejected', repaired.edges.length);
    const repairResponse: DisplayEdgesWorkerResponse = {
      requestId: request.requestId,
      edges: repaired.edges,
      hardClean: repaired.report.hardClean,
      routeResolution: 'repair',
      phaseTrace,
    };
    if (request.repairMode === 'bounded') return repairResponse;
    return finalizeContainerClearanceResponse(repairResponse, request.nodes, {
      isLargeGraph: request.nodes.length > 36 || request.edges.length > 36,
      onPhaseTrace: recordPhaseTrace,
      preferredEdges: request.edges,
    });
  }
  let incrementalAffectedEdgeCount: number | undefined;
  if (request.operation === 'incremental-route') {
    const incremental = createBaseReactFlowIncrementalDisplayEdges({
      request,
      onPhaseTrace: recordPhaseTrace,
      onBoundedCandidate,
    });
    incrementalAffectedEdgeCount = incremental.affectedEdgeCount;
    if (incremental.edges) {
      return finalizeContainerClearanceResponse({
        requestId: request.requestId,
        edges: incremental.edges,
        hardClean: true,
        routeResolution: 'incremental-route',
        phaseTrace,
        affectedEdgeCount: incremental.affectedEdgeCount,
        fallbackLevel: 'none',
      }, request.nodes, {
        eligibleEdgeIds: new Set(request.mutableEdgeIds),
        isLargeGraph: request.isLargeGraph,
        onPhaseTrace: recordPhaseTrace,
        preferredEdges: request.edges,
      });
    }
  }
  const incrementalFallbackMetadata = request.operation === 'incremental-route'
    ? {
      affectedEdgeCount: incrementalAffectedEdgeCount ?? 0,
      fallbackLevel: 'full' as const,
    }
    : {};
  const safeCandidatePatches = request.operation === 'validate-or-route'
    && request.candidatePatches
    ? (request.candidateSource === 'precompiled'
      ? sanitizeBaseReactFlowPrecompiledRoutePatches(request.edges, request.candidatePatches)
      : sanitizeBaseReactFlowDisplayCachePatches(request.edges, request.candidatePatches))
    : null;
  const candidateEdges = request.operation === 'validate-or-route'
    ? (request.candidateEdges
      ?? (safeCandidatePatches
        ? mergeBaseReactFlowDisplayEdgePatches(request.edges, safeCandidatePatches)
        : null))
    : null;
  const candidateSource = request.operation === 'validate-or-route'
    ? request.candidateSource
    : null;
  const candidateTimer = startDisplayRoutingPhaseTrace({
    phase: 'candidate-validation',
    candidateCount: candidateEdges?.length ?? 0,
    onTrace: recordPhaseTrace,
  });
  if (
    candidateEdges
    && doesDisplayCandidateMatchSourceGraph(request.edges, candidateEdges)
    && baseReactFlowDisplayHardQualityIsClean(candidateEdges, request.nodes)
    && baseReactFlowDisplayCommercialQualityIsClean(candidateEdges)
  ) {
    candidateTimer.finish('hit');
    const validatedCandidateResponse: DisplayEdgesWorkerResponse = {
      requestId: request.requestId,
      edges: candidateEdges,
      hardClean: true,
      routeResolution: 'validated-candidate',
      phaseTrace,
    };
    const lockedCandidateEdges = lockFinalDisplayComputedPaths(candidateEdges, request.nodes);
    if (
      candidateSource === 'precompiled'
      && precompiledCandidateCommercialClearanceIsClean(candidateEdges, request.nodes)
      && (
        finalDisplayRenderContractIsLocked(candidateEdges, lockedCandidateEdges)
        || doBaseReactFlowDisplayRoutesMatchExactly(candidateEdges, lockedCandidateEdges)
      )
    ) return validatedCandidateResponse;
    return finalizeContainerClearanceResponse(validatedCandidateResponse, request.nodes, {
      isLargeGraph: request.isLargeGraph,
      onPhaseTrace: recordPhaseTrace,
      // The candidate already passed exact hard/commercial validation.  Using
      // the source graph as the terminal preference can resurrect a stale
      // preset-computed path after a precompiled artifact was regenerated.
      preferredEdges: candidateEdges,
    });
  }
  candidateTimer.finish(candidateEdges ? 'rejected' : 'skip');
  const commonInput = {
    edges: request.edges,
    nodes: request.nodes,
    enableSmartEdges: request.enableSmartEdges,
    smartEdgePadding: request.smartEdgePadding,
    isLargeGraph: request.isLargeGraph,
    forceFullQuality: request.qualityMode === 'full',
    displayEdgeEpoch: request.displayEdgeEpoch,
  };
  if (request.qualityMode === 'interactive') {
    const interactiveTimer = startDisplayRoutingPhaseTrace({
      phase: 'quality',
      candidateCount: request.edges.length,
      onTrace: recordPhaseTrace,
    });
    const edges = createBaseReactFlowInteractiveDisplayEdges(commonInput);
    interactiveTimer.finish('accepted', edges.length);
    return finalizeContainerClearanceResponse({
      requestId: request.requestId,
      edges,
      hardClean: baseReactFlowDisplayHardQualityIsClean(edges, request.nodes),
      routeResolution: 'full-route',
      phaseTrace,
      ...incrementalFallbackMetadata,
    }, request.nodes, {
      isLargeGraph: request.isLargeGraph,
      onPhaseTrace: recordPhaseTrace,
      preferredEdges: request.edges,
    });
  }

  const repairNodes = withDisplayAbsolutePositions(
    request.nodes,
    new Map(request.nodes.map(node => [node.id, node] as const)),
  );
  let exactReport: BaseReactFlowDisplayExactReport | undefined;
  const fullRouteEdges = createBaseReactFlowFullRouteEdges({
    ...commonInput,
    onPhaseTrace: recordPhaseTrace,
    createPreDisplayFinalEdges: (preDisplayArgs) => {
      let boundedReport: BaseDisplayBoundedCandidateReport | undefined;
      const boundedEdges = createBaseReactFlowPreDisplayFinalEdges({
        ...preDisplayArgs,
        onBoundedCandidate: (report) => {
          boundedReport = report;
          preDisplayArgs.onBoundedCandidate?.(report);
          onBoundedCandidate?.(report);
        },
      });
      if (boundedReport) {
        exactReport = createBaseReactFlowDisplayExactReport(
          boundedEdges,
          request.nodes,
          repairNodes,
          boundedReport,
        );
      }
      return boundedEdges;
    },
  });
  const finalizerTimer = startDisplayRoutingPhaseTrace({
    phase: 'finalizer',
    candidateCount: fullRouteEdges.length,
    onTrace: recordPhaseTrace,
  });
  const finalized = finalizeBaseReactFlowDisplayEdgesWithReport(
    fullRouteEdges,
    request.nodes,
    exactReport,
  );
  finalizerTimer.finish(finalized.report.hardClean ? 'accepted' : 'fallback', finalized.edges.length);
  if (!finalized.report.hardClean) {
    const repairTimer = startDisplayRoutingPhaseTrace({
      phase: 'measured-repair',
      candidateCount: finalized.edges.length,
      onTrace: recordPhaseTrace,
    });
    const repaired = repairBaseReactFlowMeasuredDisplayEdgesWithReport(
      finalized.edges,
      request.nodes,
    );
    repairTimer.finish(repaired.report.hardClean ? 'accepted' : 'rejected', repaired.edges.length);
    return finalizeContainerClearanceResponse({
      requestId: request.requestId,
      edges: repaired.edges,
      hardClean: repaired.report.hardClean,
      routeResolution: 'full-route-repaired',
      phaseTrace,
      ...incrementalFallbackMetadata,
    }, request.nodes, {
      isLargeGraph: request.isLargeGraph,
      onPhaseTrace: recordPhaseTrace,
      preferredEdges: request.edges,
    });
  }
  return finalizeContainerClearanceResponse({
    requestId: request.requestId,
    edges: finalized.edges,
    hardClean: finalized.report.hardClean,
    routeResolution: 'full-route',
    phaseTrace,
    ...incrementalFallbackMetadata,
  }, request.nodes, {
    isLargeGraph: request.isLargeGraph,
    onPhaseTrace: recordPhaseTrace,
    preferredEdges: request.edges,
  });
};

export const handleBaseReactFlowDisplayWorkerMessage = (
  value: unknown,
  onBoundedCandidate?: (report: BaseDisplayBoundedCandidateReport) => void,
): DisplayEdgesWorkerResponse => {
  const request = parseDisplayEdgesWorkerRequest(value);
  if (!request) {
    return {
      requestId: readDisplayEdgesWorkerRequestId(value) ?? 'invalid-request',
      error: 'display-edge-worker-invalid-request',
    };
  }
  return computeBaseReactFlowDisplayEdgesWorkerResponse(request, onBoundedCandidate);
};

if (displayEdgesWorkerScope) {
  displayEdgesWorkerScope.onmessage = (event: MessageEvent<unknown>) => {
    const requestId = readDisplayEdgesWorkerRequestId(event.data) ?? 'invalid-request';
    try {
      const response = handleBaseReactFlowDisplayWorkerMessage(
        event.data,
        (boundedCandidate) => {
          if (!boundedCandidate.hardClean) {
            postDisplayEdgesResponse({ requestId, boundedCandidate });
          }
        },
      );
      postDisplayEdgesResponse(response);
    } catch {
      postDisplayEdgesResponse({
        requestId,
        error: 'display-edge-worker-failed',
      });
    }
  };
}
