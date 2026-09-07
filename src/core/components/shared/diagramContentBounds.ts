import type { Edge, Node } from '@xyflow/react';
import { computeDiagramNodeBounds, type DiagramNodeBounds } from './diagramNodeBounds';

type Bounds = Pick<DiagramNodeBounds, 'minX' | 'minY' | 'maxX' | 'maxY'>;
export type DiagramContentRect = Readonly<{ x: number; y: number; width: number; height: number }>;
const MAX_COORDINATE = 1_000_000_000;
const MAX_EDGES = 10_000;
const MAX_PATH_POINTS = 2_000;
const MAX_TOTAL_POINTS = 200_000;
const PATH_PAINT_MARGIN = 12;
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const finiteCoordinate = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE
);
const validRect = (rect: DiagramContentRect): boolean => (
  [rect.x, rect.y, rect.width, rect.height].every(finiteCoordinate)
  && rect.width > 0 && rect.height > 0
);
const includeRect = (bounds: Bounds, rect: DiagramContentRect): void => {
  bounds.minX = Math.min(bounds.minX, rect.x);
  bounds.minY = Math.min(bounds.minY, rect.y);
  bounds.maxX = Math.max(bounds.maxX, rect.x + rect.width);
  bounds.maxY = Math.max(bounds.maxY, rect.y + rect.height);
};

/** Uses actual routed points, including corridors outside the node envelope. */
export const extendDiagramBoundsWithEdges = (
  initial: Bounds,
  edges: readonly Edge[],
): Bounds => {
  const bounds = { ...initial };
  let remaining = MAX_TOTAL_POINTS;
  for (const edge of edges.slice(0, MAX_EDGES)) {
    if (edge.hidden || edge.data?.hidden === true) continue;
    const data = isRecord(edge.data) ? edge.data : {};
    const tree = isRecord(data.treeRouting) ? data.treeRouting : {};
    const points = data.computedPath ?? tree.points ?? data.elkPath;
    if (!Array.isArray(points) || points.length > MAX_PATH_POINTS || points.length > remaining) continue;
    remaining -= points.length;
    for (const point of points) {
      if (!isRecord(point) || !finiteCoordinate(point.x) || !finiteCoordinate(point.y)) continue;
      includeRect(bounds, {
        x: point.x - PATH_PAINT_MARGIN, y: point.y - PATH_PAINT_MARGIN,
        width: PATH_PAINT_MARGIN * 2, height: PATH_PAINT_MARGIN * 2,
      });
    }
  }
  return bounds;
};

export const computeDiagramContentBounds = (
  nodes: readonly Node[],
  edges: readonly Edge[],
  labelRects: readonly DiagramContentRect[] = [],
): DiagramNodeBounds | null => {
  const visibleNodes = nodes.filter(node => !node.hidden && node.data?.hidden !== true);
  // Keep hidden ancestors in the coordinate index; only their own rectangles
  // are excluded. A visible child can still have a hidden structural parent.
  const initial = computeDiagramNodeBounds(nodes);
  if (!initial) return null;
  const visibleIds = new Set(visibleNodes.map(node => node.id));
  const bounds = extendDiagramBoundsWithEdges(initial, edges.filter(edge => (
    visibleIds.has(edge.source) && visibleIds.has(edge.target)
  )));
  for (const rect of labelRects.slice(0, MAX_EDGES)) {
    if (validRect(rect)) includeRect(bounds, rect);
  }
  return { ...bounds, width: Math.max(1, bounds.maxX - bounds.minX), height: Math.max(1, bounds.maxY - bounds.minY) };
};

/** Explicit fit is infrequent: read final label rectangles without modifying the DOM. */
export const readDiagramRenderedLabels = (
  canvas: HTMLElement,
  viewport: Readonly<{ x: number; y: number; zoom: number }>,
): Array<{ rect: DiagramContentRect; readabilityScaled: boolean }> => {
  if (![viewport.x, viewport.y, viewport.zoom].every(finiteCoordinate) || viewport.zoom <= 0) return [];
  const origin = canvas.getBoundingClientRect();
  const result: Array<{ rect: DiagramContentRect; readabilityScaled: boolean }> = [];
  const labels = canvas.querySelectorAll('.vizly-edge-label, .react-flow__edge-textwrapper');
  for (const label of Array.from(labels).slice(0, MAX_EDGES)) {
    const rect = label.getBoundingClientRect();
    const projected = {
      x: (rect.left - origin.left - viewport.x) / viewport.zoom,
      y: (rect.top - origin.top - viewport.y) / viewport.zoom,
      width: rect.width / viewport.zoom,
      height: rect.height / viewport.zoom,
    };
    if (validRect(projected)) result.push({ rect: projected, readabilityScaled: label.matches('.vizly-edge-label') });
  }
  return result;
};

export const readDiagramRenderedLabelBounds = (
  canvas: HTMLElement,
  viewport: Readonly<{ x: number; y: number; zoom: number }>,
): DiagramContentRect[] => readDiagramRenderedLabels(canvas, viewport).map(label => label.rect);
