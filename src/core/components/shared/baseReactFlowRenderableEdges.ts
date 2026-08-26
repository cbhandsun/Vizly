import type { Edge, Node } from '@xyflow/react';
import { useMemo } from 'react';

const edgeIsHidden = (edge: Edge): boolean => edge.hidden === true;

/**
 * Keeps Worker input aligned with the visible node projection. Collapsed
 * containers retain their hidden business edges in application state, but
 * those edges cannot satisfy terminal gates while their endpoints are absent.
 */
export const filterBaseReactFlowRoutableEdges = (
  edges: Edge[],
  visibleNodes: readonly Node[],
): Edge[] => {
  if (edges.length === 0) return edges;
  const visibleNodeIds = new Set(visibleNodes.map(node => node.id));
  const routable = edges.filter(edge => (
    !edgeIsHidden(edge)
    && visibleNodeIds.has(edge.source)
    && visibleNodeIds.has(edge.target)
  ));
  return routable.length === edges.length ? edges : routable;
};

export const useBaseReactFlowRoutableEdges = (
  edges: Edge[],
  visibleNodes: readonly Node[],
): Edge[] => useMemo(
  () => filterBaseReactFlowRoutableEdges(edges, visibleNodes),
  [edges, visibleNodes],
);
