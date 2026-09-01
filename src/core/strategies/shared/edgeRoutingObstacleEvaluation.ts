import type { Edge } from '@xyflow/react';
import { segmentIntersectsClearanceRect } from './edgeNodeClearanceGeometry';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type PaddedRectBounds = { x1: number; y1: number; x2: number; y2: number };
type SegmentHitReferenceEntry = Readonly<{
  ax: number;
  ay: number;
  bx: number;
  by: number;
  hitCount: number;
}>;
type SegmentHitReferenceCache = WeakMap<Point, WeakMap<Point, SegmentHitReferenceEntry>>;

export type RoutingObstacleHitEvaluation = Readonly<{
  endpointNodeTraversalHits: number;
  routingObstacleHits: number;
  unrelatedObstacleHits: number;
}>;

export type RoutingObstacleEvaluationContext = Readonly<{
  countEndpointNodeTraversalHits: (path: Point[]) => number;
  countPathHits: (path: Point[]) => number;
  countUnrelatedObstacleHits: (path: Point[], maximumHits?: number) => number;
  evaluate: (path: Point[]) => RoutingObstacleHitEvaluation;
  readMetrics: () => Readonly<{ cacheHitCount: number; scannedNodeCount: number }>;
}>;

const ENDPOINT_INTERIOR_TOLERANCE = 0.51;
const MAX_SEGMENT_HIT_CACHE_ENTRIES = 8_192;
const ORTHOGONAL_TOLERANCE = 0.5;

const paddedRectBounds = (rect: Rect, padding: number): PaddedRectBounds => ({
  x1: rect.x - padding,
  y1: rect.y - padding,
  x2: rect.x + rect.width + padding,
  y2: rect.y + rect.height + padding,
});

const retainSegmentHitResult = (
  segmentKey: string | null,
  segmentHitCache: Map<string, number> | undefined,
  segmentHitReferenceCache: SegmentHitReferenceCache | undefined,
  a: Point,
  b: Point,
  hitCount: number,
): void => {
  if (!segmentKey) return;
  if (segmentHitCache && segmentHitCache.size < MAX_SEGMENT_HIT_CACHE_ENTRIES) {
    segmentHitCache.set(segmentKey, hitCount);
  }
  if (!segmentHitReferenceCache) return;
  let byEndPoint = segmentHitReferenceCache.get(a);
  if (!byEndPoint) {
    byEndPoint = new WeakMap();
    segmentHitReferenceCache.set(a, byEndPoint);
  }
  byEndPoint.set(b, {
    ax: a.x,
    ay: a.y,
    bx: b.x,
    by: b.y,
    hitCount,
  });
};

const countPathRectHits = (
  path: Point[],
  rects: readonly PaddedRectBounds[],
  onNodeScan?: (count: number) => void,
  maximumHits?: number,
  segmentHitCache?: Map<string, number>,
  onCacheHit?: () => void,
  segmentHitReferenceCache?: SegmentHitReferenceCache,
): number => {
  const boundedMaximum = Number.isSafeInteger(maximumHits) && (maximumHits ?? -1) >= 0
    ? maximumHits
    : undefined;
  let hits = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    const deltaX = Math.abs(a.x - b.x);
    const deltaY = Math.abs(a.y - b.y);
    if (!(deltaX > ORTHOGONAL_TOLERANCE || deltaY > ORTHOGONAL_TOLERANCE)) continue;
    const referenceEntry = segmentHitReferenceCache?.get(a)?.get(b);
    if (
      referenceEntry
      && referenceEntry.ax === a.x
      && referenceEntry.ay === a.y
      && referenceEntry.bx === b.x
      && referenceEntry.by === b.y
    ) {
      onCacheHit?.();
      if (boundedMaximum !== undefined && hits + referenceEntry.hitCount > boundedMaximum) {
        return boundedMaximum + 1;
      }
      hits += referenceEntry.hitCount;
      continue;
    }
    const segmentKey = Number.isFinite(a.x)
      && Number.isFinite(a.y)
      && Number.isFinite(b.x)
      && Number.isFinite(b.y)
      ? `${a.x},${a.y}>${b.x},${b.y}`
      : null;
    const cachedSegmentHits = segmentKey ? segmentHitCache?.get(segmentKey) : undefined;
    if (typeof cachedSegmentHits === 'number') {
      retainSegmentHitResult(
        segmentKey,
        undefined,
        segmentHitReferenceCache,
        a,
        b,
        cachedSegmentHits,
      );
      onCacheHit?.();
      if (boundedMaximum !== undefined && hits + cachedSegmentHits > boundedMaximum) {
        return boundedMaximum + 1;
      }
      hits += cachedSegmentHits;
      continue;
    }
    const hitsBeforeSegment = hits;

    if (deltaY < ORTHOGONAL_TOLERANCE) {
      const y = a.y;
      const segmentStart = Math.min(a.x, b.x);
      const segmentEnd = Math.max(a.x, b.x);
      for (let rectIndex = 0; rectIndex < rects.length; rectIndex += 1) {
        const rect = rects[rectIndex];
        if (y <= rect.y1 || y >= rect.y2) continue;
        if (Math.max(segmentStart, rect.x1) < Math.min(segmentEnd, rect.x2)) {
          hits += 1;
          if (boundedMaximum !== undefined && hits > boundedMaximum) {
            onNodeScan?.(rectIndex + 1);
            return hits;
          }
        }
      }
      onNodeScan?.(rects.length);
      retainSegmentHitResult(
        segmentKey,
        segmentHitCache,
        segmentHitReferenceCache,
        a,
        b,
        hits - hitsBeforeSegment,
      );
      continue;
    }

    if (deltaX < ORTHOGONAL_TOLERANCE) {
      const x = a.x;
      const segmentStart = Math.min(a.y, b.y);
      const segmentEnd = Math.max(a.y, b.y);
      for (let rectIndex = 0; rectIndex < rects.length; rectIndex += 1) {
        const rect = rects[rectIndex];
        if (x <= rect.x1 || x >= rect.x2) continue;
        if (Math.max(segmentStart, rect.y1) < Math.min(segmentEnd, rect.y2)) {
          hits += 1;
          if (boundedMaximum !== undefined && hits > boundedMaximum) {
            onNodeScan?.(rectIndex + 1);
            return hits;
          }
        }
      }
      onNodeScan?.(rects.length);
      retainSegmentHitResult(
        segmentKey,
        segmentHitCache,
        segmentHitReferenceCache,
        a,
        b,
        hits - hitsBeforeSegment,
      );
      continue;
    }

    // Never silently discard a non-axis segment: the path-quality tolerance
    // may accept half-pixel terminal alignment while it crosses a real node.
    for (let rectIndex = 0; rectIndex < rects.length; rectIndex += 1) {
      const rect = rects[rectIndex];
      if (segmentIntersectsClearanceRect({ a, b }, {
        x: rect.x1, y: rect.y1, width: rect.x2 - rect.x1, height: rect.y2 - rect.y1,
      }, 0)) {
        hits += 1;
        if (boundedMaximum !== undefined && hits > boundedMaximum) {
          onNodeScan?.(rectIndex + 1);
          return hits;
        }
      }
    }
    onNodeScan?.(rects.length);
    retainSegmentHitResult(
      segmentKey,
      segmentHitCache,
      segmentHitReferenceCache,
      a,
      b,
      hits - hitsBeforeSegment,
    );
  }
  return hits;
};

export function createRoutingObstacleEvaluationContext(
  edge: Edge,
  obstacles: Map<string, Rect>,
): RoutingObstacleEvaluationContext {
  let scannedNodeCount = 0;
  let cacheHitCount = 0;
  const sourceId = edge.source;
  const targetId = edge.target;
  const unrelatedRects: PaddedRectBounds[] = [];
  for (const [nodeId, rect] of obstacles) {
    if (nodeId === sourceId || nodeId === targetId) continue;
    unrelatedRects.push(paddedRectBounds(rect, 8));
  }
  const endpointRects: PaddedRectBounds[] = [];
  for (const nodeId of new Set([sourceId, targetId])) {
    const rect = obstacles.get(nodeId);
    if (rect) endpointRects.push(paddedRectBounds(rect, -ENDPOINT_INTERIOR_TOLERANCE));
  }
  const routingRects = [...unrelatedRects, ...endpointRects];
  const unrelatedSegmentHits = new Map<string, number>();
  const endpointSegmentHits = new Map<string, number>();
  const routingSegmentHits = new Map<string, number>();
  const unrelatedSegmentHitsByReference: SegmentHitReferenceCache = new WeakMap();
  const endpointSegmentHitsByReference: SegmentHitReferenceCache = new WeakMap();
  const routingSegmentHitsByReference: SegmentHitReferenceCache = new WeakMap();
  const recordNodeScans = (count: number) => {
    scannedNodeCount += count;
  };
  const recordCacheHit = () => {
    cacheHitCount += 1;
  };
  const countUnrelatedPathHits = (path: Point[], maximumHits?: number): number => (
    countPathRectHits(
      path,
      unrelatedRects,
      recordNodeScans,
      maximumHits,
      unrelatedSegmentHits,
      recordCacheHit,
      unrelatedSegmentHitsByReference,
    )
  );
  const countEndpointPathHits = (path: Point[]): number => (
    countPathRectHits(
      path,
      endpointRects,
      recordNodeScans,
      undefined,
      endpointSegmentHits,
      recordCacheHit,
      endpointSegmentHitsByReference,
    )
  );

  return Object.freeze({
    countEndpointNodeTraversalHits: countEndpointPathHits,
    countPathHits: (path: Point[]): number => countPathRectHits(
      path,
      routingRects,
      undefined,
      undefined,
      routingSegmentHits,
      recordCacheHit,
      routingSegmentHitsByReference,
    ),
    countUnrelatedObstacleHits: countUnrelatedPathHits,
    readMetrics: () => ({ cacheHitCount, scannedNodeCount }),
    evaluate: (path: Point[]): RoutingObstacleHitEvaluation => {
      const unrelatedObstacleHits = countUnrelatedPathHits(path);
      const endpointNodeTraversalHits = countEndpointPathHits(path);
      return Object.freeze({
        endpointNodeTraversalHits,
        routingObstacleHits: unrelatedObstacleHits + endpointNodeTraversalHits,
        unrelatedObstacleHits,
      });
    },
  });
}

export function countUnrelatedObstacleHits(
  path: Point[],
  edge: Edge,
  obstacles: Map<string, Rect>,
  maximumHits?: number,
): number {
  return createRoutingObstacleEvaluationContext(edge, obstacles)
    .countUnrelatedObstacleHits(path, maximumHits);
}

/** Counts route segments that enter the open interior of their source or target node. */
export function countEndpointNodeTraversalHits(
  path: Point[],
  edge: Edge,
  obstacles: Map<string, Rect>,
): number {
  return createRoutingObstacleEvaluationContext(edge, obstacles).countEndpointNodeTraversalHits(path);
}

export function countRoutingObstacleHits(
  path: Point[],
  edge: Edge,
  obstacles: Map<string, Rect>,
): number {
  return createRoutingObstacleEvaluationContext(edge, obstacles).countPathHits(path);
}
