import type { Edge, Node } from '@xyflow/react';

import { repairEndpointLaneCrossings } from '../../strategies/shared/edgeEndpointLaneNudgeRepair';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import {
  chooseFewestStrictCrossings,
  keepIfNoNewStrictCrossings,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { repairSharedTrunkAwareCrossings } from '../../strategies/shared/edgeRoutingPipeline';
import {
  DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
} from './baseReactFlowDisplayOverlapRepair';
import { separateLargeDetachedParallelOverlapsIfNeeded } from './baseReactFlowDisplayQualityPolishSupport';
import type { DisplayQualityGlobalRefineSession } from './baseReactFlowDisplayQualityGlobalRefine';
import { repairSharedTargetEntryStrictCrossingsIfNeeded } from './baseReactFlowDisplaySharedTargetEntry';
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

export const createDisplayQualityCrossingCandidates = ({
  edges,
  nodes,
  repairDoglegs,
  globalRefineSession,
  onPhaseTrace,
}: Readonly<{
  edges: Edge[];
  nodes: Node[];
  repairDoglegs: (edges: Edge[]) => Edge[];
  globalRefineSession: DisplayQualityGlobalRefineSession;
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
  const detachedEdges = repairEndpointOrthogonalPaths(
    separateLargeDetachedParallelOverlapsIfNeeded(
      repairSharedTargetEntryStrictCrossingsIfNeeded(edges),
      nodes,
      16,
      DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
    ),
    nodes,
  );
  const endpointEdges = repairEndpointOrthogonalPaths(
    separateLargeDetachedParallelOverlapsIfNeeded(
      repairSharedTargetEntryStrictCrossingsIfNeeded(repairDoglegs(detachedEdges)),
      nodes,
      16,
      DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
    ),
    nodes,
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
  const targetEntryEdges = repairSharedTargetEntryStrictCrossingsIfNeeded(globalEdges);
  const postSharedGlobalEdges = globalRefineSession.run({
    edges: targetEntryEdges,
    phase: 'quality-crossing-final-candidates-post-shared',
  });
  const sharedEdges = repairEndpointOrthogonalPaths(
    repairSharedTrunkAwareCrossings(postSharedGlobalEdges, nodes),
    nodes,
  );
  const endpointLaneEdges = keepIfNoNewStrictCrossings(
    sharedEdges,
    repairEndpointOrthogonalPaths(repairEndpointLaneCrossings(sharedEdges, nodes), nodes),
  );
  const postLaneGlobalEdges = keepIfNoNewStrictCrossings(
    endpointLaneEdges,
    globalRefineSession.run({
      edges: endpointLaneEdges,
      phase: 'quality-crossing-final-candidates-post-lane',
    }),
  );
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
  sharedLaneTimer.finish(
    preOverlapEdges === globalEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(globalEdges, preOverlapEdges),
  );

  const overlapTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-crossing-final-overlap',
    candidateCount: preOverlapEdges.length,
    onTrace: onPhaseTrace,
  });
  const detachedOverlapEdges = separateLargeDetachedParallelOverlapsIfNeeded(
    preOverlapEdges,
    nodes,
    16,
    DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  );
  const crossingRepairEdges = keepIfNoNewStrictCrossings(
    preOverlapEdges,
    detachedOverlapEdges,
  );
  overlapTimer.finish(
    crossingRepairEdges === preOverlapEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(preOverlapEdges, crossingRepairEdges),
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
