import type { Edge } from '@xyflow/react';

import {
  computeBaseDisplayInputSignature,
  isBaseDisplayFinalized,
  markBaseDisplayFinalized,
  normalizeBaseEdge,
  synthesizeStableFallbackPath,
} from './baseReactFlowDisplayEdgeCore';
import {
  displayHardQualityGatesAreClean,
} from './baseReactFlowDisplayQualityGates';
import { doesDisplayCandidateMatchSourceGraph } from './baseReactFlowDisplayCandidateValidation';
import { baseReactFlowDisplayCommercialQualityIsClean } from './baseReactFlowDisplayCommercialQuality';
import {
  resolveDisplayQualityBudget,
  type BaseDisplayBoundedCandidateReport,
} from './baseReactFlowDisplayEvaluation';
import { createFastDisplayQualityEdges } from './baseReactFlowDisplayQualitySeedPipeline';
import {
  commitDisplayEdgesForRenderMode,
  finalizeDisplayEdgesForRenderMode,
} from './baseReactFlowDisplayRenderPipeline';
import type {
  BaseReactFlowDisplayEdgesArgs,
  BaseReactFlowFullRouteSeedResult,
  BaseReactFlowPreDisplayFinalEdgesFactory,
} from './baseReactFlowDisplayFullRouteTypes';
import {
  createBaseReactFlowFinalEndpointEvaluation,
  diffBaseReactFlowEvaluationMetrics,
} from './baseReactFlowDisplayFinalEndpointEvaluation';
import { resolveBaseReactFlowEvaluationNodes } from './baseReactFlowDisplayEvaluationNodes';
import { auditBaseReactFlowFinalSafetyClosure } from './baseReactFlowDisplayFinalSafetyAudit';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import { createDisplayRoutingTopologyPlan } from './baseReactFlowDisplayRoutingTopologyPlan';

export const selectBaseReactFlowFullRouteSeedEdges = (
  rawEdges: Edge[],
  preparedBoundedEdges: Edge[] | null,
): Edge[] => preparedBoundedEdges ?? rawEdges;

export const prepareBaseReactFlowFullRouteSeed = ({
  edges,
  nodes,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
  displayEdgeEpoch,
  forceFullQuality = false,
  preparedInteractiveEdges,
  seedUnroutedFlowEdges = false,
  reusePreparedGlobalRouting = false,
  skipBoundedAttempt = false,
  skipFinalizedReuse = false,
  onPhaseTrace,
  onSeedPhaseTrace,
  createPreDisplayFinalEdges,
  evaluationSession: providedEvaluationSession,
}: BaseReactFlowDisplayEdgesArgs & {
  createPreDisplayFinalEdges?: BaseReactFlowPreDisplayFinalEdgesFactory;
  onSeedPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}): BaseReactFlowFullRouteSeedResult => {
  const inputSignature = computeBaseDisplayInputSignature({
    nodes,
    edges,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
  });
  if (!skipFinalizedReuse && isBaseDisplayFinalized(edges, inputSignature)) {
    return { kind: 'finalized', edges };
  }

  const repairNodes = resolveBaseReactFlowEvaluationNodes(nodes, providedEvaluationSession);
  let preparedBoundedEdges: Edge[] | null = null;
  if (
    createPreDisplayFinalEdges
    && !skipBoundedAttempt
    && (!isLargeGraph || forceFullQuality)
    && edges.length > 24
    && edges.length <= 80
  ) {
    let boundedReport: BaseDisplayBoundedCandidateReport | undefined;
    const boundedFinal = createPreDisplayFinalEdges({
      edges,
      nodes,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
      displayEdgeEpoch,
      skipFullRouteFallback: true,
      onBoundedCandidate: (report) => {
        boundedReport = report;
      },
      onPhaseTrace: onSeedPhaseTrace,
      evaluationSession: providedEvaluationSession,
    });
    const boundedHardClean = boundedReport?.hardClean ?? displayHardQualityGatesAreClean(
      boundedFinal,
      repairNodes,
    );
    if (
      boundedHardClean
      && baseReactFlowDisplayCommercialQualityIsClean(boundedFinal)
    ) {
      return {
        kind: 'finalized',
        edges: markBaseDisplayFinalized(boundedFinal, inputSignature),
      };
    }
    // A hard-clean seed can still violate the separate commercial contract
    // (for example, an excessive bend chain). Do not finalize or reuse that
    // geometry as the full-route seed; start the complete quality route from
    // the source graph so the commercial defect is not preserved by handoff.
    preparedBoundedEdges = boundedHardClean ? null : boundedFinal;
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const evaluationSession = providedEvaluationSession
    ?? createBaseReactFlowFinalEndpointEvaluation(repairNodes);
  // Keep the prepared seed paired with normalized routes through render finalization;
  // otherwise raw locked paths can overwrite obstacle-safe pre-display output.
  const trustedInteractiveEdges = preparedInteractiveEdges
    && doesDisplayCandidateMatchSourceGraph(edges, preparedInteractiveEdges)
    ? preparedInteractiveEdges
    : null;
  const preparedRouteSeed = preparedBoundedEdges ?? trustedInteractiveEdges;
  const routeSeedEdges = selectBaseReactFlowFullRouteSeedEdges(edges, preparedRouteSeed);
  const initialGateTimer = startDisplayRoutingPhaseTrace({
    phase: 'seed-initial-gate',
    candidateCount: routeSeedEdges.length,
    onTrace: onSeedPhaseTrace,
  });
  const initialGateMetricsBefore = evaluationSession.readMetrics();
  const committedInitialRoute = commitDisplayEdgesForRenderMode({
    finalQualityEdges: routeSeedEdges,
    rawEdges: routeSeedEdges,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
    inputSignature,
    nodes,
  });
  const initialSafetyAudit = auditBaseReactFlowFinalSafetyClosure(
    committedInitialRoute,
    repairNodes,
    evaluationSession,
  );
  initialGateTimer.finish(
    initialSafetyAudit.canSkip
      ? 'accepted'
      : initialSafetyAudit.endpointDefectOnly ? 'rejected' : 'fallback',
    initialSafetyAudit.canSkip ? committedInitialRoute.length : 0,
    diffBaseReactFlowEvaluationMetrics(
      initialGateMetricsBefore,
      evaluationSession.readMetrics(),
    ),
  );
  if (initialSafetyAudit.canSkip) {
    return { kind: 'finalized', edges: committedInitialRoute };
  }
  const normalizedEdges = routeSeedEdges
    .map((rawEdge) => normalizeBaseEdge({ edge: rawEdge, nodeById, displayEdgeEpoch }))
    .map((edge) => synthesizeStableFallbackPath({
      edge,
      nodeById,
      allowUnroutedFlowEdge: seedUnroutedFlowEdges,
    }));
  const layoutDirection = typeof normalizedEdges[0]?.data?.layoutDirection === 'string'
    ? normalizedEdges[0].data.layoutDirection
    : 'TB';
  const qualityBudget = resolveDisplayQualityBudget(
    normalizedEdges,
    repairNodes,
    isLargeGraph,
    forceFullQuality,
  );
  const useBoundedLargeRepair = qualityBudget.mode === 'bounded'
    && (normalizedEdges.length > 24 || repairNodes.length > 36);

  if (qualityBudget.mode === 'fast') {
    return {
      kind: 'finalized',
      edges: finalizeDisplayEdgesForRenderMode({
        finalQualityEdges: createFastDisplayQualityEdges(normalizedEdges, repairNodes),
        rawEdges: routeSeedEdges,
        repairNodes,
        renderNodes: nodes,
        enableSmartEdges,
        smartEdgePadding,
        isLargeGraph,
        layoutDirection,
        inputSignature,
        qualityBudget,
      }),
    };
  }

  const canReusePreparedGlobalRouting = reusePreparedGlobalRouting
    || preparedBoundedEdges !== null
    || trustedInteractiveEdges !== null
    || (skipBoundedAttempt && (normalizedEdges.length > 24 || repairNodes.length > 40));

  return {
    kind: 'continue',
    context: {
      inputSignature,
      routeSeedEdges,
      normalizedEdges,
      repairNodes,
      renderNodes: nodes,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
      layoutDirection,
      qualityBudget,
      useBoundedLargeRepair,
      canReusePreparedGlobalRouting,
      reusePreparedGlobalRouting,
      onPhaseTrace,
      evaluationSession,
      topologyPlan: createDisplayRoutingTopologyPlan(repairNodes, normalizedEdges),
    },
  };
};
