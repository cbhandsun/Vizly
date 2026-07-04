import type { Edge, Node } from '@xyflow/react';

import type { DiagramTypePlugin } from '../../types/plugin';

export interface UnifiedDesignerCanvasState {
  nodes: Node[];
  edges: Edge[];
}

const normalizeCanvasState = (state: { nodes: unknown; edges: unknown }): UnifiedDesignerCanvasState => ({
  nodes: Array.isArray(state.nodes) ? (state.nodes as Node[]) : [],
  edges: Array.isArray(state.edges) ? (state.edges as Edge[]) : [],
});

export const resolveUnifiedDesignerCanvasState = (
  plugin: DiagramTypePlugin,
  initialData?: unknown
): UnifiedDesignerCanvasState => {
  const fallbackState = normalizeCanvasState(plugin.getEmptyState());
  if (initialData === undefined) return fallbackState;
  return normalizeCanvasState(plugin.parseData(initialData));
};
