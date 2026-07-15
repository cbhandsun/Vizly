export type ReverseOverlapPoint = Readonly<{
  x: number;
  y: number;
}>;

export type ReverseOverlapAxis = 'h' | 'v';

export type ReverseOverlapSegmentRef = Readonly<{
  segmentIndex: number;
  axis: ReverseOverlapAxis;
  a: ReverseOverlapPoint;
  b: ReverseOverlapPoint;
}>;

const EPSILON = 0.5;
const NEAR_LANE_TOLERANCE = 4;
const LANE_GAP = 24;

const coordinatesMatch = (first: number, second: number): boolean => (
  Math.abs(first - second) <= EPSILON
);

const pointsMatch = (first: ReverseOverlapPoint, second: ReverseOverlapPoint): boolean => (
  coordinatesMatch(first.x, second.x) && coordinatesMatch(first.y, second.y)
);

const axisOf = (
  first: ReverseOverlapPoint,
  second: ReverseOverlapPoint,
): ReverseOverlapAxis | null => {
  if (coordinatesMatch(first.y, second.y) && !coordinatesMatch(first.x, second.x)) return 'h';
  if (coordinatesMatch(first.x, second.x) && !coordinatesMatch(first.y, second.y)) return 'v';
  return null;
};

const isFinitePoint = (point: ReverseOverlapPoint): boolean => (
  Number.isFinite(point.x) && Number.isFinite(point.y)
);

const isOrthogonalPath = (path: readonly ReverseOverlapPoint[]): boolean => (
  path.length >= 2
  && path.every(isFinitePoint)
  && path.slice(0, -1).every((point, index) => axisOf(point, path[index + 1]) !== null)
);

const compactPath = (path: readonly ReverseOverlapPoint[]): ReverseOverlapPoint[] => {
  const deduped: ReverseOverlapPoint[] = [];
  for (const point of path) {
    const previous = deduped[deduped.length - 1];
    if (!previous || !pointsMatch(previous, point)) deduped.push({ x: point.x, y: point.y });
  }
  if (deduped.length < 3) return deduped;

  const compacted: ReverseOverlapPoint[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = compacted[compacted.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    const incomingAxis = axisOf(previous, current);
    if (incomingAxis && incomingAxis === axisOf(current, next)) continue;
    compacted.push(current);
  }
  compacted.push(deduped[deduped.length - 1]);
  return compacted;
};

const segmentMatchesPath = (
  path: readonly ReverseOverlapPoint[],
  segment: ReverseOverlapSegmentRef,
): boolean => {
  if (
    !Number.isInteger(segment.segmentIndex)
    || segment.segmentIndex < 0
    || segment.segmentIndex >= path.length - 1
  ) return false;
  const start = path[segment.segmentIndex];
  const end = path[segment.segmentIndex + 1];
  return axisOf(start, end) === segment.axis
    && pointsMatch(start, segment.a)
    && pointsMatch(end, segment.b);
};

const laneOf = (segment: ReverseOverlapSegmentRef): number => (
  segment.axis === 'h' ? segment.a.y : segment.a.x
);

const mainCoordinate = (point: ReverseOverlapPoint, axis: ReverseOverlapAxis): number => (
  axis === 'h' ? point.x : point.y
);

const segmentDirection = (segment: ReverseOverlapSegmentRef): -1 | 0 | 1 => (
  Math.sign(mainCoordinate(segment.b, segment.axis) - mainCoordinate(segment.a, segment.axis)) as -1 | 0 | 1
);

const overlapLength = (
  first: ReverseOverlapSegmentRef,
  second: ReverseOverlapSegmentRef,
): number => {
  const firstMin = Math.min(mainCoordinate(first.a, first.axis), mainCoordinate(first.b, first.axis));
  const firstMax = Math.max(mainCoordinate(first.a, first.axis), mainCoordinate(first.b, first.axis));
  const secondMin = Math.min(mainCoordinate(second.a, second.axis), mainCoordinate(second.b, second.axis));
  const secondMax = Math.max(mainCoordinate(second.a, second.axis), mainCoordinate(second.b, second.axis));
  return Math.max(0, Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin));
};

const shiftInternalSegment = (
  path: readonly ReverseOverlapPoint[],
  segment: ReverseOverlapSegmentRef,
  lane: number,
): ReverseOverlapPoint[] => {
  const shifted = path.map(point => ({ x: point.x, y: point.y }));
  if (segment.axis === 'h') {
    shifted[segment.segmentIndex].y = lane;
    shifted[segment.segmentIndex + 1].y = lane;
  } else {
    shifted[segment.segmentIndex].x = lane;
    shifted[segment.segmentIndex + 1].x = lane;
  }
  return compactPath(shifted);
};

const buildSourceAxisAlignmentCandidate = (
  path: readonly ReverseOverlapPoint[],
  segment: ReverseOverlapSegmentRef,
  preferredSourceAxis: ReverseOverlapAxis | undefined,
): ReverseOverlapPoint[] | null => {
  if (segment.segmentIndex !== 1 || segment.axis !== preferredSourceAxis) return null;
  const sourceLane = segment.axis === 'h' ? path[0]?.y : path[0]?.x;
  if (!Number.isFinite(sourceLane) || coordinatesMatch(sourceLane, laneOf(segment))) return null;
  return shiftInternalSegment(path, segment, sourceLane);
};

const buildSourceSideOuterBypass = (
  path: readonly ReverseOverlapPoint[],
  segment: ReverseOverlapSegmentRef,
  other: ReverseOverlapSegmentRef,
): ReverseOverlapPoint[] | null => {
  const index = segment.segmentIndex;
  const before = path[index - 1];
  const start = path[index];
  const end = path[index + 1];
  const after = path[index + 2];
  if (!before || !start || !end || !after) return null;

  const perpendicularAxis: ReverseOverlapAxis = segment.axis === 'h' ? 'v' : 'h';
  if (axisOf(before, start) !== perpendicularAxis || axisOf(end, after) !== perpendicularAxis) {
    return null;
  }

  const otherLane = laneOf(other);
  const beforeLane = segment.axis === 'h' ? before.y : before.x;
  const sourceSideDirection = Math.sign(beforeLane - otherLane);
  const travelDirection = segmentDirection(segment);
  if (sourceSideDirection === 0 || travelDirection === 0) return null;

  const sourceSideLane = otherLane + sourceSideDirection * LANE_GAP;
  const otherStartMain = mainCoordinate(other.a, other.axis);
  const otherEndMain = mainCoordinate(other.b, other.axis);
  const exitMain = travelDirection > 0
    ? Math.max(otherStartMain, otherEndMain) + LANE_GAP
    : Math.min(otherStartMain, otherEndMain) - LANE_GAP;
  if (!Number.isFinite(sourceSideLane) || !Number.isFinite(exitMain)) return null;

  if (segment.axis === 'h') {
    return compactPath([
      ...path.slice(0, index),
      { x: start.x, y: sourceSideLane },
      { x: exitMain, y: sourceSideLane },
      { x: exitMain, y: after.y },
      after,
      ...path.slice(index + 3),
    ]);
  }
  return compactPath([
    ...path.slice(0, index),
    { x: sourceSideLane, y: start.y },
    { x: sourceSideLane, y: exitMain },
    { x: after.x, y: exitMain },
    after,
    ...path.slice(index + 3),
  ]);
};

const buildSourceDirectionAdjacentOuterLane = (
  path: readonly ReverseOverlapPoint[],
  segment: ReverseOverlapSegmentRef,
  other: ReverseOverlapSegmentRef,
  otherPath: readonly ReverseOverlapPoint[] | undefined,
): ReverseOverlapPoint[] | null => {
  if (!otherPath || !segmentMatchesPath(otherPath, other)) return null;
  const before = path[segment.segmentIndex - 1];
  const start = path[segment.segmentIndex];
  if (!before || !start) return null;
  const perpendicularAxis: ReverseOverlapAxis = segment.axis === 'h' ? 'v' : 'h';
  if (axisOf(before, start) !== perpendicularAxis) return null;
  const sourceDirection = segment.axis === 'h'
    ? Math.sign(start.y - before.y)
    : Math.sign(start.x - before.x);
  if (sourceDirection === 0) return null;

  const segmentMinMain = Math.min(mainCoordinate(segment.a, segment.axis), mainCoordinate(segment.b, segment.axis));
  const segmentMaxMain = Math.max(mainCoordinate(segment.a, segment.axis), mainCoordinate(segment.b, segment.axis));
  const adjacentCoordinates: number[] = [];
  for (let index = 0; index < otherPath.length - 1; index += 1) {
    const adjacentStart = otherPath[index];
    const adjacentEnd = otherPath[index + 1];
    if (axisOf(adjacentStart, adjacentEnd) !== perpendicularAxis) continue;
    const crossingMain = segment.axis === 'h' ? adjacentStart.x : adjacentStart.y;
    if (crossingMain < segmentMinMain - EPSILON || crossingMain > segmentMaxMain + EPSILON) continue;
    if (segment.axis === 'h') {
      adjacentCoordinates.push(adjacentStart.y, adjacentEnd.y);
    } else {
      adjacentCoordinates.push(adjacentStart.x, adjacentEnd.x);
    }
  }
  if (adjacentCoordinates.length === 0) return null;
  const lane = sourceDirection > 0
    ? Math.max(...adjacentCoordinates) + LANE_GAP
    : Math.min(...adjacentCoordinates) - LANE_GAP;
  return shiftInternalSegment(path, segment, lane);
};

const buildLocalReturnFlattenCandidate = (
  path: readonly ReverseOverlapPoint[],
  segment: ReverseOverlapSegmentRef,
): ReverseOverlapPoint[] | null => {
  const currentDirection = segmentDirection(segment);
  if (currentDirection === 0) return null;
  for (let index = segment.segmentIndex + 2; index < path.length - 1; index += 1) {
    const laterStart = path[index];
    const laterEnd = path[index + 1];
    if (axisOf(laterStart, laterEnd) !== segment.axis) continue;
    const laterDirection = Math.sign(
      mainCoordinate(laterEnd, segment.axis) - mainCoordinate(laterStart, segment.axis),
    );
    if (laterDirection !== -currentDirection) continue;
    if (
      Math.abs(mainCoordinate(laterEnd, segment.axis) - mainCoordinate(segment.a, segment.axis))
      < LANE_GAP
    ) continue;
    const bridgeEnd = segment.axis === 'h'
      ? { x: laterEnd.x, y: segment.a.y }
      : { x: segment.a.x, y: laterEnd.y };
    return compactPath([
      ...path.slice(0, segment.segmentIndex + 1),
      bridgeEnd,
      ...path.slice(index + 2),
    ]);
  }
  return null;
};

/**
 * Builds deterministic, geometry-only candidates for an opposite-direction
 * parallel overlap. Obstacle and whole-graph quality acceptance remain the
 * caller's responsibility.
 */
export const buildReverseOverlapRepairCandidates = (
  path: readonly ReverseOverlapPoint[],
  segment: ReverseOverlapSegmentRef,
  other: ReverseOverlapSegmentRef,
  otherPath?: readonly ReverseOverlapPoint[],
  preferredSourceAxis?: ReverseOverlapAxis,
): ReverseOverlapPoint[][] => {
  if (!isOrthogonalPath(path) || !segmentMatchesPath(path, segment)) return [];
  if (
    segment.axis !== other.axis
    || !isFinitePoint(other.a)
    || !isFinitePoint(other.b)
    || axisOf(other.a, other.b) !== other.axis
    || segmentDirection(segment) === 0
    || segmentDirection(segment) !== -segmentDirection(other)
    || Math.abs(laneOf(segment) - laneOf(other)) > NEAR_LANE_TOLERANCE
    || overlapLength(segment, other) <= EPSILON
  ) return [];
  if (segment.segmentIndex <= 0 || segment.segmentIndex >= path.length - 2) return [];

  const before = path[segment.segmentIndex - 1];
  const start = path[segment.segmentIndex];
  const end = path[segment.segmentIndex + 1];
  const after = path[segment.segmentIndex + 2];
  const perpendicularAxis: ReverseOverlapAxis = segment.axis === 'h' ? 'v' : 'h';
  if (
    axisOf(before, start) !== perpendicularAxis
    || axisOf(end, after) !== perpendicularAxis
  ) return [];

  const currentLane = laneOf(segment);
  const awayFromOtherDirection = Math.sign(currentLane - laneOf(other)) || 1;
  const candidates: ReverseOverlapPoint[][] = [];
  const seen = new Set<string>();
  const append = (candidate: ReverseOverlapPoint[] | null) => {
    if (!candidate || !isOrthogonalPath(candidate)) return;
    if (!pointsMatch(candidate[0], path[0]) || !pointsMatch(candidate[candidate.length - 1], path[path.length - 1])) {
      return;
    }
    const key = candidate.map(point => `${point.x}:${point.y}`).join('|');
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  append(buildSourceAxisAlignmentCandidate(path, segment, preferredSourceAxis));
  append(buildLocalReturnFlattenCandidate(path, segment));
  append(buildSourceDirectionAdjacentOuterLane(path, segment, other, otherPath));
  append(shiftInternalSegment(path, segment, currentLane + awayFromOtherDirection * LANE_GAP));
  append(shiftInternalSegment(path, segment, currentLane - awayFromOtherDirection * LANE_GAP));
  append(buildSourceSideOuterBypass(path, segment, other));
  append(shiftInternalSegment(path, segment, currentLane + awayFromOtherDirection * LANE_GAP * 2));
  append(shiftInternalSegment(path, segment, currentLane - awayFromOtherDirection * LANE_GAP * 2));
  return candidates;
};
