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
import {
  baseReactFlowDisplayHardQualityIsClean,
  getDisplayHardQualityGateReport,
} from './baseReactFlowDisplayQualityGates';
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
  repairBaseReactFlowFinalCommercialDetours,
  repairBaseReactFlowFinalEndpointOrder,
} from './baseReactFlowDisplayFinalEndpointOrder';
import { repairBaseReactFlowFinalSafetyClosure } from './baseReactFlowDisplayFinalSafetyClosure';
import { closeBaseReactFlowDisplayFinalHardContract } from './baseReactFlowDisplayFinalHardContract';
import {
  fastDisplayHardSafetyIsClean,
  repairFastDisplayHardSafety,
} from './baseReactFlowFastEdgeSafety';
import { commercialEdgeDetoursDoNotRegress } from './baseReactFlowDisplayCommercialDetourGuard';
import {
  eligibleCommercialClearanceDoesNotRegress,
  displayBusinessNodeCommercialClearanceIsClean,
  repairBaseReactFlowDisplayBusinessNodeClearance,
} from './baseReactFlowDisplayBusinessNodeClearance';
import {
  doesDisplayCandidateMatchSourceGraph,
  finalDisplayRenderContractIsLocked,
} from './baseReactFlowDisplayCandidateValidation';
import {
  displayEdgesWorkerScope,
  postDisplayEdgesResponse,
} from './baseReactFlowDisplayWorkerScope';

const withExactDisplayHardReport = (
  response: DisplayEdgesWorkerResponse,
  repairNodes: DisplayEdgesWorkerRequest['nodes'],
): DisplayEdgesWorkerResponse => {
  if (!response.edges) return response;
  const hardReport = getDisplayHardQualityGateReport(
    response.edges,
    repairNodes,
    'polished',
  );
  return {
    ...response,
    hardClean: hardReport.hardClean,
    hardReport,
  };
};

const repairMinimumBusinessNodeClearance = (
  edges: NonNullable<DisplayEdgesWorkerResponse['edges']>,
  repairNodes: DisplayEdgesWorkerRequest['nodes'],
  eligibleEdgeIds?: ReadonlySet<string>,
  allowTransientStrictCrossing = true,
): NonNullable<DisplayEdgesWorkerResponse['edges']> => (
  repairBaseReactFlowDisplayBusinessNodeClearance(edges, repairNodes, {
    eligibleEdgeIds,
    // The owning final hard-safety transaction closes a temporary peer-edge
    // crossing atomically; the intermediate candidate is never rendered.
    allowTransientStrictCrossing,
  })
);

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
  const requiresMinimumClearanceClosure = response.routeResolution === 'validated-candidate'
    || response.routeResolution === 'repaired-candidate'
    || response.routeResolution === 'repair';
  const requiresLateMinimumClearanceClosure = requiresMinimumClearanceClosure
    || response.routeResolution === 'full-route'
    || response.routeResolution === 'full-route-repaired';
  const businessClearanceEdges = requiresMinimumClearanceClosure
    ? repairMinimumBusinessNodeClearance(
      clearanceEdges,
      repairNodes,
      options.eligibleEdgeIds,
    )
    : clearanceEdges;
  clearanceTimer.finish(
    businessClearanceEdges === response.edges ? 'skip' : 'accepted',
    businessClearanceEdges === response.edges ? 0 : businessClearanceEdges.length,
  );
  const hardSafetyTimer = startDisplayRoutingPhaseTrace({
    phase: 'final-hard-safety',
    candidateCount: clearanceEdges.length,
    onTrace: options.onPhaseTrace,
  });
  const safeClearanceEdges = fastDisplayHardSafetyIsClean(businessClearanceEdges, repairNodes)
    ? businessClearanceEdges
    : repairFastDisplayHardSafety(businessClearanceEdges, repairNodes);
  hardSafetyTimer.finish(safeClearanceEdges === businessClearanceEdges ? 'skip' : 'accepted');
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
    ) return withExactDisplayHardReport(response, repairNodes);
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
  const lateMinimumClearanceCandidate = requiresLateMinimumClearanceClosure
    ? repairMinimumBusinessNodeClearance(
      commercialEdges,
      repairNodes,
      options.eligibleEdgeIds,
    )
    : commercialEdges;
  const lateMinimumClearanceEdges = baseReactFlowDisplayHardQualityIsClean(
    lateMinimumClearanceCandidate,
    repairNodes,
  )
    ? lateMinimumClearanceCandidate
    : commercialEdges;
  if (lateMinimumClearanceEdges !== commercialEdges) {
    startDisplayRoutingPhaseTrace({
      phase: 'final-clearance',
      candidateCount: commercialEdges.length,
      onTrace: options.onPhaseTrace,
    }).finish('accepted', lateMinimumClearanceEdges.length);
  }
  const finalCommercialSafetyClosedEdges = repairBaseReactFlowFinalSafetyClosure(
    lateMinimumClearanceEdges,
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
      : withExactDisplayHardReport(finalizedResponse, repairNodes);
  }
  return withExactDisplayHardReport(finalizedResponse, repairNodes);
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
    if (request.repairMode === 'bounded') {
      const repairNodes = withDisplayAbsolutePositions(
        request.nodes,
        new Map(request.nodes.map(node => [node.id, node] as const)),
      );
      const clearanceEdges = repairMinimumBusinessNodeClearance(
        repaired.edges,
        repairNodes,
        undefined,
        false,
      );
      const safeEdges = baseReactFlowDisplayHardQualityIsClean(clearanceEdges, repairNodes)
        ? clearanceEdges
        : repaired.edges;
      return withExactDisplayHardReport({ ...repairResponse, edges: safeEdges }, repairNodes);
    }
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
    const candidateRepairNodes = withDisplayAbsolutePositions(
      request.nodes,
      new Map(request.nodes.map(node => [node.id, node] as const)),
    );
    const renderContractIsLocked = finalDisplayRenderContractIsLocked(
      candidateEdges,
      lockedCandidateEdges,
    );
    const exceedsCommercialPromotionBudget = candidateEdges.length > 80
      || candidateRepairNodes.length > 120;
    const persistentBoundaryCandidate = candidateSource === 'persistent'
      ? repairDisplayContainerBoundaryClearanceRisks(candidateEdges, candidateRepairNodes, {
        maxEdges: request.isLargeGraph ? 4 : 8,
        maxQualityEvaluations: request.isLargeGraph ? 16 : 32,
      })
      : candidateEdges;
    const persistentBoundaryIsClean = persistentBoundaryCandidate === candidateEdges
      || doBaseReactFlowDisplayRoutesMatchExactly(candidateEdges, persistentBoundaryCandidate);
    if (
      (
        exceedsCommercialPromotionBudget
        || displayBusinessNodeCommercialClearanceIsClean(candidateEdges, candidateRepairNodes)
      )
      && persistentBoundaryIsClean
      && (
        renderContractIsLocked
        || doBaseReactFlowDisplayRoutesMatchExactly(candidateEdges, lockedCandidateEdges)
      )
    ) {
      if (candidateSource !== 'precompiled') {
        for (const phase of ['final-clearance', 'final-hard-safety'] as const) {
          startDisplayRoutingPhaseTrace({
            phase,
            candidateCount: candidateEdges.length,
            onTrace: recordPhaseTrace,
          }).finish('skip');
        }
      }
      return withExactDisplayHardReport(
        candidateSource === 'precompiled' || renderContractIsLocked
        ? validatedCandidateResponse
        : {
          ...validatedCandidateResponse,
          edges: lockedCandidateEdges,
          routeResolution: 'repaired-candidate',
        },
        candidateRepairNodes,
      );
    }
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
