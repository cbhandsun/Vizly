export type StrictCrossingZipperPoint = Readonly<{
  x: number;
  y: number;
}>;

export type StrictCrossingZipperAxis = 'h' | 'v';

export type StrictCrossingZipperSegmentRef = Readonly<{
  segmentIndex: number;
  axis: StrictCrossingZipperAxis;
  a: StrictCrossingZipperPoint;
  b: StrictCrossingZipperPoint;
}>;

export type StrictCrossingZipperBlocker = Readonly<{
  path: readonly StrictCrossingZipperPoint[];
  segment: StrictCrossingZipperSegmentRef;
}>;

const EPSILON = 0.5;
const STRICT_INTERSECTION_MARGIN = 1;
const TAP_LENGTH = 24;

const coordinatesMatch = (first: number, second: number): boolean => (
  Math.abs(first - second) <= EPSILON
);

const pointsMatch = (
  first: StrictCrossingZipperPoint,
  second: StrictCrossingZipperPoint,
): boolean => coordinatesMatch(first.x, second.x) && coordinatesMatch(first.y, second.y);

const axisOf = (
  first: StrictCrossingZipperPoint,
  second: StrictCrossingZipperPoint,
): StrictCrossingZipperAxis | null => {
  if (coordinatesMatch(first.y, second.y) && !coordinatesMatch(first.x, second.x)) return 'h';
  if (coordinatesMatch(first.x, second.x) && !coordinatesMatch(first.y, second.y)) return 'v';
  return null;
};

const isFinitePoint = (point: StrictCrossingZipperPoint): boolean => (
  Number.isFinite(point.x) && Number.isFinite(point.y)
);

const isOrthogonalPath = (path: readonly StrictCrossingZipperPoint[]): boolean => (
  path.length >= 2
  && path.every(isFinitePoint)
  && path.slice(0, -1).every((point, index) => axisOf(point, path[index + 1]) !== null)
);

const segmentMatchesPath = (
  path: readonly StrictCrossingZipperPoint[],
  segment: StrictCrossingZipperSegmentRef,
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

const mainCoordinate = (
  point: StrictCrossingZipperPoint,
  axis: StrictCrossingZipperAxis,
): number => axis === 'h' ? point.x : point.y;

const laneCoordinate = (
  point: StrictCrossingZipperPoint,
  axis: StrictCrossingZipperAxis,
): number => axis === 'h' ? point.y : point.x;

const pointAt = (
  axis: StrictCrossingZipperAxis,
  main: number,
  lane: number,
): StrictCrossingZipperPoint => axis === 'h'
  ? { x: main, y: lane }
  : { x: lane, y: main };

const segmentDirection = (segment: StrictCrossingZipperSegmentRef): -1 | 0 | 1 => (
  Math.sign(mainCoordinate(segment.b, segment.axis) - mainCoordinate(segment.a, segment.axis)) as -1 | 0 | 1
);

const compactPath = (
  path: readonly StrictCrossingZipperPoint[],
): StrictCrossingZipperPoint[] => {
  const deduped: StrictCrossingZipperPoint[] = [];
  for (const point of path) {
    const previous = deduped[deduped.length - 1];
    if (!previous || !pointsMatch(previous, point)) deduped.push({ x: point.x, y: point.y });
  }
  if (deduped.length < 3) return deduped;

  const compacted: StrictCrossingZipperPoint[] = [deduped[0]];
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

type ZipperStart = Readonly<{
  main: number;
  prefixEndIndex: number;
}>;

const candidateStarts = (
  path: readonly StrictCrossingZipperPoint[],
  target: StrictCrossingZipperSegmentRef,
): ZipperStart[] => {
  const starts: ZipperStart[] = [];
  const targetDirection = segmentDirection(target);

  if (target.segmentIndex >= 2) {
    const previousSameAxisStart = path[target.segmentIndex - 2];
    const previousSameAxisEnd = path[target.segmentIndex - 1];
    const bridgeEnd = path[target.segmentIndex];
    const previousAxis = axisOf(previousSameAxisStart, previousSameAxisEnd);
    const bridgeAxis = axisOf(previousSameAxisEnd, bridgeEnd);
    const previousDirection = previousAxis
      ? Math.sign(
        mainCoordinate(previousSameAxisEnd, previousAxis)
        - mainCoordinate(previousSameAxisStart, previousAxis),
      )
      : 0;
    const extendedMain = mainCoordinate(previousSameAxisStart, target.axis);
    const targetStartMain = mainCoordinate(target.a, target.axis);
    if (
      previousAxis === target.axis
      && bridgeAxis !== null
      && bridgeAxis !== target.axis
      && previousDirection === targetDirection
      && targetDirection * (targetStartMain - extendedMain) > EPSILON
    ) {
      starts.push({
        main: extendedMain,
        prefixEndIndex: target.segmentIndex - 2,
      });
    }
  }

  starts.push({
    main: mainCoordinate(target.a, target.axis),
    prefixEndIndex: target.segmentIndex,
  });
  return starts;
};

const collectBlockerCoordinates = (
  axis: StrictCrossingZipperAxis,
  initialLane: number,
  startMain: number,
  endMain: number,
  direction: -1 | 1,
  tapDirection: -1 | 1,
  blockers: readonly StrictCrossingZipperBlocker[],
): number[] => {
  const minMain = Math.min(startMain, endMain);
  const maxMain = Math.max(startMain, endMain);
  const ordered = blockers
    .filter(({ segment }) => {
      if (segment.axis === axis) return false;
      const crossingMain = mainCoordinate(segment.a, axis);
      return crossingMain > minMain + STRICT_INTERSECTION_MARGIN
        && crossingMain < maxMain - STRICT_INTERSECTION_MARGIN;
    })
    .map(({ segment }) => ({
      main: mainCoordinate(segment.a, axis),
      laneMin: Math.min(laneCoordinate(segment.a, axis), laneCoordinate(segment.b, axis)),
      laneMax: Math.max(laneCoordinate(segment.a, axis), laneCoordinate(segment.b, axis)),
    }))
    .sort((first, second) => direction * (first.main - second.main));
  const coordinates: number[] = [];
  let lane = initialLane;

  for (let index = 0; index < ordered.length;) {
    const crossingMain = ordered[index].main;
    const sameCoordinate = [] as typeof ordered;
    while (index < ordered.length && coordinatesMatch(ordered[index].main, crossingMain)) {
      sameCoordinate.push(ordered[index]);
      index += 1;
    }
    const intersectsCurrentLane = sameCoordinate.some(blocker => (
      lane > blocker.laneMin + STRICT_INTERSECTION_MARGIN
      && lane < blocker.laneMax - STRICT_INTERSECTION_MARGIN
    ));
    if (!intersectsCurrentLane) continue;
    coordinates.push(crossingMain);
    lane += tapDirection * TAP_LENGTH;
  }
  return coordinates;
};

const zipperSpansAreReadable = (
  startMain: number,
  blockerCoordinates: readonly number[],
  endMain: number,
  direction: -1 | 1,
): boolean => {
  let previous = startMain;
  for (const coordinate of blockerCoordinates) {
    if (direction * (coordinate - previous) < TAP_LENGTH - EPSILON) return false;
    previous = coordinate;
  }
  return direction * (endMain - previous) >= TAP_LENGTH - EPSILON;
};

const pathKey = (path: readonly StrictCrossingZipperPoint[]): string => (
  path.map(point => `${point.x}:${point.y}`).join('|')
);

/**
 * Builds bounded, geometry-only zipper candidates for a strictly crossed
 * internal segment. Every blocker is converted into a 24px forward tap along
 * the target segment's successor direction. The caller remains responsible
 * for obstacle and whole-graph quality acceptance.
 */
export const buildStrictCrossingZipperCandidates = (
  path: readonly StrictCrossingZipperPoint[],
  target: StrictCrossingZipperSegmentRef,
  blockers: readonly StrictCrossingZipperBlocker[],
): StrictCrossingZipperPoint[][] => {
  if (
    !isOrthogonalPath(path)
    || !segmentMatchesPath(path, target)
    || target.segmentIndex <= 0
    || target.segmentIndex >= path.length - 2
    || blockers.length === 0
    || blockers.some(blocker => (
      !isOrthogonalPath(blocker.path)
      || !segmentMatchesPath(blocker.path, blocker.segment)
    ))
  ) return [];

  const direction = segmentDirection(target);
  if (direction === 0) return [];
  const successorStart = path[target.segmentIndex + 1];
  const successorEnd = path[target.segmentIndex + 2];
  const successorAxis = axisOf(successorStart, successorEnd);
  if (!successorAxis || successorAxis === target.axis) return [];
  const successorDirection = Math.sign(
    laneCoordinate(successorEnd, target.axis) - laneCoordinate(successorStart, target.axis),
  );
  if (successorDirection === 0) return [];

  const targetLane = laneCoordinate(target.a, target.axis);
  const targetEndMain = mainCoordinate(target.b, target.axis);
  const successorLength = Math.abs(
    laneCoordinate(successorEnd, target.axis) - laneCoordinate(successorStart, target.axis),
  );
  const results: StrictCrossingZipperPoint[][] = [];
  const seen = new Set<string>();

  for (const start of candidateStarts(path, target)) {
    const blockerCoordinates = collectBlockerCoordinates(
      target.axis,
      targetLane,
      start.main,
      targetEndMain,
      direction,
      successorDirection as -1 | 1,
      blockers,
    );
    if (
      blockerCoordinates.length === 0
      || !zipperSpansAreReadable(start.main, blockerCoordinates, targetEndMain, direction)
    ) continue;

    const totalTapLength = blockerCoordinates.length * TAP_LENGTH;
    if (successorLength - totalTapLength < TAP_LENGTH - EPSILON) continue;

    const zipper: StrictCrossingZipperPoint[] = [pointAt(target.axis, start.main, targetLane)];
    let currentLane = targetLane;
    for (const blockerCoordinate of blockerCoordinates) {
      zipper.push(pointAt(target.axis, blockerCoordinate, currentLane));
      currentLane += successorDirection * TAP_LENGTH;
      zipper.push(pointAt(target.axis, blockerCoordinate, currentLane));
    }
    zipper.push(pointAt(target.axis, targetEndMain, currentLane));

    const candidate = compactPath([
      ...path.slice(0, start.prefixEndIndex + 1),
      ...zipper,
      ...path.slice(target.segmentIndex + 2),
    ]);
    if (
      !isOrthogonalPath(candidate)
      || !pointsMatch(candidate[0], path[0])
      || !pointsMatch(candidate[candidate.length - 1], path[path.length - 1])
    ) continue;
    const key = pathKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(candidate);
  }
  return results;
};
