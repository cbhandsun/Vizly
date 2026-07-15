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
  DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
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
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { markBaseDisplayFinalized } from './baseReactFlowDisplayEdgeCore';
import type { BaseReactFlowFullRouteContext } from './baseReactFlowDisplayFullRouteTypes';

export type BaseReactFlowFullRouteStrictResult =
  | { kind: 'finalized'; edges: Edge[] }
  | { kind: 'continue'; edges: Edge[] };

export const runBaseReactFlowFullRouteStrictPhase = (
  context: BaseReactFlowFullRouteContext,
  postSoftEdges: Edge[],
  postSoftQuality: EdgePathQualityScore,
): BaseReactFlowFullRouteStrictResult => {
  const {
    repairNodes,
    layoutDirection,
    inputSignature,
    useBoundedLargeRepair,
  } = context;
  const finalDetachedObstacleCandidate = hasHardDisplayOverlapRisk(postSoftQuality)
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
        useBoundedLargeRepair
          ? DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS
          : DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
        useBoundedLargeRepair
          ? DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS
          : DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
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
  const finalEndpointStubCandidate = repairFinalShortEndpointStubs(
    finalDetachedObstacleCandidate,
    repairNodes,
  );
  const finalTargetHemisphereCandidate = synthesizeSharedTargetTrunks(
    finalEndpointStubCandidate,
    { nodes: repairNodes },
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
  const finalDirectionalStrictCandidate = chooseFinalObstacleAwarePolishCandidate(
    repairNodes,
    finalPostTargetObstacleCandidate,
    repairEndpointOrthogonalPaths(
      repairStrictCrossingsWithDirectionalOuterLanes(finalPostTargetObstacleCandidate, repairNodes),
      repairNodes,
    ),
  );
  const finalExactResidualCandidate = repairExactThresholdResidualOverlaps(
    finalDirectionalStrictCandidate,
    repairNodes,
    useBoundedLargeRepair ? 16 : 64,
  );
  const finalExactStrictSweepCandidate = finalStrictDisplaySweep(
    finalExactResidualCandidate,
    repairNodes,
  );
  const finalPostResidualStrictCandidate = chooseDisplayStrictPolishCandidate(
    repairNodes,
    finalExactResidualCandidate,
    finalExactStrictSweepCandidate,
    repairEndpointOrthogonalPaths(
      repairStrictBypassesIfNeeded(finalExactResidualCandidate, repairNodes),
      repairNodes,
    ),
  );
  const finalDirectionalAfterResidualCandidate = chooseDirectionalOuterLaneCandidate(
    repairNodes,
    finalPostResidualStrictCandidate,
    repairEndpointOrthogonalPaths(
      repairStrictCrossingsWithDirectionalOuterLanes(finalPostResidualStrictCandidate, repairNodes),
      repairNodes,
    ),
  );
  const finalMicroCleanupCandidate = repairDisplayMicroArtifacts(finalDirectionalAfterResidualCandidate);
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
  const finalTerminalStrictCandidate = repairTerminalEndpointStrictCrossingStubs(
    finalBaseReturnCandidate,
    repairNodes,
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
  const finalReturnQualityBeforeInternalStrict = calculateEdgePathQualityScore(finalReturnCandidate);
  const finalBoundedInternalStrictCandidate = finalReturnQualityBeforeInternalStrict.strictCrossings > 0
    ? repairBoundedPortAndInternalStrictCrossings(finalReturnCandidate, repairNodes, 8)
    : finalReturnCandidate;
  const finalBoundedInternalReadableCandidate = repairTerminalBoundaryStairs(
    finalBoundedInternalStrictCandidate,
    repairNodes,
  );
  const finalBoundedInternalStrictReport = getDisplayHardQualityGateReport(
    finalBoundedInternalReadableCandidate,
    repairNodes,
    'polished',
  );
  if (finalBoundedInternalStrictReport.hardClean) {
    return {
      kind: 'finalized',
      edges: markBaseDisplayFinalized(finalBoundedInternalReadableCandidate, inputSignature),
    };
  }
  const finalInternalStrictCandidate = calculateEdgePathQualityScore(
    finalBoundedInternalStrictCandidate,
  ).strictCrossings > 0
    ? repairInternalStrictCrossingLanes(finalBoundedInternalStrictCandidate, repairNodes)
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
  const finalDoglegSweepCandidate = repairLocalDoglegArtifacts(finalStrictReturnCandidate, repairNodes);
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
  const finalResidualStrictCandidate = repairFinalResidualStrictCrossingsFromKnownAnalysis(
    finalDoglegSweepReturnCandidate,
    repairNodes,
    {
      rawStrictCrossings: finalDoglegSweepReturnQuality.strictCrossings,
      renderStrictCrossings: countDisplayStrictCrossings(finalDoglegSweepReturnCandidate),
    },
  );
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
    ? repairBoundedPortAndInternalStrictCrossings(boundedFinalReturnCandidate, repairNodes, 8)
    : boundedFinalReturnCandidate;
  return { kind: 'continue', edges: finalBoundedStrictCandidate };
};
