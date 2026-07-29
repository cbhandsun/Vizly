import type { Edge, Node } from '@xyflow/react';

import { buildSvgPreviewModel } from '@/core/export/svgPreviewModel';
import type { StandardDiagramData, StandardNodeData } from '@/core/models/DiagramModels';
import { buildRenderSceneFromReactFlow } from '@/core/rendering/reactFlowScene';
import { LayoutType, type LayoutOptions } from '@/core/types/layout';
import { calculateHierarchicalLayout } from '@/core/utils/layout/hierarchicalLayout';

export interface LocalDiagramPreview {
  dataUrl: string;
  nodeCount: number;
  edgeCount: number;
}

const MAX_PREVIEW_NODES = 2_000;
const MAX_PREVIEW_EDGES = 5_000;
const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;
const DEFAULT_HORIZONTAL_SPACING = 80;
const DEFAULT_VERTICAL_SPACING = 72;
const MAX_SAFE_COORDINATE = 1_000_000;

interface PreviewPoint {
  x: number;
  y: number;
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const finiteCoordinate = (value: unknown): number | null => (
  typeof value === 'number'
  && Number.isFinite(value)
  && Math.abs(value) <= MAX_SAFE_COORDINATE
    ? value
    : null
);

const readPoint = (value: unknown): PreviewPoint | null => {
  const record = asRecord(value);
  const x = finiteCoordinate(record?.x);
  const y = finiteCoordinate(record?.y);
  return x === null || y === null ? null : { x, y };
};

const boundedPositiveNumber = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => (
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback
);

const directAbsolutePosition = (node: StandardNodeData): PreviewPoint | null => {
  const record = node as Record<string, unknown>;
  const computed = asRecord(record.computed);
  return readPoint(record.positionAbsolute)
    ?? readPoint(computed?.positionAbsolute);
};

const resolveExplicitPositions = (
  nodes: readonly StandardNodeData[],
): Map<string, PreviewPoint> | null => {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const resolved = new Map<string, PreviewPoint>();

  const resolveNode = (
    node: StandardNodeData,
    visiting: Set<string>,
  ): PreviewPoint | null => {
    const cached = resolved.get(node.id);
    if (cached) return cached;
    const absolute = directAbsolutePosition(node);
    if (absolute) {
      resolved.set(node.id, absolute);
      return absolute;
    }

    const local = readPoint(node.position);
    if (!local || visiting.has(node.id)) return null;
    const parentId = node.parentId ?? node.parent;
    if (!parentId) {
      resolved.set(node.id, local);
      return local;
    }

    const parent = nodesById.get(parentId);
    if (!parent) return null;
    const nextVisiting = new Set(visiting);
    nextVisiting.add(node.id);
    const parentPosition = resolveNode(parent, nextVisiting);
    if (!parentPosition) return null;
    const position = {
      x: parentPosition.x + local.x,
      y: parentPosition.y + local.y,
    };
    if (Math.abs(position.x) > MAX_SAFE_COORDINATE || Math.abs(position.y) > MAX_SAFE_COORDINATE) {
      return null;
    }
    resolved.set(node.id, position);
    return position;
  };

  for (const node of nodes) {
    if (!resolveNode(node, new Set())) return null;
  }

  if (nodes.length > 1) {
    const uniquePositions = new Set(
      nodes.map(node => {
        const position = resolved.get(node.id);
        return position ? `${position.x}:${position.y}` : '';
      }),
    );
    if (uniquePositions.size <= 1) return null;
  }

  return resolved;
};

const toPreviewNode = (
  node: StandardNodeData,
  position: PreviewPoint,
): Node => ({
  id: node.id,
  type: node.type,
  position,
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
});

const resolveLayoutOptions = (diagram: StandardDiagramData): LayoutOptions => {
  const configuredWidth = boundedPositiveNumber(
    diagram.config?.NODE_WIDTH,
    DEFAULT_NODE_WIDTH,
    40,
    1_200,
  );
  const configuredHeight = boundedPositiveNumber(
    diagram.config?.NODE_HEIGHT,
    DEFAULT_NODE_HEIGHT,
    24,
    1_200,
  );
  const horizontalSpacing = boundedPositiveNumber(
    diagram.layout?.spacing?.horizontal,
    DEFAULT_HORIZONTAL_SPACING,
    12,
    1_200,
  );
  const verticalSpacing = boundedPositiveNumber(
    diagram.layout?.spacing?.vertical,
    DEFAULT_VERTICAL_SPACING,
    12,
    1_200,
  );
  const direction = diagram.layout?.direction;

  return {
    type: LayoutType.HIERARCHICAL,
    direction: direction === 'TB' || direction === 'BT' || direction === 'LR' || direction === 'RL'
      ? direction
      : undefined,
    autoDirection: !direction,
    spacing: {
      horizontal: horizontalSpacing,
      vertical: verticalSpacing,
    },
    padding: {
      top: 40,
      right: 40,
      bottom: 40,
      left: 40,
    },
    itemSize: {
      width: configuredWidth,
      height: configuredHeight,
    },
    containerSize: {
      width: 1_600,
      height: 900,
    },
  };
};

export const prepareLocalDiagramPreviewNodes = (
  diagram: StandardDiagramData,
  edges: readonly Edge[],
): Node[] => {
  const sourceNodes = diagram.nodes.slice(0, MAX_PREVIEW_NODES);
  const explicitPositions = resolveExplicitPositions(sourceNodes);
  const nodes = sourceNodes.map(node => toPreviewNode(
    node,
    explicitPositions?.get(node.id) ?? { x: 0, y: 0 },
  ));
  if (explicitPositions || nodes.length <= 1) return nodes;

  const { positions } = calculateHierarchicalLayout(
    nodes,
    [...edges],
    resolveLayoutOptions(diagram),
  );
  return nodes.map((node, index) => ({
    ...node,
    position: positions[index] ?? { x: 0, y: 0 },
  }));
};

export const buildLocalDiagramPreview = (
  diagram: StandardDiagramData,
): LocalDiagramPreview | null => {
  if (!Array.isArray(diagram.nodes) || diagram.nodes.length === 0) return null;

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
  const nodes = prepareLocalDiagramPreviewNodes(diagram, edges);
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
