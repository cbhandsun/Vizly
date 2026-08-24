import type { Edge } from '@xyflow/react';

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
import { resolveDisplayWorkerCandidate } from './baseReactFlowDisplayWorkerCandidate';
import { doBaseReactFlowDisplayRoutesMatchExactly } from './baseReactFlowDisplayRoutingTransaction';
import {
  createDisplayWorkerResponseCompleter,
  runDisplayWorkerIncrementalRequest,
} from './baseReactFlowDisplayWorkerSessionResponse';
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
import {
  createDisplayRoutingFallbackMetadata,
  createDisplayRoutingPhaseRecorder,
} from './baseReactFlowDisplayWorkerTraceRecorder';
import { repairDisplayContainerBoundaryClearanceRisks } from '../../strategies/shared/edgeDisplaySoftQualityRepair';
import {
  repairBaseReactFlowFinalCommercialDetours,
  repairBaseReactFlowFinalEndpointOrder,
  traceSkippedFinalCommercialDetours,
  traceSkippedFinalEndpointPhases,
} from './baseReactFlowDisplayFinalEndpointOrder';
import {
  canReuseBaseReactFlowFinalCommercialSafety,
  closeBaseReactFlowFinalCommercialSafety,
  commitBaseReactFlowFinalCommercialSafety,
} from './baseReactFlowDisplayCommercialSafety';
import { runBaseReactFlowFinalSafetyClosure } from './baseReactFlowDisplayFinalSafetyRun';
import { fastDisplayHardSafetyIsClean, repairFastDisplayHardSafety } from './baseReactFlowFastEdgeSafety';
import { commercialEdgeDetoursDoNotRegress } from './baseReactFlowDisplayCommercialDetourGuard';
import {
  displayBusinessNodeCommercialClearanceIsClean,
  repairBaseReactFlowMinimumBusinessNodeClearance as repairMinimumBusinessNodeClearance,
} from './baseReactFlowDisplayBusinessNodeClearance';
import {
  analyzeFinalDisplayRenderContract,
  doesDisplayCandidateMatchSourceGraph,
  finalDisplayRenderContractIsLocked,
  selectHardCleanDisplayCandidate,
} from './baseReactFlowDisplayCandidateValidation';
import { installBaseReactFlowDisplayWorkerTransport } from './baseReactFlowDisplayWorkerTransport';
import { postDisplayEdgesResponse } from './baseReactFlowDisplayWorkerScope';
import {
  finalizeStableIncrementalDisplayResponse,
  withExactDisplayHardReport,
} from './baseReactFlowDisplayWorkerResponse';
import { finalizeAuditedIncrementalDisplayResponse } from './baseReactFlowDisplayIncrementalFinalization';
import { shouldEscalateInteractiveDisplayRoute } from './baseReactFlowDisplayWorkerFallback';
import {
  createDisplayWorkerFinalEvaluation,
  type DisplayWorkerFinalizationOptions,
} from './baseReactFlowDisplayWorkerFinalEvaluation';

const finalizeContainerClearanceResponse = (
  response: DisplayEdgesWorkerResponse,
  nodes: DisplayEdgesWorkerRequest['nodes'],
  options: DisplayWorkerFinalizationOptions,
): DisplayEdgesWorkerResponse => {
  if (!response.edges) return response;
  const {
    repairNodes,
    evaluation: finalEvaluation,
    hardQualityIsClean: finalHardQualityIsClean,
  } = createDisplayWorkerFinalEvaluation({
    nodes,
    responseEdges: response.edges,
    initialHardReport: options.initialHardReport,
    initialHardReportEdges: options.initialHardReportEdges,
  });
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
  const auditedIncrementalResponse = finalizeAuditedIncrementalDisplayResponse({
    response,
    edges: safeClearanceEdges,
    nodes: repairNodes,
    evaluation: finalEvaluation,
    onPhaseTrace: options.onPhaseTrace,
  });
  if (auditedIncrementalResponse) return auditedIncrementalResponse;
  const endpointOrderedCandidate = repairBaseReactFlowFinalEndpointOrder(
    safeClearanceEdges,
    repairNodes,
    {
      eligibleEdgeIds: options.eligibleEdgeIds,
      onPhaseTrace: options.onPhaseTrace,
      preferredEdges: options.preferredEdges,
      evaluation: finalEvaluation,
    },
  );
  const orderedEdges = selectHardCleanDisplayCandidate(
    safeClearanceEdges,
    endpointOrderedCandidate,
    finalHardQualityIsClean,
  );
  const finalSafety = runBaseReactFlowFinalSafetyClosure({
    edges: orderedEdges,
    eligibleEdgeIds: options.eligibleEdgeIds,
    evaluation: finalEvaluation,
    nodes: repairNodes,
    onPhaseTrace: options.onPhaseTrace,
    routeResolution: response.routeResolution,
  });
  const {
    edges: safetyClosedEdges,
    endpointDefectDelegated,
    safetyAudit,
  } = finalSafety;
  const safetyClosedHardClean = finalHardQualityIsClean(safetyClosedEdges);
  // Re-apply a changed preferred trunk only after hard closure.
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
    traceSkippedFinalEndpointPhases(
      safetyClosedEdges.length,
      options.onPhaseTrace,
      true,
    );
  }
  const stableIncrementalResponse = safetyAudit.canSkip
    ? finalizeStableIncrementalDisplayResponse(response, safetyClosedEdges, repairNodes,
      finalEvaluation.hardReport(safetyClosedEdges))
    : null;
  if (stableIncrementalResponse) {
    traceSkippedFinalCommercialDetours(safetyClosedEdges.length, options.onPhaseTrace);
    return stableIncrementalResponse;
  }
  const preferredOrderCandidate = shouldReapplyPreferredOrder
    ? repairBaseReactFlowFinalEndpointOrder(
      safetyClosedEdges,
      repairNodes,
      {
        eligibleEdgeIds: options.eligibleEdgeIds,
        onPhaseTrace: options.onPhaseTrace,
        preferredEdges: options.preferredEdges,
        evaluation: finalEvaluation,
      },
    )
    : safetyClosedEdges;
  const orderedAfterClosure = selectHardCleanDisplayCandidate(
    safetyClosedEdges,
    preferredOrderCandidate,
    finalHardQualityIsClean,
  );
  const latePolishBaseline = finalHardQualityIsClean(orderedAfterClosure)
    ? orderedAfterClosure
    : safetyClosedEdges;
  let commercialEvaluationEdges: readonly DisplayEdgesWorkerRequest['edges'][number][] | null = null;
  let commercialClosureReady = false;
  const commercialCandidate = repairBaseReactFlowFinalCommercialDetours(
    orderedAfterClosure,
    repairNodes,
    {
      eligibleEdgeIds: options.eligibleEdgeIds,
      evaluation: finalEvaluation,
      onPhaseTrace: options.onPhaseTrace,
      onFinalEvaluation: result => {
        commercialEvaluationEdges = result.edges;
        commercialClosureReady = result.closureReady;
      },
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
  const commercialEdges = finalHardQualityIsClean(commercialCandidate)
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
  const lateMinimumClearanceEdges = finalHardQualityIsClean(lateMinimumClearanceCandidate)
    ? lateMinimumClearanceCandidate
    : commercialEdges;
  if (lateMinimumClearanceEdges !== commercialEdges) {
    startDisplayRoutingPhaseTrace({
      phase: 'final-clearance',
      candidateCount: commercialEdges.length,
      onTrace: options.onPhaseTrace,
    }).finish('accepted', lateMinimumClearanceEdges.length);
  }
  const canReuseCommercialClosure = canReuseBaseReactFlowFinalCommercialSafety({
    commercialClosureReady: commercialClosureReady
      && lateMinimumClearanceEdges === commercialEdges,
    commercialEvaluationEdges,
    endpointDefectDelegated,
    finalEdges: lateMinimumClearanceEdges,
    orderedEdges,
  });
  const finalCommercialSafetyClosedEdges = closeBaseReactFlowFinalCommercialSafety({
    canReuseClosure: canReuseCommercialClosure,
    edges: lateMinimumClearanceEdges,
    eligibleEdgeIds: options.eligibleEdgeIds,
    evaluation: finalEvaluation,
    nodes: repairNodes,
    onPhaseTrace: options.onPhaseTrace,
  });
  const finalizedResponse = commitBaseReactFlowFinalCommercialSafety({
    closedEdges: finalCommercialSafetyClosedEdges,
    eligibleEdgeIds: options.eligibleEdgeIds,
    evaluation: finalEvaluation,
    nodes,
    onPhaseTrace: options.onPhaseTrace,
    repairNodes,
    response,
  });
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
    const finalizedCommercialClearanceIsClean = finalizedResponse.edges
      ? displayBusinessNodeCommercialClearanceIsClean(finalizedResponse.edges, repairNodes)
      : false;
    return stabilizedEdges
      && stabilizedResponse.hardClean === true
      && (
        // Commercial clearance is a final hard contract. A bounded 48px
        // closure must outrank the soft detour guard when the baseline is
        // commercially dirty; otherwise stabilization resurrects the exact
        // near-node route it was invoked to replace.
        !finalizedCommercialClearanceIsClean
        || commercialEdgeDetoursDoNotRegress(
          finalizedResponse.edges ?? [],
          stabilizedEdges,
          Array.from(stabilizedEdges.keys()),
        )
      )
      ? stabilizedResponse
      : withExactDisplayHardReport(
        finalizedResponse,
        repairNodes,
        finalizedResponse.hardReport,
      );
  }
  return withExactDisplayHardReport(
    finalizedResponse,
    repairNodes,
    finalizedResponse.hardReport,
  );
};

export const computeBaseReactFlowDisplayEdgesWorkerResponse = (
  request: DisplayEdgesWorkerRequest,
  onBoundedCandidate?: (report: BaseDisplayBoundedCandidateReport) => void,
): DisplayEdgesWorkerResponse => {
  const phaseTrace: DisplayRoutingPhaseTrace[] = [];
  const recordPhaseTrace = createDisplayRoutingPhaseRecorder({
    requestId: request.requestId,
    phaseTrace,
    publish: postDisplayEdgesResponse,
    // Incremental routing is latency-sensitive and completes in one bounded
    // transaction. Its aggregate trace travels with the single final response.
    publishProgress: request.operation !== 'incremental-route',
  });
  const completeResponse = createDisplayWorkerResponseCompleter(request, phaseTrace);
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
      return completeResponse(
        withExactDisplayHardReport({ ...repairResponse, edges: safeEdges }, repairNodes),
      );
    }
    return completeResponse(finalizeContainerClearanceResponse(repairResponse, request.nodes, {
      isLargeGraph: request.nodes.length > 36 || request.edges.length > 36,
      onPhaseTrace: recordPhaseTrace,
      preferredEdges: request.edges,
    }));
  }
  let incrementalAffectedEdgeCount: number | undefined;
  if (request.operation === 'incremental-route') {
    const incremental = runDisplayWorkerIncrementalRequest({
      request,
      onPhaseTrace: recordPhaseTrace,
      onBoundedCandidate,
    });
    incrementalAffectedEdgeCount = incremental.affectedEdgeCount;
    if (incremental.edges) {
      const incrementalFinalizerTimer = startDisplayRoutingPhaseTrace({
        phase: 'finalizer',
        candidateCount: incremental.edges.length,
        onTrace: recordPhaseTrace,
      });
      const incrementalResponse = finalizeContainerClearanceResponse({
        requestId: request.requestId,
        edges: incremental.edges,
        hardClean: true,
        hardReport: incremental.hardReport,
        routeResolution: 'incremental-route',
        phaseTrace,
        affectedEdgeCount: incremental.affectedEdgeCount,
        fallbackLevel: 'none',
      }, request.nodes, {
        eligibleEdgeIds: new Set(request.mutableEdgeIds),
        initialHardReport: incremental.hardReport,
        initialHardReportEdges: incremental.edges,
        isLargeGraph: request.isLargeGraph,
        onPhaseTrace: recordPhaseTrace,
        preferredEdges: request.edges,
      });
      incrementalFinalizerTimer.finish(
        incrementalResponse.hardClean === true ? 'accepted' : 'fallback',
      );
      return completeResponse(incrementalResponse);
    }
  }
  const incrementalFallbackMetadata = createDisplayRoutingFallbackMetadata(
    request,
    incrementalAffectedEdgeCount,
  );
  const { edges: candidateEdges, source: candidateSource } = resolveDisplayWorkerCandidate(request);
  const candidateTimer = startDisplayRoutingPhaseTrace({
    phase: 'candidate-validation',
    candidateCount: candidateEdges?.length ?? 0,
    onTrace: recordPhaseTrace,
  });
  const candidateMatchesSource = candidateEdges
    ? doesDisplayCandidateMatchSourceGraph(request.edges, candidateEdges)
    : false;
  const candidateRepairNodes = candidateEdges && candidateMatchesSource
    ? withDisplayAbsolutePositions(
      request.nodes,
      new Map(request.nodes.map(node => [node.id, node] as const)),
    )
    : null;
  const candidateHardReport = candidateEdges && candidateRepairNodes
    ? getDisplayHardQualityGateReport(candidateEdges, candidateRepairNodes, 'polished')
    : null;
  if (
    candidateEdges
    && candidateMatchesSource
    && candidateRepairNodes
    && candidateHardReport?.hardClean === true
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
    const {
      renderContractIsLocked,
      lockedRouteMatches,
      lockedHardGateInputsMatch,
    } = analyzeFinalDisplayRenderContract(
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
      && lockedRouteMatches
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
      return completeResponse(withExactDisplayHardReport(
        candidateSource === 'precompiled' || renderContractIsLocked
        ? validatedCandidateResponse
        : {
          ...validatedCandidateResponse,
          edges: lockedCandidateEdges,
          routeResolution: 'repaired-candidate',
        },
        candidateRepairNodes,
        candidateSource === 'precompiled' || lockedHardGateInputsMatch
          ? candidateHardReport
          : undefined,
      ));
    }
    return completeResponse(finalizeContainerClearanceResponse(validatedCandidateResponse, request.nodes, {
      isLargeGraph: request.isLargeGraph,
      onPhaseTrace: recordPhaseTrace,
      // The candidate already passed exact hard/commercial validation.  Using
      // the source graph as the terminal preference can resurrect a stale
      // preset-computed path after a precompiled artifact was regenerated.
      preferredEdges: candidateEdges,
    }));
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
  let escalatedFromInteractive = false;
  let preparedInteractiveEdges: Edge[] | undefined;
  if (request.qualityMode === 'interactive') {
    const interactiveTimer = startDisplayRoutingPhaseTrace({
      phase: 'quality',
      candidateCount: request.edges.length,
      onTrace: recordPhaseTrace,
    });
    const edges = createBaseReactFlowInteractiveDisplayEdges(commonInput);
    const interactiveResponse = finalizeContainerClearanceResponse({
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
    const interactiveIsClean = !shouldEscalateInteractiveDisplayRoute(interactiveResponse);
    interactiveTimer.finish(
      interactiveIsClean ? 'accepted' : 'fallback',
      interactiveResponse.edges?.length ?? 0,
    );
    if (interactiveIsClean) return completeResponse(interactiveResponse);
    // Interactive quality is a latency preference, never a weaker commit
    // contract. Continue inside this Worker transaction with the full route
    // when its exact final report is dirty, so the UI still receives at most
    // one atomic, hard-gated response.
    escalatedFromInteractive = true;
    preparedInteractiveEdges = interactiveResponse.edges;
  }

  const repairNodes = withDisplayAbsolutePositions(
    request.nodes,
    new Map(request.nodes.map(node => [node.id, node] as const)),
  );
  let exactReport: BaseReactFlowDisplayExactReport | undefined;
  const fullRouteEdges = createBaseReactFlowFullRouteEdges({
    ...commonInput,
    forceFullQuality: request.qualityMode === 'full' || escalatedFromInteractive,
    preparedInteractiveEdges,
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
    recordPhaseTrace,
    false,
    false,
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
      undefined,
      false,
      recordPhaseTrace,
      false,
    );
    repairTimer.finish(repaired.report.hardClean ? 'accepted' : 'rejected', repaired.edges.length);
    return completeResponse(finalizeContainerClearanceResponse({
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
    }));
  }
  return completeResponse(finalizeContainerClearanceResponse({
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
  }));
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

installBaseReactFlowDisplayWorkerTransport(handleBaseReactFlowDisplayWorkerMessage);
