import type { Edge } from '@xyflow/react';

import {
  displayMicroCleanupSafetyDoesNotRegress,
  repairDisplayMicroArtifacts,
} from '../../strategies/shared/edgeDisplayMicroCleanup';
import { repairResidualHairpinBridges } from '../../strategies/shared/edgeHairpinBridgeWidenRepair';
import { repairTerminalBoundaryStairs } from '../../strategies/shared/edgeTerminalBoundaryStairRepair';
import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import {
  calculateEdgePathQualityScore,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { markBaseDisplayFinalized } from './baseReactFlowDisplayEdgeCore';
import {
  finishDisplaySoftQuality,
} from './baseReactFlowDisplayObstacleRepair';
import {
  DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
  repairResidualDisplayOverlaps,
} from './baseReactFlowDisplayOverlapRepair';
import {
  chooseFinalObstacleAwarePolishCandidate,
  hasHardDisplayOverlapRisk,
  keepPerEdgeObstacleNonRegressingCandidates,
  type BaseDisplayBoundedCandidateReport,
} from './baseReactFlowDisplayEvaluation';
import { finalSameSideTrueTrunksDoNotRegress } from './baseReactFlowDisplayFinalEndpointOrder';
import {
  finalizeDisplayEdgesForRenderMode,
} from './baseReactFlowDisplayRenderPipeline';
import { displayHardQualityGatesAreClean } from './baseReactFlowDisplayQualityGates';
import { createBaseReactFlowDisplayMicroSafetyContext } from './baseReactFlowDisplayMicroSafety';
import { startDisplayRoutingPhaseTrace } from './baseReactFlowDisplayRoutingTrace';
import { repairTerminalEndpointStrictCrossingStubs } from './baseReactFlowDisplayStrictTerminalRepair';
import type { BaseReactFlowFullRouteContext } from './baseReactFlowDisplayFullRouteTypes';

export type BaseReactFlowFullRoutePostRenderResult =
  | { kind: 'finalized'; edges: Edge[] }
  | { kind: 'continue'; edges: Edge[]; quality: EdgePathQualityScore };

export const shouldDeferFullRenderPolishForStrictTrunkClosure = (
  edges: Edge[],
  nodes: BaseReactFlowFullRouteContext['repairNodes'],
  qualityReport: BaseDisplayBoundedCandidateReport,
): boolean => qualityReport.quality.strictCrossings > 0
  && auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks.length > 0;

export const runBaseReactFlowFullRoutePostRenderPhase = (
  context: BaseReactFlowFullRouteContext,
  finalQualityEdges: Edge[],
  qualityReport: BaseDisplayBoundedCandidateReport,
): BaseReactFlowFullRoutePostRenderResult => {
  const {
    routeSeedEdges,
    repairNodes,
    renderNodes,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
    layoutDirection,
    inputSignature,
    qualityBudget,
    useBoundedLargeRepair,
    onPhaseTrace,
  } = context;
  const finalizeTimer = startDisplayRoutingPhaseTrace({
    phase: 'post-render-finalize',
    candidateCount: finalQualityEdges.length,
    onTrace: onPhaseTrace,
  });
  const deferFullRenderPolish = shouldDeferFullRenderPolishForStrictTrunkClosure(
    finalQualityEdges,
    repairNodes,
    qualityReport,
  );
  const finalizedEdges = deferFullRenderPolish
    ? finalQualityEdges
    : (() => {
      const rawFinalizedEdges = finalizeDisplayEdgesForRenderMode({
        finalQualityEdges,
        rawEdges: routeSeedEdges,
        repairNodes,
        renderNodes,
        enableSmartEdges,
        smartEdgePadding,
        isLargeGraph,
        layoutDirection,
        inputSignature,
        qualityBudget,
      });
      const obstacleSafeFinalizedEdges = keepPerEdgeObstacleNonRegressingCandidates(
        finalQualityEdges,
        rawFinalizedEdges,
        repairNodes,
      );
      const selectedFinalizedEdges = chooseFinalObstacleAwarePolishCandidate(
        repairNodes,
        finalQualityEdges,
        obstacleSafeFinalizedEdges,
        rawFinalizedEdges,
      );
      return finalSameSideTrueTrunksDoNotRegress(
        finalQualityEdges,
        selectedFinalizedEdges,
        repairNodes,
      )
        ? selectedFinalizedEdges
        : finalQualityEdges;
    })();
  finalizeTimer.finish(
    deferFullRenderPolish
      ? 'fallback'
      : finalizedEdges === finalQualityEdges ? 'skip' : 'accepted',
    finalizedEdges === finalQualityEdges ? 0 : finalizedEdges.length,
  );
  const softClosureTimer = startDisplayRoutingPhaseTrace({
    phase: 'post-render-soft-closure',
    candidateCount: finalizedEdges.length,
    onTrace: onPhaseTrace,
  });
  const microSafetyContext = createBaseReactFlowDisplayMicroSafetyContext(
    finalizedEdges,
    repairNodes,
  );
  const postFinalizeMicroCandidate = repairDisplayMicroArtifacts(
    finalizedEdges,
    microSafetyContext,
  );
  const postFinalizeMicroCleaned = displayMicroCleanupSafetyDoesNotRegress(
    microSafetyContext.baseline,
    microSafetyContext.evaluate(postFinalizeMicroCandidate),
  )
    ? postFinalizeMicroCandidate
    : finalizedEdges;
  const postFinalizeResidualCleaned = postFinalizeMicroCleaned;
  const postFinalizeObstacleCleaned = isLargeGraph && qualityBudget.mode === 'fast'
    ? postFinalizeResidualCleaned
    : finishDisplaySoftQuality(
      postFinalizeResidualCleaned,
      repairNodes,
      layoutDirection,
      qualityBudget.finalSoft,
    );
  const postFinalizeObstacleQuality = calculateEdgePathQualityScore(postFinalizeObstacleCleaned);
  const finalPostSoftResidualCleaned = hasHardDisplayOverlapRisk(postFinalizeObstacleQuality)
    ? repairResidualDisplayOverlaps(
      postFinalizeObstacleCleaned,
      repairNodes,
      useBoundedLargeRepair
        ? DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS
        : DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
      useBoundedLargeRepair
        ? DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS
        : DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
    )
    : postFinalizeObstacleCleaned;
  const finalPostSoftQuality = calculateEdgePathQualityScore(finalPostSoftResidualCleaned);
  const earlyTerminalStrictCandidate = finalPostSoftQuality.strictCrossings > 0
    ? repairTerminalEndpointStrictCrossingStubs(finalPostSoftResidualCleaned, repairNodes)
    : finalPostSoftResidualCleaned;
  const earlyTerminalReadableCandidate = repairTerminalBoundaryStairs(
    earlyTerminalStrictCandidate,
    repairNodes,
  );
  const earlyTerminalHairpinCandidate = repairResidualHairpinBridges(
    earlyTerminalReadableCandidate,
    repairNodes,
  );
  if (displayHardQualityGatesAreClean(earlyTerminalHairpinCandidate, repairNodes)) {
    softClosureTimer.finish('accepted', earlyTerminalHairpinCandidate.length);
    return {
      kind: 'finalized',
      edges: markBaseDisplayFinalized(earlyTerminalHairpinCandidate, inputSignature),
    };
  }
  softClosureTimer.finish('fallback');
  return {
    kind: 'continue',
    edges: finalPostSoftResidualCleaned,
    quality: finalPostSoftQuality,
  };
};
