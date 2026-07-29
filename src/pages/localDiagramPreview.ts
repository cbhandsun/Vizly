import type { Edge, Node } from '@xyflow/react';

import { buildSvgPreviewModel } from '@/core/export/svgPreviewModel';
import type { StandardDiagramData } from '@/core/models/DiagramModels';
import { buildRenderSceneFromReactFlow } from '@/core/rendering/reactFlowScene';

export interface LocalDiagramPreview {
  dataUrl: string;
  nodeCount: number;
  edgeCount: number;
}

const MAX_PREVIEW_NODES = 2_000;
const MAX_PREVIEW_EDGES = 5_000;

export const buildLocalDiagramPreview = (
  diagram: StandardDiagramData,
): LocalDiagramPreview | null => {
  if (!Array.isArray(diagram.nodes) || diagram.nodes.length === 0) return null;

  const nodes: Node[] = diagram.nodes.slice(0, MAX_PREVIEW_NODES).map(node => ({
    id: node.id,
    type: node.type,
    position: node.position ?? { x: 0, y: 0 },
    parentId: node.parentId ?? node.parent,
    width: node.width,
    height: node.height,
    measured: node.measured,
    style: node.style,
    data: {
      ...node.data,
      label: node.label ?? node.description,
      description: node.description,
      domain: node.domain,
      themeColor: node.themeColor,
    },
  }));
  const edges: Edge[] = Array.isArray(diagram.edges)
    ? diagram.edges.slice(0, MAX_PREVIEW_EDGES).map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edge.type,
        label: edge.label,
        markerStart: edge.markerStart,
        markerEnd: edge.markerEnd,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        style: edge.style,
        data: edge.data,
      }))
    : [];
  const scene = buildRenderSceneFromReactFlow(nodes, edges, { padding: 24 });
  const preview = buildSvgPreviewModel(scene, {
    maxPreviewSide: 720,
    title: diagram.name || diagram.metadata?.title || 'Diagram preview',
  });

  return {
    dataUrl: preview.dataUrl,
    nodeCount: preview.nodeCount,
    edgeCount: preview.edgeCount,
  };
};
