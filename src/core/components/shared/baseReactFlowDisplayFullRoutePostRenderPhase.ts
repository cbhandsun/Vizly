import type { Edge } from '@xyflow/react';

import {
  displayMicroCleanupSafetyDoesNotRegress,
  repairDisplayMicroArtifacts,
} from '../../strategies/shared/edgeDisplayMicroCleanup';
import { repairResidualHairpinBridges } from '../../strategies/shared/edgeHairpinBridgeWidenRepair';
import { repairTerminalBoundaryStairs } from '../../strategies/shared/edgeTerminalBoundaryStairRepair';
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
  hasHardDisplayOverlapRisk,
} from './baseReactFlowDisplayEvaluation';
import {
  finalizeDisplayEdgesForRenderMode,
} from './baseReactFlowDisplayRenderPipeline';
import { displayHardQualityGatesAreClean } from './baseReactFlowDisplayQualityGates';
import { createBaseReactFlowDisplayMicroSafetyContext } from './baseReactFlowDisplayMicroSafety';
import { repairTerminalEndpointStrictCrossingStubs } from './baseReactFlowDisplayStrictTerminalRepair';
import type { BaseReactFlowFullRouteContext } from './baseReactFlowDisplayFullRouteTypes';

export type BaseReactFlowFullRoutePostRenderResult =
  | { kind: 'finalized'; edges: Edge[] }
  | { kind: 'continue'; edges: Edge[]; quality: EdgePathQualityScore };

export const runBaseReactFlowFullRoutePostRenderPhase = (
  context: BaseReactFlowFullRouteContext,
  finalQualityEdges: Edge[],
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
  } = context;
  const finalizedEdges = finalizeDisplayEdgesForRenderMode({
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
  const postFinalizeObstacleCleaned = isLargeGraph
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
    return {
      kind: 'finalized',
      edges: markBaseDisplayFinalized(earlyTerminalHairpinCandidate, inputSignature),
    };
  }
  return {
    kind: 'continue',
    edges: finalPostSoftResidualCleaned,
    quality: finalPostSoftQuality,
  };
};
