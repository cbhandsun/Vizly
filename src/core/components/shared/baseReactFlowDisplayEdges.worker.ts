import type { Edge } from '@xyflow/react';

import {
  lockFinalDisplayComputedPaths,
  withDisplayAbsolutePositions,
} from './baseReactFlowDisplayEdgeCore';
import type { BaseDisplayBoundedCandidateReport } from './baseReactFlowDisplayEvaluation';
import { repairBaseReactFlowMeasuredDisplayEdgesWithReport } from './baseReactFlowDisplayMeasuredRepair';
import {
  baseReactFlowDisplayHardQualityIsClean,
  getDisplayHardQualityGateReport,
} from './baseReactFlowDisplayQualityGates';
import { baseReactFlowDisplayCommercialQualityIsClean } from './baseReactFlowDisplayCommercialQuality';
import { createBaseReactFlowInteractiveDisplayEdges } from './baseReactFlowDisplayQualitySeedPipeline';
import { resolveDisplayWorkerCandidate } from './baseReactFlowDisplayWorkerCandidate';
import { doBaseReactFlowDisplayRoutesMatchExactly } from './baseReactFlowDisplayRoutingTransaction';
import {
  createDisplayWorkerResponseCompleter,
  runDisplayWorkerIncrementalRequest,
} from './baseReactFlowDisplayWorkerSessionResponse';
import {
  type DisplayEdgesWorkerRequest,
  type DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import { runBaseReactFlowDisplayWorkerFullRoute } from './baseReactFlowDisplayWorkerFullRoute';
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
import {
  createBaseReactFlowDisplayWorkerMessageHandler,
  installBaseReactFlowDisplayWorkerTransport,
} from './baseReactFlowDisplayWorkerTransport';
import { postDisplayEdgesResponse } from './baseReactFlowDisplayWorkerScope';
import {
  finalizeStableIncrementalDisplayResponse,
  withExactDisplayHardReport,
} from './baseReactFlowDisplayWorkerResponse';
import { finalizeAuditedIncrementalDisplayResponse } from './baseReactFlowDisplayIncrementalFinalization';
import { finalizeDisplayWorkerIncrementalCandidate } from './baseReactFlowDisplayIncrementalWorkerFinalizer';
import { shouldEscalateInteractiveDisplayRoute } from './baseReactFlowDisplayWorkerFallback';
import {
  createTracedDisplayWorkerFinalEvaluation,
  finalizeBoundedDisplayWorkerRepairResponse,
  type DisplayWorkerFinalizationOptions,
} from './baseReactFlowDisplayWorkerFinalEvaluation';
import { finalizeBaseReactFlowExactCommercialClearance } from './baseReactFlowDisplayFinalCommercialClearanceTransaction';
import { runDisplayWorkerLayoutRepairTransaction } from './baseReactFlowDisplayWorkerLayoutTransaction';

const finalizeContainerClearanceResponse = (
  response: DisplayEdgesWorkerResponse,
  nodes: DisplayEdgesWorkerRequest['nodes'],
  options: DisplayWorkerFinalizationOptions,
): DisplayEdgesWorkerResponse => {
  if (!response.edges) return response;
  const finalEvaluationScope = createTracedDisplayWorkerFinalEvaluation({
    nodes,
    responseEdges: response.edges,
    options,
  });
  const {
    repairNodes,
    evaluation: finalEvaluation,
    hardQualityIsClean: finalHardQualityIsClean,
    withExactHardReport,
  } = finalEvaluationScope;
  const finalizeExactCommercialResponse = (
    exactCandidate: DisplayEdgesWorkerResponse,
  ): DisplayEdgesWorkerResponse => (
    (options.commercialStabilizationPass ?? 0) > 0
      ? exactCandidate
      : finalizeBaseReactFlowExactCommercialClearance({
        exactBaseline: exactCandidate,
        repairNodes,
        eligibleEdgeIds: options.eligibleEdgeIds,
        exactReport: candidate => withExactHardReport(candidate),
      })
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
    ) return withExactHardReport(response);
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
  const lateClearanceTimer = startDisplayRoutingPhaseTrace({
    phase: 'final-clearance',
    candidateCount: commercialEdges.length,
    onTrace: options.onPhaseTrace,
  });
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
  lateClearanceTimer.finish(
    lateMinimumClearanceEdges === commercialEdges ? 'skip' : 'accepted',
    lateMinimumClearanceEdges === commercialEdges ? 0 : lateMinimumClearanceEdges.length,
  );
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
  const finalizedRoutesChanged = Boolean(
    finalizedResponse.edges
    && !doBaseReactFlowDisplayRoutesMatchExactly(response.edges, finalizedResponse.edges),
  );
  if (
    (options.commercialStabilizationPass ?? 0) < (options.isLargeGraph ? 2 : 1)
    && finalizedRoutesChanged
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
      finalEvaluation: finalEvaluationScope,
      preferredEdges: finalizedResponse.edges,
    });
    const stabilizedEdges = stabilizedResponse.edges;
    const exactFinalizedResponse = withExactHardReport(finalizedResponse);
    const finalizedCommercialClearanceIsClean = finalizedResponse.edges
      ? displayBusinessNodeCommercialClearanceIsClean(finalizedResponse.edges, repairNodes)
      : false;
    // Commercial clearance is a final hard contract. A bounded 48px closure
    // must outrank the soft detour guard when the baseline is commercially
    // dirty; otherwise stabilization resurrects the near-node route it was
    // invoked to replace. It must also replace an exact hard-dirty baseline.
    const selectedResponse = stabilizedEdges
      && stabilizedResponse.hardClean === true
      && (
        exactFinalizedResponse.hardClean !== true
        || !finalizedCommercialClearanceIsClean
        || commercialEdgeDetoursDoNotRegress(
          finalizedResponse.edges ?? [],
          stabilizedEdges,
          Array.from(stabilizedEdges.keys()),
        )
      )
      ? stabilizedResponse
      : exactFinalizedResponse;
    return finalizeExactCommercialResponse(selectedResponse);
  }
  return finalizeExactCommercialResponse(withExactHardReport(finalizedResponse));
};

export const computeBaseReactFlowDisplayEdgesWorkerResponse = (
  request: DisplayEdgesWorkerRequest,
  onBoundedCandidate?: (report: BaseDisplayBoundedCandidateReport) => void,
): DisplayEdgesWorkerResponse => {
  if (request.operation === 'repair-validate-or-route') {
    return runDisplayWorkerLayoutRepairTransaction(
      request,
      nestedRequest => computeBaseReactFlowDisplayEdgesWorkerResponse(
        nestedRequest,
        onBoundedCandidate,
      ),
    );
  }
  const phaseTrace: DisplayRoutingPhaseTrace[] = [];
  const recordPhaseTrace = createDisplayRoutingPhaseRecorder({
    requestId: request.requestId,
    phaseTrace,
    publish: postDisplayEdgesResponse,
    // Completed phase metrics are bounded and contain no graph payload. Keep
    // publishing them for incremental jobs as well so a client-side timeout
    // retains the last completed phase instead of losing the entire trace.
    publishProgress: true,
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
      undefined,
      false,
      recordPhaseTrace,
      true,
      request.stopAfterObstacleFailure === true,
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
      return completeResponse(finalizeBoundedDisplayWorkerRepairResponse(
        repairResponse,
        request.nodes,
      ));
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
      const incrementalResponse = finalizeDisplayWorkerIncrementalCandidate({
        request,
        incremental,
        onPhaseTrace: recordPhaseTrace,
        finalizeResponse: (response, eligibleEdgeIds) => finalizeContainerClearanceResponse(
          { ...response, phaseTrace },
          request.nodes,
          {
            eligibleEdgeIds,
            initialHardReport: incremental.hardReport,
            initialHardReportEdges: incremental.edges ?? undefined,
            isLargeGraph: request.isLargeGraph,
            onPhaseTrace: recordPhaseTrace,
            preferredEdges: request.edges,
          },
        ),
      });
      if (incrementalResponse) return completeResponse(incrementalResponse);
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
  if (candidateHardReport && candidateHardReport.hardClean !== true) {
    onBoundedCandidate?.(candidateHardReport);
  }
  let candidateValidationFinished = false;
  if (
    candidateEdges
    && candidateMatchesSource
    && candidateRepairNodes
    && candidateHardReport?.hardClean === true
  ) {
    const validatedCandidateResponse: DisplayEdgesWorkerResponse = {
      requestId: request.requestId,
      edges: candidateEdges,
      hardClean: true,
      routeResolution: 'validated-candidate',
      phaseTrace,
    };
    if (!baseReactFlowDisplayCommercialQualityIsClean(candidateEdges)) {
      const exactValidatedCandidateResponse = withExactDisplayHardReport(
        validatedCandidateResponse,
        candidateRepairNodes,
      );
      if (exactValidatedCandidateResponse.hardClean !== true) {
        if (exactValidatedCandidateResponse.hardReport) {
          onBoundedCandidate?.(exactValidatedCandidateResponse.hardReport);
        }
      } else {
        // Exact hard safety and structural commercial quality are independent
        // promotion contracts. Give a hard-clean candidate the same bounded
        // commercial closure used by final responses before discarding it and
        // recomputing the complete route. The provisional repaired resolution
        // deliberately bypasses the validated-candidate idempotence shortcut,
        // which is only sound after commercial quality has already passed.
        candidateTimer.finish('fallback');
        candidateValidationFinished = true;
        const commerciallyFinalizedResponse = finalizeContainerClearanceResponse({
          ...exactValidatedCandidateResponse,
          routeResolution: 'repaired-candidate',
        }, request.nodes, {
          isLargeGraph: request.isLargeGraph,
          onPhaseTrace: recordPhaseTrace,
          preferredEdges: candidateEdges,
        });
        const exactCommerciallyFinalizedResponse = withExactDisplayHardReport(
          commerciallyFinalizedResponse,
          candidateRepairNodes,
        );
        if (
          exactCommerciallyFinalizedResponse.edges
          && exactCommerciallyFinalizedResponse.hardClean === true
          && baseReactFlowDisplayCommercialQualityIsClean(exactCommerciallyFinalizedResponse.edges)
        ) return completeResponse(exactCommerciallyFinalizedResponse);
      }
    } else {
      candidateTimer.finish('hit');
      const lockedCandidateEdges = lockFinalDisplayComputedPaths(candidateEdges, request.nodes);
      const {
        renderContractIsLocked,
        lockedRouteMatches,
      } = analyzeFinalDisplayRenderContract(
        candidateEdges,
        lockedCandidateEdges,
      );
      const exceedsCommercialPromotionBudget = candidateEdges.length > 80
        || candidateRepairNodes.length > 120;
      const persistentBoundaryCandidate = candidateSource !== 'precompiled'
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
  }
  if (!candidateValidationFinished) {
    candidateTimer.finish(candidateEdges ? 'rejected' : 'skip');
  }
  const commonInput = {
    edges: request.edges,
    nodes: request.nodes,
    enableSmartEdges: request.enableSmartEdges,
    smartEdgePadding: request.smartEdgePadding,
    isLargeGraph: request.isLargeGraph,
    forceFullQuality: request.qualityMode === 'full',
    seedUnroutedFlowEdges: true,
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

  return runBaseReactFlowDisplayWorkerFullRoute({
    request,
    commonInput,
    escalatedFromInteractive,
    preparedInteractiveEdges,
    phaseTrace,
    fallbackMetadata: incrementalFallbackMetadata,
    onPhaseTrace: recordPhaseTrace,
    onBoundedCandidate,
    completeResponse,
    finalizeResponse: finalizeContainerClearanceResponse,
  });
};

export const handleBaseReactFlowDisplayWorkerMessage =
  createBaseReactFlowDisplayWorkerMessageHandler(computeBaseReactFlowDisplayEdgesWorkerResponse);

installBaseReactFlowDisplayWorkerTransport(handleBaseReactFlowDisplayWorkerMessage);
