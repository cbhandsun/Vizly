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

const STALE_DURING_NODE_DRAG_EDGE_TYPES = new Set([
  ...EXPENSIVE_INTERACTIVE_EDGE_TYPES,
  'stablePath',
]);

export const resolveBaseReactFlowNodeDragFallbackIds = (
  primaryNodeId: string,
  draggedNodes: readonly { id: string; selected?: boolean }[],
): string[] => Array.from(new Set([
  primaryNodeId,
  ...draggedNodes
    .filter(node => node.selected)
    .map(node => node.id),
]));

/**
 * Keeps every diagram visible and responsive while the worker searches for a
 * final route. Built-in smooth-step edges avoid running obstacle routing
 * synchronously in every custom edge component during the pending window.
 */
export const createBaseReactFlowInteractiveFallbackEdges = (
  edges: Edge[],
): Edge[] => {
  let fallbackEdges: Edge[] | null = null;

  edges.forEach((edge, index) => {
    // An omitted type inherits BaseReactFlow's advanced-smart-step default.
    // Treat it as expensive too, otherwise a rejected worker can leave that
    // custom edge rendering stale absolute route data from a previous geometry.
    const effectiveType = edge.type ?? 'advanced-smart-step';
    if (!EXPENSIVE_INTERACTIVE_EDGE_TYPES.has(effectiveType)) return;
    if (!fallbackEdges) fallbackEdges = [...edges];
    fallbackEdges[index] = {
      ...edge,
      type: 'smoothstep',
    };
  });

  return fallbackEdges ?? edges;
};

/**
 * Uses endpoint-driven built-in paths while a node is moving or its final
 * canvas route is being recomputed. Stable paths contain absolute points from
 * the previous geometry and would otherwise appear detached from the node.
 */
export const createBaseReactFlowNodeDragFallbackEdges = (
  edges: Edge[],
  draggingNodeIds?: readonly string[],
): Edge[] => {
  let fallbackEdges: Edge[] | null = null;
  const draggingIds = draggingNodeIds?.length
    ? new Set(draggingNodeIds)
    : null;

  edges.forEach((edge, index) => {
    if (draggingIds && !draggingIds.has(edge.source) && !draggingIds.has(edge.target)) return;
    if (!edge.type || !STALE_DURING_NODE_DRAG_EDGE_TYPES.has(edge.type)) return;
    if (!fallbackEdges) fallbackEdges = [...edges];
    fallbackEdges[index] = {
      ...edge,
      type: 'smoothstep',
    };
  });

  return fallbackEdges ?? edges;
};

export const shouldUseBaseReactFlowNodeDragFallback = ({
  isNodeDragging,
  dragFallbackPending,
  hasResolvedEdges: _hasResolvedEdges,
  sourceEdgeCount,
}: {
  isNodeDragging: boolean;
  dragFallbackPending: boolean;
  hasResolvedEdges: boolean;
  sourceEdgeCount: number;
}): boolean => (
  sourceEdgeCount > 0
  && (isNodeDragging || dragFallbackPending)
);
