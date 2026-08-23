import type { Edge } from '@xyflow/react';

import {
  createDisplayMicroCleanupDiagnostics,
  repairDisplayMicroArtifacts,
} from '../../strategies/shared/edgeDisplayMicroCleanup';
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
  chooseFinalObstacleAwarePolishCandidate,
  chooseFinalVisualPolishCandidate,
  hasHardDisplayOverlapRisk,
  keepPerEdgeObstacleNonRegressingCandidates,
} from './baseReactFlowDisplayEvaluation';
import { finalSameSideTrueTrunksDoNotRegress } from './baseReactFlowDisplayFinalEndpointOrder';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import type { BaseReactFlowFullRouteContext } from './baseReactFlowDisplayFullRouteTypes';
import { createDisplayRoutingTopologyWaypointAxes } from './baseReactFlowDisplayRoutingTopologyPlan';
import { repairSharedTargetEntryStrictCrossingsIfNeeded } from './baseReactFlowDisplaySharedTargetEntry';
import {
  createDisplayTopologyFirstSeed,
  repairDisplayEndpointOrthogonalPathsTwice,
} from './baseReactFlowDisplayTopologyFirstSeed';
import {
  repairBoundedQualityPolishMicroArtifacts,
  separateLargeDetachedParallelOverlapsIfNeeded,
  shouldMaterializeDetachedMicroAlternative,
  shouldUseBoundedQualityResidualRepair,
} from './baseReactFlowDisplayQualityPolishSupport';

export {
  boundedQualityPolishNeedsMicroRepair,
  canSkipLargeDetachedOverlapRepair,
  separateLargeDetachedParallelOverlapsIfNeeded,
  shouldMaterializeDetachedMicroAlternative,
  shouldUseBoundedQualityResidualRepair,
} from './baseReactFlowDisplayQualityPolishSupport';

export {
  hasSharedTargetEntryStrictCrossing,
  repairSharedTargetEntryStrictCrossingsIfNeeded,
} from './baseReactFlowDisplaySharedTargetEntry';

export const createBaseReactFlowFullRouteQualityEdges = ({
  normalizedEdges,
  repairNodes,
  layoutDirection,
  useBoundedLargeRepair,
  canReusePreparedGlobalRouting,
  reusePreparedGlobalRouting,
  onPhaseTrace,
  topologyPlan,
}: BaseReactFlowFullRouteContext): Edge[] => {
  const topologySeedTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-topology-seed',
    candidateCount: normalizedEdges.length,
    onTrace: onPhaseTrace,
  });
  const topologySeed = createDisplayTopologyFirstSeed(
    normalizedEdges,
    repairNodes,
    topologyPlan,
  );
  topologySeedTimer.finish(
    topologySeed.applied ? 'accepted' : 'skip',
    topologySeed.applied ? topologySeed.edges.length : 0,
  );
  const globalRouteTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-global-route',
    candidateCount: normalizedEdges.length,
    onTrace: onPhaseTrace,
  });
  const globallyRoutedEdges = canReusePreparedGlobalRouting
    ? topologySeed.edges
    : reduceEdgeCrossingsWithWaypoints(
      topologySeed.edges,
      repairNodes,
      layoutDirection,
      {
        onlyNodeRiskEdges: true,
        preferredAxes: createDisplayRoutingTopologyWaypointAxes(
          topologyPlan,
          useBoundedLargeRepair,
        ),
      },
    );
  const detachedRoutedEdges = reusePreparedGlobalRouting
    ? globallyRoutedEdges
    : separateLargeDetachedParallelOverlapsIfNeeded(
      globallyRoutedEdges,
      repairNodes,
      96,
      DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
    );
  globalRouteTimer.finish(
    detachedRoutedEdges === normalizedEdges ? 'skip' : 'accepted',
    detachedRoutedEdges === normalizedEdges ? 0 : detachedRoutedEdges.length,
  );
  const topologyTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-topology',
    candidateCount: detachedRoutedEdges.length,
    onTrace: onPhaseTrace,
  });
  const topologySeedRemainsCurrent = topologySeed.applied
    && globallyRoutedEdges === topologySeed.edges
    && detachedRoutedEdges === globallyRoutedEdges;
  const topologySeedIsCleanFixedPoint = topologySeedRemainsCurrent
    && topologySeed.quality !== undefined
    && !hasHardDisplayOverlapRisk(topologySeed.quality);
  const sameNodeRoleRepairedEdges = topologySeedIsCleanFixedPoint
    ? detachedRoutedEdges
    : (() => {
      const routedEndpointEdges = topologySeedRemainsCurrent
        ? detachedRoutedEdges
        : repairDisplayEndpointOrthogonalPathsTwice(detachedRoutedEdges, repairNodes);
      const initialTrunkEdges = synthesizeSharedEndpointTrunks(routedEndpointEdges, { nodes: repairNodes });
      const localTrunkEdges = repairLocalDoglegArtifacts(initialTrunkEdges, repairNodes);
      const secondaryTrunkEdges = synthesizeSharedEndpointTrunks(localTrunkEdges, { nodes: repairNodes });
      const secondaryDetachedEdges = reusePreparedGlobalRouting
        ? secondaryTrunkEdges
        : separateLargeDetachedParallelOverlapsIfNeeded(
          secondaryTrunkEdges,
          repairNodes,
          24,
          DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
        );
      const trunkAwareEdges = synthesizeSharedEndpointTrunks(secondaryDetachedEdges, { nodes: repairNodes });
      const endpointRepairedEdges = repairDisplayEndpointOrthogonalPathsTwice(trunkAwareEdges, repairNodes);
      const targetTrunkEdges = synthesizeSharedTargetTrunks(endpointRepairedEdges, { nodes: repairNodes });
      const finalEndpointRepairedEdges = repairDisplayEndpointOrthogonalPathsTwice(targetTrunkEdges, repairNodes);
      return repairEndpointOrthogonalPaths(
        repairSameNodeInOutCrossings(finalEndpointRepairedEdges, repairNodes),
        repairNodes,
      );
    })();
  topologyTimer.finish(
    sameNodeRoleRepairedEdges === detachedRoutedEdges ? 'skip' : 'accepted',
    sameNodeRoleRepairedEdges === detachedRoutedEdges ? 0 : sameNodeRoleRepairedEdges.length,
  );
  const crossingSweepTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-sweeps',
    candidateCount: sameNodeRoleRepairedEdges.length,
    onTrace: onPhaseTrace,
  });
  const crossingPhaseTrace: DisplayRoutingPhaseTrace[] = [];
  const recordCrossingPhaseTrace = onPhaseTrace
    ? (trace: DisplayRoutingPhaseTrace) => crossingPhaseTrace.push(trace)
    : undefined;
  const structuralCrossingTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-structural',
    candidateCount: sameNodeRoleRepairedEdges.length,
    onTrace: recordCrossingPhaseTrace,
  });
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
  structuralCrossingTimer.finish(
    endpointLaneNudgedEdges === sameNodeRoleRepairedEdges ? 'skip' : 'accepted',
    endpointLaneNudgedEdges === sameNodeRoleRepairedEdges ? 0 : endpointLaneNudgedEdges.length,
  );
  const globalRefineTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-global-refine',
    candidateCount: endpointLaneNudgedEdges.length,
    onTrace: recordCrossingPhaseTrace,
  });
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
  globalRefineTimer.finish(
    finalTargetQualityEdges === endpointLaneNudgedEdges ? 'skip' : 'accepted',
    finalTargetQualityEdges === endpointLaneNudgedEdges ? 0 : finalTargetQualityEdges.length,
  );
  const finalCrossingCandidatesTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-candidates',
    candidateCount: finalTargetQualityEdges.length,
    onTrace: recordCrossingPhaseTrace,
  });
  const finalDetachedQualityEdges = repairEndpointOrthogonalPaths(
    separateLargeDetachedParallelOverlapsIfNeeded(
      repairSharedTargetEntryStrictCrossingsIfNeeded(finalTargetQualityEdges),
      repairNodes,
      16,
      DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
    ),
    repairNodes,
  );
  const finalEndpointQualityEdges = repairEndpointOrthogonalPaths(
    separateLargeDetachedParallelOverlapsIfNeeded(
      repairSharedTargetEntryStrictCrossingsIfNeeded(
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
  const finalTargetEntryQualityEdges = repairSharedTargetEntryStrictCrossingsIfNeeded(
    finalCrossingQualityEdges,
  );
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
  const finalDetachedOverlapCandidate = separateLargeDetachedParallelOverlapsIfNeeded(
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
  finalCrossingCandidatesTimer.finish(
    finalQualityCandidateEdges === finalTargetQualityEdges ? 'skip' : 'accepted',
    finalQualityCandidateEdges === finalTargetQualityEdges ? 0 : finalQualityCandidateEdges.length,
  );
  crossingSweepTimer.finish(
    finalQualityCandidateEdges === sameNodeRoleRepairedEdges ? 'skip' : 'accepted',
    finalQualityCandidateEdges === sameNodeRoleRepairedEdges
      ? 0
      : finalQualityCandidateEdges.length,
  );
  crossingPhaseTrace.forEach(trace => onPhaseTrace?.(trace));
  const strictClosureTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-strict-closure',
    candidateCount: finalQualityCandidateEdges.length,
    onTrace: onPhaseTrace,
  });
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
  strictClosureTimer.finish(
    finalQualityEdges === finalQualityCandidateEdges ? 'skip' : 'accepted',
    finalQualityEdges === finalQualityCandidateEdges ? 0 : finalQualityEdges.length,
  );
  const polishTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-polish',
    candidateCount: finalQualityEdges.length,
    onTrace: onPhaseTrace,
  });
  const polishPhaseTrace: DisplayRoutingPhaseTrace[] = [];
  const recordPolishPhaseTrace = onPhaseTrace
    ? (trace: DisplayRoutingPhaseTrace) => polishPhaseTrace.push(trace)
    : undefined;
  const polishCandidateTimer = recordPolishPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'quality-polish-candidates',
        candidateCount: finalQualityEdges.length,
        onTrace: recordPolishPhaseTrace,
      })
    : null;
  const localPolishTimer = recordPolishPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'quality-polish-local',
        candidateCount: finalQualityEdges.length,
        onTrace: recordPolishPhaseTrace,
      })
    : null;
  const finalLocalPolishCandidate = repairLocalDoglegArtifacts(finalQualityEdges, repairNodes);
  localPolishTimer?.finish(
    finalLocalPolishCandidate === finalQualityEdges ? 'skip' : 'accepted',
    finalLocalPolishCandidate === finalQualityEdges ? 0 : finalQualityEdges.length,
  );
  const detachedPolishTimer = recordPolishPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'quality-polish-detached',
        candidateCount: finalLocalPolishCandidate.length,
        onTrace: recordPolishPhaseTrace,
      })
    : null;
  const finalDetachedPolishCandidate = separateLargeDetachedParallelOverlapsIfNeeded(
    finalLocalPolishCandidate,
    repairNodes,
    16,
    useBoundedLargeRepair
      ? DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS
      : DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  );
  detachedPolishTimer?.finish(
    finalDetachedPolishCandidate === finalLocalPolishCandidate ? 'skip' : 'accepted',
    finalDetachedPolishCandidate === finalLocalPolishCandidate
      ? 0
      : finalDetachedPolishCandidate.length,
  );
  const detachedLocalPolishTimer = recordPolishPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'quality-polish-detached-local',
        candidateCount: finalDetachedPolishCandidate.length,
        onTrace: recordPolishPhaseTrace,
      })
    : null;
  const finalDetachedLocalPolishCandidate = useBoundedLargeRepair
    ? finalDetachedPolishCandidate
    : repairLocalDoglegArtifacts(finalDetachedPolishCandidate, repairNodes);
  detachedLocalPolishTimer?.finish(
    finalDetachedLocalPolishCandidate === finalDetachedPolishCandidate ? 'skip' : 'accepted',
    finalDetachedLocalPolishCandidate === finalDetachedPolishCandidate
      ? 0
      : finalDetachedLocalPolishCandidate.length,
  );
  const endpointPolishTimer = recordPolishPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'quality-polish-endpoint',
        candidateCount: finalDetachedPolishCandidate.length,
        onTrace: recordPolishPhaseTrace,
      })
    : null;
  const finalEndpointPolishCandidate = repairEndpointOrthogonalPaths(
    finalDetachedPolishCandidate,
    repairNodes,
    { detectExistingBridgeCrossings: !useBoundedLargeRepair },
  );
  endpointPolishTimer?.finish(
    finalEndpointPolishCandidate === finalDetachedPolishCandidate ? 'skip' : 'accepted',
    finalEndpointPolishCandidate === finalDetachedPolishCandidate
      ? 0
      : finalEndpointPolishCandidate.length,
  );
  const microPolishTimer = recordPolishPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'quality-polish-micro',
        candidateCount: finalEndpointPolishCandidate.length,
        onTrace: recordPolishPhaseTrace,
      })
    : null;
  // Bounded polish already retains the detached-micro candidate above. Keep
  // the endpoint candidate separately and avoid repeating the same global
  // micro search after endpoint normalization; candidate selection can still
  // choose either repair family independently.
  const microPolishDiagnostics = createDisplayMicroCleanupDiagnostics();
  const finalMicroPolishCandidate = useBoundedLargeRepair
    ? finalEndpointPolishCandidate
    : repairDisplayMicroArtifacts(
      finalEndpointPolishCandidate,
      undefined,
      microPolishDiagnostics,
    );
  const finalLocalAfterDetachedCandidate = useBoundedLargeRepair
    ? finalEndpointPolishCandidate
    : repairLocalDoglegArtifacts(finalEndpointPolishCandidate, repairNodes);
  const finalEndpointAfterLocalCandidate = useBoundedLargeRepair
    ? finalLocalAfterDetachedCandidate
    : repairEndpointOrthogonalPaths(finalLocalAfterDetachedCandidate, repairNodes);
  microPolishTimer?.finish(
    finalEndpointAfterLocalCandidate === finalEndpointPolishCandidate ? 'skip' : 'accepted',
    finalEndpointAfterLocalCandidate === finalEndpointPolishCandidate
      ? 0
      : finalEndpointAfterLocalCandidate.length,
    {
      candidateCount: microPolishDiagnostics.generatedCandidateCount,
      evaluationCount: microPolishDiagnostics.evaluatedCandidateCount,
      cacheHitCount: microPolishDiagnostics.cacheHitCount
        + microPolishDiagnostics.pairCacheHitCount,
      scannedEdgePairCount: microPolishDiagnostics.scannedEdgePairCount,
      scannedSegmentCount: microPolishDiagnostics.scannedSegmentCount,
    },
  );
  const detachedMicroDiagnostics = createDisplayMicroCleanupDiagnostics();
  const detachedMicroPolishTimer = recordPolishPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'quality-polish-detached-micro',
        candidateCount: finalDetachedPolishCandidate.length,
        onTrace: recordPolishPhaseTrace,
      })
    : null;
  // Endpoint normalization is the stronger non-bounded seed for this micro
  // defect family. Bounded routing keeps the detached branch because it is its
  // sole micro candidate; the non-bounded path avoids the redundant search.
  const needsDetachedMicroAlternative = shouldMaterializeDetachedMicroAlternative(
    useBoundedLargeRepair,
  );
  const finalDetachedMicroPolishCandidate = needsDetachedMicroAlternative
    ? repairBoundedQualityPolishMicroArtifacts(
      finalDetachedPolishCandidate,
      useBoundedLargeRepair,
      detachedMicroDiagnostics,
    )
    : finalDetachedPolishCandidate;
  detachedMicroPolishTimer?.finish(
    finalDetachedMicroPolishCandidate === finalDetachedPolishCandidate ? 'skip' : 'accepted',
    finalDetachedMicroPolishCandidate === finalDetachedPolishCandidate
      ? 0
      : finalDetachedMicroPolishCandidate.length,
    {
      candidateCount: detachedMicroDiagnostics.generatedCandidateCount,
      evaluationCount: detachedMicroDiagnostics.evaluatedCandidateCount,
      cacheHitCount: detachedMicroDiagnostics.cacheHitCount
        + detachedMicroDiagnostics.pairCacheHitCount,
      scannedEdgePairCount: detachedMicroDiagnostics.scannedEdgePairCount,
      scannedSegmentCount: detachedMicroDiagnostics.scannedSegmentCount,
    },
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
  polishCandidateTimer?.finish(
    finalPolishCandidates.every(candidate => candidate === finalQualityEdges)
      ? 'skip'
      : 'accepted',
  );
  const polishSelectionTimer = recordPolishPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'quality-polish-selection',
        candidateCount: finalPolishCandidates.length,
        onTrace: recordPolishPhaseTrace,
      })
    : null;
  const prePolishSelectionEdges = finalQualityEdges;
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
  polishSelectionTimer?.finish(
    finalQualityEdges === prePolishSelectionEdges ? 'skip' : 'accepted',
    finalQualityEdges === prePolishSelectionEdges ? 0 : finalQualityEdges.length,
  );
  const residualPolishTimer = recordPolishPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'quality-polish-residual',
        candidateCount: finalQualityEdges.length,
        onTrace: recordPolishPhaseTrace,
      })
    : null;
  const preFinalizeResidualQuality = calculateEdgePathQualityScore(finalQualityEdges);
  const useBoundedQualityResidualRepair = shouldUseBoundedQualityResidualRepair(
    useBoundedLargeRepair,
    finalQualityEdges.length,
  );
  const residualQualityEdges = hasHardDisplayOverlapRisk(preFinalizeResidualQuality)
    ? repairResidualDisplayOverlaps(
      finalQualityEdges,
      repairNodes,
      useBoundedQualityResidualRepair
        ? DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS
        : DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
      useBoundedQualityResidualRepair
        ? DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS
        : DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
      {
        parentPhase: 'quality-polish-residual',
        onPhaseTrace: recordPolishPhaseTrace,
      },
    )
    : finalQualityEdges;
  residualPolishTimer?.finish(
    residualQualityEdges === finalQualityEdges ? 'skip' : 'accepted',
    residualQualityEdges === finalQualityEdges ? 0 : residualQualityEdges.length,
  );
  const obstacleSelectionTimer = recordPolishPhaseTrace
    ? startDisplayRoutingPhaseTrace({
        phase: 'quality-polish-obstacle-selection',
        candidateCount: residualQualityEdges.length,
        onTrace: recordPolishPhaseTrace,
      })
    : null;
  const obstacleSafeQualityEdges = keepPerEdgeObstacleNonRegressingCandidates(
    normalizedEdges,
    residualQualityEdges,
    repairNodes,
  );
  const selectedQualityEdges = chooseFinalObstacleAwarePolishCandidate(
    repairNodes,
    normalizedEdges,
    obstacleSafeQualityEdges,
    residualQualityEdges,
  );
  const result = finalSameSideTrueTrunksDoNotRegress(
    normalizedEdges,
    selectedQualityEdges,
    repairNodes,
  )
    ? selectedQualityEdges
    : normalizedEdges;
  obstacleSelectionTimer?.finish(
    result === residualQualityEdges ? 'skip' : 'accepted',
    result === residualQualityEdges ? 0 : result.length,
  );
  polishTimer.finish(
    result === finalQualityEdges ? 'skip' : 'accepted',
    result === finalQualityEdges ? 0 : result.length,
  );
  polishPhaseTrace.forEach(trace => onPhaseTrace?.(trace));
  return result;
};
