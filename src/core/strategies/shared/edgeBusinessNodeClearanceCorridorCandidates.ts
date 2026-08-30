import { segmentToClearanceRectDistance } from './edgeNodeClearanceGeometry';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Axis = 'h' | 'v';

const EPS = 0.5;
const MAX_CORRIDOR_CANDIDATES = 12;

const axisOf = (start: Point, end: Point): Axis | null => {
  if (Math.abs(start.y - end.y) <= EPS && Math.abs(start.x - end.x) > EPS) return 'h';
  if (Math.abs(start.x - end.x) <= EPS && Math.abs(start.y - end.y) > EPS) return 'v';
  return null;
};

const samePoint = (first: Point, second: Point): boolean => (
  Math.abs(first.x - second.x) <= EPS && Math.abs(first.y - second.y) <= EPS
);

const compactPath = (path: Point[]): Point[] => {
  const deduped = path.filter((point, index) => index === 0 || !samePoint(point, path[index - 1]));
  if (deduped.length < 3) return deduped;
  const compacted = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = compacted[compacted.length - 1];
    const point = deduped[index];
    const next = deduped[index + 1];
    const collinear = (
      Math.abs(previous.x - point.x) <= EPS && Math.abs(point.x - next.x) <= EPS
    ) || (
      Math.abs(previous.y - point.y) <= EPS && Math.abs(point.y - next.y) <= EPS
    );
    if (!collinear) compacted.push(point);
  }
  compacted.push(deduped[deduped.length - 1]);
  return compacted;
};

const uniqueNumbers = (values: number[]): number[] => (
  [...new Set(values.filter(Number.isFinite).map(value => Math.round(value * 100) / 100))]
);

const riskyRectsForPath = (
  path: Point[],
  rects: Rect[],
  clearance: number,
): Rect[] => rects.filter(rect => path.slice(0, -1).some((start, index) => (
  segmentToClearanceRectDistance({ a: start, b: path[index + 1] }, rect)
    < clearance - EPS
)));

const pathHasCrossAxisBacktrack = (path: Point[], terminalAxis: Axis): boolean => {
  let direction = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const delta = terminalAxis === 'v'
      ? path[index + 1].x - path[index].x
      : path[index + 1].y - path[index].y;
    const nextDirection = Math.sign(delta);
    if (nextDirection === 0) continue;
    if (direction !== 0 && direction !== nextDirection) return true;
    direction = nextDirection;
  }
  return false;
};

const laneLeavesContainingContainer = (
  containerRects: Rect[],
  axis: Axis,
  originalLane: number,
  candidateLane: number,
  segmentStart: number,
  segmentEnd: number,
  overflow: number,
): boolean => containerRects.some(rect => {
  const containsOriginalLane = axis === 'v'
    ? originalLane >= rect.x - EPS && originalLane <= rect.x + rect.width + EPS
    : originalLane >= rect.y - EPS && originalLane <= rect.y + rect.height + EPS;
  const spansSegment = axis === 'v'
    ? Math.max(segmentStart, segmentEnd) >= rect.y - EPS
      && Math.min(segmentStart, segmentEnd) <= rect.y + rect.height + EPS
    : Math.max(segmentStart, segmentEnd) >= rect.x - EPS
      && Math.min(segmentStart, segmentEnd) <= rect.x + rect.width + EPS;
  const containsCandidateLane = axis === 'v'
    ? candidateLane >= rect.x - overflow - EPS
      && candidateLane <= rect.x + rect.width + overflow + EPS
    : candidateLane >= rect.y - overflow - EPS
      && candidateLane <= rect.y + rect.height + overflow + EPS;
  return containsOriginalLane && spansSegment && !containsCandidateLane;
});

/**
 * Replaces a compound near-obstacle stair with one monotone outer corridor.
 * Candidate validation remains the caller's responsibility; this builder is
 * bounded and never mutates the source path.
 */
export const buildBusinessNodeTerminalCorridorCandidates = (
  path: Point[],
  rects: Rect[],
  minimumClearance: number,
  containerRects: Rect[] = [],
  containerOverflow = 0,
): Point[][] => {
  if (path.length < 6 || rects.length === 0 || !Number.isFinite(minimumClearance)) return [];
  if (path.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return [];
  if (rects.some(rect => (
    !Number.isFinite(rect.x)
    || !Number.isFinite(rect.y)
    || !Number.isFinite(rect.width)
    || !Number.isFinite(rect.height)
    || rect.width < 0
    || rect.height < 0
  ))) return [];
  if (path.slice(0, -1).some((point, index) => !axisOf(point, path[index + 1]))) return [];
  const clearance = Math.max(0, minimumClearance);
  const overflow = Number.isFinite(containerOverflow) && containerOverflow > 0
    ? containerOverflow
    : 0;
  if (clearance <= EPS) return [];
  const start = path[0];
  const sourceStub = path[1];
  const targetStub = path[path.length - 2];
  const end = path[path.length - 1];
  const sourceAxis = axisOf(start, sourceStub);
  const targetAxis = axisOf(targetStub, end);
  if (!sourceAxis || sourceAxis !== targetAxis) return [];
  const flow = sourceAxis === 'v'
    ? Math.sign(end.y - start.y)
    : Math.sign(end.x - start.x);
  const sourceDirection = sourceAxis === 'v'
    ? Math.sign(sourceStub.y - start.y)
    : Math.sign(sourceStub.x - start.x);
  const targetDirection = sourceAxis === 'v'
    ? Math.sign(targetStub.y - end.y)
    : Math.sign(targetStub.x - end.x);
  if (flow === 0 || sourceDirection !== flow || targetDirection !== -flow) return [];

  const riskyRects = riskyRectsForPath(path, rects, clearance);
  if (riskyRects.length === 0) return [];
  if (riskyRects.length < 2 && !pathHasCrossAxisBacktrack(path, sourceAxis)) return [];
  if (sourceAxis === 'v') {
    const sourceY = flow > 0
      ? Math.min(sourceStub.y, ...riskyRects.map(rect => rect.y - clearance))
      : Math.max(sourceStub.y, ...riskyRects.map(rect => rect.y + rect.height + clearance));
    const targetY = flow > 0
      ? Math.max(targetStub.y, ...riskyRects.map(rect => rect.y + rect.height + clearance))
      : Math.min(targetStub.y, ...riskyRects.map(rect => rect.y - clearance));
    const lanes = uniqueNumbers(riskyRects.flatMap(rect => [
      rect.x - clearance,
      rect.x + rect.width + clearance,
    ])).filter(lane => riskyRects.every(rect => (
      lane <= rect.x - clearance + EPS
      || lane >= rect.x + rect.width + clearance - EPS
    )));
    return lanes.filter(lane => !laneLeavesContainingContainer(
      containerRects,
      'v',
      path[2].x,
      lane,
      sourceY,
      targetY,
      overflow,
    )).slice(0, MAX_CORRIDOR_CANDIDATES).map(lane => compactPath([
      start,
      { x: start.x, y: sourceY },
      { x: lane, y: sourceY },
      { x: lane, y: targetY },
      { x: end.x, y: targetY },
      end,
    ]));
  }

  const sourceX = flow > 0
    ? Math.min(sourceStub.x, ...riskyRects.map(rect => rect.x - clearance))
    : Math.max(sourceStub.x, ...riskyRects.map(rect => rect.x + rect.width + clearance));
  const targetX = flow > 0
    ? Math.max(targetStub.x, ...riskyRects.map(rect => rect.x + rect.width + clearance))
    : Math.min(targetStub.x, ...riskyRects.map(rect => rect.x - clearance));
  const lanes = uniqueNumbers(riskyRects.flatMap(rect => [
    rect.y - clearance,
    rect.y + rect.height + clearance,
  ])).filter(lane => riskyRects.every(rect => (
    lane <= rect.y - clearance + EPS
    || lane >= rect.y + rect.height + clearance - EPS
  )));
  return lanes.filter(lane => !laneLeavesContainingContainer(
    containerRects,
    'h',
    path[2].y,
    lane,
    sourceX,
    targetX,
    overflow,
  )).slice(0, MAX_CORRIDOR_CANDIDATES).map(lane => compactPath([
    start,
    { x: sourceX, y: start.y },
    { x: sourceX, y: lane },
    { x: targetX, y: lane },
    { x: targetX, y: end.y },
    end,
  ]));
};
