import type { Edge, Node } from '@xyflow/react';

import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import {
  createLocalDoglegRepairDiagnostics,
  type LocalDoglegRepairDiagnostics,
} from '../../strategies/shared/edgeLocalDoglegRepair';
import { repairSameNodeInOutCrossings } from '../../strategies/shared/edgeSameNodeRoleRepair';
import {
  synthesizeSharedEndpointTrunks,
  synthesizeSharedTargetTrunks,
} from '../../strategies/shared/edgeSharedTrunkSynthesis';
import { DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS } from './baseReactFlowDisplayOverlapRepair';
import { separateLargeDetachedParallelOverlapsIfNeeded } from './baseReactFlowDisplayQualityPolishSupport';
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import { repairDisplayEndpointOrthogonalPathsTwice } from './baseReactFlowDisplayTopologyFirstSeed';

export const repairDisplayQualityTopology = ({
  edges,
  nodes,
  topologySeedRemainsCurrent,
  reusePreparedGlobalRouting,
  repairDoglegs,
  onPhaseTrace,
}: Readonly<{
  edges: Edge[];
  nodes: Node[];
  topologySeedRemainsCurrent: boolean;
  reusePreparedGlobalRouting: boolean;
  repairDoglegs: (edges: Edge[], diagnostics?: LocalDoglegRepairDiagnostics) => Edge[];
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}>): Edge[] => {
  const endpointTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-topology-endpoints',
    candidateCount: edges.length,
    onTrace: onPhaseTrace,
  });
  const routedEndpointEdges = topologySeedRemainsCurrent
    ? edges
    : repairDisplayEndpointOrthogonalPathsTwice(edges, nodes);
  endpointTimer.finish(
    routedEndpointEdges === edges ? 'skip' : 'accepted',
    countChangedRoutingItems(edges, routedEndpointEdges),
  );

  const trunkTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-topology-trunks',
    candidateCount: routedEndpointEdges.length,
    onTrace: onPhaseTrace,
  });
  const initialTrunkTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-topology-trunks-initial',
    candidateCount: routedEndpointEdges.length,
    onTrace: onPhaseTrace,
  });
  const initialTrunkEdges = synthesizeSharedEndpointTrunks(routedEndpointEdges, { nodes });
  initialTrunkTimer.finish(
    initialTrunkEdges === routedEndpointEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(routedEndpointEdges, initialTrunkEdges),
  );
  const doglegTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-topology-trunks-dogleg',
    candidateCount: initialTrunkEdges.length,
    onTrace: onPhaseTrace,
  });
  const doglegDiagnostics = createLocalDoglegRepairDiagnostics();
  const localTrunkEdges = repairDoglegs(
    initialTrunkEdges,
    doglegDiagnostics,
  );
  doglegTimer.finish(
    localTrunkEdges === initialTrunkEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(initialTrunkEdges, localTrunkEdges),
    {
      candidateCount: doglegDiagnostics.candidateCount,
      evaluationCount: doglegDiagnostics.qualityEvaluationCount,
      cacheHitCount: doglegDiagnostics.cacheHitCount
        + doglegDiagnostics.deduplicatedCandidateCount,
    },
  );
  const secondaryTrunkTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-topology-trunks-secondary',
    candidateCount: localTrunkEdges.length,
    onTrace: onPhaseTrace,
  });
  const secondaryTrunkEdges = synthesizeSharedEndpointTrunks(localTrunkEdges, { nodes });
  secondaryTrunkTimer.finish(
    secondaryTrunkEdges === localTrunkEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(localTrunkEdges, secondaryTrunkEdges),
  );
  trunkTimer.finish(
    secondaryTrunkEdges === routedEndpointEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(routedEndpointEdges, secondaryTrunkEdges),
  );

  const detachedTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-topology-detached',
    candidateCount: secondaryTrunkEdges.length,
    onTrace: onPhaseTrace,
  });
  const secondaryDetachedEdges = reusePreparedGlobalRouting
    ? secondaryTrunkEdges
    : separateLargeDetachedParallelOverlapsIfNeeded(
      secondaryTrunkEdges,
      nodes,
      24,
      DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
    );
  detachedTimer.finish(
    secondaryDetachedEdges === secondaryTrunkEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(secondaryTrunkEdges, secondaryDetachedEdges),
  );

  const finalizeTimer = startDisplayRoutingPhaseTrace({
    phase: 'quality-topology-finalize',
    candidateCount: secondaryDetachedEdges.length,
    onTrace: onPhaseTrace,
  });
  const trunkAwareEdges = synthesizeSharedEndpointTrunks(secondaryDetachedEdges, { nodes });
  const endpointRepairedEdges = repairDisplayEndpointOrthogonalPathsTwice(trunkAwareEdges, nodes);
  const targetTrunkEdges = synthesizeSharedTargetTrunks(endpointRepairedEdges, { nodes });
  const finalEndpointRepairedEdges = repairDisplayEndpointOrthogonalPathsTwice(targetTrunkEdges, nodes);
  const finalizedTopologyEdges = repairEndpointOrthogonalPaths(
    repairSameNodeInOutCrossings(finalEndpointRepairedEdges, nodes),
    nodes,
  );
  finalizeTimer.finish(
    finalizedTopologyEdges === secondaryDetachedEdges ? 'skip' : 'accepted',
    countChangedRoutingItems(secondaryDetachedEdges, finalizedTopologyEdges),
  );
  return finalizedTopologyEdges;
};
