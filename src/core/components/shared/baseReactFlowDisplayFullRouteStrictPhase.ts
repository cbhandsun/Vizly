import type { Edge } from '@xyflow/react';

import { separateDetachedParallelOverlaps } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { repairDisplayMicroArtifacts } from '../../strategies/shared/edgeDisplayMicroCleanup';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import { repairLocalDoglegArtifacts } from '../../strategies/shared/edgeLocalDoglegRepair';
import { repairTerminalBoundaryStairs } from '../../strategies/shared/edgeTerminalBoundaryStairRepair';
import {
  calculateEdgePathQualityScore,
  countStrictEdgeCrossings,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { synthesizeSharedTargetTrunks } from '../../strategies/shared/edgeSharedTrunkSynthesis';
import {
  repairDisplayObstacleHits,
  repairStrictBypassesIfNeeded,
} from './baseReactFlowDisplayObstacleRepair';
import {
  DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
  repairExactThresholdResidualOverlaps,
  repairNearParallelResidualOverlaps,
  repairResidualDisplayOverlaps,
} from './baseReactFlowDisplayOverlapRepair';
import {
  chooseDisplayStrictPolishCandidate,
  chooseFinalObstacleAwarePolishCandidate,
  countDisplayObstacleHits,
  countDisplayStrictCrossings,
  hasHardDisplayOverlapRisk,
} from './baseReactFlowDisplayEvaluation';
import {
  finalStrictDisplaySweep,
  repairStrictCrossingsWithDirectionalOuterLanes,
  chooseDirectionalOuterLaneCandidate,
} from './baseReactFlowDisplayStrictSweepRepair';
import {
  DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS,
} from './baseReactFlowDisplayRenderPipeline';
import { repairFinalShortEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import { repairBoundedPortAndInternalStrictCrossings } from './baseReactFlowDisplayBoundedStrictRepair';
import { repairInternalStrictCrossingLanes } from './baseReactFlowDisplayStrictResidualRepair';
import { repairFinalResidualStrictCrossingsFromKnownAnalysis } from './baseReactFlowDisplayStrictRepairAnalysis';
import { repairTerminalEndpointStrictCrossingStubs } from './baseReactFlowDisplayStrictTerminalRepair';
import { markBaseDisplayFinalized } from './baseReactFlowDisplayEdgeCore';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import {
  createDisplayTerminalValidationSnapshot,
  displayTerminalValidationDoesNotRegress,
  keepDisplayTerminalValidationNonRegressing,
} from './baseReactFlowTerminalValidation';
import type { BaseReactFlowFullRouteContext } from './baseReactFlowDisplayFullRouteTypes';
import {
  createDisplayRoutingDefectPlan,
  displayRoutingDefectPlanNeedsStrictPrimaryCrossing,
  displayRoutingDefectStageIsScheduled,
  type RoutingDefectPlan,
} from './baseReactFlowDisplayRoutingDefectPlan';

export type BaseReactFlowFullRouteStrictResult =
  | { kind: 'finalized'; edges: Edge[] }
  | { kind: 'continue'; edges: Edge[] };

export const runBaseReactFlowFullRouteStrictPhase = (
  context: BaseReactFlowFullRouteContext,
  postSoftEdges: Edge[],
  postSoftQuality: EdgePathQualityScore,
  defectPlan: RoutingDefectPlan,
  skipInitialOverlapRepair = false,
): BaseReactFlowFullRouteStrictResult => {
  const {
    repairNodes,
    layoutDirection,
    inputSignature,
    useBoundedLargeRepair,
    onPhaseTrace,
  } = context;
  const primaryTimer = startDisplayRoutingPhaseTrace({
    phase: 'strict-primary',
    candidateCount: postSoftEdges.length,
    onTrace: onPhaseTrace,
  });
  const primaryPhaseTrace: DisplayRoutingPhaseTrace[] = [];
  const recordPrimaryPhaseTrace = onPhaseTrace
    ? (trace: DisplayRoutingPhaseTrace) => primaryPhaseTrace.push(trace)
    : undefined;
  const terminalSnapshot = createDisplayTerminalValidationSnapshot(repairNodes);
  const keepTerminalSafe = (baseline: Edge[], candidate: Edge[]): Edge[] => (
    displayTerminalValidationDoesNotRegress(baseline, candidate, terminalSnapshot)
      ? candidate
      : baseline
  );
  const overlapScheduled = displayRoutingDefectStageIsScheduled(
    defectPlan.orderedStages,
    'strict-primary-overlap',
  ) && !skipInitialOverlapRepair;
  const overlapTimer = startDisplayRoutingPhaseTrace({
    phase: 'strict-primary-overlap',
    candidateCount: overlapScheduled ? postSoftEdges.length : 0,
    onTrace: recordPrimaryPhaseTrace,
  });
  const finalDetachedObstacleCandidate = overlapScheduled
    ? (() => {
      const detachedCandidate = separateDetachedParallelOverlaps(
        postSoftEdges,
        repairNodes,
        16,
      );
      const obstacleCandidate = repairDisplayObstacleHits(
        detachedCandidate,
        repairNodes,
        layoutDirection,
        DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS,
      );
      const residualObstacleCandidate = repairResidualDisplayOverlaps(
        obstacleCandidate,
        repairNodes,
        // Quality already ran the exhaustive residual search, and post-render
        // ran a bounded retry after its micro/soft edits. Strict primary gets
        // one final independent attempt, but keeps it bounded before the exact
        // strict closure and terminal hard gates.
        DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
        DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
      );
      return chooseFinalObstacleAwarePolishCandidate(
        repairNodes,
        postSoftEdges,
        detachedCandidate,
        obstacleCandidate,
        residualObstacleCandidate,
      );
    })()
    : postSoftEdges;
  overlapTimer.finish(
    finalDetachedObstacleCandidate === postSoftEdges ? 'skip' : 'accepted',
    finalDetachedObstacleCandidate === postSoftEdges ? 0 : finalDetachedObstacleCandidate.length,
    overlapScheduled ? undefined : {
      evaluationCount: 0,
      cacheHitCount: 0,
      scannedNodeCount: 0,
      scannedSegmentCount: 0,
      scannedEdgePairCount: 0,
    },
  );
  const endpointTargetTimer = startDisplayRoutingPhaseTrace({
    phase: 'strict-primary-endpoint-target',
    candidateCount: finalDetachedObstacleCandidate.length,
    onTrace: recordPrimaryPhaseTrace,
  });
  const finalEndpointStubCandidate = keepTerminalSafe(
    finalDetachedObstacleCandidate,
    repairFinalShortEndpointStubs(finalDetachedObstacleCandidate, repairNodes),
  );
  const finalTargetHemisphereCandidate = keepTerminalSafe(
    finalEndpointStubCandidate,
    synthesizeSharedTargetTrunks(finalEndpointStubCandidate, { nodes: repairNodes }),
  );
  const finalPostTargetStrictCandidate = chooseFinalObstacleAwarePolishCandidate(
    repairNodes,
    finalTargetHemisphereCandidate,
    repairEndpointOrthogonalPaths(
      repairStrictBypassesIfNeeded(finalTargetHemisphereCandidate, repairNodes),
      repairNodes,
    ),
  );
  const finalPostTargetObstacleCandidate = countDisplayObstacleHits(
    finalPostTargetStrictCandidate,
    repairNodes,
  ) > 0
    ? chooseFinalObstacleAwarePolishCandidate(
      repairNodes,
      finalPostTargetStrictCandidate,
      repairDisplayObstacleHits(
        finalPostTargetStrictCandidate,
        repairNodes,
        layoutDirection,
        DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS,
      ),
    )
    : finalPostTargetStrictCandidate;
  endpointTargetTimer.finish(
    finalPostTargetObstacleCandidate === finalDetachedObstacleCandidate ? 'skip' : 'accepted',
    finalPostTargetObstacleCandidate === finalDetachedObstacleCandidate
      ? 0
      : finalPostTargetObstacleCandidate.length,
  );
  const crossingTimer = startDisplayRoutingPhaseTrace({
    phase: 'strict-primary-crossing',
    candidateCount: finalPostTargetObstacleCandidate.length,
    onTrace: recordPrimaryPhaseTrace,
  });
  const crossingScheduled = displayRoutingDefectPlanNeedsStrictPrimaryCrossing(defectPlan);
  const finalDirectionalStrictCandidate = crossingScheduled
    ? chooseFinalObstacleAwarePolishCandidate(
      repairNodes,
      finalPostTargetObstacleCandidate,
      repairEndpointOrthogonalPaths(
        repairStrictCrossingsWithDirectionalOuterLanes(finalPostTargetObstacleCandidate, repairNodes),
        repairNodes,
      ),
    )
    : finalPostTargetObstacleCandidate;
  const finalExactResidualRawCandidate = crossingScheduled
    ? repairExactThresholdResidualOverlaps(
      finalDirectionalStrictCandidate,
      repairNodes,
      useBoundedLargeRepair ? 16 : 64,
    )
    : finalDirectionalStrictCandidate;
  const finalExactResidualCandidate = crossingScheduled
    ? keepDisplayTerminalValidationNonRegressing(
      finalDirectionalStrictCandidate,
      finalExactResidualRawCandidate,
      terminalSnapshot,
    )
    : finalExactResidualRawCandidate;
  const finalExactStrictSweepCandidate = crossingScheduled
    ? finalStrictDisplaySweep(
      finalExactResidualCandidate,
      repairNodes,
    )
    : finalExactResidualCandidate;
  const finalPostResidualStrictCandidate = crossingScheduled
    ? chooseDisplayStrictPolishCandidate(
      repairNodes,
      finalExactResidualCandidate,
      finalExactStrictSweepCandidate,
      repairEndpointOrthogonalPaths(
        repairStrictBypassesIfNeeded(finalExactResidualCandidate, repairNodes),
        repairNodes,
      ),
    )
    : finalExactStrictSweepCandidate;
  const finalDirectionalAfterResidualCandidate = crossingScheduled
    ? keepTerminalSafe(
      finalPostResidualStrictCandidate,
      chooseDirectionalOuterLaneCandidate(
        repairNodes,
        finalPostResidualStrictCandidate,
        repairEndpointOrthogonalPaths(
          repairStrictCrossingsWithDirectionalOuterLanes(finalPostResidualStrictCandidate, repairNodes),
          repairNodes,
        ),
      ),
    )
    : finalPostResidualStrictCandidate;
  crossingTimer.finish(
    finalDirectionalAfterResidualCandidate === finalPostTargetObstacleCandidate ? 'skip' : 'accepted',
    finalDirectionalAfterResidualCandidate === finalPostTargetObstacleCandidate
      ? 0
      : finalDirectionalAfterResidualCandidate.length,
    crossingScheduled ? undefined : {
      evaluationCount: 0,
      cacheHitCount: 0,
      scannedNodeCount: 0,
      scannedSegmentCount: 0,
      scannedEdgePairCount: 0,
      workItemCount: 0,
    },
  );
  const cleanupSelectionTimer = startDisplayRoutingPhaseTrace({
    phase: 'strict-primary-cleanup-selection',
    candidateCount: finalDirectionalAfterResidualCandidate.length,
    onTrace: recordPrimaryPhaseTrace,
  });
  const finalMicroCleanupCandidate = repairDisplayMicroArtifacts(
    finalDirectionalAfterResidualCandidate,
    undefined,
    undefined,
    { allowCompoundRepairs: false },
  );
  const finalLocalCleanupCandidate = repairLocalDoglegArtifacts(
    finalMicroCleanupCandidate,
    repairNodes,
  );
  const finalEndpointCleanupCandidate = repairEndpointOrthogonalPaths(
    finalLocalCleanupCandidate,
    repairNodes,
  );
  const finalBaseReturnCandidate = chooseFinalObstacleAwarePolishCandidate(
    repairNodes,
    finalDirectionalAfterResidualCandidate,
    finalMicroCleanupCandidate,
    finalLocalCleanupCandidate,
    finalEndpointCleanupCandidate,
  );
  const finalTerminalStrictCandidate = keepTerminalSafe(
    finalBaseReturnCandidate,
    repairTerminalEndpointStrictCrossingStubs(finalBaseReturnCandidate, repairNodes),
  );
  const finalBaseReturnQuality = calculateEdgePathQualityScore(finalBaseReturnCandidate);
  const finalTerminalStrictQuality = calculateEdgePathQualityScore(finalTerminalStrictCandidate);
  const finalReturnCandidate = (
    countStrictEdgeCrossings(finalTerminalStrictCandidate)
      < countStrictEdgeCrossings(finalBaseReturnCandidate)
    && countDisplayObstacleHits(finalTerminalStrictCandidate, repairNodes)
      <= countDisplayObstacleHits(finalBaseReturnCandidate, repairNodes)
    && finalTerminalStrictQuality.nonOrthogonalSegments <= finalBaseReturnQuality.nonOrthogonalSegments
    && finalTerminalStrictQuality.reverseOverlap <= finalBaseReturnQuality.reverseOverlap
    && finalTerminalStrictQuality.unrelatedOverlap <= finalBaseReturnQuality.unrelatedOverlap
    && finalTerminalStrictQuality.unexplainedRelatedOverlap
      <= finalBaseReturnQuality.unexplainedRelatedOverlap
    && finalTerminalStrictQuality.shortEndpointStubs <= finalBaseReturnQuality.shortEndpointStubs
    && finalTerminalStrictQuality.tinyInteriorDoglegs <= finalBaseReturnQuality.tinyInteriorDoglegs
    && finalTerminalStrictQuality.hairpins <= finalBaseReturnQuality.hairpins + 1
  )
    ? finalTerminalStrictCandidate
    : finalBaseReturnCandidate;
  cleanupSelectionTimer.finish(
    finalReturnCandidate === finalDirectionalAfterResidualCandidate ? 'skip' : 'accepted',
    finalReturnCandidate === finalDirectionalAfterResidualCandidate ? 0 : finalReturnCandidate.length,
  );
  primaryTimer.finish(
    finalReturnCandidate === postSoftEdges ? 'skip' : 'accepted',
    finalReturnCandidate === postSoftEdges ? 0 : finalReturnCandidate.length,
  );
  primaryPhaseTrace.forEach(trace => onPhaseTrace?.(trace));
  const closureTimer = startDisplayRoutingPhaseTrace({
    phase: 'strict-closure',
    candidateCount: finalReturnCandidate.length,
    onTrace: onPhaseTrace,
  });
  const finalReturnQualityBeforeInternalStrict = calculateEdgePathQualityScore(finalReturnCandidate);
  const finalBoundedInternalStrictCandidate = finalReturnQualityBeforeInternalStrict.strictCrossings > 0
    ? keepTerminalSafe(
      finalReturnCandidate,
      repairBoundedPortAndInternalStrictCrossings(finalReturnCandidate, repairNodes, 8),
    )
    : finalReturnCandidate;
  const boundedInternalDefectPlan = createDisplayRoutingDefectPlan(
    context.evaluationSession.hardReport(finalBoundedInternalStrictCandidate),
  );
  const finalBoundedInternalReadableCandidate = boundedInternalDefectPlan.needsTerminalRepair
    ? keepTerminalSafe(
      finalBoundedInternalStrictCandidate,
      repairTerminalBoundaryStairs(finalBoundedInternalStrictCandidate, repairNodes),
    )
    : finalBoundedInternalStrictCandidate;
  const finalBoundedInternalStrictReport = context.evaluationSession.hardReport(
    finalBoundedInternalReadableCandidate,
  );
  if (finalBoundedInternalStrictReport.hardClean) {
    closureTimer.finish('accepted', finalBoundedInternalReadableCandidate.length);
    return {
      kind: 'finalized',
      edges: markBaseDisplayFinalized(finalBoundedInternalReadableCandidate, inputSignature),
    };
  }
  const finalInternalStrictCandidate = calculateEdgePathQualityScore(
    finalBoundedInternalStrictCandidate,
  ).strictCrossings > 0
    ? keepTerminalSafe(
      finalBoundedInternalStrictCandidate,
      repairInternalStrictCrossingLanes(finalBoundedInternalStrictCandidate, repairNodes),
    )
    : finalBoundedInternalStrictCandidate;
  const finalInternalStrictQuality = calculateEdgePathQualityScore(finalInternalStrictCandidate);
  const finalStrictReturnCandidate = (
    countStrictEdgeCrossings(finalInternalStrictCandidate) < countStrictEdgeCrossings(finalReturnCandidate)
    && countDisplayObstacleHits(finalInternalStrictCandidate, repairNodes)
      <= countDisplayObstacleHits(finalReturnCandidate, repairNodes)
    && finalInternalStrictQuality.nonOrthogonalSegments
      <= finalReturnQualityBeforeInternalStrict.nonOrthogonalSegments
    && finalInternalStrictQuality.reverseOverlap <= finalReturnQualityBeforeInternalStrict.reverseOverlap
    && finalInternalStrictQuality.unrelatedOverlap
      <= finalReturnQualityBeforeInternalStrict.unrelatedOverlap
    && finalInternalStrictQuality.unexplainedRelatedOverlap
      <= finalReturnQualityBeforeInternalStrict.unexplainedRelatedOverlap
    && finalInternalStrictQuality.shortEndpointStubs
      <= finalReturnQualityBeforeInternalStrict.shortEndpointStubs
    && finalInternalStrictQuality.tinyInteriorDoglegs
      <= finalReturnQualityBeforeInternalStrict.tinyInteriorDoglegs
    && finalInternalStrictQuality.hairpins <= finalReturnQualityBeforeInternalStrict.hairpins + 1
  )
    ? finalInternalStrictCandidate
    : finalReturnCandidate;
  const finalReturnQuality = calculateEdgePathQualityScore(finalStrictReturnCandidate);
  const finalReturnObstacleHits = countDisplayObstacleHits(finalStrictReturnCandidate, repairNodes);
  const finalDoglegSweepCandidate = finalReturnQuality.tinyInteriorDoglegs > 0
    ? keepTerminalSafe(
      finalStrictReturnCandidate,
      repairLocalDoglegArtifacts(finalStrictReturnCandidate, repairNodes),
    )
    : finalStrictReturnCandidate;
  const finalDoglegSweepQuality = calculateEdgePathQualityScore(finalDoglegSweepCandidate);
  const finalDoglegSweepReturnCandidate = (
    finalDoglegSweepQuality.tinyInteriorDoglegs < finalReturnQuality.tinyInteriorDoglegs
    && finalDoglegSweepQuality.nonOrthogonalSegments <= finalReturnQuality.nonOrthogonalSegments
    && finalDoglegSweepQuality.strictCrossings <= finalReturnQuality.strictCrossings
    && finalDoglegSweepQuality.reverseOverlap <= finalReturnQuality.reverseOverlap
    && finalDoglegSweepQuality.unrelatedOverlap <= finalReturnQuality.unrelatedOverlap
    && finalDoglegSweepQuality.unexplainedRelatedOverlap
      <= finalReturnQuality.unexplainedRelatedOverlap
    && finalDoglegSweepQuality.shortEndpointStubs <= finalReturnQuality.shortEndpointStubs
    && finalDoglegSweepQuality.hairpins <= finalReturnQuality.hairpins
    && countDisplayObstacleHits(finalDoglegSweepCandidate, repairNodes) <= finalReturnObstacleHits
  )
    ? finalDoglegSweepCandidate
    : finalStrictReturnCandidate;
  const finalDoglegSweepReturnQuality = finalDoglegSweepReturnCandidate === finalDoglegSweepCandidate
    ? finalDoglegSweepQuality
    : finalReturnQuality;
  const finalResidualStrictCandidate = finalDoglegSweepReturnQuality.strictCrossings > 0
    ? keepTerminalSafe(
      finalDoglegSweepReturnCandidate,
      repairFinalResidualStrictCrossingsFromKnownAnalysis(
        finalDoglegSweepReturnCandidate,
        repairNodes,
        {
          rawStrictCrossings: finalDoglegSweepReturnQuality.strictCrossings,
          renderStrictCrossings: countDisplayStrictCrossings(finalDoglegSweepReturnCandidate),
        },
      ),
    )
    : finalDoglegSweepReturnCandidate;
  const boundedFinalNearParallelCandidate = (
    useBoundedLargeRepair
    && hasHardDisplayOverlapRisk(calculateEdgePathQualityScore(finalResidualStrictCandidate))
  )
    ? repairDisplayMicroArtifacts(repairNearParallelResidualOverlaps(
      finalResidualStrictCandidate,
      repairNodes,
      16,
    ))
    : finalResidualStrictCandidate;
  const boundedFinalReturnCandidate = chooseFinalObstacleAwarePolishCandidate(
    repairNodes,
    finalResidualStrictCandidate,
    boundedFinalNearParallelCandidate,
  );
  const boundedFinalReturnQuality = calculateEdgePathQualityScore(boundedFinalReturnCandidate);
  const finalBoundedStrictCandidate = boundedFinalReturnQuality.strictCrossings > 0
    ? keepTerminalSafe(
      boundedFinalReturnCandidate,
      repairBoundedPortAndInternalStrictCrossings(boundedFinalReturnCandidate, repairNodes, 8),
    )
    : boundedFinalReturnCandidate;
  closureTimer.finish(
    finalBoundedStrictCandidate === finalReturnCandidate ? 'skip' : 'fallback',
    finalBoundedStrictCandidate === finalReturnCandidate
      ? 0
      : finalBoundedStrictCandidate.length,
  );
  return { kind: 'continue', edges: finalBoundedStrictCandidate };
};
