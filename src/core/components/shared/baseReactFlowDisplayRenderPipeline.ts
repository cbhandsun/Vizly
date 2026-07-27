import type { Edge, Node } from '@xyflow/react';

import { separateDetachedParallelOverlaps } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { repairDisplayMicroArtifacts } from '../../strategies/shared/edgeDisplayMicroCleanup';
import {
  repairDisplayContainerBoundaryClearanceRisks,
  repairDisplaySoftQualityRisks,
} from '../../strategies/shared/edgeDisplaySoftQualityRepair';
import { repairEndpointLaneCrossings } from '../../strategies/shared/edgeEndpointLaneNudgeRepair';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import {
  repairLocalDoglegArtifacts,
  widenReadableSideStepArtifacts,
} from '../../strategies/shared/edgeLocalDoglegRepair';
import { restoreReadableRawLockedPaths } from '../../strategies/shared/edgeReadableRawPathRestore';
import { repairTerminalBoundaryStairs } from '../../strategies/shared/edgeTerminalBoundaryStairRepair';
import { calculateEdgePathQualityScore } from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  markBaseDisplayFinalized,
  toBasicDisplayEdge,
  toCanvasRefEdge,
  toSmartDisplayEdge,
} from './baseReactFlowDisplayEdgeCore';
import { compactDisplayEdgePaths } from './baseReactFlowDisplayGeometry';
import {
  chooseDisplayStrictPolishCandidate,
  chooseFinalObstacleAwarePolishCandidate,
  chooseFinalVisualPolishCandidate,
  displayHardSafetyIsClean,
  hasHardDisplayOverlapRisk,
  type DisplayQualityBudget,
  type DisplaySoftQualityOptions,
} from './baseReactFlowDisplayEvaluation';
import {
  finishDisplaySoftQuality,
  repairDisplayObstacleHits,
  repairStrictBypassesIfNeeded,
} from './baseReactFlowDisplayObstacleRepair';
import {
  DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  repairResidualDisplayOverlaps,
} from './baseReactFlowDisplayOverlapRepair';
import { repairFinalResidualStrictCrossings } from './baseReactFlowDisplayStrictResidualRepair';
import {
  chooseDirectionalOuterLaneCandidate,
  finalStrictDisplaySweep,
  repairStrictCrossingsWithDirectionalOuterLanes,
  repairTerminalStrictCrossingsWithEndpointLanes,
} from './baseReactFlowDisplayStrictSweepRepair';

export const DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS = {
  maxEdges: 4,
  maxCandidatesPerEdge: 40,
  maxQualityEvaluations: 56,
};

const finalDisplayQualitySweep = <T extends Edge[]>(edges: T, nodes: Node[]): T => {
  const strictCleaned = finalStrictDisplaySweep(edges, nodes);
  const microCleaned = repairDisplayMicroArtifacts(strictCleaned) as T;
  const detachedCleaned = separateDetachedParallelOverlaps(
    microCleaned,
    nodes,
    16,
    DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  ) as T;
  const endpointDetachedCleaned = repairEndpointOrthogonalPaths(detachedCleaned, nodes) as T;
  const selected = chooseFinalVisualPolishCandidate(
    strictCleaned,
    microCleaned,
    detachedCleaned,
    endpointDetachedCleaned,
  );
  const finalStrict = finalStrictDisplaySweep(selected, nodes);
  const finalMicro = repairDisplayMicroArtifacts(finalStrict) as T;
  return compactDisplayEdgePaths(chooseFinalVisualPolishCandidate(finalStrict, finalMicro));
};

const finishDisplayQuality = <T extends Edge[]>(edges: T, nodes: Node[]): T => {
  const swept = finalDisplayQualitySweep(edges, nodes);
  const finalMicro = repairDisplayMicroArtifacts(swept) as T;
  return chooseFinalVisualPolishCandidate(swept, finalMicro);
};

const finishFastDisplayEdgesForRenderMode = ({
  finalQualityEdges,
  rawEdges,
  repairNodes,
  enableSmartEdges,
  smartEdgePadding,
  inputSignature,
}: {
  finalQualityEdges: Edge[];
  rawEdges: Edge[];
  repairNodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  inputSignature: string;
}): Edge[] => {
  const displayEdges = enableSmartEdges && Number.isFinite(smartEdgePadding)
    ? finalQualityEdges.map((edge, index) => toSmartDisplayEdge({
      edge,
      rawEdge: rawEdges[index],
      smartEdgePadding,
    }))
    : finalQualityEdges.map((edge, index) => toBasicDisplayEdge({
      edge,
      rawEdge: rawEdges[index],
    }));
  const readableEdges = restoreReadableRawLockedPaths(displayEdges, rawEdges, repairNodes);
  const terminalReadableEdges = repairTerminalBoundaryStairs(readableEdges, repairNodes);
  const microCleaned = repairDisplayMicroArtifacts(terminalReadableEdges) as Edge[];
  const residualStrictCleaned = repairFinalResidualStrictCrossings(microCleaned, repairNodes);
  return markBaseDisplayFinalized(compactDisplayEdgePaths(residualStrictCleaned), inputSignature);
};

const finishBoundedHardDisplayEdgesForRenderMode = ({
  finalQualityEdges,
  rawEdges,
  repairNodes,
  layoutDirection,
  enableSmartEdges,
  smartEdgePadding,
  inputSignature,
  finalSoft,
}: {
  finalQualityEdges: Edge[];
  rawEdges: Edge[];
  repairNodes: Node[];
  layoutDirection: string;
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  inputSignature: string;
  finalSoft: DisplaySoftQualityOptions;
}): Edge[] | null => {
  const displayEdges = enableSmartEdges && Number.isFinite(smartEdgePadding)
    ? finalQualityEdges.map((edge, index) => toSmartDisplayEdge({
      edge,
      rawEdge: rawEdges[index],
      smartEdgePadding,
    }))
    : finalQualityEdges.map((edge, index) => toBasicDisplayEdge({
      edge,
      rawEdge: rawEdges[index],
    }));
  const readableEdges = restoreReadableRawLockedPaths(displayEdges, rawEdges, repairNodes);
  const terminalReadableEdges = repairTerminalBoundaryStairs(readableEdges, repairNodes);
  const obstacleCleaned = repairDisplayObstacleHits(terminalReadableEdges, repairNodes, layoutDirection, finalSoft);
  const obstacleMicroCleaned = repairDisplayMicroArtifacts(obstacleCleaned) as Edge[];
  const residualCleaned = hasHardDisplayOverlapRisk(calculateEdgePathQualityScore(obstacleMicroCleaned))
    ? repairResidualDisplayOverlaps(
      obstacleMicroCleaned,
      repairNodes,
      DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
      DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
    )
    : obstacleMicroCleaned;
  const residualMicroCleaned = repairDisplayMicroArtifacts(residualCleaned) as Edge[];
  const selected = chooseFinalObstacleAwarePolishCandidate(
    repairNodes,
    terminalReadableEdges,
    obstacleCleaned,
    obstacleMicroCleaned,
    residualCleaned,
    residualMicroCleaned,
  );
  const compacted = compactDisplayEdgePaths(
    repairFinalResidualStrictCrossings(selected, repairNodes),
  );
  if (!displayHardSafetyIsClean(compacted, repairNodes)) return null;
  return markBaseDisplayFinalized(compacted, inputSignature);
};

export const finishInteractiveDisplayEdgesForRenderMode = ({
  finalQualityEdges,
  rawEdges,
  repairNodes,
  layoutDirection,
  enableSmartEdges,
  smartEdgePadding,
  inputSignature,
  deferOuterObstacleRepair = false,
}: {
  finalQualityEdges: Edge[];
  rawEdges: Edge[];
  repairNodes: Node[];
  layoutDirection: string;
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  inputSignature: string;
  deferOuterObstacleRepair?: boolean;
}): Edge[] => {
  const displayEdges = enableSmartEdges && Number.isFinite(smartEdgePadding)
    ? finalQualityEdges.map((edge, index) => toSmartDisplayEdge({
      edge,
      rawEdge: rawEdges[index],
      smartEdgePadding,
    }))
    : finalQualityEdges.map((edge, index) => toBasicDisplayEdge({
      edge,
      rawEdge: rawEdges[index],
    }));
  const readableEdges = restoreReadableRawLockedPaths(displayEdges, rawEdges, repairNodes);
  const terminalReadableEdges = repairTerminalBoundaryStairs(readableEdges, repairNodes);
  if (deferOuterObstacleRepair && displayHardSafetyIsClean(terminalReadableEdges, repairNodes)) {
    return markBaseDisplayFinalized(compactDisplayEdgePaths(terminalReadableEdges), inputSignature);
  }
  const microCleaned = repairDisplayMicroArtifacts(terminalReadableEdges) as Edge[];
  const localCleaned = repairLocalDoglegArtifacts(microCleaned, repairNodes);
  const obstacleCleaned = repairDisplayObstacleHits(
    localCleaned,
    repairNodes,
    layoutDirection,
    deferOuterObstacleRepair
      ? { ...DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS, skipOuterFallback: true }
      : DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS,
  );
  if (deferOuterObstacleRepair) {
    return markBaseDisplayFinalized(compactDisplayEdgePaths(obstacleCleaned), inputSignature);
  }
  const residualCleaned = hasHardDisplayOverlapRisk(calculateEdgePathQualityScore(obstacleCleaned))
    ? repairResidualDisplayOverlaps(
      obstacleCleaned,
      repairNodes,
      DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
      DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
    )
    : obstacleCleaned;
  const residualMicroCleaned = repairDisplayMicroArtifacts(residualCleaned) as Edge[];
  const selected = chooseFinalObstacleAwarePolishCandidate(
    repairNodes,
    displayEdges,
    terminalReadableEdges,
    microCleaned,
    localCleaned,
    obstacleCleaned,
    residualCleaned,
    residualMicroCleaned,
  );
  const strictCleaned = finalStrictDisplaySweep(selected, repairNodes);
  const strictMicroCleaned = repairDisplayMicroArtifacts(strictCleaned) as Edge[];
  const strictSelected = chooseDisplayStrictPolishCandidate(
    repairNodes,
    selected,
    strictCleaned,
    strictMicroCleaned,
  );
  const directionalCleaned = chooseDirectionalOuterLaneCandidate(
    repairNodes,
    strictSelected,
    repairEndpointOrthogonalPaths(
      repairStrictCrossingsWithDirectionalOuterLanes(strictSelected, repairNodes),
      repairNodes,
    ),
  );
  const finalMicroCleaned = repairDisplayMicroArtifacts(directionalCleaned) as Edge[];
  const finalLocalCleaned = repairLocalDoglegArtifacts(finalMicroCleaned, repairNodes);
  const finalStrictCleaned = finalLocalCleaned === strictSelected
    ? strictSelected
    : finalStrictDisplaySweep(finalLocalCleaned, repairNodes);
  const finalStrictMicroCleaned = repairDisplayMicroArtifacts(finalStrictCleaned) as Edge[];
  const finalSelected = chooseDisplayStrictPolishCandidate(
    repairNodes,
    directionalCleaned,
    finalMicroCleaned,
    finalLocalCleaned,
    finalStrictCleaned,
    finalStrictMicroCleaned,
  );
  const postSelectedTerminalCleaned = repairTerminalStrictCrossingsWithEndpointLanes(
    finalSelected,
    repairNodes,
  );
  const postSelectedTerminalMicroCleaned = repairDisplayMicroArtifacts(
    postSelectedTerminalCleaned,
  ) as Edge[];
  const postSelected = chooseDisplayStrictPolishCandidate(
    repairNodes,
    finalSelected,
    postSelectedTerminalCleaned,
    postSelectedTerminalMicroCleaned,
  );
  return markBaseDisplayFinalized(
    compactDisplayEdgePaths(repairFinalResidualStrictCrossings(postSelected, repairNodes)),
    inputSignature,
  );
};

const polishRenderedDisplayEdges = (edges: Edge[], nodes: Node[]): Edge[] => {
  const terminalBoundaryPolished = repairTerminalBoundaryStairs(edges, nodes);
  const endpointLaneRawPolished = repairEndpointLaneCrossings(terminalBoundaryPolished, nodes);
  const endpointLanePolished = repairEndpointOrthogonalPaths(endpointLaneRawPolished, nodes);
  const readableSideStepPolished = widenReadableSideStepArtifacts(edges, nodes);
  const selectedAnchorPolished = chooseFinalVisualPolishCandidate(
    terminalBoundaryPolished,
    endpointLaneRawPolished,
    endpointLanePolished,
    readableSideStepPolished,
  );
  const localPolished = repairLocalDoglegArtifacts(selectedAnchorPolished, nodes);
  const detachedPolished = separateDetachedParallelOverlaps(
    localPolished,
    nodes,
    16,
    DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  );
  const endpointPolished = repairEndpointOrthogonalPaths(detachedPolished, nodes);
  const selectedPolished = chooseFinalVisualPolishCandidate(
    selectedAnchorPolished,
    localPolished,
    detachedPolished,
    endpointPolished,
  );
  const finalEndpointLaneRawPolished = repairEndpointLaneCrossings(selectedPolished, nodes);
  const finalEndpointLanePolished = repairEndpointOrthogonalPaths(finalEndpointLaneRawPolished, nodes);
  const finalDetachedPolished = separateDetachedParallelOverlaps(
    finalEndpointLanePolished,
    nodes,
    16,
    DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  );
  const finalCandidate = chooseFinalVisualPolishCandidate(
    selectedPolished,
    finalEndpointLaneRawPolished,
    finalEndpointLanePolished,
    finalDetachedPolished,
  );
  const finalEndpointPolished = repairEndpointOrthogonalPaths(finalCandidate, nodes);
  const finalStrictBypassRawPolished = repairStrictBypassesIfNeeded(finalEndpointPolished, nodes);
  const finalStrictBypassPolished = repairEndpointOrthogonalPaths(finalStrictBypassRawPolished, nodes);
  const finalSelected = chooseFinalVisualPolishCandidate(
    finalCandidate,
    finalEndpointPolished,
    finalStrictBypassRawPolished,
    finalStrictBypassPolished,
  );
  return repairFinalResidualStrictCrossings(finalSelected, nodes);
};

export const finalizeDisplayEdgesForRenderMode = ({
  finalQualityEdges,
  rawEdges,
  repairNodes,
  renderNodes,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
  layoutDirection,
  inputSignature,
  qualityBudget,
}: {
  finalQualityEdges: Edge[];
  rawEdges: Edge[];
  repairNodes: Node[];
  renderNodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  layoutDirection: string;
  inputSignature: string;
  qualityBudget: DisplayQualityBudget;
}): Edge[] => {
  if (isLargeGraph) {
    const containerReadableEdges = repairDisplayContainerBoundaryClearanceRisks(
      finalQualityEdges,
      repairNodes,
    );
    return markBaseDisplayFinalized(
      containerReadableEdges.map(edge => toCanvasRefEdge(edge)),
      inputSignature,
    );
  }
  if (qualityBudget.mode === 'fast') {
    return finishFastDisplayEdgesForRenderMode({
      finalQualityEdges,
      rawEdges,
      repairNodes,
      enableSmartEdges,
      smartEdgePadding,
      inputSignature,
    });
  }
  if (qualityBudget.mode === 'bounded' && (finalQualityEdges.length > 24 || repairNodes.length > 36)) {
    const boundedHardFinished = finishBoundedHardDisplayEdgesForRenderMode({
      finalQualityEdges,
      rawEdges,
      repairNodes,
      layoutDirection,
      enableSmartEdges,
      smartEdgePadding,
      inputSignature,
      finalSoft: qualityBudget.finalSoft,
    });
    if (boundedHardFinished) return boundedHardFinished;
  }
  if (enableSmartEdges) {
    if (typeof smartEdgePadding !== 'number' || !Number.isFinite(smartEdgePadding)) {
      const finished = finishDisplayQuality(polishRenderedDisplayEdges(finalQualityEdges, repairNodes), renderNodes);
      const softFinished = finishDisplaySoftQuality(finished, repairNodes, layoutDirection, qualityBudget.finalSoft);
      const strictFinished = repairFinalResidualStrictCrossings(softFinished, repairNodes);
      return markBaseDisplayFinalized(
        repairDisplayContainerBoundaryClearanceRisks(strictFinished, repairNodes),
        inputSignature,
      );
    }
    const smartDisplayEdges = finalQualityEdges.map((edge, index) => toSmartDisplayEdge({
      edge,
      rawEdge: rawEdges[index],
      smartEdgePadding,
    }));
    const polishedSmartDisplayEdges = polishRenderedDisplayEdges(smartDisplayEdges, repairNodes);
    const readableSmartDisplayEdges = restoreReadableRawLockedPaths(polishedSmartDisplayEdges, rawEdges, repairNodes);
    const softReadableSmartDisplayEdges = repairDisplaySoftQualityRisks(
      readableSmartDisplayEdges,
      repairNodes,
      layoutDirection,
      qualityBudget.soft,
    );
    const finishedSmartDisplayEdges = finishDisplayQuality(softReadableSmartDisplayEdges, renderNodes);
    const finalSmartDisplayEdges = finishDisplaySoftQuality(
      finishedSmartDisplayEdges,
      repairNodes,
      layoutDirection,
      qualityBudget.finalSoft,
    );
    const strictSmartDisplayEdges = repairFinalResidualStrictCrossings(
      finalSmartDisplayEdges,
      repairNodes,
    );
    return markBaseDisplayFinalized(
      repairDisplayContainerBoundaryClearanceRisks(strictSmartDisplayEdges, repairNodes),
      inputSignature,
    );
  }
  const basicDisplayEdges = finalQualityEdges.map((edge, index) => toBasicDisplayEdge({
    edge,
    rawEdge: rawEdges[index],
  }));
  const polishedBasicDisplayEdges = polishRenderedDisplayEdges(basicDisplayEdges, repairNodes);
  const readableBasicDisplayEdges = restoreReadableRawLockedPaths(polishedBasicDisplayEdges, rawEdges, repairNodes);
  const softReadableBasicDisplayEdges = repairDisplaySoftQualityRisks(
    readableBasicDisplayEdges,
    repairNodes,
    layoutDirection,
    qualityBudget.soft,
  );
  const finishedBasicDisplayEdges = finishDisplayQuality(softReadableBasicDisplayEdges, renderNodes);
  const finalBasicDisplayEdges = finishDisplaySoftQuality(
    finishedBasicDisplayEdges,
    repairNodes,
    layoutDirection,
    qualityBudget.finalSoft,
  );
  const strictBasicDisplayEdges = repairFinalResidualStrictCrossings(
    finalBasicDisplayEdges,
    repairNodes,
  );
  return markBaseDisplayFinalized(
    repairDisplayContainerBoundaryClearanceRisks(strictBasicDisplayEdges, repairNodes),
    inputSignature,
  );
};
