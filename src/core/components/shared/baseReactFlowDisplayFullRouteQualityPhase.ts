import type { Edge, Node } from '@xyflow/react';

import {
  separateDetachedParallelOverlaps,
} from '../../strategies/shared/edgeDetachedOverlapRepair';
import { repairDisplayMicroArtifacts } from '../../strategies/shared/edgeDisplayMicroCleanup';
import { repairEndpointLaneCrossings } from '../../strategies/shared/edgeEndpointLaneNudgeRepair';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import { refineGlobalEdgeWaypoints } from '../../strategies/shared/edgeGlobalWaypointRefinement';
import { repairLocalDoglegArtifacts } from '../../strategies/shared/edgeLocalDoglegRepair';
import { repairReverseFlowBypassCrossings } from '../../strategies/shared/edgeReverseFlowBypassRepair';
import { repairSameNodeInOutCrossings } from '../../strategies/shared/edgeSameNodeRoleRepair';
import {
  calculateEdgePathQualityScore,
  chooseFewestStrictCrossings,
  countStrictEdgeCrossings,
  keepIfNoNewStrictCrossings,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  repairSharedTargetEntryCrossings,
  synthesizeSharedEndpointTrunks,
  synthesizeSharedTargetTrunks,
} from '../../strategies/shared/edgeSharedTrunkSynthesis';
import {
  reduceEdgeCrossingsWithWaypoints,
  repairSharedTrunkAwareCrossings,
} from '../../strategies/shared/edgeRoutingPipeline';
import { repairStrictBypassesIfNeeded } from './baseReactFlowDisplayObstacleRepair';
import {
  DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
  repairResidualDisplayOverlaps,
} from './baseReactFlowDisplayOverlapRepair';
import {
  chooseFinalVisualPolishCandidate,
  hasHardDisplayOverlapRisk,
} from './baseReactFlowDisplayEvaluation';
import type { BaseReactFlowFullRouteContext } from './baseReactFlowDisplayFullRouteTypes';

const repairEndpointOrthogonalPathsTwice = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
): T => {
  const first = repairEndpointOrthogonalPaths(edges, nodes) as T;
  return first === edges ? first : repairEndpointOrthogonalPaths(first, nodes) as T;
};

export const createBaseReactFlowFullRouteQualityEdges = ({
  normalizedEdges,
  repairNodes,
  layoutDirection,
  useBoundedLargeRepair,
  canReusePreparedGlobalRouting,
  reusePreparedGlobalRouting,
}: BaseReactFlowFullRouteContext): Edge[] => {
  const globallyRoutedEdges = canReusePreparedGlobalRouting
    ? normalizedEdges
    : reduceEdgeCrossingsWithWaypoints(
      normalizedEdges,
      repairNodes,
      layoutDirection,
      { onlyNodeRiskEdges: true },
    );
  const detachedRoutedEdges = reusePreparedGlobalRouting
    ? globallyRoutedEdges
    : separateDetachedParallelOverlaps(
      globallyRoutedEdges,
      repairNodes,
      96,
      DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
    );
  const routedEndpointEdges = repairEndpointOrthogonalPathsTwice(detachedRoutedEdges, repairNodes);
  const initialTrunkEdges = synthesizeSharedEndpointTrunks(routedEndpointEdges, { nodes: repairNodes });
  const localTrunkEdges = repairLocalDoglegArtifacts(initialTrunkEdges, repairNodes);
  const secondaryTrunkEdges = synthesizeSharedEndpointTrunks(localTrunkEdges, { nodes: repairNodes });
  const secondaryDetachedEdges = reusePreparedGlobalRouting
    ? secondaryTrunkEdges
    : separateDetachedParallelOverlaps(
      secondaryTrunkEdges,
      repairNodes,
      24,
      DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
    );
  const trunkAwareEdges = synthesizeSharedEndpointTrunks(secondaryDetachedEdges, { nodes: repairNodes });
  const endpointRepairedEdges = repairEndpointOrthogonalPathsTwice(trunkAwareEdges, repairNodes);
  const targetTrunkEdges = synthesizeSharedTargetTrunks(endpointRepairedEdges, { nodes: repairNodes });
  const finalEndpointRepairedEdges = repairEndpointOrthogonalPathsTwice(targetTrunkEdges, repairNodes);
  const sameNodeRoleRepairedEdges = repairEndpointOrthogonalPaths(
    repairSameNodeInOutCrossings(finalEndpointRepairedEdges, repairNodes),
    repairNodes,
  );
  const reverseFlowBypassEdges = repairEndpointOrthogonalPaths(
    repairReverseFlowBypassCrossings(sameNodeRoleRepairedEdges, repairNodes),
    repairNodes,
  );
  const finalCrossingRepairedEdges = repairEndpointOrthogonalPaths(
    repairSharedTrunkAwareCrossings(reverseFlowBypassEdges, repairNodes),
    repairNodes,
  );
  const finalReverseFlowBypassEdges = repairEndpointOrthogonalPaths(
    repairReverseFlowBypassCrossings(finalCrossingRepairedEdges, repairNodes),
    repairNodes,
  );
  const finalDisplayCrossingRepairedEdges = repairEndpointOrthogonalPaths(
    repairSharedTrunkAwareCrossings(finalReverseFlowBypassEdges, repairNodes),
    repairNodes,
  );
  const endpointLaneNudgedEdges = repairEndpointLaneCrossings(
    finalDisplayCrossingRepairedEdges,
    repairNodes,
  );
  const globallyRefinedEdges = repairEndpointOrthogonalPaths(
    refineGlobalEdgeWaypoints(endpointLaneNudgedEdges, repairNodes),
    repairNodes,
  );
  const finalGloballyRefinedEdges = refineGlobalEdgeWaypoints(globallyRefinedEdges, repairNodes);
  const doglegRepairedEdges = repairLocalDoglegArtifacts(finalGloballyRefinedEdges, repairNodes);
  const finalCrossingSweepEdges = refineGlobalEdgeWaypoints(doglegRepairedEdges, repairNodes);
  const repairedEdges = repairLocalDoglegArtifacts(finalCrossingSweepEdges, repairNodes);
  const finalTargetQualityEdges = repairEndpointOrthogonalPaths(
    synthesizeSharedTargetTrunks(repairedEdges, { nodes: repairNodes }),
    repairNodes,
  );
  const finalDetachedQualityEdges = repairEndpointOrthogonalPaths(
    separateDetachedParallelOverlaps(
      repairSharedTargetEntryCrossings(finalTargetQualityEdges),
      repairNodes,
      16,
      DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
    ),
    repairNodes,
  );
  const finalEndpointQualityEdges = repairEndpointOrthogonalPaths(
    separateDetachedParallelOverlaps(
      repairSharedTargetEntryCrossings(
        repairLocalDoglegArtifacts(finalDetachedQualityEdges, repairNodes),
      ),
      repairNodes,
      16,
      DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
    ),
    repairNodes,
  );
  const finalCrossingQualityEdges = repairEndpointOrthogonalPaths(
    refineGlobalEdgeWaypoints(finalEndpointQualityEdges, repairNodes),
    repairNodes,
  );
  const finalTargetEntryQualityEdges = repairSharedTargetEntryCrossings(finalCrossingQualityEdges);
  const finalGlobalCrossingCandidate = repairEndpointOrthogonalPaths(
    refineGlobalEdgeWaypoints(finalTargetEntryQualityEdges, repairNodes),
    repairNodes,
  );
  const finalSharedCrossingCandidate = repairEndpointOrthogonalPaths(
    repairSharedTrunkAwareCrossings(finalGlobalCrossingCandidate, repairNodes),
    repairNodes,
  );
  const finalEndpointLaneCandidate = keepIfNoNewStrictCrossings(
    finalSharedCrossingCandidate,
    repairEndpointOrthogonalPaths(
      repairEndpointLaneCrossings(finalSharedCrossingCandidate, repairNodes),
      repairNodes,
    ),
  );
  const finalPostSharedGlobalCandidate = keepIfNoNewStrictCrossings(
    finalEndpointLaneCandidate,
    repairEndpointOrthogonalPaths(
      refineGlobalEdgeWaypoints(finalEndpointLaneCandidate, repairNodes),
      repairNodes,
    ),
  );
  const finalPostGlobalEndpointLaneCandidate = keepIfNoNewStrictCrossings(
    finalPostSharedGlobalCandidate,
    repairEndpointOrthogonalPaths(
      repairEndpointLaneCrossings(finalPostSharedGlobalCandidate, repairNodes),
      repairNodes,
    ),
  );
  const finalPreOverlapRepairCandidate = keepIfNoNewStrictCrossings(
    finalPostGlobalEndpointLaneCandidate,
    repairEndpointOrthogonalPaths(finalPostGlobalEndpointLaneCandidate, repairNodes),
  );
  const finalDetachedOverlapCandidate = separateDetachedParallelOverlaps(
    finalPreOverlapRepairCandidate,
    repairNodes,
    16,
    DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  );
  const finalCrossingRepairCandidate = keepIfNoNewStrictCrossings(
    finalPreOverlapRepairCandidate,
    finalDetachedOverlapCandidate,
  );
  const finalQualityCandidateEdges = chooseFewestStrictCrossings(
    finalDetachedQualityEdges,
    finalEndpointQualityEdges,
    finalCrossingQualityEdges,
    finalTargetEntryQualityEdges,
    finalGlobalCrossingCandidate,
    finalSharedCrossingCandidate,
    finalEndpointLaneCandidate,
    finalPostSharedGlobalCandidate,
    finalPostGlobalEndpointLaneCandidate,
    finalPreOverlapRepairCandidate,
    finalCrossingRepairCandidate,
  );
  const finalQualityBaseEdges = countStrictEdgeCrossings(finalQualityCandidateEdges) === 0
    ? finalQualityCandidateEdges
    : (() => {
      const finalStrictSweepCandidate = repairEndpointOrthogonalPaths(
        refineGlobalEdgeWaypoints(finalQualityCandidateEdges, repairNodes),
        repairNodes,
      );
      const finalStrictEndpointLaneCandidate = repairEndpointOrthogonalPaths(
        repairEndpointLaneCrossings(finalQualityCandidateEdges, repairNodes),
        repairNodes,
      );
      const finalStrictBypassRawCandidate = repairStrictBypassesIfNeeded(
        finalQualityCandidateEdges,
        repairNodes,
      );
      const finalStrictBypassCandidate = repairEndpointOrthogonalPaths(
        finalStrictBypassRawCandidate,
        repairNodes,
      );
      const strictBaseEdges = chooseFewestStrictCrossings(
        finalQualityCandidateEdges,
        finalStrictSweepCandidate,
        finalStrictEndpointLaneCandidate,
        finalStrictBypassRawCandidate,
        finalStrictBypassCandidate,
      );
      const finalPostQualityStrictBypassRawCandidate = repairStrictBypassesIfNeeded(
        strictBaseEdges,
        repairNodes,
      );
      const finalPostQualityStrictBypassCandidate = repairEndpointOrthogonalPaths(
        finalPostQualityStrictBypassRawCandidate,
        repairNodes,
      );
      return chooseFewestStrictCrossings(
        strictBaseEdges,
        finalPostQualityStrictBypassRawCandidate,
        finalPostQualityStrictBypassCandidate,
      );
    })();
  let finalQualityEdges = finalQualityBaseEdges;
  for (let pass = 0; pass < 3; pass += 1) {
    if (countStrictEdgeCrossings(finalQualityEdges) === 0) break;
    const strictBypassRawCandidate = repairStrictBypassesIfNeeded(finalQualityEdges, repairNodes);
    const strictBypassCandidate = repairEndpointOrthogonalPaths(
      strictBypassRawCandidate,
      repairNodes,
    );
    const nextFinalQualityEdges = chooseFewestStrictCrossings(
      finalQualityEdges,
      strictBypassRawCandidate,
      strictBypassCandidate,
    );
    if (nextFinalQualityEdges === finalQualityEdges) break;
    finalQualityEdges = nextFinalQualityEdges;
  }

  const finalLocalPolishCandidate = repairLocalDoglegArtifacts(finalQualityEdges, repairNodes);
  const finalDetachedPolishCandidate = separateDetachedParallelOverlaps(
    finalLocalPolishCandidate,
    repairNodes,
    16,
    useBoundedLargeRepair
      ? DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS
      : DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  );
  const finalDetachedMicroPolishCandidate = repairDisplayMicroArtifacts(finalDetachedPolishCandidate);
  const finalDetachedLocalPolishCandidate = repairLocalDoglegArtifacts(
    finalDetachedPolishCandidate,
    repairNodes,
  );
  const finalEndpointPolishCandidate = repairEndpointOrthogonalPaths(
    finalDetachedPolishCandidate,
    repairNodes,
  );
  const finalMicroPolishCandidate = repairDisplayMicroArtifacts(finalEndpointPolishCandidate);
  const finalLocalAfterDetachedCandidate = repairLocalDoglegArtifacts(
    finalEndpointPolishCandidate,
    repairNodes,
  );
  const finalEndpointAfterLocalCandidate = repairEndpointOrthogonalPaths(
    finalLocalAfterDetachedCandidate,
    repairNodes,
  );
  const finalPolishCandidates: [Edge[], ...Edge[][]] = [
    finalQualityEdges,
    finalLocalPolishCandidate,
    finalDetachedPolishCandidate,
    finalDetachedMicroPolishCandidate,
    finalDetachedLocalPolishCandidate,
    finalEndpointPolishCandidate,
    finalMicroPolishCandidate,
    finalLocalAfterDetachedCandidate,
    finalEndpointAfterLocalCandidate,
  ];
  if (finalPolishCandidates.some(
    candidate => calculateEdgePathQualityScore(candidate).strictCrossings === 0,
  )) {
    finalQualityEdges = chooseFinalVisualPolishCandidate(...finalPolishCandidates);
  } else {
    const finalStrictPolishRawCandidate = repairStrictBypassesIfNeeded(
      finalEndpointPolishCandidate,
      repairNodes,
    );
    const finalStrictPolishCandidate = repairEndpointOrthogonalPaths(
      finalStrictPolishRawCandidate,
      repairNodes,
    );
    finalQualityEdges = chooseFinalVisualPolishCandidate(
      finalQualityEdges,
      finalLocalPolishCandidate,
      finalDetachedPolishCandidate,
      finalDetachedMicroPolishCandidate,
      finalDetachedLocalPolishCandidate,
      finalEndpointPolishCandidate,
      finalMicroPolishCandidate,
      finalLocalAfterDetachedCandidate,
      finalEndpointAfterLocalCandidate,
      finalStrictPolishRawCandidate,
      finalStrictPolishCandidate,
    );
  }
  const preFinalizeResidualQuality = calculateEdgePathQualityScore(finalQualityEdges);
  return hasHardDisplayOverlapRisk(preFinalizeResidualQuality)
    ? repairResidualDisplayOverlaps(
      finalQualityEdges,
      repairNodes,
      useBoundedLargeRepair
        ? DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS
        : DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
      useBoundedLargeRepair
        ? DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS
        : DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
    )
    : finalQualityEdges;
};
