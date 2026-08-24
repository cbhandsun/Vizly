import type { Edge, Node } from '@xyflow/react';

import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import { repairLocalDoglegArtifacts } from '../../strategies/shared/edgeLocalDoglegRepair';
import { repairSameNodeInOutCrossings } from '../../strategies/shared/edgeSameNodeRoleRepair';
import {
  calculateEdgePathQualityScore,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  synthesizeSharedEndpointTrunks,
  synthesizeSharedTargetTrunks,
} from '../../strategies/shared/edgeSharedTrunkSynthesis';
import type { RoutingTopologyPlan } from './baseReactFlowDisplayRoutingTopologyPlan';

export type DisplayTopologyFirstSeedResult = Readonly<{
  edges: Edge[];
  applied: boolean;
  quality?: EdgePathQualityScore;
}>;

const topologySeedHardQualityDoesNotRegress = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean => candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
  && candidate.strictCrossings <= baseline.strictCrossings
  && candidate.reverseOverlap <= baseline.reverseOverlap
  && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
  && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
  && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
  && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
  && candidate.hairpins <= baseline.hairpins;

export const displayTopologyFirstSeedDoesNotRegress = (
  baselineEdges: Edge[],
  candidateEdges: Edge[],
): boolean => topologySeedHardQualityDoesNotRegress(
  calculateEdgePathQualityScore(baselineEdges),
  calculateEdgePathQualityScore(candidateEdges),
);

export const repairDisplayEndpointOrthogonalPathsTwice = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
): T => {
  const first = repairEndpointOrthogonalPaths(edges, nodes) as T;
  return first === edges ? first : repairEndpointOrthogonalPaths(first, nodes) as T;
};

/**
 * Builds endpoint topology before global waypoint search. The seed is only
 * materialized when the immutable topology plan proves an O2M/M2O group is
 * present; graphs without shared endpoint topology retain their exact input.
 *
 * Every operation is routing-owned and deterministic. Callers still retain
 * the normalized input as the obstacle/quality fallback, so this seed never
 * gains commit authority by itself.
 */
export const createDisplayTopologyFirstSeed = (
  edges: Edge[],
  nodes: Node[],
  topologyPlan: RoutingTopologyPlan,
): DisplayTopologyFirstSeedResult => {
  if (topologyPlan.groups.length === 0) return { edges, applied: false };
  const topologyMemberIndexes = new Set(
    topologyPlan.groups.flatMap(group => group.memberEdgeIndexes),
  );
  const topologyMembersAreLockedLayoutPaths = topologyMemberIndexes.size > 0
    && [...topologyMemberIndexes].every(index => (
      edges[index]?.data?.layoutPathLocked === true
    ));
  if (topologyMembersAreLockedLayoutPaths) return { edges, applied: false };

  const endpointEdges = repairDisplayEndpointOrthogonalPathsTwice(edges, nodes);
  const sourceTrunkEdges = synthesizeSharedEndpointTrunks(endpointEdges, { nodes });
  const localEdges = repairLocalDoglegArtifacts(sourceTrunkEdges, nodes);
  const stableSourceTrunkEdges = synthesizeSharedEndpointTrunks(localEdges, { nodes });
  const targetTrunkEdges = synthesizeSharedTargetTrunks(stableSourceTrunkEdges, { nodes });
  const finalEndpointEdges = repairDisplayEndpointOrthogonalPathsTwice(targetTrunkEdges, nodes);
  const sameNodeRoleEdges = repairEndpointOrthogonalPaths(
    repairSameNodeInOutCrossings(finalEndpointEdges, nodes),
    nodes,
  );

  if (sameNodeRoleEdges === edges) {
    return { edges, applied: false };
  }

  const baselineQuality = calculateEdgePathQualityScore(edges);
  const candidateQuality = calculateEdgePathQualityScore(sameNodeRoleEdges);
  if (!topologySeedHardQualityDoesNotRegress(baselineQuality, candidateQuality)) {
    return { edges, applied: false, quality: candidateQuality };
  }

  return { edges: sameNodeRoleEdges, applied: true, quality: candidateQuality };
};
