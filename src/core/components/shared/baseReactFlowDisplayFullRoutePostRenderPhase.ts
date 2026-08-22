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
  commitDisplayEdgesForRenderMode,
  finalizeDisplayEdgesForRenderMode,
} from './baseReactFlowDisplayRenderPipeline';
import { displayHardQualityGatesAreClean } from './baseReactFlowDisplayQualityGates';
import { createBaseReactFlowDisplayMicroSafetyContext } from './baseReactFlowDisplayMicroSafety';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import { repairTerminalEndpointStrictCrossingStubs } from './baseReactFlowDisplayStrictTerminalRepair';
import type { BaseReactFlowFullRouteContext } from './baseReactFlowDisplayFullRouteTypes';

export type BaseReactFlowFullRoutePostRenderResult =
  | { kind: 'finalized'; edges: Edge[] }
  | {
      kind: 'continue';
      edges: Edge[];
      quality: EdgePathQualityScore;
      skipInitialStrictOverlapRepair: boolean;
    };

export const shouldDeferFullRenderPolishForStrictTrunkClosure = (
  edges: Edge[],
  nodes: BaseReactFlowFullRouteContext['repairNodes'],
  qualityReport: BaseDisplayBoundedCandidateReport,
): boolean => (
  // Small hard-overlap routes are handed to the dedicated overlap/strict
  // closure below. Full render polish cannot close those defects atomically
  // and is otherwise commonly computed only to be rejected by the hard gate.
  (edges.length <= 24 && hasHardDisplayOverlapRisk(qualityReport.quality))
  || (
    qualityReport.quality.strictCrossings > 0
    && auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks.length > 0
  )
);

export const shouldUseBoundedPostRenderResidualRepair = (
  useBoundedLargeRepair: boolean,
  mustCloseHardOverlapFirst: boolean,
): boolean => useBoundedLargeRepair || mustCloseHardOverlapFirst;

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
  if (qualityReport.hardClean) {
    const directCommitTimer = startDisplayRoutingPhaseTrace({
      phase: 'post-render-finalize',
      candidateCount: finalQualityEdges.length,
      onTrace: onPhaseTrace,
    });
    const committedEdges = commitDisplayEdgesForRenderMode({
      finalQualityEdges,
      rawEdges: routeSeedEdges,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph,
      inputSignature,
      nodes: renderNodes,
    });
    directCommitTimer.finish('accepted', committedEdges.length);
    startDisplayRoutingPhaseTrace({
      phase: 'post-render-soft-closure',
      candidateCount: committedEdges.length,
      onTrace: onPhaseTrace,
    }).finish('skip');
    return { kind: 'finalized', edges: committedEdges };
  }
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
  const softClosurePhaseTrace: DisplayRoutingPhaseTrace[] = [];
  const recordSoftClosurePhaseTrace = onPhaseTrace
    ? (trace: DisplayRoutingPhaseTrace) => softClosurePhaseTrace.push(trace)
    : undefined;
  const microTimer = startDisplayRoutingPhaseTrace({
    phase: 'post-render-micro',
    candidateCount: finalizedEdges.length,
    onTrace: recordSoftClosurePhaseTrace,
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
  const postFinalizeQuality = calculateEdgePathQualityScore(postFinalizeResidualCleaned);
  microTimer.finish(
    postFinalizeResidualCleaned === finalizedEdges ? 'skip' : 'accepted',
    postFinalizeResidualCleaned === finalizedEdges ? 0 : postFinalizeResidualCleaned.length,
  );
  // Soft obstacle/visual search is costly and cannot close strict overlap
  // defects atomically. Let the dedicated bounded overlap/strict phases close
  // those defects first instead of spending seconds on a candidate that the
  // hard gate must reject.
  const mustCloseHardOverlapFirst = hasHardDisplayOverlapRisk(postFinalizeQuality);
  const softQualityTimer = startDisplayRoutingPhaseTrace({
    phase: 'post-render-soft-quality',
    candidateCount: postFinalizeResidualCleaned.length,
    onTrace: recordSoftClosurePhaseTrace,
  });
  const postFinalizeObstacleCleaned = (finalizedEdges.length <= 24 && mustCloseHardOverlapFirst)
    || (isLargeGraph && qualityBudget.mode === 'fast')
    ? postFinalizeResidualCleaned
    : finishDisplaySoftQuality(
      postFinalizeResidualCleaned,
      repairNodes,
      layoutDirection,
      qualityBudget.finalSoft,
    );
  softQualityTimer.finish(
    postFinalizeObstacleCleaned === postFinalizeResidualCleaned ? 'skip' : 'accepted',
    postFinalizeObstacleCleaned === postFinalizeResidualCleaned
      ? 0
      : postFinalizeObstacleCleaned.length,
  );
  const residualTimer = startDisplayRoutingPhaseTrace({
    phase: 'post-render-residual',
    candidateCount: postFinalizeObstacleCleaned.length,
    onTrace: recordSoftClosurePhaseTrace,
  });
  const postFinalizeObstacleQuality = calculateEdgePathQualityScore(postFinalizeObstacleCleaned);
  const useBoundedPostRenderResidualRepair = shouldUseBoundedPostRenderResidualRepair(
    useBoundedLargeRepair,
    mustCloseHardOverlapFirst,
  );
  const finalPostSoftResidualCleaned = hasHardDisplayOverlapRisk(postFinalizeObstacleQuality)
    ? repairResidualDisplayOverlaps(
      postFinalizeObstacleCleaned,
      repairNodes,
      useBoundedPostRenderResidualRepair
        ? DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS
        : DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
      useBoundedPostRenderResidualRepair
        ? DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS
        : DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
    )
    : postFinalizeObstacleCleaned;
  residualTimer.finish(
    finalPostSoftResidualCleaned === postFinalizeObstacleCleaned ? 'skip' : 'accepted',
    finalPostSoftResidualCleaned === postFinalizeObstacleCleaned
      ? 0
      : finalPostSoftResidualCleaned.length,
  );
  const terminalGateTimer = startDisplayRoutingPhaseTrace({
    phase: 'post-render-terminal-gate',
    candidateCount: finalPostSoftResidualCleaned.length,
    onTrace: recordSoftClosurePhaseTrace,
  });
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
    terminalGateTimer.finish('accepted', earlyTerminalHairpinCandidate.length);
    softClosureTimer.finish('accepted', earlyTerminalHairpinCandidate.length);
    softClosurePhaseTrace.forEach(trace => onPhaseTrace?.(trace));
    return {
      kind: 'finalized',
      edges: markBaseDisplayFinalized(earlyTerminalHairpinCandidate, inputSignature),
    };
  }
  terminalGateTimer.finish('fallback');
  softClosureTimer.finish('fallback');
  softClosurePhaseTrace.forEach(trace => onPhaseTrace?.(trace));
  return {
    kind: 'continue',
    edges: finalPostSoftResidualCleaned,
    quality: finalPostSoftQuality,
    skipInitialStrictOverlapRepair: mustCloseHardOverlapFirst
      && finalPostSoftResidualCleaned === postFinalizeObstacleCleaned,
  };
};
