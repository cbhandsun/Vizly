export type OrthogonalPathPoint = Readonly<{
  x: number;
  y: number;
}>;

export type OrthogonalSegmentAxis = 'h' | 'v';

export type OrthogonalSegmentRef = Readonly<{
  edgeIndex: number;
  segIdx: number;
  axis: OrthogonalSegmentAxis;
  a: OrthogonalPathPoint;
  b: OrthogonalPathPoint;
}>;

export type PairedTerminalApproachRepairResult = [
  OrthogonalPathPoint[],
  OrthogonalPathPoint[],
];

const EPSILON = 0.5;
const STRICT_INTERSECTION_MARGIN = 1;
const INTERNAL_LANE_OFFSET = 48;
const TERMINAL_TRUNK_OFFSET = 28;

const coordinatesMatch = (first: number, second: number): boolean => (
  Math.abs(first - second) <= EPSILON
);

const pointsMatch = (first: OrthogonalPathPoint, second: OrthogonalPathPoint): boolean => (
  coordinatesMatch(first.x, second.x) && coordinatesMatch(first.y, second.y)
);

const axisOf = (
  first: OrthogonalPathPoint,
  second: OrthogonalPathPoint,
): OrthogonalSegmentAxis | null => {
  if (coordinatesMatch(first.y, second.y) && !coordinatesMatch(first.x, second.x)) return 'h';
  if (coordinatesMatch(first.x, second.x) && !coordinatesMatch(first.y, second.y)) return 'v';
  return null;
};

const isFinitePath = (path: readonly OrthogonalPathPoint[]): boolean => (
  path.length >= 2
  && path.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))
);

const isOrthogonalPath = (path: readonly OrthogonalPathPoint[]): boolean => (
  isFinitePath(path)
  && path.slice(0, -1).every((point, index) => axisOf(point, path[index + 1]) !== null)
);

const segmentRefMatchesPath = (
  path: readonly OrthogonalPathPoint[],
  ref: OrthogonalSegmentRef,
): boolean => {
  if (!Number.isInteger(ref.segIdx) || ref.segIdx < 0 || ref.segIdx >= path.length - 1) return false;
  const a = path[ref.segIdx];
  const b = path[ref.segIdx + 1];
  return axisOf(a, b) === ref.axis && pointsMatch(a, ref.a) && pointsMatch(b, ref.b);
};

const strictlyCrosses = (
  first: OrthogonalSegmentRef,
  second: OrthogonalSegmentRef,
): boolean => {
  if (first.axis === second.axis) return false;
  const horizontal = first.axis === 'h' ? first : second;
  const vertical = first.axis === 'v' ? first : second;
  const intersectionX = vertical.a.x;
  const intersectionY = horizontal.a.y;
  return intersectionX > Math.min(horizontal.a.x, horizontal.b.x) + STRICT_INTERSECTION_MARGIN
    && intersectionX < Math.max(horizontal.a.x, horizontal.b.x) - STRICT_INTERSECTION_MARGIN
    && intersectionY > Math.min(vertical.a.y, vertical.b.y) + STRICT_INTERSECTION_MARGIN
    && intersectionY < Math.max(vertical.a.y, vertical.b.y) - STRICT_INTERSECTION_MARGIN;
};

const setCoordinate = (
  point: OrthogonalPathPoint,
  axis: OrthogonalSegmentAxis,
  value: number,
): OrthogonalPathPoint => (
  axis === 'h' ? { x: value, y: point.y } : { x: point.x, y: value }
);

const coordinateAlong = (point: OrthogonalPathPoint, axis: OrthogonalSegmentAxis): number => (
  axis === 'h' ? point.x : point.y
);

const compactPath = (path: readonly OrthogonalPathPoint[]): OrthogonalPathPoint[] => {
  const deduped: OrthogonalPathPoint[] = [];
  for (const point of path) {
    const previous = deduped[deduped.length - 1];
    if (!previous || !pointsMatch(previous, point)) deduped.push({ x: point.x, y: point.y });
  }
  if (deduped.length < 3) return deduped;

  const compacted: OrthogonalPathPoint[] = [deduped[0]];
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

const replaceSegmentLane = (
  path: readonly OrthogonalPathPoint[],
  segmentIndex: number,
  perpendicularAxis: OrthogonalSegmentAxis,
  coordinate: number,
): OrthogonalPathPoint[] => {
  const result = path.map(point => ({ x: point.x, y: point.y }));
  result[segmentIndex] = setCoordinate(result[segmentIndex], perpendicularAxis, coordinate);
  result[segmentIndex + 1] = setCoordinate(result[segmentIndex + 1], perpendicularAxis, coordinate);
  return result;
};

/**
 * Separates a target-terminal approach from a strictly crossing interior segment.
 *
 * Paths and refs are supplied in the same two-edge index space. The function is
 * deliberately geometry-only so callers can apply their own obstacle and global
 * quality gates before accepting the candidate.
 */
export const repairPairedTerminalApproachStrictCrossing = (
  paths: readonly [readonly OrthogonalPathPoint[], readonly OrthogonalPathPoint[]],
  refs: readonly [OrthogonalSegmentRef, OrthogonalSegmentRef],
): PairedTerminalApproachRepairResult | null => {
  if (!paths.every(isOrthogonalPath)) return null;
  if (refs.some(ref => !Number.isInteger(ref.edgeIndex) || ref.edgeIndex < 0 || ref.edgeIndex > 1)) return null;
  if (refs[0].edgeIndex === refs[1].edgeIndex) return null;
  if (refs.some(ref => !segmentRefMatchesPath(paths[ref.edgeIndex], ref))) return null;
  if (!strictlyCrosses(refs[0], refs[1])) return null;

  const terminalRefs = refs.filter(ref => ref.segIdx === paths[ref.edgeIndex].length - 3);
  if (terminalRefs.length !== 1) return null;
  const terminalRef = terminalRefs[0];
  const internalRef = refs[0] === terminalRef ? refs[1] : refs[0];
  const terminalPath = paths[terminalRef.edgeIndex];
  const internalPath = paths[internalRef.edgeIndex];

  if (terminalRef.axis === internalRef.axis) return null;
  if (terminalRef.segIdx < 2) return null;
  if (internalRef.segIdx <= 0 || internalRef.segIdx >= internalPath.length - 2) return null;

  const precedingTerminalAxis = axisOf(
    terminalPath[terminalRef.segIdx - 1],
    terminalPath[terminalRef.segIdx],
  );
  const endpointStubAxis = axisOf(
    terminalPath[terminalRef.segIdx + 1],
    terminalPath[terminalRef.segIdx + 2],
  );
  const previousInternalAxis = axisOf(
    internalPath[internalRef.segIdx - 1],
    internalPath[internalRef.segIdx],
  );
  const nextInternalAxis = axisOf(
    internalPath[internalRef.segIdx + 1],
    internalPath[internalRef.segIdx + 2],
  );
  if (
    precedingTerminalAxis !== internalRef.axis
    || endpointStubAxis !== internalRef.axis
    || previousInternalAxis !== terminalRef.axis
    || nextInternalAxis !== terminalRef.axis
  ) return null;

  const terminalCorner = terminalPath[terminalRef.segIdx + 1];
  const approachStart = terminalPath[terminalRef.segIdx];
  const cornerCoordinate = coordinateAlong(terminalCorner, terminalRef.axis);
  const approachDirection = Math.sign(
    cornerCoordinate - coordinateAlong(approachStart, terminalRef.axis),
  );
  if (approachDirection === 0) return null;

  const internalLaneCoordinate = cornerCoordinate - approachDirection * INTERNAL_LANE_OFFSET;
  const terminalTrunkCoordinate = cornerCoordinate - approachDirection * TERMINAL_TRUNK_OFFSET;
  if (!Number.isFinite(internalLaneCoordinate) || !Number.isFinite(terminalTrunkCoordinate)) return null;

  const repairedInternalPath = compactPath(replaceSegmentLane(
    internalPath,
    internalRef.segIdx,
    terminalRef.axis,
    internalLaneCoordinate,
  ));
  const repairedTerminalPath = compactPath(replaceSegmentLane(
    terminalPath,
    terminalRef.segIdx - 1,
    terminalRef.axis,
    terminalTrunkCoordinate,
  ));

  if (!isOrthogonalPath(repairedInternalPath) || !isOrthogonalPath(repairedTerminalPath)) return null;
  if (
    !pointsMatch(repairedInternalPath[0], internalPath[0])
    || !pointsMatch(repairedInternalPath[repairedInternalPath.length - 1], internalPath[internalPath.length - 1])
    || !pointsMatch(repairedTerminalPath[0], terminalPath[0])
    || !pointsMatch(repairedTerminalPath[repairedTerminalPath.length - 1], terminalPath[terminalPath.length - 1])
  ) return null;

  const result: PairedTerminalApproachRepairResult = [
    paths[0].map(point => ({ x: point.x, y: point.y })),
    paths[1].map(point => ({ x: point.x, y: point.y })),
  ];
  result[internalRef.edgeIndex] = repairedInternalPath;
  result[terminalRef.edgeIndex] = repairedTerminalPath;
  return result;
};
