import type { Edge } from '@xyflow/react';

import {
  buildEdgeSegments,
  calculateEdgePairQuality,
} from '../../../../strategies/shared/edgePathQualityGeometry';

export type FiniteDisplayPoint = { x: number; y: number };

export const finiteDisplayPointPath = (value: unknown): FiniteDisplayPoint[] => (
  Array.isArray(value)
    ? value.filter((point): point is FiniteDisplayPoint => (
      point !== null
      && typeof point === 'object'
      && typeof (point as { x?: unknown }).x === 'number'
      && Number.isFinite((point as { x: number }).x)
      && typeof (point as { y?: unknown }).y === 'number'
      && Number.isFinite((point as { y: number }).y)
    ))
    : []
);

export const unexplainedRelatedOverlapPairs = (edges: Edge[]) => edges.flatMap(
  (first, firstIndex) => edges.slice(firstIndex + 1).flatMap((second, offset) => {
    const secondIndex = firstIndex + offset + 1;
    const firstPath = finiteDisplayPointPath(first.data?.computedPath);
    const secondPath = finiteDisplayPointPath(second.data?.computedPath);
    const pair = calculateEdgePairQuality(
      first,
      second,
      buildEdgeSegments(firstPath, firstIndex),
      buildEdgeSegments(secondPath, secondIndex),
    );
    return pair.unexplainedRelatedOverlap > 0
      ? [{
        first: first.id,
        second: second.id,
        firstEndpoints: {
          source: first.source,
          target: first.target,
          sourceHandle: first.sourceHandle,
          targetHandle: first.targetHandle,
        },
        secondEndpoints: {
          source: second.source,
          target: second.target,
          sourceHandle: second.sourceHandle,
          targetHandle: second.targetHandle,
        },
        overlap: pair.unexplainedRelatedOverlap,
        firstPath,
        secondPath,
      }]
      : [];
  }),
);
