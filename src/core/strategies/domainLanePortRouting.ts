import type { Edge, Node } from '@xyflow/react';
import { buildEndpointOrthogonalFallbackPath, lockComputedPathOnEdge } from './shared/edgeFallbackPath';
import { chooseCommercialRouteCandidate } from './shared/edgeCommercialRouteGuard';
import { repairSharedTrunkAwareObstacles } from './shared/edgeRoutingWaypointRefinement';
import { asRoutingRecord, readManualHandleLocks } from './domainDagreEdgePreparationSupport';
import { getEdgePath } from './shared/edgeRoutingPathGeometry';
import { normalizeHandle } from '../routing/utils/handleUtils';

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const MAX_INTERACTIVE_EDGES = 48;
const MAX_INTERACTIVE_NODES = 128;

const pointsOutward = (
  end: { x: number; y: number },
  next: { x: number; y: number },
  handle: string,
): boolean => {
  const dx = next.x - end.x;
  const dy = next.y - end.y;
  const side = normalizeHandle(handle);
  if (side === 'l' || side === 'r') {
    return Math.abs(dy) <= 0.5 && (side === 'r' ? dx : -dx) >= 48;
  }
  return (side === 't' || side === 'b')
    && Math.abs(dx) <= 0.5 && (side === 'b' ? dy : -dy) >= 48;
};

/** Choose escape sides against all business-node obstacles, not just endpoints. */
export const repairDomainLanePortRoutes = (edges: Edge[], nodes: Node[]): Edge[] => {
  // This is only seed preparation. Keep its main-thread work bounded; larger
  // graphs still go through the Worker-owned full routing and hard gates.
  if (
    edges.length === 0
    || edges.length > MAX_INTERACTIVE_EDGES
    || nodes.length > MAX_INTERACTIVE_NODES
  ) return edges;
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  let current = edges;
  for (let pass = 0; pass < 2; pass += 1) {
    const before = current;
    for (let index = 0; index < current.length; index += 1) {
      const edge = current[index];
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) continue;
      const locks = readManualHandleLocks(asRoutingRecord(edge.data));
      const sourceSides = locks.source && edge.sourceHandle ? [edge.sourceHandle] : SIDES;
      const targetSides = locks.target && edge.targetHandle ? [edge.targetHandle] : SIDES;
      const candidates: Edge[][] = [current];
      for (const sourceHandle of sourceSides) {
        for (const targetHandle of targetSides) {
          for (const stubLength of [56, 112, 168]) {
            const candidate = { ...edge, sourceHandle, targetHandle, data: { ...edge.data } };
            lockComputedPathOnEdge(candidate, buildEndpointOrthogonalFallbackPath({
              source, target, sourceHandle, targetHandle, nodeById, stubLength,
            }));
            const [routed] = repairSharedTrunkAwareObstacles([candidate], nodes, 24);
            const path = getEdgePath(routed);
            // Local obstacle skirts must not turn an outward terminal back
            // into its node. Such a candidate cannot pass the final contract.
            if (
              path.length < 2
              || !pointsOutward(path[0], path[1], sourceHandle)
              || !pointsOutward(path[path.length - 1], path[path.length - 2], targetHandle)
            ) continue;
            candidates.push(current.map((item, position) => position === index ? routed : item));
          }
        }
      }
      current = chooseCommercialRouteCandidate(nodes, ...candidates);
    }
    if (current === before) break;
  }
  return current;
};
