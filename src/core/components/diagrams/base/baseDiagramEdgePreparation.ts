import type { Edge } from '@xyflow/react';

type EdgeData = Record<string, unknown>;

const isFinitePoint = (value: unknown): value is { x: number; y: number } => {
  if (!value || typeof value !== 'object') return false;
  const point = value as Record<string, unknown>;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
};

const hasRenderableComputedPath = (value: unknown): boolean => (
  Array.isArray(value)
  && value.length >= 2
  && value.every(isFinitePoint)
);

export const hasTrustedLayoutPath = (edge: Edge): boolean => {
  const data = edge.data as EdgeData | undefined;
  if (!data) return false;

  const isLayoutLocked = data.layoutPathLocked === true || data._layoutPathLocked === true;
  const isStablePath = String(edge.type || '').toLowerCase() === 'stablepath';
  return (isLayoutLocked || isStablePath) && hasRenderableComputedPath(data.computedPath);
};

/**
 * Lightweight render preparation. Full display quality is intentionally owned
 * by BaseReactFlow's worker so the UI never performs the same route synchronously
 * before posting it to the worker again.
 */
export const prepareBaseDiagramDisplayEdges = (edges: Edge[]): Edge[] => {
  let changed = false;
  const prepared = edges.map((edge) => {
    if (!hasTrustedLayoutPath(edge) || edge.type === 'stablePath') return edge;
    changed = true;
    return { ...edge, type: 'stablePath' };
  });
  return changed ? prepared : edges;
};
