import type { Edge, Node } from '@xyflow/react';

import { repairEndpointLaneCrossings } from '../../strategies/shared/edgeEndpointLaneNudgeRepair';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import {
  chooseFewestStrictCrossings,
  keepIfNoNewStrictCrossings,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { repairSharedTrunkAwareCrossings } from '../../strategies/shared/edgeRoutingPipeline';
import {
  DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS,
  DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
} from './baseReactFlowDisplayOverlapRepair';
import {
  createDetachedRepairDiagnostics,
  separateLargeDetachedParallelOverlapsIfNeeded,
} from './baseReactFlowDisplayQualityPolishSupport';
import type { DisplayQualityGlobalRefineSession } from './baseReactFlowDisplayQualityGlobalRefine';
import { repairSharedTargetEntryStrictCrossingsIfNeeded } from './baseReactFlowDisplaySharedTargetEntry';
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

export const selectDisplayQualityInitialDetachedOverlapOptions = (
  useBoundedLargeRepair: boolean,
): typeof DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS => (
  useBoundedLargeRepair
    ? DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS
    : DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS
);

export const createDisplayQualityCrossingCandidates = ({
  edges,
  nodes,
  repairDoglegs,
  globalRefineSession,
  useBoundedLargeRepair,
  onPhaseTrace,
}: Readonly<{
  edges: Edge[];
  nodes: Node[];
  repairDoglegs: (edges: Edge[]) => Edge[];
  globalRefineSession: DisplayQualityGlobalRefineSession;
  useBoundedLargeRepair: boolean;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}>): Edge[] => {
  const finalCandidatesTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-candidates',
    candidateCount: edges.length,
    onTrace: onPhaseTrace,
  });
  const prepareTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-prepare',
    candidateCount: edges.length,
    onTrace: onPhaseTrace,
  });
  const detachedTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-prepare-detached',
    candidateCount: edges.length,
    onTrace: onPhaseTrace,
  });
  const detachedTargetTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-prepare-detached-target',
    candidateCount: edges.length,
    onTrace: onPhaseTrace,
  });
  const detachedTargetEdges = repairSharedTargetEntryStrictCrossingsIfNeeded(edges);
  detachedTargetTimer.finish(
    detachedTargetEdges === edges ? 'skip' : 'accepted',
    countChangedRoutingItems(edges, detachedTargetEdges),
  );
  const detachedOverlapTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-prepare-detached-overlap',
    candidateCount: detachedTargetEdges.length,
    onTrace: onPhaseTrace,
  });
  const detachedOverlapDiagnostics = createDetachedRepairDiagnostics();
  const detachedPreparedOverlapEdges = separateLargeDetachedParallelOverlapsIfNeeded(
    detachedTargetEdges,
    nodes,
    16,
    {
      ...selectDisplayQualityInitialDetachedOverlapOptions(useBoundedLargeRepair),
      diagnostics: detachedOverlapDiagnostics,
    },
  );
  detachedOverlapTimer.finish(
    detachedPreparedOverlapEdges === detachedTargetEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(detachedTargetEdges, detachedPreparedOverlapEdges),
    detachedOverlapDiagnostics,
  );
  const detachedEndpointTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-prepare-detached-endpoint',
    candidateCount: detachedPreparedOverlapEdges.length,
    onTrace: onPhaseTrace,
  });
  const detachedEdges = repairEndpointOrthogonalPaths(detachedPreparedOverlapEdges, nodes);
  detachedEndpointTimer.finish(
    detachedEdges === detachedPreparedOverlapEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(detachedPreparedOverlapEdges, detachedEdges),
  );
  detachedTimer.finish(
    detachedEdges === edges ? 'skip' : 'accepted',
    countChangedRoutingItems(edges, detachedEdges),
  );
  const doglegTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-prepare-dogleg',
    candidateCount: detachedEdges.length,
    onTrace: onPhaseTrace,
  });
  const localDoglegTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-prepare-dogleg-local',
    candidateCount: detachedEdges.length,
    onTrace: onPhaseTrace,
  });
  const doglegEdges = repairDoglegs(detachedEdges);
  localDoglegTimer.finish(
    doglegEdges === detachedEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(detachedEdges, doglegEdges),
  );
  const doglegTargetTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-prepare-dogleg-target',
    candidateCount: doglegEdges.length,
    onTrace: onPhaseTrace,
  });
  const doglegTargetEdges = repairSharedTargetEntryStrictCrossingsIfNeeded(doglegEdges);
  doglegTargetTimer.finish(
    doglegTargetEdges === doglegEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(doglegEdges, doglegTargetEdges),
  );
  const doglegOverlapTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-prepare-dogleg-overlap',
    candidateCount: doglegTargetEdges.length,
    onTrace: onPhaseTrace,
  });
  const doglegOverlapDiagnostics = createDetachedRepairDiagnostics();
  const doglegOverlapEdges = separateLargeDetachedParallelOverlapsIfNeeded(
    doglegTargetEdges,
    nodes,
    16,
    {
      ...DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
      diagnostics: doglegOverlapDiagnostics,
    },
  );
  doglegOverlapTimer.finish(
    doglegOverlapEdges === doglegTargetEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(doglegTargetEdges, doglegOverlapEdges),
    doglegOverlapDiagnostics,
  );
  const doglegEndpointTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-prepare-dogleg-endpoint',
    candidateCount: doglegOverlapEdges.length,
    onTrace: onPhaseTrace,
  });
  const endpointEdges = repairEndpointOrthogonalPaths(doglegOverlapEdges, nodes);
  doglegEndpointTimer.finish(
    endpointEdges === doglegOverlapEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(doglegOverlapEdges, endpointEdges),
  );
  doglegTimer.finish(
    endpointEdges === detachedEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(detachedEdges, endpointEdges),
  );
  prepareTimer.finish(
    endpointEdges === edges ? 'skip' : 'accepted',
    countChangedRoutingItems(edges, endpointEdges),
  );

  const globalEdges = globalRefineSession.run({
    edges: endpointEdges,
    phase: 'quality-crossing-final-candidates-global',
  });
  const sharedLaneTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-shared-lane',
    candidateCount: globalEdges.length,
    onTrace: onPhaseTrace,
  });
  const targetEntryTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-shared-target',
    candidateCount: globalEdges.length,
    onTrace: onPhaseTrace,
  });
  const targetEntryEdges = repairSharedTargetEntryStrictCrossingsIfNeeded(globalEdges);
  targetEntryTimer.finish(
    targetEntryEdges === globalEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(globalEdges, targetEntryEdges),
  );
  const postSharedGlobalEdges = globalRefineSession.run({
    edges: targetEntryEdges,
    phase: 'quality-crossing-final-candidates-post-shared',
  });
  const sharedTrunkTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-shared-trunk',
    candidateCount: postSharedGlobalEdges.length,
    onTrace: onPhaseTrace,
  });
  const sharedEdges = repairEndpointOrthogonalPaths(
    repairSharedTrunkAwareCrossings(postSharedGlobalEdges, nodes),
    nodes,
  );
  sharedTrunkTimer.finish(
    sharedEdges === postSharedGlobalEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(postSharedGlobalEdges, sharedEdges),
  );
  const initialLaneTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-lane-initial',
    candidateCount: sharedEdges.length,
    onTrace: onPhaseTrace,
  });
  const endpointLaneEdges = keepIfNoNewStrictCrossings(
    sharedEdges,
    repairEndpointOrthogonalPaths(repairEndpointLaneCrossings(sharedEdges, nodes), nodes),
  );
  initialLaneTimer.finish(
    endpointLaneEdges === sharedEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(sharedEdges, endpointLaneEdges),
  );
  const postLaneGlobalEdges = keepIfNoNewStrictCrossings(
    endpointLaneEdges,
    globalRefineSession.run({
      edges: endpointLaneEdges,
      phase: 'quality-crossing-final-candidates-post-lane',
    }),
  );
  const finalLaneTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-lane-final',
    candidateCount: postLaneGlobalEdges.length,
    onTrace: onPhaseTrace,
  });
  const postGlobalEndpointLaneEdges = keepIfNoNewStrictCrossings(
    postLaneGlobalEdges,
    repairEndpointOrthogonalPaths(
      repairEndpointLaneCrossings(postLaneGlobalEdges, nodes),
      nodes,
    ),
  );
  const preOverlapEdges = keepIfNoNewStrictCrossings(
    postGlobalEndpointLaneEdges,
    repairEndpointOrthogonalPaths(postGlobalEndpointLaneEdges, nodes),
  );
  finalLaneTimer.finish(
    preOverlapEdges === postLaneGlobalEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(postLaneGlobalEdges, preOverlapEdges),
  );
  sharedLaneTimer.finish(
    preOverlapEdges === globalEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(globalEdges, preOverlapEdges),
  );

  const overlapTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-overlap',
    candidateCount: preOverlapEdges.length,
    onTrace: onPhaseTrace,
  });
  const finalOverlapDiagnostics = createDetachedRepairDiagnostics();
  const detachedOverlapEdges = separateLargeDetachedParallelOverlapsIfNeeded(
    preOverlapEdges,
    nodes,
    16,
    {
      ...DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
      diagnostics: finalOverlapDiagnostics,
    },
  );
  const crossingRepairEdges = keepIfNoNewStrictCrossings(
    preOverlapEdges,
    detachedOverlapEdges,
  );
  overlapTimer.finish(
    detachedOverlapEdges === preOverlapEdges
      ? 'skip'
      : (crossingRepairEdges === preOverlapEdges ? 'rejected' : 'accepted'),
    countChangedRoutingItems(preOverlapEdges, detachedOverlapEdges),
    finalOverlapDiagnostics,
  );

  const selectionTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-selection',
    candidateCount: 11,
    onTrace: onPhaseTrace,
  });
  const result = chooseFewestStrictCrossings(
    detachedEdges,
    endpointEdges,
    globalEdges,
    targetEntryEdges,
    postSharedGlobalEdges,
    sharedEdges,
    endpointLaneEdges,
    postLaneGlobalEdges,
    postGlobalEndpointLaneEdges,
    preOverlapEdges,
    crossingRepairEdges,
  );
  selectionTimer.finish(
    result === edges ? 'skip' : 'accepted',
    countChangedRoutingItems(edges, result),
  );
  finalCandidatesTimer.finish(
    result === edges ? 'skip' : 'accepted',
    countChangedRoutingItems(edges, result),
  );
  return result;
};
