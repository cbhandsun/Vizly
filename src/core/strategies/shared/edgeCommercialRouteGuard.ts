import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import { getEdgePath, getRoutingObstacles } from './edgeRoutingPathGeometry';
import { chooseFewestStrictCrossings } from './edgeStrictCrossingGuard';
import { countUnrelatedObstacleHits } from './edgeWaypointCandidateRepair';

export function countCommercialObstacleHits(
  edges: Edge[],
  nodes: ReactFlowNode[],
): number {
  const obstacles = getRoutingObstacles(nodes);
  return edges.reduce((total, edge) => (
    total + countUnrelatedObstacleHits(getEdgePath(edge), edge, obstacles)
  ), 0);
}

/**
 * Selects a display candidate using the commercial routing priority:
 * real-node traversal is a hard failure; strict crossings are optimized only
 * among candidates with the same minimum obstacle-hit count.
 */
export function chooseCommercialRouteCandidate<T extends Edge[]>(
  nodes: ReactFlowNode[],
  ...candidates: T[]
): T {
  if (candidates.length === 0) return [] as unknown as T;
  const uniqueCandidates = candidates.filter(
    (candidate, index) => candidates.indexOf(candidate) === index,
  );
  const scored = uniqueCandidates.map(candidate => ({
    candidate,
    obstacleHits: countCommercialObstacleHits(candidate, nodes),
  }));
  const minimumObstacleHits = Math.min(...scored.map(item => item.obstacleHits));
  return chooseFewestStrictCrossings(
    ...scored
      .filter(item => item.obstacleHits === minimumObstacleHits)
      .map(item => item.candidate),
  );
}
