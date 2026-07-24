import type { Edge } from '@xyflow/react';

const EXPENSIVE_INTERACTIVE_EDGE_TYPES = new Set([
  'advanced-smart',
  'advanced-smart-step',
  'advanced-smart-bezier',
  'advanced-smart-straight',
  'smart',
  'smart-step',
  'smart-bezier',
  'smart-straight',
  'smart-orthogonal',
]);

/**
 * Keeps medium and large diagrams responsive while the bounded worker searches
 * for a final route. Built-in smooth-step edges avoid running obstacle routing
 * synchronously in every custom edge component during the pending window.
 */
export const createBaseReactFlowInteractiveFallbackEdges = (
  edges: Edge[],
): Edge[] => {
  let fallbackEdges: Edge[] | null = null;

  edges.forEach((edge, index) => {
    if (!edge.type || !EXPENSIVE_INTERACTIVE_EDGE_TYPES.has(edge.type)) return;
    if (!fallbackEdges) fallbackEdges = [...edges];
    fallbackEdges[index] = {
      ...edge,
      type: 'smoothstep',
    };
  });

  return fallbackEdges ?? edges;
};
