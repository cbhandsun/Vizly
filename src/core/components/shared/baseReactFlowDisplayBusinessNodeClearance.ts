import type { Edge, Node } from '@xyflow/react';

import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  MINIMUM_BUSINESS_NODE_CLEARANCE,
  repairBusinessNodeClearanceRisks,
} from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { scoreNodeClearanceRisk } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { getDisplayComputedPath } from './baseReactFlowDisplayGeometry';

export interface DisplayBusinessNodeClearanceOptions {
  eligibleEdgeIds?: ReadonlySet<string>;
  allowTransientStrictCrossing?: boolean;
}

export const displayBusinessNodeCommercialClearanceIsClean = (
  edges: Edge[],
  nodes: Node[],
): boolean => edges.every(edge => scoreNodeClearanceRisk(
  getDisplayComputedPath(edge),
  nodes,
  edge,
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
) <= 0.5);

export const eligibleCommercialClearanceDoesNotRegress = (
  baselineEdges: Edge[],
  candidateEdges: Edge[],
  nodes: Node[],
  eligibleEdgeIds: ReadonlySet<string> | undefined,
): boolean => {
  if (!eligibleEdgeIds || eligibleEdgeIds.size === 0) return true;
  const candidateById = new Map(candidateEdges.map(edge => [edge.id, edge] as const));
  return baselineEdges.every((edge) => {
    if (!eligibleEdgeIds.has(edge.id)) return true;
    const candidate = candidateById.get(edge.id);
    if (!candidate) return false;
    return scoreNodeClearanceRisk(
      getDisplayComputedPath(candidate),
      nodes,
      candidate,
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    ) <= scoreNodeClearanceRisk(
      getDisplayComputedPath(edge),
      nodes,
      edge,
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    ) + 0.5;
  });
};

const eligibleMinimumClearanceIsClean = (
  edges: Edge[],
  nodes: Node[],
  eligibleEdgeIds: ReadonlySet<string> | undefined,
): boolean => edges.every(edge => (
  Boolean(eligibleEdgeIds && !eligibleEdgeIds.has(edge.id))
  || scoreNodeClearanceRisk(
    getDisplayComputedPath(edge),
    nodes,
    edge,
    MINIMUM_BUSINESS_NODE_CLEARANCE,
  ) <= 0.5
));

/**
 * Preserves the 16px safety floor atomically while opportunistically promoting
 * the same route to the 48px commercial clearance target.
 */
export const repairBaseReactFlowDisplayBusinessNodeClearance = (
  edges: Edge[],
  nodes: Node[],
  options: DisplayBusinessNodeClearanceOptions = {},
): Edge[] => {
  if (displayBusinessNodeCommercialClearanceIsClean(edges, nodes)) return edges;
  const minimumEdges = repairBusinessNodeClearanceRisks(edges, nodes, {
    ...options,
    minimumClearance: MINIMUM_BUSINESS_NODE_CLEARANCE,
  });
  const commercialEdges = repairBusinessNodeClearanceRisks(minimumEdges, nodes, {
    ...options,
    minimumClearance: COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  });
  const commercialMinimumClosedEdges = repairBusinessNodeClearanceRisks(
    commercialEdges,
    nodes,
    { ...options, minimumClearance: MINIMUM_BUSINESS_NODE_CLEARANCE },
  );
  return eligibleMinimumClearanceIsClean(
    commercialMinimumClosedEdges,
    nodes,
    options.eligibleEdgeIds,
  )
    ? commercialMinimumClosedEdges
    : minimumEdges;
};
