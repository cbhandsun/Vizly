import type { Edge, Node } from '@xyflow/react';

import {
  displaySegmentIntersectsRect,
  getDisplayComputedPath,
  getDisplayNodeRect,
  isDisplayContainerNode,
} from './baseReactFlowDisplayGeometry';

const MAX_INCREMENTAL_CONTEXT_PROMOTIONS = 8;

const edgeIntersectsNode = (edge: Edge, node: Node): boolean => {
  if (edge.source === node.id || edge.target === node.id) return false;
  const rect = getDisplayNodeRect(node);
  if (!rect) return false;
  const path = getDisplayComputedPath(edge);
  for (let index = 0; index < path.length - 1; index += 1) {
    if (displaySegmentIntersectsRect(path[index], path[index + 1], rect)) {
      return true;
    }
  }
  return false;
};

/**
 * Promotes only frozen context edges with concrete geometric evidence: their
 * current route intersects a changed business-node obstacle. Returning null
 * means the bounded promotion budget was exceeded and the caller must fall
 * back to a full route instead of widening the incremental transaction.
 */
export const findBaseReactFlowBlockedContextEdgePromotions = ({
  edges,
  nodes,
  changedNodeIds,
  contextEdgeIds,
}: {
  edges: Edge[];
  nodes: Node[];
  changedNodeIds: readonly string[];
  contextEdgeIds: readonly string[];
}): string[] | null => {
  const contextIds = new Set(contextEdgeIds);
  const changedIds = new Set(changedNodeIds);
  const changedNodes = nodes.filter(node => (
    changedIds.has(node.id) && !isDisplayContainerNode(node)
  ));
  if (contextIds.size === 0 || changedNodes.length === 0) return [];

  const promotedIds: string[] = [];
  for (const edge of edges) {
    if (
      !contextIds.has(edge.id)
      || !changedNodes.some(node => edgeIntersectsNode(edge, node))
    ) continue;
    promotedIds.push(edge.id);
    if (promotedIds.length > MAX_INCREMENTAL_CONTEXT_PROMOTIONS) return null;
  }
  return promotedIds;
};
