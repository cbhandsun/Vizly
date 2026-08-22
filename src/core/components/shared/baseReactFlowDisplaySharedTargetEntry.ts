import type { Edge } from '@xyflow/react';

import { repairSharedTargetEntryCrossings } from '../../strategies/shared/edgeSharedTrunkSynthesis';

type SharedTargetEntryPoint = { x: number; y: number };
type SharedTargetEntrySegment = {
  a: SharedTargetEntryPoint;
  b: SharedTargetEntryPoint;
  axis: 'h' | 'v';
};

const EPSILON = 0.5;

const getPath = (edge: Edge): SharedTargetEntryPoint[] => {
  const treeRouting = edge.data?.treeRouting;
  const raw = edge.data?.computedPath
    || (treeRouting && typeof treeRouting === 'object' && 'points' in treeRouting
      ? treeRouting.points
      : []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((point: unknown) => {
      if (!point || typeof point !== 'object') return { x: Number.NaN, y: Number.NaN };
      const candidate = point as Record<string, unknown>;
      return { x: Number(candidate.x), y: Number(candidate.y) };
    })
    .filter((point: SharedTargetEntryPoint) => Number.isFinite(point.x) && Number.isFinite(point.y));
};

const getSegments = (edge: Edge): SharedTargetEntrySegment[] => {
  const path = getPath(edge);
  const segments: SharedTargetEntrySegment[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    const horizontal = Math.abs(a.y - b.y) <= EPSILON && Math.abs(a.x - b.x) > EPSILON;
    const vertical = Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) > EPSILON;
    if (horizontal || vertical) segments.push({ a, b, axis: horizontal ? 'h' : 'v' });
  }
  return segments;
};

const strictlyCross = (
  first: SharedTargetEntrySegment,
  second: SharedTargetEntrySegment,
): boolean => {
  if (first.axis === second.axis) return false;
  const horizontal = first.axis === 'h' ? first : second;
  const vertical = first.axis === 'v' ? first : second;
  const x = vertical.a.x;
  const y = horizontal.a.y;
  return x > Math.min(horizontal.a.x, horizontal.b.x) + EPSILON
    && x < Math.max(horizontal.a.x, horizontal.b.x) - EPSILON
    && y > Math.min(vertical.a.y, vertical.b.y) + EPSILON
    && y < Math.max(vertical.a.y, vertical.b.y) - EPSILON;
};

/** Exact no-op proof for the shared-target repair's own crossing geometry. */
export const hasSharedTargetEntryStrictCrossing = (edges: Edge[]): boolean => {
  const targetSegments = new Map<string, SharedTargetEntrySegment[][]>();
  for (const edge of edges) {
    if (!edge.target) continue;
    const segments = getSegments(edge);
    if (segments.length === 0) continue;
    const relatedPaths = targetSegments.get(edge.target);
    if (!relatedPaths) {
      targetSegments.set(edge.target, [segments]);
      continue;
    }
    for (const relatedSegments of relatedPaths) {
      for (const first of segments) {
        for (const second of relatedSegments) {
          if (strictlyCross(first, second)) return true;
        }
      }
    }
    relatedPaths.push(segments);
  }
  return false;
};

export const repairSharedTargetEntryStrictCrossingsIfNeeded = <T extends Edge[]>(
  edges: T,
  repair: (candidate: Edge[]) => Edge[] = repairSharedTargetEntryCrossings,
): T => hasSharedTargetEntryStrictCrossing(edges) ? repair(edges) as T : edges;
