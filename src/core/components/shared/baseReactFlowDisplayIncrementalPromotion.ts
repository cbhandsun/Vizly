import type { Edge, Node } from '@xyflow/react';

import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { createNodeClearanceEvaluationContext } from '../../strategies/shared/edgeWaypointCandidateRepair';
import {
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  isDisplayContainerNode,
} from './baseReactFlowDisplayGeometry';

const MAX_INCREMENTAL_CONTEXT_PROMOTIONS = 8;

const edgeViolatesNodeClearance = (edge: Edge, node: Node): boolean => {
  if (edge.source === node.id || edge.target === node.id) return false;
  return createNodeClearanceEvaluationContext([node], edge).score(
    getDisplayComputedPath(edge),
    COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  ) > 1e-6;
};

/**
 * Promotes only frozen edges with concrete geometric evidence: their current
 * route intersects or violates the commercial clearance of a changed business
 * node. `contextEdgeIds` is a priority hint, not a complete boundary: a node
 * move can approach a previously unrelated branch. Returning null means the
 * bounded promotion budget was exceeded and the caller must fall back to a
 * full route instead of widening the incremental transaction.
 */
export const findBaseReactFlowBlockedContextEdgePromotions = ({
  edges,
  nodes,
  changedNodeIds,
  contextEdgeIds,
  mutableEdgeIds = [],
}: {
  edges: Edge[];
  nodes: Node[];
  changedNodeIds: readonly string[];
  contextEdgeIds: readonly string[];
  mutableEdgeIds?: readonly string[];
}): string[] | null => {
  const hintedContextIds = new Set(contextEdgeIds);
  const mutableIds = new Set(mutableEdgeIds);
  const changedIds = new Set(changedNodeIds);
  const changedNodes = nodes.filter(node => (
    changedIds.has(node.id) && !isDisplayContainerNode(node)
  ));
  if (changedNodes.length === 0) return [];

  const promotedIds: string[] = [];
  const frozenEdges = edges
    .filter(edge => !mutableIds.has(edge.id))
    .sort((first, second) => (
      Number(hintedContextIds.has(second.id)) - Number(hintedContextIds.has(first.id))
    ));
  for (const edge of frozenEdges) {
    if (
      !changedNodes.some(node => edgeViolatesNodeClearance(edge, node))
    ) continue;
    promotedIds.push(edge.id);
    if (promotedIds.length > MAX_INCREMENTAL_CONTEXT_PROMOTIONS) return null;
  }
  return promotedIds;
};

/**
 * Expands an incremental transaction only across a strict crossing whose
 * opposite edge is already mutable. Unrelated context edges remain frozen.
 */
export const findBaseReactFlowStrictContextEdgePromotions = ({
  edges,
  mutableEdgeIds,
  contextEdgeIds,
}: {
  edges: Edge[];
  mutableEdgeIds: ReadonlySet<string>;
  contextEdgeIds: readonly string[];
}): string[] | null => {
  const contextIds = new Set(contextEdgeIds);
  const promotedIds = new Set<string>();
  for (const hit of findDisplayStrictCrossingHits(edges)) {
    const firstId = edges[hit.a.edgeIndex]?.id;
    const secondId = edges[hit.b.edgeIndex]?.id;
    if (!firstId || !secondId) continue;
    if (mutableEdgeIds.has(firstId) && contextIds.has(secondId)) {
      promotedIds.add(secondId);
    }
    if (mutableEdgeIds.has(secondId) && contextIds.has(firstId)) {
      promotedIds.add(firstId);
    }
    if (promotedIds.size > MAX_INCREMENTAL_CONTEXT_PROMOTIONS) return null;
  }
  return [...promotedIds].sort();
};
