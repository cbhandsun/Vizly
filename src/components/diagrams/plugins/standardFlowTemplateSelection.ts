import type { Edge, Node } from '@xyflow/react';

import type {
  DiagramViewerTemplateData,
  DiagramViewerTemplateSelectionContext,
} from '@/components/diagramViewerTemplateSelection';

interface StandardFlowTemplateSelectionDependencies {
  convertData: (data: DiagramViewerTemplateData) => Promise<{ nodes: Node[]; edges: Edge[] }>;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  scheduleFitView: (callback: () => void) => void;
  fitView: () => void;
}

export const resolveStandardFlowPreset = <T>(
  presets: Readonly<Record<string, T>>,
  id: string,
): T | null => presets[id] ?? null;

export const applyStandardFlowTemplateSelection = async (
  data: DiagramViewerTemplateData,
  context: DiagramViewerTemplateSelectionContext,
  dependencies: StandardFlowTemplateSelectionDependencies,
): Promise<boolean> => {
  if (!context.isCurrent()) return false;
  const { nodes, edges } = await dependencies.convertData(data);
  if (!context.isCurrent()) return false;

  dependencies.setNodes(nodes);
  dependencies.setEdges(edges);
  dependencies.scheduleFitView(() => {
    if (context.isCurrent()) dependencies.fitView();
  });
  return true;
};
