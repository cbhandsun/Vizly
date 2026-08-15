import type { Edge } from '@xyflow/react';

import {
  displayStrictCrossesHorizontal,
  displayStrictCrossesVertical,
  getDisplayComputedPath,
  type DisplayPoint,
  type DisplayRect,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import type { DisplayCrossingClusterPortSide } from './baseReactFlowDisplayCrossingClusterRanking';

export type DisplayCrossingClusterStrictHit = {
  a: DisplaySegment;
  b: DisplaySegment;
};

export const displayCrossingClusterSideAxis = (
  side: DisplayCrossingClusterPortSide,
): 'h' | 'v' => side === 'left' || side === 'right' ? 'h' : 'v';

export const displayCrossingClusterOutwardStub = (
  anchor: DisplayPoint,
  side: DisplayCrossingClusterPortSide,
  clearance: number,
): DisplayPoint => {
  if (side === 'left') return { x: anchor.x - clearance, y: anchor.y };
  if (side === 'right') return { x: anchor.x + clearance, y: anchor.y };
  if (side === 'top') return { x: anchor.x, y: anchor.y - clearance };
  return { x: anchor.x, y: anchor.y + clearance };
};

export const displayCrossingClusterPointOnSide = (
  point: DisplayPoint,
  rect: DisplayRect,
  side: DisplayCrossingClusterPortSide,
): boolean => {
  if (side === 'left' || side === 'right') {
    const sideX = side === 'left' ? rect.x : rect.x + rect.width;
    return Math.abs(point.x - sideX) <= 2
      && point.y >= rect.y - 2
      && point.y <= rect.y + rect.height + 2;
  }
  const sideY = side === 'top' ? rect.y : rect.y + rect.height;
  return Math.abs(point.y - sideY) <= 2
    && point.x >= rect.x - 2
    && point.x <= rect.x + rect.width + 2;
};

export const displayCrossingClusterFacingSidePair = (
  sourceRect: DisplayRect,
  targetRect: DisplayRect,
): [DisplayCrossingClusterPortSide, DisplayCrossingClusterPortSide] => {
  const sourceCenter = {
    x: sourceRect.x + sourceRect.width / 2,
    y: sourceRect.y + sourceRect.height / 2,
  };
  const targetCenter = {
    x: targetRect.x + targetRect.width / 2,
    y: targetRect.y + targetRect.height / 2,
  };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  }
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
};

/**
 * Stable, allocation-light path identity used as a deterministic candidate
 * tie-breaker. Keep this byte-for-byte compatible with the legacy map/join
 * representation, including sparse arrays and non-finite numeric values.
 */
export const displayCrossingClusterPathSignature = (path: DisplayPoint[]): string => {
  let signature = '';
  for (let index = 0; index < path.length; index += 1) {
    if (index > 0) signature += '|';
    // Array#map skips sparse slots while Array#join still emits separators.
    if (!(index in path)) continue;
    const point = path[index];
    signature += `${Math.round(point.x * 10)}:${Math.round(point.y * 10)}`;
  }
  return signature;
};

export const displayCrossingClusterEdgeStateSignature = (
  edges: readonly Edge[],
  changedIndexes: readonly number[],
): string => changedIndexes
  .map(index => {
    const edge = edges[index];
    return `${index}:${String(edge.sourceHandle ?? '')}:${String(edge.targetHandle ?? '')}:${displayCrossingClusterPathSignature(getDisplayComputedPath(edge))}`;
  })
  .join(';');

export const firstDisplayCrossingClusterStrictHits = (
  segments: readonly DisplaySegment[],
  limit = 2,
): DisplayCrossingClusterStrictHit[] => {
  if (typeof limit !== 'number' || Number.isNaN(limit) || limit <= 0) return [];

  const hits: DisplayCrossingClusterStrictHit[] = [];
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      const first = segments[firstIndex];
      const second = segments[secondIndex];
      if (first.edgeIndex === second.edgeIndex || first.axis === second.axis) continue;
      const crosses = first.axis === 'h'
        ? displayStrictCrossesHorizontal(first.a, first.b, second)
        : displayStrictCrossesVertical(first.a, first.b, second);
      if (!crosses) continue;
      hits.push({ a: first, b: second });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
};

export const selectDisplayCrossingClusterOtherSegments = (
  segments: readonly DisplaySegment[],
  moverIndex: number,
): DisplaySegment[] => segments.filter(segment => segment.edgeIndex !== moverIndex);

export const displayCrossingClusterCrossingPairSignature = (
  segments: readonly DisplaySegment[],
): string => firstDisplayCrossingClusterStrictHits(segments)
  .map((hit) => {
    const firstIndex = Math.min(hit.a.edgeIndex, hit.b.edgeIndex);
    const secondIndex = Math.max(hit.a.edgeIndex, hit.b.edgeIndex);
    return `${firstIndex}:${secondIndex}`;
  })
  .sort()
  .join('|');
