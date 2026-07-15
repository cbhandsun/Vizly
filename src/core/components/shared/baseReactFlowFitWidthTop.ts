import type { Edge, Node } from '@xyflow/react';
import { isBaseReactFlowNodeHidden } from './baseReactFlowRenderableNodes';

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;
const SAFE_TOP = 64;
const SAFE_LEFT = 56;
const MIN_FIT_ZOOM = 0.45;

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const resolveNodeDimension = (value: unknown, fallback: number): number => (
  isFiniteNumber(value) ? value : fallback
);

export const computeBaseReactFlowMinorResizeThreshold = ({
  containerWidth,
  nodeCount,
}: {
  containerWidth: number;
  nodeCount: number;
}): number => {
  const nodeFactor = Math.min(6, Math.round(nodeCount / 200));
  const baseThreshold = Math.min(10, Math.max(4, Math.round(containerWidth * 0.004)));
  return baseThreshold + nodeFactor;
};

export const shouldSkipBaseReactFlowMinorResize = ({
  currentSize,
  previousSize,
  nodeCount,
}: {
  currentSize: { width: number; height: number };
  previousSize: { width: number; height: number } | null;
  nodeCount: number;
}): boolean => {
  if (!previousSize) {
    return false;
  }

  const dw = Math.abs(currentSize.width - previousSize.width);
  const dh = Math.abs(currentSize.height - previousSize.height);
  const threshold = computeBaseReactFlowMinorResizeThreshold({
    containerWidth: currentSize.width,
    nodeCount,
  });

  return dw <= threshold && dh <= threshold;
};

export const computeBaseReactFlowNodeBounds = (nodes: Node[]): Bounds | null => {
  const visibleNodes = nodes.filter((node) => !isBaseReactFlowNodeHidden(node));
  if (visibleNodes.length === 0) {
    return null;
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of visibleNodes) {
    const width = resolveNodeDimension(
      node.measured?.width ?? node.width ?? (node.style as any)?.width,
      DEFAULT_NODE_WIDTH,
    );
    const height = resolveNodeDimension(
      node.measured?.height ?? node.height ?? (node.style as any)?.height,
      DEFAULT_NODE_HEIGHT,
    );

    const abs = (node as any).positionAbsolute ?? (node as any).computed?.positionAbsolute;
    let xVal = abs?.x;
    let yVal = abs?.y;

    if (!isFiniteNumber(xVal) || !isFiniteNumber(yVal)) {
      let x = node.position?.x ?? 0;
      let y = node.position?.y ?? 0;
      let currentNode: Node | undefined = node;

      while (currentNode?.parentId) {
        const parent = nodeById.get(currentNode.parentId);
        if (!parent) break;
        x += parent.position?.x ?? 0;
        y += parent.position?.y ?? 0;
        currentNode = parent;
      }

      xVal = x;
      yVal = y;
    }

    const x2 = xVal + width;
    const y2 = yVal + height;
    if (xVal < minX) minX = xVal;
    if (yVal < minY) minY = yVal;
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;
  }

  return { minX, minY, maxX, maxY };
};

export const expandBaseReactFlowBoundsForEdges = ({
  bounds,
  edges,
}: {
  bounds: Bounds;
  edges: Edge[];
}): Bounds & { contentWidth: number; contentHeight: number } => {
  let maxStrokeWidth = 0;
  let hasEdgeLabel = false;
  let hasSmartEdge = false;

  for (const edge of edges) {
    const strokeWidth = isFiniteNumber(edge.style?.strokeWidth) ? Number(edge.style?.strokeWidth) : 2;
    if (strokeWidth > maxStrokeWidth) {
      maxStrokeWidth = strokeWidth;
    }
    const label = (edge as any)?.data?.label ?? (edge as any)?.label;
    if (label) hasEdgeLabel = true;
    const pathType = ((edge.data && typeof edge.data === 'object' && (edge.data as any).pathType) || (edge as any).pathType || edge.type || '').toString().toLowerCase();
    if (pathType.includes('smart')) hasSmartEdge = true;
  }

  const edgeMargin = Math.max(0, Math.ceil(maxStrokeWidth) + 4);
  const smartExtraY = hasSmartEdge ? 24 : 0;
  const labelExtraY = hasEdgeLabel ? 24 : 0;
  const labelExtraX = hasEdgeLabel ? 16 : 0;

  const minX = bounds.minX - (edgeMargin + labelExtraX);
  const maxX = bounds.maxX + (edgeMargin + labelExtraX);
  const minY = bounds.minY - (edgeMargin + smartExtraY + labelExtraY);
  const maxY = bounds.maxY + (edgeMargin + labelExtraY);

  return {
    minX,
    minY,
    maxX,
    maxY,
    contentWidth: (Number.isFinite(maxX) && Number.isFinite(minX)) ? Math.max(1, maxX - minX) : 1,
    contentHeight: (Number.isFinite(maxY) && Number.isFinite(minY)) ? Math.max(1, maxY - minY) : 1,
  };
};

export const computeBaseReactFlowFitViewport = ({
  bounds,
  containerSize,
  fitPadding,
  fitRatio,
  maxFitZoom,
  minZoom,
  maxZoom,
  hasInitialized,
  lastZoom,
  force,
  previousContainer,
}: {
  bounds: Bounds & { contentWidth: number; contentHeight: number };
  containerSize: { width: number; height: number };
  fitPadding: number;
  fitRatio: number;
  maxFitZoom: number;
  minZoom: number;
  maxZoom: number;
  hasInitialized: boolean;
  lastZoom: number | null;
  force?: boolean;
  previousContainer: { width: number; height: number } | null;
}): { x: number; y: number; zoom: number } => {
  const padding = Math.max(0, fitPadding);
  const containerWidth = Math.max(1, containerSize.width - SAFE_LEFT - padding * 2);

  let zoom = Math.max(MIN_FIT_ZOOM, Math.min(maxFitZoom, (containerWidth * fitRatio) / bounds.contentWidth));
  zoom = Math.min(zoom, maxZoom);
  zoom = Math.max(zoom, minZoom);

  const isContainerShrinking = previousContainer && containerSize.width < previousContainer.width * 0.98;
  if (!force && !isContainerShrinking && hasInitialized && lastZoom && zoom < lastZoom * 0.95) {
    zoom = lastZoom;
  }

  const extraCenterX = Math.max(0, (containerWidth - bounds.contentWidth * zoom) / 2);
  return {
    x: SAFE_LEFT + padding + extraCenterX - (bounds.minX * zoom),
    y: SAFE_TOP + padding - (bounds.minY * zoom),
    zoom,
  };
};
