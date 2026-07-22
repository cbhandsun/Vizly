import type { Edge, Node } from '@xyflow/react';

const stripHtml = (value: string): string => value.replace(/<[^>]*>?/gm, '');

export const projectDesignerStandardNodes = (nodes: Node[]): {
  standardNodes: Array<Record<string, unknown>>;
  groups: Array<Record<string, unknown>>;
} => {
  const standardNodes: Array<Record<string, unknown>> = [];
  const groups: Array<Record<string, unknown>> = [];
  for (const node of nodes) {
    const nodeData = node.data ?? {};
    const rawLabel = typeof nodeData.label === 'string' ? nodeData.label : '';
    const description = typeof nodeData.description === 'string'
      ? nodeData.description
      : `<b>${rawLabel}</b>`;
    const canvasMetadata = {
      canvasPosition: node.position,
      width: node.measured?.width ?? node.width ?? 100,
      height: node.measured?.height ?? node.height ?? 50,
      parentId: node.parentId,
      shape: nodeData.shape,
      icon: nodeData.icon,
      style: node.style,
      theme: nodeData.theme,
      sequence: nodeData.sequence || '1',
    };
    const baseNode = {
      id: node.id,
      description,
      domain: nodeData.domain || nodeData.domainClass || '业务域',
      subDomain: nodeData.subDomain || undefined,
      domainClass: nodeData.domainClass || 'core',
      type: 'custom',
      metadata: canvasMetadata,
    };
    if (node.type === 'titleGroup' || node.type === 'subGroup') {
      groups.push({
        ...baseNode,
        type: 'group',
        label: rawLabel || stripHtml(description),
        isGroup: true,
        measured: { width: canvasMetadata.width, height: canvasMetadata.height },
        position: node.position,
        themeColor: nodeData.themeColor,
        data: nodeData,
      });
    } else {
      standardNodes.push(baseNode);
    }
  }
  return { standardNodes, groups };
};

export const projectDesignerStandardEdges = (edges: Edge[]): Array<Record<string, unknown>> => edges.map(edge => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  type: edge.type === 'smart-step' || edge.type === 'smart' ? 'main' : edge.type || 'main',
  label: edge.label || edge.data?.label,
  markerEnd: edge.markerEnd,
  style: edge.style,
  metadata: {
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    autoHandles: edge.data?.auto,
    manualHandles: Boolean(edge.data?.manualHandles),
    manualHandleSides: edge.data?.manualHandleSides,
  },
}));
