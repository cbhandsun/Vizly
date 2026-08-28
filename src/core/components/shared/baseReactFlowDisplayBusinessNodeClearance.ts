import type { Edge, Node } from '@xyflow/react';

import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  MINIMUM_BUSINESS_NODE_CLEARANCE,
  repairBusinessNodeClearanceRisks,
} from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { createBusinessNodeClearanceGeometryContext } from '../../strategies/shared/edgeBusinessNodeClearanceGeometryContext';
import {
  createNodeClearanceGraphEvaluationContext,
  scoreNodeClearanceRisk,
  type NodeClearanceGraphEvaluationContext,
} from '../../strategies/shared/edgeWaypointCandidateRepair';
import { getDisplayComputedPath } from './baseReactFlowDisplayGeometry';

export interface DisplayBusinessNodeClearanceOptions {
  eligibleEdgeIds?: ReadonlySet<string>;
  allowTransientStrictCrossing?: boolean;
}

export const displayBusinessNodeCommercialClearanceIsClean = (
  edges: Edge[],
  nodes: Node[],
): boolean => countDisplayBusinessNodeCommercialClearanceViolations(edges, nodes) === 0;

/** Final response metric; indexed pruning is parity-tested against the full scorer. */
export const countDisplayBusinessNodeCommercialClearanceViolations = (
  edges: Edge[],
  nodes: Node[],
): number => {
  const evaluation = createNodeClearanceGraphEvaluationContext(nodes);
  let violations = 0;
  for (const edge of edges) {
    if (evaluation.score(
      getDisplayComputedPath(edge),
      edge,
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    ) > 0.5) violations += 1;
  }
  return violations;
};

export const eligibleCommercialClearanceDoesNotRegress = (
  baselineEdges: Edge[],
  candidateEdges: Edge[],
  nodes: Node[],
  eligibleEdgeIds: ReadonlySet<string> | undefined,
  evaluation?: NodeClearanceGraphEvaluationContext,
): boolean => {
  if (eligibleEdgeIds?.size === 0) return true;
  const clearanceEvaluation = evaluation ?? createNodeClearanceGraphEvaluationContext(nodes);
  const candidateById = new Map(candidateEdges.map(edge => [edge.id, edge] as const));
  return baselineEdges.every((edge) => {
    if (eligibleEdgeIds && !eligibleEdgeIds.has(edge.id)) return true;
    const candidate = candidateById.get(edge.id);
    if (!candidate) return false;
    return clearanceEvaluation.score(
      getDisplayComputedPath(candidate),
      candidate,
      COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    ) <= clearanceEvaluation.score(
      getDisplayComputedPath(edge),
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
  const geometryContext = createBusinessNodeClearanceGeometryContext(nodes);
  const minimumEdges = repairBusinessNodeClearanceRisks(edges, nodes, {
    ...options,
    geometryContext,
    minimumClearance: MINIMUM_BUSINESS_NODE_CLEARANCE,
  });
  const commercialEdges = repairBusinessNodeClearanceRisks(minimumEdges, nodes, {
    ...options,
    geometryContext,
    minimumClearance: COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  });
  const commercialMinimumClosedEdges = repairBusinessNodeClearanceRisks(
    commercialEdges,
    nodes,
    { ...options, geometryContext, minimumClearance: MINIMUM_BUSINESS_NODE_CLEARANCE },
  );
  return eligibleMinimumClearanceIsClean(
    commercialMinimumClosedEdges,
    nodes,
    options.eligibleEdgeIds,
  )
    ? commercialMinimumClosedEdges
    : minimumEdges;
};

/** Worker transaction wrapper: a temporary peer crossing must be closed before commit. */
export const repairBaseReactFlowMinimumBusinessNodeClearance = (
  edges: Edge[],
  nodes: Node[],
  eligibleEdgeIds?: ReadonlySet<string>,
  allowTransientStrictCrossing = true,
): Edge[] => repairBaseReactFlowDisplayBusinessNodeClearance(edges, nodes, {
  eligibleEdgeIds,
  allowTransientStrictCrossing,
});
