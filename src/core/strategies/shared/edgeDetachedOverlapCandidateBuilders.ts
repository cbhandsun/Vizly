import type {
  Axis,
  PathSegmentRef,
  Point,
  Rect,
} from './edgeDetachedOverlapGeometry';
import {
  EPS,
  allSegmentsOrthogonal,
  axisOf,
  compactPath,
  pathEquals,
  pathLength,
  pointNear,
} from './edgeDetachedOverlapGeometry';

const MICRO_ENDPOINT_SLIDE = 8;
const SIDE_MATCH_TOLERANCE = 8;
const SIDE_INSET = 4;

export const STRICT_BYPASS_CLEARANCES = [16, 32, 48, 64, 96, 128, 160, 192, 224];
export const MAZE_COORD_OFFSETS = [0, 16, -16, 24, -24, 32, -32, 48, -48, 64, -64, 96, -96, 160, -160, 224, -224, 320, -320];
export const MAX_MAZE_GRID_CELLS = 20_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function segmentLength(first: Point, second: Point): number {
  return Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
}

export function shiftInternalSegment(path: Point[], segment: PathSegmentRef, delta: number): Point[] | null {
  if (segment.segIdx <= 0 || segment.segIdx >= path.length - 2) return null;
  const shifted = path.map(point => ({ ...point }));
  if (segment.axis === 'v') {
    shifted[segment.segIdx].x += delta;
    shifted[segment.segIdx + 1].x += delta;
  } else {
    shifted[segment.segIdx].y += delta;
    shifted[segment.segIdx + 1].y += delta;
  }
  const compacted = compactPath(shifted);
  if (!pointNear(compacted[0], path[0], 1)) return null;
  if (!pointNear(compacted[compacted.length - 1], path[path.length - 1], 1)) return null;
  return compacted;
}

export function bypassParallelOverlap(
  path: Point[],
  segment: PathSegmentRef,
  other: PathSegmentRef,
  delta: number,
  clearance = 16,
): Point[] | null {
  if (segment.segIdx <= 0 || segment.segIdx >= path.length - 2) return null;
  if (segment.axis !== other.axis) return null;

  const before = path.slice(0, segment.segIdx + 1);
  const after = path.slice(segment.segIdx + 2);
  const candidates: Point[][] = [];

  if (segment.axis === 'h') {
    const otherMin = Math.min(other.a.x, other.b.x);
    const otherMax = Math.max(other.a.x, other.b.x);
    const laneY = segment.a.y + delta;
    for (const bypassX of [otherMin - clearance, otherMax + clearance]) {
      candidates.push(compactPath([
        ...before,
        { x: bypassX, y: segment.a.y },
        { x: bypassX, y: laneY },
        { x: segment.b.x, y: laneY },
        segment.b,
        ...after,
      ]));
    }
  } else {
    const otherMin = Math.min(other.a.y, other.b.y);
    const otherMax = Math.max(other.a.y, other.b.y);
    const laneX = segment.a.x + delta;
    for (const bypassY of [otherMin - clearance, otherMax + clearance]) {
      candidates.push(compactPath([
        ...before,
        { x: segment.a.x, y: bypassY },
        { x: laneX, y: bypassY },
        { x: laneX, y: segment.b.y },
        segment.b,
        ...after,
      ]));
    }
  }

  const valid = candidates.filter(candidate => (
    candidate.length >= 2
    && pointNear(candidate[0], path[0], 1)
    && pointNear(candidate[candidate.length - 1], path[path.length - 1], 1)
    && allSegmentsOrthogonal(candidate)
  ));

  if (valid.length === 0) return null;
  return valid.reduce((best, candidate) => (
    pathLength(candidate) < pathLength(best) ? candidate : best
  ));
}

export function bypassAdjacentLegsAroundOverlap(
  path: Point[],
  segment: PathSegmentRef,
  other: PathSegmentRef,
  delta: number,
  clearance = 16,
): Point[] | null {
  if (segment.segIdx <= 0 || segment.segIdx >= path.length - 2) return null;
  if (segment.axis !== other.axis) return null;

  const previous = axisOf(path[segment.segIdx - 1], path[segment.segIdx]);
  const next = axisOf(path[segment.segIdx + 1], path[segment.segIdx + 2]);
  const candidates: Point[][] = [];

  if (segment.axis === 'h' && previous === 'v' && next === 'v') {
    const otherMin = Math.min(other.a.x, other.b.x);
    const otherMax = Math.max(other.a.x, other.b.x);
    const laneY = segment.a.y + delta;
    for (const sideX of [otherMin - clearance, otherMax + clearance]) {
      candidates.push(compactPath([
        ...path.slice(0, segment.segIdx),
        { x: segment.a.x, y: laneY },
        { x: sideX, y: laneY },
        { x: sideX, y: path[segment.segIdx + 2].y },
        ...path.slice(segment.segIdx + 3),
      ]));
    }
  }

  if (segment.axis === 'v' && previous === 'h' && next === 'h') {
    const otherMin = Math.min(other.a.y, other.b.y);
    const otherMax = Math.max(other.a.y, other.b.y);
    const laneX = segment.a.x + delta;
    for (const sideY of [otherMin - clearance, otherMax + clearance]) {
      candidates.push(compactPath([
        ...path.slice(0, segment.segIdx),
        { x: laneX, y: segment.a.y },
        { x: laneX, y: sideY },
        { x: path[segment.segIdx + 2].x, y: sideY },
        ...path.slice(segment.segIdx + 3),
      ]));
    }
  }

  const valid = candidates.filter(candidate => (
    candidate.length >= 2
    && pointNear(candidate[0], path[0], 1)
    && pointNear(candidate[candidate.length - 1], path[path.length - 1], 1)
    && allSegmentsOrthogonal(candidate)
  ));

  if (valid.length === 0) return null;
  return valid.reduce((best, candidate) => (
    pathLength(candidate) < pathLength(best) ? candidate : best
  ));
}

function axisMainCoordinate(point: Point, axis: Axis): number {
  return axis === 'h' ? point.x : point.y;
}

function axisLaneCoordinate(point: Point, axis: Axis): number {
  return axis === 'h' ? point.y : point.x;
}

function pointWithAxis(axis: Axis, main: number, lane: number): Point {
  return axis === 'h'
    ? { x: Math.round(main), y: Math.round(lane) }
    : { x: Math.round(lane), y: Math.round(main) };
}

function uniqueSortedNumbers(values: number[]): number[] {
  return [...new Set(values.filter(Number.isFinite).map(value => Math.round(value)))]
    .sort((first, second) => first - second);
}

function laneEscapeCoordinates(segment: PathSegmentRef, path: Point[]): number[] {
  const previous = path[segment.segIdx - 1];
  const current = path[segment.segIdx];
  const next = path[segment.segIdx + 2];
  if (!previous || !current || !next) return [];

  const base = axisLaneCoordinate(current, segment.axis);
  const adjacent = [axisLaneCoordinate(previous, segment.axis), axisLaneCoordinate(next, segment.axis)];
  const candidates: number[] = [];
  for (const adjacentLane of adjacent) {
    const direction = Math.sign(adjacentLane - base);
    if (direction === 0) continue;
    const distance = Math.abs(adjacentLane - base);
    candidates.push(adjacentLane - direction);
    if (distance > 3) candidates.push(adjacentLane - direction * 2);
    for (const offset of [1, 2, 4, 8, 16, 24, 32, 48, 64]) {
      if (offset < distance) candidates.push(base + direction * offset);
    }
  }
  for (const offset of [8, 16, 24, 32, 48, 64, 96, 128]) {
    candidates.push(base - offset, base + offset);
  }
  return uniqueSortedNumbers(candidates)
    .filter(coordinate => Math.abs(coordinate - base) > EPS);
}

function overlapEscapeMainCoordinates(value: number, other: PathSegmentRef): number[] {
  const otherStart = axisMainCoordinate(other.a, other.axis);
  const otherEnd = axisMainCoordinate(other.b, other.axis);
  const otherMin = Math.min(otherStart, otherEnd);
  const otherMax = Math.max(otherStart, otherEnd);
  const candidates = [value];
  if (value >= otherMin - EPS && value <= otherMax + EPS) {
    for (const gap of [1, 2, 8, 16, 24, 32]) {
      candidates.push(otherMin - gap, otherMax + gap);
    }
  }
  return uniqueSortedNumbers(candidates);
}

export function buildAdjacentLaneEscapeCandidates(
  path: Point[],
  segment: PathSegmentRef,
  other: PathSegmentRef,
): Point[][] {
  if (segment.axis !== other.axis) return [];
  if (segment.segIdx <= 0 || segment.segIdx >= path.length - 2) return [];

  const previous = path[segment.segIdx - 1];
  const start = path[segment.segIdx];
  const end = path[segment.segIdx + 1];
  const next = path[segment.segIdx + 2];
  if (!previous || !start || !end || !next) return [];
  const previousAxis = axisOf(previous, start);
  const nextAxis = axisOf(end, next);
  if (!previousAxis || !nextAxis || previousAxis === segment.axis || nextAxis === segment.axis) return [];

  const startMain = axisMainCoordinate(start, segment.axis);
  const endMain = axisMainCoordinate(end, segment.axis);
  const nextLane = axisLaneCoordinate(next, segment.axis);
  const startCoordinates = overlapEscapeMainCoordinates(startMain, other);
  const endCoordinates = overlapEscapeMainCoordinates(endMain, other);
  const laneCoordinates = laneEscapeCoordinates(segment, path);
  const candidates: Point[][] = [];

  for (const lane of laneCoordinates) {
    for (const startCoordinate of startCoordinates) {
      for (const endCoordinate of endCoordinates) {
        if (Math.abs(startCoordinate - endCoordinate) <= EPS) continue;
        const candidate = compactPath([
          ...path.slice(0, segment.segIdx),
          pointWithAxis(segment.axis, startMain, lane),
          pointWithAxis(segment.axis, startCoordinate, lane),
          pointWithAxis(segment.axis, endCoordinate, lane),
          pointWithAxis(segment.axis, endCoordinate, nextLane),
          ...path.slice(segment.segIdx + 3),
        ]);
        if (candidate.length < 2) continue;
        if (!pointNear(candidate[0], path[0], 1)) continue;
        if (!pointNear(candidate[candidate.length - 1], path[path.length - 1], 1)) continue;
        if (!allSegmentsOrthogonal(candidate)) continue;
        if (pathEquals(candidate, compactPath(path))) continue;
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

export function trimSegmentEndpointOverlap(path: Point[], segment: PathSegmentRef, other: PathSegmentRef): Point[] | null {
  if (segment.axis !== other.axis) return null;
  const segmentStart = segment.axis === 'v' ? segment.a.y : segment.a.x;
  const segmentEnd = segment.axis === 'v' ? segment.b.y : segment.b.x;
  const otherStart = segment.axis === 'v' ? other.a.y : other.a.x;
  const otherEnd = segment.axis === 'v' ? other.b.y : other.b.x;
  const overlapMin = Math.max(Math.min(segmentStart, segmentEnd), Math.min(otherStart, otherEnd));
  const overlapMax = Math.min(Math.max(segmentStart, segmentEnd), Math.max(otherStart, otherEnd));
  if (overlapMax - overlapMin < 1) return null;

  const direction = Math.sign(segmentEnd - segmentStart);
  if (direction === 0) return null;
  const trimGap = 2;
  const shifted = path.map(point => ({ ...point }));
  const startTouchesOverlap = direction > 0
    ? Math.abs(segmentStart - overlapMin) <= 1
    : Math.abs(segmentStart - overlapMax) <= 1;
  const endTouchesOverlap = direction > 0
    ? Math.abs(segmentEnd - overlapMax) <= 1
    : Math.abs(segmentEnd - overlapMin) <= 1;

  if (endTouchesOverlap && segment.segIdx + 2 < path.length) {
    const nextAxis = axisOf(path[segment.segIdx + 1], path[segment.segIdx + 2]);
    if (!nextAxis || nextAxis === segment.axis) return null;
    const nextCoordinate = direction > 0 ? overlapMin - trimGap : overlapMax + trimGap;
    if (!coordinateInsideSegment(segmentStart, segmentEnd, nextCoordinate)) return null;
    setAxisCoordinate(shifted[segment.segIdx + 1], segment.axis, nextCoordinate);
    setAxisCoordinate(shifted[segment.segIdx + 2], segment.axis, nextCoordinate);
    const compacted = compactPath(shifted);
    return allSegmentsOrthogonal(compacted) ? compacted : null;
  }

  if (startTouchesOverlap && segment.segIdx > 0) {
    const previousAxis = axisOf(path[segment.segIdx - 1], path[segment.segIdx]);
    if (!previousAxis || previousAxis === segment.axis) return null;
    const nextCoordinate = direction > 0 ? overlapMax + trimGap : overlapMin - trimGap;
    if (!coordinateInsideSegment(segmentStart, segmentEnd, nextCoordinate)) return null;
    setAxisCoordinate(shifted[segment.segIdx - 1], segment.axis, nextCoordinate);
    setAxisCoordinate(shifted[segment.segIdx], segment.axis, nextCoordinate);
    const compacted = compactPath(shifted);
    return allSegmentsOrthogonal(compacted) ? compacted : null;
  }

  return null;
}

function coordinateInsideSegment(start: number, end: number, value: number): boolean {
  return value > Math.min(start, end) + EPS && value < Math.max(start, end) - EPS;
}

function setAxisCoordinate(point: Point, axis: Axis, value: number): void {
  if (axis === 'v') {
    point.y = Math.round(value);
  } else {
    point.x = Math.round(value);
  }
}

function endpointBypassCoordinate(
  segment: PathSegmentRef,
  other: PathSegmentRef,
  atStart: boolean,
  clearance: number,
): number | null {
  const segmentStart = segment.axis === 'v' ? segment.a.y : segment.a.x;
  const segmentEnd = segment.axis === 'v' ? segment.b.y : segment.b.x;
  const direction = Math.sign(segmentEnd - segmentStart);
  if (direction === 0) return null;

  const otherStart = segment.axis === 'v' ? other.a.y : other.a.x;
  const otherEnd = segment.axis === 'v' ? other.b.y : other.b.x;
  const overlapMin = Math.max(Math.min(segmentStart, segmentEnd), Math.min(otherStart, otherEnd));
  const overlapMax = Math.min(Math.max(segmentStart, segmentEnd), Math.max(otherStart, otherEnd));
  if (overlapMax - overlapMin <= EPS) return null;

  const coordinate = atStart
    ? (direction > 0 ? overlapMin - clearance : overlapMax + clearance)
    : (direction > 0 ? overlapMax + clearance : overlapMin - clearance);
  const min = Math.min(segmentStart, segmentEnd);
  const max = Math.max(segmentStart, segmentEnd);
  return coordinate > min + EPS && coordinate < max - EPS ? coordinate : null;
}

export function endpointBypassCoordinates(
  segment: PathSegmentRef,
  other: PathSegmentRef,
  clearance: number,
): number[] {
  const segmentStart = segment.axis === 'v' ? segment.a.y : segment.a.x;
  const segmentEnd = segment.axis === 'v' ? segment.b.y : segment.b.x;
  const otherStart = segment.axis === 'v' ? other.a.y : other.a.x;
  const otherEnd = segment.axis === 'v' ? other.b.y : other.b.x;
  const overlapMin = Math.max(Math.min(segmentStart, segmentEnd), Math.min(otherStart, otherEnd));
  const overlapMax = Math.min(Math.max(segmentStart, segmentEnd), Math.max(otherStart, otherEnd));
  if (overlapMax - overlapMin <= EPS) return [];

  return [overlapMin - clearance, overlapMax + clearance]
    .filter(Number.isFinite)
    .map(coordinate => Math.round(coordinate));
}

/**
 * Returns bend coordinates that preserve a readable terminal stub on the segment's existing
 * axis. Opposed endpoint trunks often need both bends moved together; overlap-boundary offsets
 * alone can leave one or both terminal stubs shorter than the 48px display contract.
 */
export function endpointReadableStubCoordinates(
  path: Point[],
  segment: PathSegmentRef,
  distances: readonly number[] = [48, 64, 96],
): number[] {
  const lastSegmentIndex = path.length - 2;
  const atStart = segment.segIdx === 0;
  const atEnd = segment.segIdx === lastSegmentIndex;
  if (!atStart && !atEnd) return [];

  const terminal = atStart ? segment.a : segment.b;
  const interior = atStart ? segment.b : segment.a;
  const terminalCoordinate = segment.axis === 'v' ? terminal.y : terminal.x;
  const interiorCoordinate = segment.axis === 'v' ? interior.y : interior.x;
  const direction = Math.sign(interiorCoordinate - terminalCoordinate);
  const available = Math.abs(interiorCoordinate - terminalCoordinate);
  if (direction === 0 || available < 48 - EPS) return [];

  return [...new Set(distances
    .map(distance => Number(distance))
    .filter(distance => Number.isFinite(distance) && distance >= 48 && distance <= available + EPS)
    .map(distance => Math.round(terminalCoordinate + direction * distance)))];
}

export function bypassEndpointParallelOverlapAtCoordinate(
  path: Point[],
  segment: PathSegmentRef,
  coordinate: number,
): Point[] | null {
  const lastSegmentIndex = path.length - 2;
  const atStart = segment.segIdx === 0;
  const atEnd = segment.segIdx === lastSegmentIndex;
  if (!atStart && !atEnd) return null;

  const candidate = (() => {
    if (atStart) {
      const next = path[segment.segIdx + 2];
      if (!next) return null;
      if (segment.axis === 'v') {
        return compactPath([
          segment.a,
          { x: segment.a.x, y: coordinate },
          { x: next.x, y: coordinate },
          ...path.slice(segment.segIdx + 2),
        ]);
      }
      return compactPath([
        segment.a,
        { x: coordinate, y: segment.a.y },
        { x: coordinate, y: next.y },
        ...path.slice(segment.segIdx + 2),
      ]);
    }

    const previous = path[segment.segIdx - 1];
    if (!previous) return null;
    if (segment.axis === 'v') {
      return compactPath([
        ...path.slice(0, Math.max(0, segment.segIdx - 1)),
        { x: previous.x, y: coordinate },
        { x: segment.b.x, y: coordinate },
        segment.b,
      ]);
    }
    return compactPath([
      ...path.slice(0, Math.max(0, segment.segIdx - 1)),
      { x: coordinate, y: previous.y },
      { x: coordinate, y: segment.b.y },
      segment.b,
    ]);
  })();

  if (!candidate || candidate.length < 2) return null;
  if (!pointNear(candidate[0], path[0], 1)) return null;
  if (!pointNear(candidate[candidate.length - 1], path[path.length - 1], 1)) return null;
  return allSegmentsOrthogonal(candidate) ? candidate : null;
}

export function bypassEndpointParallelOverlap(
  path: Point[],
  segment: PathSegmentRef,
  other: PathSegmentRef,
  clearance = 16,
): Point[] | null {
  if (segment.axis !== other.axis) return null;
  const lastSegmentIndex = path.length - 2;
  const atStart = segment.segIdx === 0;
  const atEnd = segment.segIdx === lastSegmentIndex;
  if (!atStart && !atEnd) return null;

  const preferredCoordinate = endpointBypassCoordinate(segment, other, atStart, clearance);
  const coordinates = [
    ...(preferredCoordinate === null ? [] : [Math.round(preferredCoordinate)]),
    ...endpointBypassCoordinates(segment, other, clearance),
  ];
  const uniqueCoordinates = [...new Set(coordinates)];
  const candidates = uniqueCoordinates
    .map(coordinate => bypassEndpointParallelOverlapAtCoordinate(path, segment, coordinate))
    .filter((candidate): candidate is Point[] => candidate !== null);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) => (
    pathLength(candidate) < pathLength(best) ? candidate : best
  ));
}

export function buildTerminalSegmentParallelLaneCandidates(
  path: Point[],
  segment: PathSegmentRef,
  other: PathSegmentRef,
  clearance = 32,
): Point[][] {
  if (segment.axis !== other.axis) return [];
  const lastSegmentIndex = path.length - 2;
  const atStart = segment.segIdx === 0;
  const atEnd = segment.segIdx === lastSegmentIndex;
  if (!atStart && !atEnd) return [];

  const currentLane = segment.axis === 'h' ? segment.a.y : segment.a.x;
  const otherLane = other.axis === 'h' ? other.a.y : other.a.x;
  const preferredDirection = Math.abs(currentLane - otherLane) <= EPS
    ? (segment.edgeIndex <= other.edgeIndex ? -1 : 1)
    : Math.sign(currentLane - otherLane);
  if (preferredDirection === 0) return [];
  const directions = [preferredDirection, -preferredDirection];

  const candidates = directions.map(direction => {
    const lane = Math.round(currentLane + direction * clearance);
    if (path.length === 2) {
      return segment.axis === 'h'
        ? compactPath([
          segment.a,
          { x: segment.a.x, y: lane },
          { x: segment.b.x, y: lane },
          segment.b,
        ])
        : compactPath([
          segment.a,
          { x: lane, y: segment.a.y },
          { x: lane, y: segment.b.y },
          segment.b,
        ]);
    }

    if (segment.axis === 'h') {
      if (atStart) {
        return compactPath([
          segment.a,
          { x: segment.a.x, y: lane },
          { x: segment.b.x, y: lane },
          ...path.slice(segment.segIdx + 2),
        ]);
      }
      return compactPath([
        ...path.slice(0, segment.segIdx),
        { x: segment.a.x, y: lane },
        { x: segment.b.x, y: lane },
        segment.b,
      ]);
    }

    if (atStart) {
      return compactPath([
        segment.a,
        { x: lane, y: segment.a.y },
        { x: lane, y: segment.b.y },
        ...path.slice(segment.segIdx + 2),
      ]);
    }
    return compactPath([
      ...path.slice(0, segment.segIdx),
      { x: lane, y: segment.a.y },
      { x: lane, y: segment.b.y },
      segment.b,
    ]);
  });

  const seen = new Set<string>();
  return candidates.filter(candidate => {
    if (candidate.length < 2) return false;
    if (!pointNear(candidate[0], path[0], 1)) return false;
    if (!pointNear(candidate[candidate.length - 1], path[path.length - 1], 1)) return false;
    if (!allSegmentsOrthogonal(candidate)) return false;
    const key = candidate.map(point => `${point.x}:${point.y}`).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function terminalApproachLane(path: Point[], segment: PathSegmentRef): number | null {
  const lastSegmentIndex = path.length - 2;
  if (segment.segIdx === lastSegmentIndex && segment.segIdx >= 2) {
    const approachStart = path[segment.segIdx - 2];
    const approachEnd = path[segment.segIdx - 1];
    return axisOf(approachStart, approachEnd) === segment.axis
      ? axisLaneCoordinate(approachStart, segment.axis)
      : null;
  }
  if (segment.segIdx === 0 && path.length >= 4) {
    const approachStart = path[2];
    const approachEnd = path[3];
    return axisOf(approachStart, approachEnd) === segment.axis
      ? axisLaneCoordinate(approachStart, segment.axis)
      : null;
  }
  return null;
}

export function buildTerminalApproachBypassCandidates(
  path: Point[],
  segment: PathSegmentRef,
  otherPath: Point[],
  other: PathSegmentRef,
  overlapClearance = 16,
): Point[][] {
  const lastSegmentIndex = path.length - 2;
  if (segment.segIdx !== lastSegmentIndex || segment.segIdx < 2 || segment.axis !== other.axis) return [];
  const approachStart = path[segment.segIdx - 2];
  const approachEnd = path[segment.segIdx - 1];
  if (axisOf(approachStart, approachEnd) !== segment.axis) return [];

  const segmentStart = axisMainCoordinate(segment.a, segment.axis);
  const segmentEnd = axisMainCoordinate(segment.b, segment.axis);
  const direction = Math.sign(segmentEnd - segmentStart);
  if (direction === 0) return [];
  const otherStart = axisMainCoordinate(other.a, other.axis);
  const otherEnd = axisMainCoordinate(other.b, other.axis);
  const overlapMin = Math.max(Math.min(segmentStart, segmentEnd), Math.min(otherStart, otherEnd));
  const overlapMax = Math.min(Math.max(segmentStart, segmentEnd), Math.max(otherStart, otherEnd));
  if (overlapMax - overlapMin <= EPS) return [];

  const mainClearance = Math.max(2, Math.round(overlapClearance));
  const turnCoordinate = direction > 0
    ? overlapMax + mainClearance
    : overlapMin - mainClearance;
  if (!coordinateInsideSegment(segmentStart, segmentEnd, turnCoordinate)) return [];

  const approachLane = axisLaneCoordinate(approachStart, segment.axis);
  const terminalLane = axisLaneCoordinate(segment.a, segment.axis);
  const otherTerminalLane = axisLaneCoordinate(other.a, other.axis);
  const otherApproachLane = terminalApproachLane(otherPath, other);
  const occupiedLanes = [approachLane, terminalLane, otherTerminalLane]
    .concat(otherApproachLane === null ? [] : [otherApproachLane]);
  const laneClearance = Math.max(32, mainClearance * 2);
  const laneCandidates = [
    Math.min(...occupiedLanes) - laneClearance,
    Math.max(...occupiedLanes) + laneClearance,
  ].map(value => Math.round(value));
  const approachStartMain = axisMainCoordinate(approachStart, segment.axis);

  return laneCandidates.map(lane => compactPath([
    ...path.slice(0, segment.segIdx - 2),
    pointWithAxis(segment.axis, approachStartMain, lane),
    pointWithAxis(segment.axis, turnCoordinate, lane),
    pointWithAxis(segment.axis, turnCoordinate, terminalLane),
    segment.b,
  ])).filter(candidate => (
    candidate.length >= 2
    && pointNear(candidate[0], path[0], 1)
    && pointNear(candidate[candidate.length - 1], path[path.length - 1], 1)
    && allSegmentsOrthogonal(candidate)
    && !pathEquals(candidate, compactPath(path))
  ));
}

export function buildTerminalEndpointSlideShortcutCandidates(
  path: Point[],
  segment: PathSegmentRef,
): Point[][] {
  const lastSegmentIndex = path.length - 2;
  const atStart = segment.segIdx === 0;
  const atEnd = segment.segIdx === lastSegmentIndex;
  if (!atStart && !atEnd) return [];

  const candidates: Point[][] = [];
  if (atEnd) {
    const endpoint = path[path.length - 1];
    for (let index = 0; index < segment.segIdx; index += 1) {
      const axis = axisOf(path[index], path[index + 1]);
      if (axis !== segment.axis) continue;
      const slidEndpoint = segment.axis === 'h'
        ? { x: endpoint.x, y: path[index].y }
        : { x: path[index].x, y: endpoint.y };
      if (segmentLength(slidEndpoint, endpoint) > MICRO_ENDPOINT_SLIDE) continue;
      candidates.push(compactPath([
        ...path.slice(0, index + 1),
        slidEndpoint,
      ]));
    }
  }

  if (atStart) {
    const endpoint = path[0];
    for (let index = path.length - 2; index > segment.segIdx; index -= 1) {
      const axis = axisOf(path[index], path[index + 1]);
      if (axis !== segment.axis) continue;
      const slidEndpoint = segment.axis === 'h'
        ? { x: endpoint.x, y: path[index].y }
        : { x: path[index].x, y: endpoint.y };
      if (segmentLength(slidEndpoint, endpoint) > MICRO_ENDPOINT_SLIDE) continue;
      candidates.push(compactPath([
        slidEndpoint,
        ...path.slice(index + 1),
      ]));
    }
  }

  const seen = new Set<string>();
  return candidates.filter(candidate => {
    if (candidate.length < 2) return false;
    if (!allSegmentsOrthogonal(candidate)) return false;
    const startShift = segmentLength(candidate[0], path[0]);
    const endShift = segmentLength(candidate[candidate.length - 1], path[path.length - 1]);
    if (!((startShift <= MICRO_ENDPOINT_SLIDE && endShift <= EPS) || (endShift <= MICRO_ENDPOINT_SLIDE && startShift <= EPS))) {
      return false;
    }
    const key = candidate.map(point => `${point.x}:${point.y}`).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function slideEndpointAlongSide(point: Point, rect: Rect | null, axis: Axis, delta: number): Point | null {
  if (!rect) return null;
  if (axis === 'v') {
    const onTopOrBottom = Math.abs(point.y - rect.y) <= SIDE_MATCH_TOLERANCE
      || Math.abs(point.y - (rect.y + rect.height)) <= SIDE_MATCH_TOLERANCE;
    if (!onTopOrBottom) return null;
    const minX = rect.x + SIDE_INSET;
    const maxX = rect.x + rect.width - SIDE_INSET;
    const x = point.x + delta;
    if (x < minX || x > maxX) return null;
    return { x: Math.round(clamp(x, minX, maxX)), y: Math.round(point.y) };
  }

  const onLeftOrRight = Math.abs(point.x - rect.x) <= SIDE_MATCH_TOLERANCE
    || Math.abs(point.x - (rect.x + rect.width)) <= SIDE_MATCH_TOLERANCE;
  if (!onLeftOrRight) return null;
  const minY = rect.y + SIDE_INSET;
  const maxY = rect.y + rect.height - SIDE_INSET;
  const y = point.y + delta;
  if (y < minY || y > maxY) return null;
  return { x: Math.round(point.x), y: Math.round(clamp(y, minY, maxY)) };
}
