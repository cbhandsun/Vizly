import type { Point } from './edgePathQualityGeometry';

type Axis = 'h' | 'v';
const EPS = 0.5;
const SHORT_ENDPOINT_STUB = 32;
const TINY_INTERIOR_SEGMENT = 24;
const HAIRPIN_BRIDGE = 140;

const segmentLength = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const axisOf = (a: Point, b: Point): Axis | null => {
  if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
};

const segmentDirection = (a: Point, b: Point, axis: Axis): -1 | 0 | 1 => {
  const delta = axis === 'h' ? b.x - a.x : b.y - a.y;
  if (Math.abs(delta) <= EPS) return 0;
  return delta > 0 ? 1 : -1;
};

export const pathLength = (path: Point[]): number => {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    total += segmentLength(path[index], path[index + 1]);
  }
  return total;
};

const manhattanDistance = (path: Point[]): number => {
  if (path.length < 2) return 0;
  return segmentLength(path[0], path[path.length - 1]);
};

export const countShortEndpointStubs = (path: Point[]): number => {
  if (path.length < 3) return 0;
  let total = 0;
  if (segmentLength(path[0], path[1]) < SHORT_ENDPOINT_STUB) total += 1;
  if (segmentLength(path[path.length - 2], path[path.length - 1]) < SHORT_ENDPOINT_STUB) total += 1;
  return total;
};

export const countTinyInteriorDoglegs = (path: Point[]): number => {
  let total = 0;
  for (let index = 1; index < path.length - 2; index += 1) {
    if (segmentLength(path[index], path[index + 1]) < TINY_INTERIOR_SEGMENT) total += 1;
  }
  return total;
};

export const countHairpins = (path: Point[]): number => {
  const segments: Array<{ axis: Axis; direction: -1 | 0 | 1; length: number }> = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const axis = axisOf(path[index], path[index + 1]);
    if (!axis) continue;
    segments.push({
      axis,
      direction: segmentDirection(path[index], path[index + 1], axis),
      length: segmentLength(path[index], path[index + 1]),
    });
  }
  let total = 0;
  for (let index = 0; index < segments.length - 2; index += 1) {
    const first = segments[index];
    const bridge = segments[index + 1];
    const third = segments[index + 2];
    if (
      first.axis === third.axis
      && first.direction !== 0
      && first.direction === -third.direction
      && bridge.length < HAIRPIN_BRIDGE
    ) total += 1;
  }
  return total;
};

export const backtrackPenalty = (path: Point[]): number => {
  if (path.length < 2) return 0;
  const start = path[0];
  const end = path[path.length - 1];
  const primaryAxis: Axis = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? 'h' : 'v';
  const primaryDirection = segmentDirection(start, end, primaryAxis);
  if (primaryDirection === 0) return 0;
  let penalty = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const axis = axisOf(path[index], path[index + 1]);
    if (axis !== primaryAxis) continue;
    const direction = segmentDirection(path[index], path[index + 1], axis);
    if (direction === -primaryDirection) {
      penalty += segmentLength(path[index], path[index + 1]);
    }
  }
  return Math.round(penalty);
};

export const detourPenalty = (path: Point[]): number => {
  const direct = manhattanDistance(path);
  if (direct <= EPS) return 0;
  const length = pathLength(path);
  const excess = length / direct - 1.8;
  if (excess <= 0) return 0;
  return Math.round(excess * direct);
};

