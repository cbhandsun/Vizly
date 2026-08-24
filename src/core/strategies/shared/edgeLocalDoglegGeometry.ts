import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import { createOrthogonalSegmentCrossingIndex } from './edgeLocalDoglegSegmentIndex';

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Axis = 'h' | 'v';
export type OrthogonalSegment = { a: Point; b: Point };
type PositionedNode = ReactFlowNode & { positionAbsolute?: Point };

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

export type EdgePathInteractionContext = {
  otherSegments: readonly OrthogonalSegment[];
  countCrossings: (
    segments: readonly OrthogonalSegment[],
    maximumInclusive?: number,
  ) => number;
  countParallelOverlap: (segments: readonly OrthogonalSegment[]) => number;
};

export type EdgeObstacleInteractionContext = {
  countPathHits: (path: readonly Point[]) => number;
  countSegmentHits: (
    segments: readonly OrthogonalSegment[],
    maximumInclusive?: number,
  ) => number;
};

export type LocalDoglegCandidateSnapshot = {
  path: Point[];
  segments: readonly OrthogonalSegment[];
  readonly length: number;
  readonly bends: number;
};

export type ChangedEdgePathEvaluationBuffer = {
  withPath: (path: Point[]) => Edge[];
};

export const EPS = 0.5;
export const MAX_LOCAL_DOGLEG_DEPTH = 72;
export const MAX_BROAD_DOGLEG_DEPTH = 520;
export const MAX_OPPOSITE_RETURN_DEPTH = MAX_BROAD_DOGLEG_DEPTH;
export const MIN_LENGTH_SAVING = 8;
export const MIN_CONTRACTED_OUTER_LANE = 48;
export const MIN_TERMINAL_STUB = 56;
export const MAX_TERMINAL_STUB_LENGTH_PENALTY = 128;
export const TINY_INTERIOR_SEGMENT = 24;
export const MIN_READABLE_SIDE_STEP = 48;
export const MAX_TINY_SIDE_STEP = 24;
export const MIN_TINY_CORNER_LANE_OFFSET = 32;
export const MAX_VISUAL_POLISH_LENGTH_PENALTY = 180;
export const MAX_TINY_CLEANUP_LENGTH_PENALTY = 640;
export const MAX_TINY_CLEANUP_RELATED_OVERLAP_PENALTY = 160;
export const MIN_ENDPOINT_CHANNEL_NOISE = 120;
export const OBSTACLE_PADDING = 8;
export const SIDE_MATCH_TOLERANCE = 8;
export const SIDE_INSET = 4;
export const MAX_HAIRPIN_COLLAPSE_BRIDGE = 104;
export const OUTER_LANE_CLEARANCES = [12, 24, 36, 48, 64, 96];

export const num = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

export function getEdgePath(edge: Edge): Point[] {
  const raw = edge.data?.computedPath || edge.data?.elkPath || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(point => {
      const candidate = asRecord(point);
      return { x: Number(candidate.x), y: Number(candidate.y) };
    })
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

export function withComputedPath(edge: Edge, path: Point[]): Edge {
  const data: Record<string, unknown> = { ...(edge.data || {}), computedPath: path, localDoglegRepaired: true };
  const treeRouting = asRecord(data.treeRouting);
  if (Array.isArray(treeRouting.points)) {
    data.treeRouting = { ...treeRouting, points: path };
  }
  return { ...edge, data };
}

export function edgesWithCurrentPaths(
  edges: Edge[],
  edgeKeys: string[],
  pathByEdgeKey: Map<string, Point[]>,
  override?: { index: number; path: Point[] },
): Edge[] {
  return edges.map((edge, index) => {
    const path = override?.index === index
      ? override.path
      : pathByEdgeKey.get(edgeKeys[index]) ?? getEdgePath(edge);
    return { ...edge, data: { ...(edge.data || {}), computedPath: path } };
  });
}

/**
 * Reuses one private candidate array and changed-edge clone while a synchronous
 * candidate loop evaluates alternative paths. Neither the baseline array nor
 * its edge/data objects are mutated. Callers must treat the returned array as
 * ephemeral because the next withPath call updates its computedPath in place.
 */
export function createChangedEdgePathEvaluationBuffer(
  baselineEdges: Edge[],
  changedIndex: number,
): ChangedEdgePathEvaluationBuffer {
  const candidateEdges = baselineEdges.slice();
  const baselineEdge = baselineEdges[changedIndex];
  if (!baselineEdge) return { withPath: () => candidateEdges };

  const candidateData: Record<string, unknown> = { ...((baselineEdge.data || {}) as Record<string, unknown>) };
  candidateEdges[changedIndex] = { ...baselineEdge, data: candidateData };
  return {
    withPath(path: Point[]): Edge[] {
      candidateData.computedPath = path;
      return candidateEdges;
    },
  };
}

export function axisOf(a: Point, b: Point): Axis | null {
  if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
}

export function compactPath(points: Point[]): Point[] {
  const deduped: Point[] = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.abs(previous.x - point.x) > EPS || Math.abs(previous.y - point.y) > EPS) {
      deduped.push({ x: Math.round(point.x), y: Math.round(point.y) });
    }
  }
  if (deduped.length <= 2) return deduped;

  const result: Point[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    const sameX = Math.abs(previous.x - current.x) <= EPS && Math.abs(current.x - next.x) <= EPS;
    const sameY = Math.abs(previous.y - current.y) <= EPS && Math.abs(current.y - next.y) <= EPS;
    if (!sameX && !sameY) result.push(current);
  }
  result.push(deduped[deduped.length - 1]);
  return result;
}

export function pathEquals(first: Point[], second: Point[]): boolean {
  return first.length === second.length
    && first.every((point, index) => (
      Math.abs(point.x - second[index]?.x) <= EPS && Math.abs(point.y - second[index]?.y) <= EPS
    ));
}

export function pathLength(points: Point[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.abs(points[index + 1].x - points[index].x) + Math.abs(points[index + 1].y - points[index].y);
  }
  return total;
}

export function segmentLength(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function terminalStubScore(points: Point[]): number {
  if (points.length < 2) return 0;
  const firstAxis = axisOf(points[0], points[1]);
  const lastAxis = axisOf(points[points.length - 2], points[points.length - 1]);
  const firstLength = firstAxis ? segmentLength(points[0], points[1]) : 0;
  const lastLength = lastAxis ? segmentLength(points[points.length - 2], points[points.length - 1]) : 0;
  if (!firstAxis && !lastAxis) return 0;
  if (!firstAxis) return lastLength;
  if (!lastAxis) return firstLength;
  return Math.min(firstLength, lastLength);
}

export function bendCount(points: Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previousAxis = axisOf(points[index - 1], points[index]);
    const nextAxis = axisOf(points[index], points[index + 1]);
    if (previousAxis && nextAxis && previousAxis !== nextAxis) total += 1;
  }
  return total;
}

export function localVisualNoise(points: Point[]): number {
  let tinySegments = 0;
  let hairpins = 0;
  const segments: Array<{ axis: Axis; direction: number; length: number }> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const axis = axisOf(points[index], points[index + 1]);
    if (!axis) continue;
    const length = segmentLength(points[index], points[index + 1]);
    if (index > 0 && index < points.length - 2 && length < TINY_INTERIOR_SEGMENT) {
      tinySegments += 1;
    }
    segments.push({
      axis,
      direction: axis === 'v'
        ? Math.sign(points[index + 1].y - points[index].y)
        : Math.sign(points[index + 1].x - points[index].x),
      length,
    });
  }

  for (let index = 0; index + 2 < segments.length; index += 1) {
    const first = segments[index];
    const middle = segments[index + 1];
    const last = segments[index + 2];
    if (
      first.axis === last.axis
      && first.axis !== middle.axis
      && first.direction !== 0
      && first.direction === -last.direction
      && middle.length < 112
    ) {
      hairpins += 1;
    }
  }

  return tinySegments * 20 + hairpins * 48;
}

export function hasTinyInteriorSegment(points: Point[]): boolean {
  for (let index = 1; index < points.length - 2; index += 1) {
    const axis = axisOf(points[index], points[index + 1]);
    if (!axis) continue;
    const length = segmentLength(points[index], points[index + 1]);
    if (length > EPS && length < TINY_INTERIOR_SEGMENT) return true;
  }
  return false;
}

export function toSegments(points: Point[]): OrthogonalSegment[] {
  const segments: OrthogonalSegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    if (axisOf(points[index], points[index + 1])) segments.push({ a: points[index], b: points[index + 1] });
  }
  return segments;
}

/**
 * Prepares candidate geometry once. Length and bend metrics stay lazy so an
 * obstacle rejection retains the previous short-circuit order and cost.
 */
export function createLocalDoglegCandidateSnapshot(points: Point[]): LocalDoglegCandidateSnapshot {
  const path = compactPath(points);
  const segments = toSegments(path);
  let cachedLength: number | undefined;
  let cachedBends: number | undefined;
  return {
    path,
    segments,
    get length(): number {
      cachedLength ??= pathLength(path);
      return cachedLength;
    },
    get bends(): number {
      cachedBends ??= bendCount(path);
      return cachedBends;
    },
  };
}

/**
 * Captures all orthogonal segments belonging to other edges once for a local
 * repair pass. Coordinates are copied so the context remains an immutable
 * snapshot even if a candidate builder mutates a source point in place.
 */
export function createEdgePathInteractionContext(
  edgeKey: string,
  pathByEdgeKey: Map<string, Point[]>,
): EdgePathInteractionContext {
  const otherSegments: OrthogonalSegment[] = [];
  for (const [otherKey, otherPath] of pathByEdgeKey) {
    if (otherKey === edgeKey) continue;
    for (const segment of toSegments(otherPath)) {
      otherSegments.push(Object.freeze({
        a: Object.freeze({ ...segment.a }),
        b: Object.freeze({ ...segment.b }),
      }));
    }
  }
  const crossingIndex = createOrthogonalSegmentCrossingIndex(otherSegments);
  return {
    otherSegments: Object.freeze(otherSegments),
    countCrossings(
      segments: readonly OrthogonalSegment[],
      maximumInclusive = Number.POSITIVE_INFINITY,
    ): number {
      if (crossingIndex) {
        const indexedCount = crossingIndex.countCrossings(segments, maximumInclusive);
        if (indexedCount !== null) return indexedCount;
      }
      let total = 0;
      for (const segment of segments) {
        for (const otherSegment of otherSegments) {
          if (strictCross(segment.a, segment.b, otherSegment.a, otherSegment.b)) total += 1;
          if (total > maximumInclusive) return total;
        }
      }
      return total;
    },
    countParallelOverlap(segments: readonly OrthogonalSegment[]): number {
      let total = 0;
      for (const segment of segments) {
        for (const otherSegment of otherSegments) {
          total += segmentParallelOverlap(segment, otherSegment);
        }
      }
      return Math.round(total);
    },
  };
}

export function nodeRect(node: ReactFlowNode | undefined): Rect | null {
  if (!node) return null;
  const position = (node as PositionedNode).positionAbsolute ?? node.position;
  const width = num(node.measured?.width ?? node.width ?? node.style?.width, 0);
  const height = num(node.measured?.height ?? node.height ?? node.style?.height, 0);
  if (width <= 1 || height <= 1) return null;
  return {
    x: num(position.x, 0),
    y: num(position.y, 0),
    width,
    height,
  };
}

export function getRoutingObstacles(nodes: ReactFlowNode[]): Map<string, Rect> {
  const ignoredTypes = new Set(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane']);
  const obstacles = new Map<string, Rect>();
  for (const node of nodes) {
    if (ignoredTypes.has(String(node.type || ''))) continue;
    const rect = nodeRect(node);
    if (rect) obstacles.set(node.id, rect);
  }
  return obstacles;
}

export function segmentIntersectsRect(a: Point, b: Point, rect: Rect, padding = OBSTACLE_PADDING): boolean {
  const axis = axisOf(a, b);
  if (!axis) return false;
  const x1 = rect.x - padding;
  const y1 = rect.y - padding;
  const x2 = rect.x + rect.width + padding;
  const y2 = rect.y + rect.height + padding;
  if (axis === 'h') {
    const y = a.y;
    if (y < y1 || y > y2) return false;
    return Math.max(Math.min(a.x, b.x), x1) < Math.min(Math.max(a.x, b.x), x2);
  }
  const x = a.x;
  if (x < x1 || x > x2) return false;
  return Math.max(Math.min(a.y, b.y), y1) < Math.min(Math.max(a.y, b.y), y2);
}

type PaddedObstacleBounds = Readonly<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}>;

type PaddedObstacleIndex = Readonly<{
  finiteBounds: readonly PaddedObstacleBounds[];
  nonFiniteBounds: readonly PaddedObstacleBounds[];
  byX1: readonly PaddedObstacleBounds[];
  byX2: readonly PaddedObstacleBounds[];
  byY1: readonly PaddedObstacleBounds[];
  byY2: readonly PaddedObstacleBounds[];
}>;

function upperBound(
  items: readonly PaddedObstacleBounds[],
  value: number,
  coordinate: 'x1' | 'y1',
): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (items[middle][coordinate] <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function lowerBound(
  items: readonly PaddedObstacleBounds[],
  value: number,
  coordinate: 'x2' | 'y2',
): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (items[middle][coordinate] < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function createPaddedObstacleIndex(bounds: readonly PaddedObstacleBounds[]): PaddedObstacleIndex {
  const finiteBounds: PaddedObstacleBounds[] = [];
  const nonFiniteBounds: PaddedObstacleBounds[] = [];
  for (const obstacle of bounds) {
    if (
      Number.isFinite(obstacle.x1)
      && Number.isFinite(obstacle.y1)
      && Number.isFinite(obstacle.x2)
      && Number.isFinite(obstacle.y2)
    ) finiteBounds.push(obstacle);
    else nonFiniteBounds.push(obstacle);
  }
  return {
    finiteBounds,
    nonFiniteBounds,
    byX1: [...finiteBounds].sort((first, second) => first.x1 - second.x1),
    byX2: [...finiteBounds].sort((first, second) => first.x2 - second.x2),
    byY1: [...finiteBounds].sort((first, second) => first.y1 - second.y1),
    byY2: [...finiteBounds].sort((first, second) => first.y2 - second.y2),
  };
}

function countHorizontalObstacleHits(
  fixed: number,
  minimum: number,
  maximum: number,
  index: PaddedObstacleIndex,
): number {
  const prefixEnd = upperBound(index.byY1, fixed, 'y1');
  const suffixStart = lowerBound(index.byY2, fixed, 'y2');
  let hits = 0;
  if (prefixEnd <= index.byY2.length - suffixStart) {
    for (let obstacleIndex = 0; obstacleIndex < prefixEnd; obstacleIndex += 1) {
      const obstacle = index.byY1[obstacleIndex];
      if (fixed > obstacle.y2) continue;
      if (Math.max(minimum, obstacle.x1) < Math.min(maximum, obstacle.x2)) hits += 1;
    }
  } else {
    for (let obstacleIndex = suffixStart; obstacleIndex < index.byY2.length; obstacleIndex += 1) {
      const obstacle = index.byY2[obstacleIndex];
      if (fixed < obstacle.y1) continue;
      if (Math.max(minimum, obstacle.x1) < Math.min(maximum, obstacle.x2)) hits += 1;
    }
  }
  for (const obstacle of index.nonFiniteBounds) {
    if (fixed < obstacle.y1 || fixed > obstacle.y2) continue;
    if (Math.max(minimum, obstacle.x1) < Math.min(maximum, obstacle.x2)) hits += 1;
  }
  return hits;
}

function countVerticalObstacleHits(
  fixed: number,
  minimum: number,
  maximum: number,
  index: PaddedObstacleIndex,
): number {
  const prefixEnd = upperBound(index.byX1, fixed, 'x1');
  const suffixStart = lowerBound(index.byX2, fixed, 'x2');
  let hits = 0;
  if (prefixEnd <= index.byX2.length - suffixStart) {
    for (let obstacleIndex = 0; obstacleIndex < prefixEnd; obstacleIndex += 1) {
      const obstacle = index.byX1[obstacleIndex];
      if (fixed > obstacle.x2) continue;
      if (Math.max(minimum, obstacle.y1) < Math.min(maximum, obstacle.y2)) hits += 1;
    }
  } else {
    for (let obstacleIndex = suffixStart; obstacleIndex < index.byX2.length; obstacleIndex += 1) {
      const obstacle = index.byX2[obstacleIndex];
      if (fixed < obstacle.x1) continue;
      if (Math.max(minimum, obstacle.y1) < Math.min(maximum, obstacle.y2)) hits += 1;
    }
  }
  for (const obstacle of index.nonFiniteBounds) {
    if (fixed < obstacle.x1 || fixed > obstacle.x2) continue;
    if (Math.max(minimum, obstacle.y1) < Math.min(maximum, obstacle.y2)) hits += 1;
  }
  return hits;
}

function countSegmentObstacleHits(
  a: Point,
  b: Point,
  index: PaddedObstacleIndex,
): number {
  const axis = axisOf(a, b);
  if (!axis) return 0;

  if (axis === 'h') {
    const fixed = a.y;
    const minimum = Math.min(a.x, b.x);
    const maximum = Math.max(a.x, b.x);
    return countHorizontalObstacleHits(fixed, minimum, maximum, index);
  }

  const fixed = a.x;
  const minimum = Math.min(a.y, b.y);
  const maximum = Math.max(a.y, b.y);
  return countVerticalObstacleHits(fixed, minimum, maximum, index);
}

/**
 * Captures the unrelated obstacle bounds for one edge. The source/target
 * exclusion and padding are resolved once, and only primitive coordinates are
 * retained so later Map or Rect mutations cannot alter candidate evaluation.
 */
export function createEdgeObstacleInteractionContext(
  edge: Edge,
  obstacles: Map<string, Rect>,
): EdgeObstacleInteractionContext {
  const bounds = Object.freeze(Array.from(obstacles, ([nodeId, rect]) => {
    if (nodeId === edge.source || nodeId === edge.target) return null;
    return Object.freeze({
      x1: rect.x - OBSTACLE_PADDING,
      y1: rect.y - OBSTACLE_PADDING,
      x2: rect.x + rect.width + OBSTACLE_PADDING,
      y2: rect.y + rect.height + OBSTACLE_PADDING,
    });
  }).filter((value): value is PaddedObstacleBounds => value !== null));
  const obstacleIndex = createPaddedObstacleIndex(bounds);

  return {
    countPathHits(path: readonly Point[]): number {
      let hits = 0;
      for (let index = 0; index < path.length - 1; index += 1) {
        hits += countSegmentObstacleHits(path[index], path[index + 1], obstacleIndex);
      }
      return hits;
    },
    countSegmentHits(
      segments: readonly OrthogonalSegment[],
      maximumInclusive = Number.POSITIVE_INFINITY,
    ): number {
      let hits = 0;
      for (const segment of segments) {
        hits += countSegmentObstacleHits(segment.a, segment.b, obstacleIndex);
        if (hits > maximumInclusive) return hits;
      }
      return hits;
    },
  };
}

export function pathHitsUnrelatedObstacle(path: Point[], edge: Edge, obstacles: Map<string, Rect>): boolean {
  return countUnrelatedObstacleHits(path, edge, obstacles) > 0;
}

export function countUnrelatedObstacleHits(path: Point[], edge: Edge, obstacles: Map<string, Rect>): number {
  return createEdgeObstacleInteractionContext(edge, obstacles).countPathHits(path);
}

export function slideEndpointOnSide(point: Point, rect: Rect | null, mainAxis: Axis, targetCoordinate: number): Point | null {
  if (!rect || !Number.isFinite(targetCoordinate)) return null;

  if (mainAxis === 'v') {
    const onHorizontalSide = Math.abs(point.y - rect.y) <= SIDE_MATCH_TOLERANCE
      || Math.abs(point.y - (rect.y + rect.height)) <= SIDE_MATCH_TOLERANCE;
    if (!onHorizontalSide) return null;
    const minX = rect.x + SIDE_INSET;
    const maxX = rect.x + rect.width - SIDE_INSET;
    if (targetCoordinate < minX || targetCoordinate > maxX) return null;
    return { x: Math.round(targetCoordinate), y: Math.round(point.y) };
  }

  const onVerticalSide = Math.abs(point.x - rect.x) <= SIDE_MATCH_TOLERANCE
    || Math.abs(point.x - (rect.x + rect.width)) <= SIDE_MATCH_TOLERANCE;
  if (!onVerticalSide) return null;
  const minY = rect.y + SIDE_INSET;
  const maxY = rect.y + rect.height - SIDE_INSET;
  if (targetCoordinate < minY || targetCoordinate > maxY) return null;
  return { x: Math.round(point.x), y: Math.round(targetCoordinate) };
}

export function strictCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const firstAxis = axisOf(a1, a2);
  const secondAxis = axisOf(b1, b2);
  if (!firstAxis || !secondAxis || firstAxis === secondAxis) return false;
  const h1 = firstAxis === 'h' ? a1 : b1;
  const h2 = firstAxis === 'h' ? a2 : b2;
  const v1 = firstAxis === 'v' ? a1 : b1;
  const v2 = firstAxis === 'v' ? a2 : b2;
  const x = v1.x;
  const y = h1.y;
  return x > Math.min(h1.x, h2.x) + 1
    && x < Math.max(h1.x, h2.x) - 1
    && y > Math.min(v1.y, v2.y) + 1
    && y < Math.max(v1.y, v2.y) - 1;
}

export function countCrossings(path: Point[], edgeKey: string, pathByEdgeKey: Map<string, Point[]>): number {
  return createEdgePathInteractionContext(edgeKey, pathByEdgeKey).countCrossings(toSegments(path));
}

export function countParallelOverlap(path: Point[], edgeKey: string, pathByEdgeKey: Map<string, Point[]>): number {
  return createEdgePathInteractionContext(edgeKey, pathByEdgeKey).countParallelOverlap(toSegments(path));
}

export function segmentParallelOverlap(first: OrthogonalSegment, second: OrthogonalSegment): number {
  const firstAxis = axisOf(first.a, first.b);
  const secondAxis = axisOf(second.a, second.b);
  if (!firstAxis || firstAxis !== secondAxis) return 0;
  if (firstAxis === 'v') {
    if (Math.abs(first.a.x - second.a.x) > EPS) return 0;
    return Math.max(0, Math.min(Math.max(first.a.y, first.b.y), Math.max(second.a.y, second.b.y))
      - Math.max(Math.min(first.a.y, first.b.y), Math.min(second.a.y, second.b.y)));
  }
  if (Math.abs(first.a.y - second.a.y) > EPS) return 0;
  return Math.max(0, Math.min(Math.max(first.a.x, first.b.x), Math.max(second.a.x, second.b.x))
    - Math.max(Math.min(first.a.x, first.b.x), Math.min(second.a.x, second.b.x)));
}

export function hasSameEndpoints(first: Point[], second: Point[]): boolean {
  const firstStart = first[0];
  const firstEnd = first[first.length - 1];
  const secondStart = second[0];
  const secondEnd = second[second.length - 1];
  return !!firstStart && !!firstEnd && !!secondStart && !!secondEnd
    && Math.abs(firstStart.x - secondStart.x) <= EPS
    && Math.abs(firstStart.y - secondStart.y) <= EPS
    && Math.abs(firstEnd.x - secondEnd.x) <= EPS
    && Math.abs(firstEnd.y - secondEnd.y) <= EPS;
}

export function hasLocalDoglegRisk(points: Point[]): boolean {
  if (points.length < 4) return false;
  if (localVisualNoise(points) > 0 || hasTinyInteriorSegment(points)) return true;

  const firstAxis = axisOf(points[0], points[1]);
  const lastAxis = axisOf(points[points.length - 2], points[points.length - 1]);
  if (
    (firstAxis && segmentLength(points[0], points[1]) < MIN_TERMINAL_STUB)
    || (lastAxis && segmentLength(points[points.length - 2], points[points.length - 1]) < MIN_TERMINAL_STUB)
  ) {
    return true;
  }

  const segments: Array<{ axis: Axis; direction: number; length: number }> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const axis = axisOf(points[index], points[index + 1]);
    if (!axis) continue;
    segments.push({
      axis,
      direction: axis === 'v'
        ? Math.sign(points[index + 1].y - points[index].y)
        : Math.sign(points[index + 1].x - points[index].x),
      length: segmentLength(points[index], points[index + 1]),
    });
  }

  for (let index = 0; index + 2 < segments.length; index += 1) {
    const first = segments[index];
    const middle = segments[index + 1];
    const last = segments[index + 2];
    if (first.axis !== last.axis || first.axis === middle.axis) continue;
    if (first.direction !== 0 && first.direction === -last.direction) return true;
    if (
      first.direction !== 0
      && first.direction === last.direction
      && middle.length <= MAX_LOCAL_DOGLEG_DEPTH
    ) {
      return true;
    }
  }

  return false;
}
