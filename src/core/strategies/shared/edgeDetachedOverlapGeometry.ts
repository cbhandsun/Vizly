import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Axis = 'h' | 'v';
type PositionedNode = ReactFlowNode & { positionAbsolute?: Point };

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

export type Segment = {
  a: Point;
  b: Point;
  axis: Axis;
};

export type PathSegmentRef = Segment & {
  edgeId: string;
  edgeIndex: number;
  segIdx: number;
  pointCount: number;
  fromStart: number;
  fromEnd: number;
};

type DetachedOverlapHit = {
  a: PathSegmentRef;
  b: PathSegmentRef;
  overlap: number;
};

export type StrictCrossingHit = {
  a: PathSegmentRef;
  b: PathSegmentRef;
};

export type StrictCrossingSegmentIndex = Readonly<{
  horizontal: readonly PathSegmentRef[];
  vertical: readonly PathSegmentRef[];
  horizontalByY: readonly PathSegmentRef[];
  verticalByX: readonly PathSegmentRef[];
}>;

export const EPS = 0.5;
const VISUAL_PARALLEL_LANE_TOLERANCE = 4;
const SHARED_TRUNK_COORDINATE_EPS = VISUAL_PARALLEL_LANE_TOLERANCE;
const ENDPOINT_TRUNK_WINDOW = 160;

const num = (value: unknown, fallback: number): number => (
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
  const data: Record<string, unknown> = { ...(edge.data || {}), computedPath: path, detachedOverlapSeparated: true };
  const treeRouting = asRecord(data.treeRouting);
  if (Array.isArray(treeRouting.points)) {
    data.treeRouting = { ...treeRouting, points: path };
  }
  return { ...edge, data };
}

export function axisOf(a: Point, b: Point): Axis | null {
  if (Math.abs(a.y - b.y) < EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
}

export function pointNear(a: Point, b: Point, tolerance = 1): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
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

export function allSegmentsOrthogonal(path: Point[]): boolean {
  if (path.length < 2) return false;
  for (let index = 0; index < path.length - 1; index += 1) {
    if (!axisOf(path[index], path[index + 1])) return false;
  }
  return true;
}

export function pathEquals(first: Point[], second: Point[]): boolean {
  return first.length === second.length
    && first.every((point, index) => (
      Math.abs(point.x - second[index]?.x) <= EPS && Math.abs(point.y - second[index]?.y) <= EPS
    ));
}

function rangeOverlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2))
    - Math.max(Math.min(a1, a2), Math.min(b1, b2)));
}

export function segmentOverlap(first: Segment, second: Segment): number {
  if (first.axis !== second.axis) return 0;
  if (first.axis === 'h') {
    if (Math.abs(first.a.y - second.a.y) > VISUAL_PARALLEL_LANE_TOLERANCE) return 0;
    return rangeOverlap(first.a.x, first.b.x, second.a.x, second.b.x);
  }
  if (Math.abs(first.a.x - second.a.x) > VISUAL_PARALLEL_LANE_TOLERANCE) return 0;
  return rangeOverlap(first.a.y, first.b.y, second.a.y, second.b.y);
}

export function strictCross(first: Segment, second: Segment): boolean {
  if (first.axis === second.axis) return false;
  const h = first.axis === 'h' ? first : second;
  const v = first.axis === 'v' ? first : second;
  const x = v.a.x;
  const y = h.a.y;
  return x > Math.min(h.a.x, h.b.x) + EPS
    && x < Math.max(h.a.x, h.b.x) - EPS
    && y > Math.min(v.a.y, v.b.y) + EPS
    && y < Math.max(v.a.y, v.b.y) - EPS;
}

export function nodeRect(node: ReactFlowNode | undefined): Rect | null {
  if (!node) return null;
  const pos = (node as PositionedNode).positionAbsolute ?? node.position;
  const width = num(node.measured?.width ?? node.width ?? node.style?.width, 0);
  const height = num(node.measured?.height ?? node.height ?? node.style?.height, 0);
  if (width <= 1 || height <= 1) return null;
  return { x: num(pos.x, 0), y: num(pos.y, 0), width, height };
}

export function getRoutingObstacles(nodes: ReactFlowNode[]): Map<string, Rect> {
  const ignoredTypes = new Set(['titleGroup', 'subGroup', 'group', 'domain']);
  const obstacles = new Map<string, Rect>();
  for (const node of nodes) {
    if (ignoredTypes.has(String(node.type || ''))) continue;
    const rect = nodeRect(node);
    if (rect) obstacles.set(node.id, rect);
  }
  return obstacles;
}

export function segmentIntersectsRect(segment: Segment, rect: Rect, padding = 12): boolean {
  const x1 = rect.x - padding;
  const y1 = rect.y - padding;
  const x2 = rect.x + rect.width + padding;
  const y2 = rect.y + rect.height + padding;
  if (segment.axis === 'h') {
    const y = segment.a.y;
    if (y < y1 || y > y2) return false;
    return Math.max(Math.min(segment.a.x, segment.b.x), x1) < Math.min(Math.max(segment.a.x, segment.b.x), x2);
  }
  const x = segment.a.x;
  if (x < x1 || x > x2) return false;
  return Math.max(Math.min(segment.a.y, segment.b.y), y1) < Math.min(Math.max(segment.a.y, segment.b.y), y2);
}

export function pathLength(points: Point[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.abs(points[index + 1].x - points[index].x) + Math.abs(points[index + 1].y - points[index].y);
  }
  return total;
}

export function extractPathSegmentRefs(paths: Point[][], edges: Edge[]): PathSegmentRef[] {
  const refs: PathSegmentRef[] = [];
  paths.forEach((path, edgeIndex) => {
    const segmentLengths: number[] = [];
    let totalLength = 0;
    for (let segIdx = 0; segIdx < path.length - 1; segIdx += 1) {
      const length = Math.abs(path[segIdx].x - path[segIdx + 1].x) + Math.abs(path[segIdx].y - path[segIdx + 1].y);
      segmentLengths.push(length);
      totalLength += length;
    }

    let fromStart = 0;
    for (let segIdx = 0; segIdx < path.length - 1; segIdx += 1) {
      const a = path[segIdx];
      const b = path[segIdx + 1];
      const axis = axisOf(a, b);
      const segmentLength = segmentLengths[segIdx] ?? 0;
      if (axis && segmentLength >= 8) {
        refs.push({
          edgeId: edges[edgeIndex]?.id || `edge-${edgeIndex}`,
          edgeIndex,
          segIdx,
          pointCount: path.length,
          a,
          b,
          axis,
          fromStart,
          fromEnd: Math.max(0, totalLength - fromStart - segmentLength),
        });
      }
      fromStart += segmentLength;
    }
  });
  return refs;
}

export function isEndpointSharedTrunkOverlap(
  first: PathSegmentRef,
  second: PathSegmentRef,
  edges: Edge[],
  _overlap: number,
  firstEdgeSegments: readonly PathSegmentRef[] = [first],
  secondEdgeSegments: readonly PathSegmentRef[] = [second],
): boolean {
  const firstEdge = edges[first.edgeIndex];
  const secondEdge = edges[second.edgeIndex];
  if (!firstEdge || !secondEdge) return false;
  const samePoint = (firstPoint: Point, secondPoint: Point): boolean => (
    Math.abs(firstPoint.x - secondPoint.x) <= SHARED_TRUNK_COORDINATE_EPS
    && Math.abs(firstPoint.y - secondPoint.y) <= SHARED_TRUNK_COORDINATE_EPS
  );
  const chainContains = (target: boolean): boolean => {
    const firstOffset = target ? first.pointCount - 2 - first.segIdx : first.segIdx;
    const secondOffset = target ? second.pointCount - 2 - second.segIdx : second.segIdx;
    if (firstOffset !== secondOffset || firstOffset < 0) return false;
    for (let offset = 0; offset <= firstOffset; offset += 1) {
      const firstIndex = target ? first.pointCount - 2 - offset : offset;
      const secondIndex = target ? second.pointCount - 2 - offset : offset;
      const firstPart = firstEdgeSegments.find(segment => segment.segIdx === firstIndex);
      const secondPart = secondEdgeSegments.find(segment => segment.segIdx === secondIndex);
      if (!firstPart || !secondPart || firstPart.axis !== secondPart.axis) return false;
      const [firstStart, firstEnd] = target
        ? [firstPart.b, firstPart.a]
        : [firstPart.a, firstPart.b];
      const [secondStart, secondEnd] = target
        ? [secondPart.b, secondPart.a]
        : [secondPart.a, secondPart.b];
      if (!samePoint(firstStart, secondStart)) return false;
      const firstDelta = firstPart.axis === 'h'
        ? firstEnd.x - firstStart.x
        : firstEnd.y - firstStart.y;
      const secondDelta = secondPart.axis === 'h'
        ? secondEnd.x - secondStart.x
        : secondEnd.y - secondStart.y;
      if (firstDelta * secondDelta <= EPS) return false;
      if (offset < firstOffset && !samePoint(firstEnd, secondEnd)) return false;
    }
    return true;
  };
  return (firstEdge.source === secondEdge.source && chainContains(false))
    || (firstEdge.target === secondEdge.target && chainContains(true));
}

export function isReversePairOverlap(first: PathSegmentRef, second: PathSegmentRef, edges: Edge[]): boolean {
  const firstEdge = edges[first.edgeIndex];
  const secondEdge = edges[second.edgeIndex];
  return !!(
    firstEdge
    && secondEdge
    && firstEdge.source === secondEdge.target
    && firstEdge.target === secondEdge.source
  );
}

export function sharesAnyEndpoint(first: PathSegmentRef, second: PathSegmentRef, edges: Edge[]): boolean {
  const firstEdge = edges[first.edgeIndex];
  const secondEdge = edges[second.edgeIndex];
  return !!(
    firstEdge
    && secondEdge
    && (
      firstEdge.source === secondEdge.source
      || firstEdge.source === secondEdge.target
      || firstEdge.target === secondEdge.source
      || firstEdge.target === secondEdge.target
    )
  );
}

export function segmentAxisDirection(segment: Segment): number {
  return segment.axis === 'v'
    ? Math.sign(segment.b.y - segment.a.y)
    : Math.sign(segment.b.x - segment.a.x);
}

export function segmentDirection(segment: PathSegmentRef): number {
  return segmentAxisDirection(segment);
}

export function segmentsRunOppositeDirections(first: PathSegmentRef, second: PathSegmentRef): boolean {
  return segmentDirection(first) * segmentDirection(second) < 0;
}

export function isOppositeEndpointOverlap(hit: DetachedOverlapHit, edges: Edge[]): boolean {
  if (segmentDirection(hit.a) * segmentDirection(hit.b) >= 0) return false;
  const firstEdge = edges[hit.a.edgeIndex];
  const secondEdge = edges[hit.b.edgeIndex];
  if (!firstEdge || !secondEdge) return false;

  return (
    firstEdge.target === secondEdge.source
    && hit.a.fromEnd <= ENDPOINT_TRUNK_WINDOW
    && hit.b.fromStart <= ENDPOINT_TRUNK_WINDOW
  ) || (
    firstEdge.source === secondEdge.target
    && hit.a.fromStart <= ENDPOINT_TRUNK_WINDOW
    && hit.b.fromEnd <= ENDPOINT_TRUNK_WINDOW
  );
}

export function extractPathSegmentRefsForPath(path: Point[], edgeIndex: number, edges: Edge[]): PathSegmentRef[] {
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let segIdx = 0; segIdx < path.length - 1; segIdx += 1) {
    const length = Math.abs(path[segIdx].x - path[segIdx + 1].x) + Math.abs(path[segIdx].y - path[segIdx + 1].y);
    segmentLengths.push(length);
    totalLength += length;
  }

  const refs: PathSegmentRef[] = [];
  let fromStart = 0;
  for (let segIdx = 0; segIdx < path.length - 1; segIdx += 1) {
    const a = path[segIdx];
    const b = path[segIdx + 1];
    const axis = axisOf(a, b);
    const segmentLength = segmentLengths[segIdx] ?? 0;
    if (axis && segmentLength >= 8) {
      refs.push({
        edgeId: edges[edgeIndex]?.id || `edge-${edgeIndex}`,
        edgeIndex,
        segIdx,
        pointCount: path.length,
        a,
        b,
        axis,
        fromStart,
        fromEnd: Math.max(0, totalLength - fromStart - segmentLength),
      });
    }
    fromStart += segmentLength;
  }
  return refs;
}

export function createStrictCrossingSegmentIndex(
  segments: readonly PathSegmentRef[],
): StrictCrossingSegmentIndex {
  const horizontal: PathSegmentRef[] = [];
  const vertical: PathSegmentRef[] = [];
  for (const segment of segments) {
    (segment.axis === 'h' ? horizontal : vertical).push(segment);
  }
  return {
    horizontal,
    vertical,
    horizontalByY: [...horizontal].sort((first, second) => first.a.y - second.a.y),
    verticalByX: [...vertical].sort((first, second) => first.a.x - second.a.x),
  };
}

const firstCoordinateAbove = (
  segments: readonly PathSegmentRef[],
  value: number,
  coordinate: (segment: PathSegmentRef) => number,
): number => {
  let lower = 0;
  let upper = segments.length;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (coordinate(segments[middle]) <= value) lower = middle + 1;
    else upper = middle;
  }
  return lower;
};

const strictCrossingCandidates = (
  segment: PathSegmentRef,
  segmentIndex: StrictCrossingSegmentIndex,
): readonly PathSegmentRef[] => {
  const perpendicularSegments = segment.axis === 'h'
    ? segmentIndex.verticalByX
    : segmentIndex.horizontalByY;
  const coordinate = segment.axis === 'h'
    ? (candidate: PathSegmentRef) => candidate.a.x
    : (candidate: PathSegmentRef) => candidate.a.y;
  const start = segment.axis === 'h'
    ? Math.min(segment.a.x, segment.b.x) + EPS
    : Math.min(segment.a.y, segment.b.y) + EPS;
  const end = segment.axis === 'h'
    ? Math.max(segment.a.x, segment.b.x) - EPS
    : Math.max(segment.a.y, segment.b.y) - EPS;
  if (end <= start) return [];

  const first = firstCoordinateAbove(perpendicularSegments, start, coordinate);
  let last = first;
  while (last < perpendicularSegments.length && coordinate(perpendicularSegments[last]) < end) {
    last += 1;
  }
  return perpendicularSegments.slice(first, last);
};

export function strictCrossingsForEdgeSegments(
  candidateSegments: PathSegmentRef[],
  allSegments: PathSegmentRef[],
  edgeIndex: number,
  segmentIndex = createStrictCrossingSegmentIndex(allSegments),
): number {
  let total = 0;
  for (const candidate of candidateSegments) {
    for (const other of strictCrossingCandidates(candidate, segmentIndex)) {
      if (other.edgeIndex === edgeIndex) continue;
      if (strictCross(candidate, other)) total += 1;
    }
  }
  return total;
}

export function findDetachedParallelOverlaps(paths: Point[][], edges: Edge[], minOverlap = 96): DetachedOverlapHit[] {
  const segments = extractPathSegmentRefs(paths, edges);
  const segmentsByEdgeIndex = new Map<number, PathSegmentRef[]>();
  for (const segment of segments) {
    const current = segmentsByEdgeIndex.get(segment.edgeIndex) ?? [];
    current.push(segment);
    segmentsByEdgeIndex.set(segment.edgeIndex, current);
  }
  const hits: DetachedOverlapHit[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const first = segments[i];
      const second = segments[j];
      if (first.edgeIndex === second.edgeIndex || first.axis !== second.axis) continue;
      const overlap = segmentOverlap(first, second);
      if (isEndpointSharedTrunkOverlap(
        first,
        second,
        edges,
        overlap,
        segmentsByEdgeIndex.get(first.edgeIndex),
        segmentsByEdgeIndex.get(second.edgeIndex),
      )) continue;
      if (overlap >= minOverlap) hits.push({ a: first, b: second, overlap });
    }
  }
  return hits.sort((a, b) => hitRepairPriority(b, edges) - hitRepairPriority(a, edges));
}

export function scoreActionableDetachedOverlaps(
  paths: Point[][],
  edges: Edge[],
  minOverlap: number,
): number {
  let score = 0;
  for (const hit of findDetachedParallelOverlaps(paths, edges, minOverlap)) {
    const oppositeDirection = segmentsRunOppositeDirections(hit.a, hit.b);
    const unrelated = !sharesAnyEndpoint(hit.a, hit.b, edges);
    if (!oppositeDirection && !unrelated) continue;
    score += Math.ceil(hit.overlap) * 100 + 1;
    if (unrelated) score += 100_000;
    if (oppositeDirection) score += 1_000_000;
  }
  return score;
}

function hitRepairPriority(hit: DetachedOverlapHit, edges: Edge[]): number {
  const firstEdge = edges[hit.a.edgeIndex];
  const secondEdge = edges[hit.b.edgeIndex];
  const oppositeDirection = segmentsRunOppositeDirections(hit.a, hit.b);
  const reversePair = isReversePairOverlap(hit.a, hit.b, edges);
  const unrelated = !sharesAnyEndpoint(hit.a, hit.b, edges);
  const flowThroughEndpoint = !!(
    firstEdge
    && secondEdge
    && (
      firstEdge.target === secondEdge.source
      || firstEdge.source === secondEdge.target
    )
  );

  return hit.overlap
    + (oppositeDirection ? 10_000 : 0)
    + (reversePair ? 5_000 : 0)
    + (unrelated ? 3_000 : 0)
    + (flowThroughEndpoint ? 2_000 : 0);
}

export function findStrictCrossings(paths: Point[][], edges: Edge[]): StrictCrossingHit[] {
  const segments = extractPathSegmentRefs(paths, edges);
  const segmentIndex = createStrictCrossingSegmentIndex(segments);
  const { horizontal: horizontalSegments } = segmentIndex;
  const segmentOrder = new Map(segments.map((segment, index) => [segment, index] as const));
  const hits: StrictCrossingHit[] = [];
  for (const horizontal of horizontalSegments) {
    for (const vertical of strictCrossingCandidates(horizontal, segmentIndex)) {
      if (horizontal.edgeIndex === vertical.edgeIndex) continue;
      if (!strictCross(horizontal, vertical)) continue;
      const horizontalOrder = segmentOrder.get(horizontal) ?? 0;
      const verticalOrder = segmentOrder.get(vertical) ?? 0;
      hits.push(horizontalOrder < verticalOrder
        ? { a: horizontal, b: vertical }
        : { a: vertical, b: horizontal });
    }
  }
  return hits.sort((first, second) => {
    const firstA = segmentOrder.get(first.a) ?? 0;
    const secondA = segmentOrder.get(second.a) ?? 0;
    if (firstA !== secondA) return firstA - secondA;
    return (segmentOrder.get(first.b) ?? 0) - (segmentOrder.get(second.b) ?? 0);
  });
}
