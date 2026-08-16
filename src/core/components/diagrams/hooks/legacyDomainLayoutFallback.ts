import type { Edge, Node } from '@xyflow/react';

import { getDisplayHardQualityGateReport } from '../../shared/baseReactFlowDisplayQualityGates';
import { getDisplayComputedPath } from '../../shared/baseReactFlowDisplayGeometry';
import { isDirectedForestLayoutGraph } from './treeLayoutTopology';

export const shouldPreferElkForLegacyDomainTopology = (
  nodes: Node[],
  edges: Edge[],
): boolean => (
  nodes.length > 0
  && edges.length > 0
  && !isDirectedForestLayoutGraph(nodes, edges)
);

/**
 * Legacy domain layouts remain useful for simple trees and already-clean
 * business graphs. Dense DAGs and feedback graphs can, however, place a long
 * same-rank edge through an unrelated sibling port or node. When the legacy
 * engine has supplied a complete route candidate, use its hard-quality report
 * as a cheap preflight and let ELK own ranking before the expensive Worker
 * transaction starts.
 */
export const shouldUseElkSafetyFallback = (
  nodes: Node[],
  edges: Edge[],
): boolean => {
  if (nodes.length === 0 || edges.length === 0) return false;

  const routedEdges = edges.filter(edge => String(edge.type ?? '').toLowerCase() !== 'canvas-ref');
  if (
    routedEdges.length === 0
    || routedEdges.some(edge => getDisplayComputedPath(edge).length < 2)
  ) return false;

  return !getDisplayHardQualityGateReport(routedEdges, nodes, 'polished').hardClean;
};
