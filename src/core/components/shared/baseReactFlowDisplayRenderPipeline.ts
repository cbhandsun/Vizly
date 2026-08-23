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
import { commitComputedDisplayEdgeTerminals } from './baseReactFlowDisplayEndpointAnchoring';
import {
  markBaseDisplayFinalized,
  toBasicDisplayEdge,
  toCanvasRefEdge,
  toSmartDisplayEdge,
} from './baseReactFlowDisplayEdgeCore';
import { compactDisplayEdgePaths } from './baseReactFlowDisplayGeometry';
import { materializeDisplayTerminalHandles } from './baseReactFlowDisplayTerminalCommit';
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import {
  chooseDisplayStrictPolishCandidate,
  chooseFinalObstacleAwarePolishCandidate,
  chooseFinalVisualPolishCandidate,
  displayHardSafetyIsClean,
  hasHardDisplayOverlapRisk,
  type DisplayQualityBudget,
  type DisplaySoftQualityOptions,
} from './baseReactFlowDisplayEvaluation';
import { repairBusinessNodeClearanceRisks } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
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

const closeBusinessNodeClearanceTransaction = (
  edges: Edge[],
  nodes: Node[],
): Edge[] => {
  const clearanceCandidate = repairBusinessNodeClearanceRisks(edges, nodes, {
    allowTransientStrictCrossing: true,
  });
  const residualCandidate = repairFinalResidualStrictCrossings(clearanceCandidate, nodes);
  const directionalCandidate = repairEndpointOrthogonalPaths(
    repairStrictCrossingsWithDirectionalOuterLanes(residualCandidate, nodes),
    nodes,
  );
  return repairFinalResidualStrictCrossings(
    chooseDirectionalOuterLaneCandidate(
      nodes,
      residualCandidate,
      directionalCandidate,
    ),
    nodes,
  );
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

/**
 * Commits an already quality-validated route to the renderer selected by the
 * current display mode without running another geometry-polish transaction.
 *
 * Full-route safety phases can finish early after closing their last hard
 * defect. Those candidates are geometrically final, but they still need the
 * same smart/basic/canvas conversion as the normal post-render path. Keeping
 * this conversion separate prevents an early safety exit from leaking raw
 * edge types while also preserving an accepted shared-trunk transaction.
 */
export const commitDisplayEdgesForRenderMode = ({
  finalQualityEdges,
  rawEdges,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
  inputSignature,
  nodes,
}: {
  finalQualityEdges: Edge[];
  rawEdges: Edge[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  inputSignature: string;
  nodes: Node[];
}): Edge[] => {
  const committedQualityEdges = commitComputedDisplayEdgeTerminals(
    materializeDisplayTerminalHandles(finalQualityEdges, nodes),
    nodes,
  );
  if (isLargeGraph) {
    return markBaseDisplayFinalized(
      committedQualityEdges.map(edge => (
        String(edge.type || '').toLowerCase() === 'canvas-ref'
          ? edge
          : toCanvasRefEdge(edge)
      )),
      inputSignature,
    );
  }
  const displayEdges = enableSmartEdges && Number.isFinite(smartEdgePadding)
    ? committedQualityEdges.map((edge, index) => toSmartDisplayEdge({
      edge,
      rawEdge: rawEdges[index] ?? edge,
      smartEdgePadding,
    }))
    : committedQualityEdges.map((edge, index) => toBasicDisplayEdge({
      edge,
      rawEdge: rawEdges[index] ?? edge,
    }));
  return markBaseDisplayFinalized(displayEdges, inputSignature);
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
  const obstacleCleaned = repairDisplayObstacleHits(
    terminalReadableEdges,
    repairNodes,
    layoutDirection,
    finalSoft,
  );
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
  onPhaseTrace,
}: {
  finalQualityEdges: Edge[];
  rawEdges: Edge[];
  repairNodes: Node[];
  layoutDirection: string;
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  inputSignature: string;
  deferOuterObstacleRepair?: boolean;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}): Edge[] => {
  const projectionTimer = onPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'seed-interactive-finish-projection',
        candidateCount: finalQualityEdges.length,
        onTrace: onPhaseTrace,
      })
    : null;
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
  const readableEdges = deferOuterObstacleRepair
    ? displayEdges
    : restoreReadableRawLockedPaths(displayEdges, rawEdges, repairNodes);
  const terminalReadableEdges = repairTerminalBoundaryStairs(readableEdges, repairNodes);
  projectionTimer?.finish(
    terminalReadableEdges === finalQualityEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(finalQualityEdges, terminalReadableEdges),
  );
  const hardGateTimer = onPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'seed-interactive-finish-hard-gate',
        candidateCount: terminalReadableEdges.length,
        onTrace: onPhaseTrace,
      })
    : null;
  const hardClean = deferOuterObstacleRepair
    && displayHardSafetyIsClean(terminalReadableEdges, repairNodes);
  hardGateTimer?.finish(hardClean ? 'accepted' : 'fallback', 0, {
    evaluationCount: deferOuterObstacleRepair ? 1 : 0,
    scannedNodeCount: deferOuterObstacleRepair ? repairNodes.length : 0,
  });
  if (hardClean) {
    const commitTimer = onPhaseTrace
      ? startDisplayRoutingPhaseTrace({
          phase: 'seed-interactive-finish-commit',
          candidateCount: terminalReadableEdges.length,
          onTrace: onPhaseTrace,
        })
      : null;
    const committed = markBaseDisplayFinalized(
      compactDisplayEdgePaths(terminalReadableEdges),
      inputSignature,
    );
    commitTimer?.finish('accepted', countChangedRoutingItems(terminalReadableEdges, committed));
    return committed;
  }
  const microTimer = onPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'seed-interactive-finish-micro',
        candidateCount: terminalReadableEdges.length,
        onTrace: onPhaseTrace,
      })
    : null;
  const microCleaned = repairDisplayMicroArtifacts(terminalReadableEdges) as Edge[];
  microTimer?.finish(
    microCleaned === terminalReadableEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(terminalReadableEdges, microCleaned),
  );
  const localTimer = onPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'seed-interactive-finish-local',
        candidateCount: microCleaned.length,
        onTrace: onPhaseTrace,
      })
    : null;
  const localCleaned = repairLocalDoglegArtifacts(microCleaned, repairNodes);
  localTimer?.finish(
    localCleaned === microCleaned ? 'skip' : 'accepted',
    countChangedRoutingItems(microCleaned, localCleaned),
  );
  const obstacleTimer = onPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'seed-interactive-finish-obstacle',
        candidateCount: localCleaned.length,
        onTrace: onPhaseTrace,
      })
    : null;
  const obstacleCleaned = repairDisplayObstacleHits(
    localCleaned,
    repairNodes,
    layoutDirection,
    deferOuterObstacleRepair
      ? { ...DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS, skipOuterFallback: true }
      : DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS,
  );
  obstacleTimer?.finish(
    obstacleCleaned === localCleaned ? 'skip' : 'accepted',
    countChangedRoutingItems(localCleaned, obstacleCleaned),
  );
  if (deferOuterObstacleRepair) {
    const commitTimer = onPhaseTrace
      ? startDisplayRoutingPhaseTrace({
          phase: 'seed-interactive-finish-commit',
          candidateCount: obstacleCleaned.length,
          onTrace: onPhaseTrace,
        })
      : null;
    const committed = markBaseDisplayFinalized(
      compactDisplayEdgePaths(obstacleCleaned),
      inputSignature,
    );
    commitTimer?.finish('accepted', countChangedRoutingItems(obstacleCleaned, committed));
    return committed;
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
  const clearanceSafe = repairBusinessNodeClearanceRisks(
    postSelected,
    repairNodes,
    // The interactive frame only needs a safe visual corridor. The final
    // worker transaction applies the full 48px commercial clearance; using a
    // 16px preview corridor here avoids adding wide temporary doglegs while a
    // node is still moving.
    { minimumClearance: 16, allowTransientStrictCrossing: true },
  );
  const clearanceCompacted = repairLocalDoglegArtifacts(
    clearanceSafe,
    repairNodes,
  );
  const branchClearanceSafe = repairBusinessNodeClearanceRisks(
    clearanceCompacted,
    repairNodes,
    { minimumClearance: 16, allowTransientStrictCrossing: true },
  );
  const clearanceStrictSafe = repairFinalResidualStrictCrossings(
    branchClearanceSafe,
    repairNodes,
  );
  return markBaseDisplayFinalized(
    compactDisplayEdgePaths(clearanceStrictSafe),
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
  if (isLargeGraph && qualityBudget.mode !== 'fast') {
    const qualityFinishedEdges = finalizeDisplayEdgesForRenderMode({
      finalQualityEdges,
      rawEdges,
      repairNodes,
      renderNodes,
      enableSmartEdges,
      smartEdgePadding,
      isLargeGraph: false,
      layoutDirection,
      inputSignature,
      qualityBudget,
    });
    return markBaseDisplayFinalized(
      qualityFinishedEdges.map(edge => toCanvasRefEdge(edge)),
      inputSignature,
    );
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
  if (enableSmartEdges) {
    if (typeof smartEdgePadding !== 'number' || !Number.isFinite(smartEdgePadding)) {
      const finished = finishDisplayQuality(polishRenderedDisplayEdges(finalQualityEdges, repairNodes), renderNodes);
      const softFinished = finishDisplaySoftQuality(finished, repairNodes, layoutDirection, qualityBudget.finalSoft);
      const strictFinished = repairFinalResidualStrictCrossings(softFinished, repairNodes);
      return markBaseDisplayFinalized(
        closeBusinessNodeClearanceTransaction(
          repairDisplayContainerBoundaryClearanceRisks(strictFinished, repairNodes),
          repairNodes,
        ),
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
      closeBusinessNodeClearanceTransaction(
        repairDisplayContainerBoundaryClearanceRisks(strictSmartDisplayEdges, repairNodes),
        repairNodes,
      ),
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
    closeBusinessNodeClearanceTransaction(
      repairDisplayContainerBoundaryClearanceRisks(strictBasicDisplayEdges, repairNodes),
      repairNodes,
    ),
    inputSignature,
  );
};
