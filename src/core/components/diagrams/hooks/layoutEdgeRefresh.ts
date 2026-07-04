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

export const hasTrustedLockedComputedPath = (edge: Edge): boolean => {
  const data = edge.data as EdgeData | undefined;
  if (!data) return false;

  const isLayoutLocked = data.layoutPathLocked === true || data._layoutPathLocked === true;
  return isLayoutLocked && hasRenderableComputedPath(data.computedPath);
};

export const refreshDomainLayoutEdgeForRender = (edge: Edge, layoutEpoch: number): Edge => {
  const data = ((edge.data && typeof edge.data === 'object') ? edge.data : {}) as EdgeData;

  if (hasTrustedLockedComputedPath(edge)) {
    return {
      ...edge,
      data: {
        ...data,
        waypoints: [],
        _layoutEpoch: layoutEpoch,
      },
    };
  }

  return {
    ...edge,
    data: {
      ...data,
      waypoints: [],
      computedPath: undefined,
      elkPath: undefined,
      algorithm: undefined,
      _layoutEpoch: layoutEpoch,
    },
  };
};
