import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Segment = { a: Point; b: Point };
export type Direction = 'L' | 'R' | 'U' | 'D';
export type Side = 't' | 'b' | 'l' | 'r';
type PositionedNode = ReactFlowNode & { positionAbsolute?: Point };

export const EPS = 0.5;
export const MIN_ENDPOINT_STUB = 48;
export const MIN_INTERIOR_LEG = 48;
export const DEFAULT_SPACING = 12;
export const SIDE_TOLERANCE = 10;
const VISUAL_AXIS_TOLERANCE = 12;

const num = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

const parseFiniteCoordinate = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function getEdgePath(edge: Edge): Point[] {
  const data = isRecord(edge.data) ? edge.data : {};
  const treeRouting = isRecord(data.treeRouting) ? data.treeRouting : {};
  const raw = Array.isArray(data.computedPath)
    ? data.computedPath
    : Array.isArray(treeRouting.points)
      ? treeRouting.points
      : Array.isArray(data.elkPath)
        ? data.elkPath
        : [];
  const path: Point[] = [];
  for (const candidate of raw) {
    if (!isRecord(candidate)) continue;
    const x = parseFiniteCoordinate(candidate.x);
    const y = parseFiniteCoordinate(candidate.y);
    if (x !== null && y !== null) path.push({ x, y });
  }
  return path;
}

function compactCollinearPath(points: Point[]): Point[] {
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

function chooseDiagonalBend(previous: Point | undefined, a: Point, b: Point, next: Point | undefined): Point {
  const horizontalFirst = { x: b.x, y: a.y };
  const verticalFirst = { x: a.x, y: b.y };
  const score = (bend: Point): number => {
    const firstAxis = axisOf(a, bend);
    const lastAxis = axisOf(bend, b);
    const previousAxis = previous ? axisOf(previous, a) : null;
    const nextAxis = next ? axisOf(b, next) : null;
    const firstLength = segmentLength(a, bend);
    const lastLength = segmentLength(bend, b);
    return (previousAxis && firstAxis && previousAxis !== firstAxis ? 2 : 0)
      + (nextAxis && lastAxis && nextAxis !== lastAxis ? 2 : 0)
      + (Math.min(firstLength, lastLength) < 8 ? 3 : 0);
  };
  return score(horizontalFirst) <= score(verticalFirst) ? horizontalFirst : verticalFirst;
}

function expandDiagonalSegments(points: Point[]): Point[] {
  if (points.length <= 1) return points;

  const expanded: Point[] = [points[0]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = expanded[expanded.length - 1];
    const b = points[index + 1];
    if (axisOf(a, b)) {
      expanded.push(b);
      continue;
    }

    expanded.push(
      chooseDiagonalBend(expanded[expanded.length - 2], a, b, points[index + 2]),
      b,
    );
  }
  return expanded;
}

export function compactPath(points: Point[]): Point[] {
  return compactCollinearPath(expandDiagonalSegments(compactCollinearPath(points)));
}

export function pathEquals(first: Point[], second: Point[]): boolean {
  return first.length === second.length
    && first.every((point, index) => (
      Math.abs(point.x - second[index]?.x) <= EPS && Math.abs(point.y - second[index]?.y) <= EPS
    ));
}

export function axisOf(a: Point, b: Point): 'h' | 'v' | null {
  if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
}

export function isStrictlyOrthogonal(path: Point[]): boolean {
  if (path.length < 2) return false;
  for (let index = 0; index < path.length - 1; index += 1) {
    if (!axisOf(path[index], path[index + 1])) return false;
  }
  return true;
}

export function sameEndpoints(first: Point[], second: Point[]): boolean {
  return Math.abs(first[0]?.x - second[0]?.x) <= EPS
    && Math.abs(first[0]?.y - second[0]?.y) <= EPS
    && Math.abs(first[first.length - 1]?.x - second[second.length - 1]?.x) <= EPS
    && Math.abs(first[first.length - 1]?.y - second[second.length - 1]?.y) <= EPS;
}

export function segmentLength(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function visualAxisOf(a: Point, b: Point): 'h' | 'v' | null {
  if (Math.abs(a.y - b.y) <= VISUAL_AXIS_TOLERANCE && Math.abs(a.x - b.x) > VISUAL_AXIS_TOLERANCE) return 'h';
  if (Math.abs(a.x - b.x) <= VISUAL_AXIS_TOLERANCE && Math.abs(a.y - b.y) > VISUAL_AXIS_TOLERANCE) return 'v';
  return axisOf(a, b);
}

function directionOf(a: Point, b: Point): Direction | null {
  const axis = axisOf(a, b);
  if (axis === 'h') return b.x > a.x ? 'R' : 'L';
  if (axis === 'v') return b.y > a.y ? 'D' : 'U';
  return null;
}

export function firstDirection(path: Point[]): Direction | null {
  for (let index = 0; index < path.length - 1; index += 1) {
    const direction = directionOf(path[index], path[index + 1]);
    if (direction) return direction;
  }
  return null;
}

export function lastDirection(path: Point[]): Direction | null {
  for (let index = path.length - 2; index >= 0; index -= 1) {
    const direction = directionOf(path[index], path[index + 1]);
    if (direction) return direction;
  }
  return null;
}

export function pathLength(path: Point[]): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    total += Math.abs(path[index].x - path[index + 1].x) + Math.abs(path[index].y - path[index + 1].y);
  }
  return total;
}

export function bendCount(path: Point[]): number {
  let total = 0;
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = axisOf(path[index - 1], path[index]);
    const next = axisOf(path[index], path[index + 1]);
    if (previous && next && previous !== next) total += 1;
  }
  return total;
}

export function turnbackCount(path: Point[]): number {
  const directions: Direction[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const direction = directionOf(path[index], path[index + 1]);
    if (direction) directions.push(direction);
  }
  let total = 0;
  for (let index = 1; index < directions.length; index += 1) {
    const previous = directions[index - 1];
    const current = directions[index];
    if (
      (previous === 'L' && current === 'R')
      || (previous === 'R' && current === 'L')
      || (previous === 'U' && current === 'D')
      || (previous === 'D' && current === 'U')
    ) {
      total += 1;
    }
  }
  return total;
}

export function toSegments(path: Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    if (axisOf(path[index], path[index + 1])) segments.push({ a: path[index], b: path[index + 1] });
  }
  return segments;
}

export function getNodeRect(node: ReactFlowNode): Rect | null {
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

function isContainerNode(node: ReactFlowNode): boolean {
  return new Set(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane'])
    .has(String(node.type ?? ''));
}

export function routingObstacles(nodes: ReactFlowNode[]): Map<string, Rect> {
  const obstacles = new Map<string, Rect>();
  for (const node of nodes) {
    if (isContainerNode(node)) continue;
    const rect = getNodeRect(node);
    if (rect) obstacles.set(node.id, rect);
  }
  return obstacles;
}

export function segmentIntersectsRect(segment: Segment, rect: Rect, padding = 4): boolean {
  const x1 = rect.x - padding;
  const y1 = rect.y - padding;
  const x2 = rect.x + rect.width + padding;
  const y2 = rect.y + rect.height + padding;
  const axis = axisOf(segment.a, segment.b);
  if (axis === 'h') {
    const y = segment.a.y;
    if (y <= y1 || y >= y2) return false;
    return Math.max(Math.min(segment.a.x, segment.b.x), x1) < Math.min(Math.max(segment.a.x, segment.b.x), x2);
  }
  if (axis === 'v') {
    const x = segment.a.x;
    if (x <= x1 || x >= x2) return false;
    return Math.max(Math.min(segment.a.y, segment.b.y), y1) < Math.min(Math.max(segment.a.y, segment.b.y), y2);
  }
  return false;
}

export function strictCrosses(first: Segment, second: Segment): boolean {
  const firstAxis = axisOf(first.a, first.b);
  const secondAxis = axisOf(second.a, second.b);
  if (!firstAxis || !secondAxis || firstAxis === secondAxis) return false;
  const horizontal = firstAxis === 'h' ? first : second;
  const vertical = firstAxis === 'v' ? first : second;
  const x = vertical.a.x;
  const y = horizontal.a.y;
  return x > Math.min(horizontal.a.x, horizontal.b.x) + 1
    && x < Math.max(horizontal.a.x, horizontal.b.x) - 1
    && y > Math.min(vertical.a.y, vertical.b.y) + 1
    && y < Math.max(vertical.a.y, vertical.b.y) - 1;
}

export function visualStrictCrosses(first: Segment, second: Segment): boolean {
  const firstAxis = visualAxisOf(first.a, first.b);
  const secondAxis = visualAxisOf(second.a, second.b);
  if (!firstAxis || !secondAxis || firstAxis === secondAxis) return false;
  const horizontal = firstAxis === 'h' ? first : second;
  const vertical = firstAxis === 'v' ? first : second;
  const x = (vertical.a.x + vertical.b.x) / 2;
  const y = (horizontal.a.y + horizontal.b.y) / 2;
  return x > Math.min(horizontal.a.x, horizontal.b.x) + 1
    && x < Math.max(horizontal.a.x, horizontal.b.x) - 1
    && y > Math.min(vertical.a.y, vertical.b.y) + 1
    && y < Math.max(vertical.a.y, vertical.b.y) - 1;
}

export function parallelOverlapLength(first: Segment, second: Segment): number {
  const firstAxis = axisOf(first.a, first.b);
  const secondAxis = axisOf(second.a, second.b);
  if (!firstAxis || firstAxis !== secondAxis) return 0;
  if (firstAxis === 'h') {
    if (Math.abs(first.a.y - second.a.y) > EPS) return 0;
    return Math.max(0, Math.min(Math.max(first.a.x, first.b.x), Math.max(second.a.x, second.b.x))
      - Math.max(Math.min(first.a.x, first.b.x), Math.min(second.a.x, second.b.x)));
  }
  if (Math.abs(first.a.x - second.a.x) > EPS) return 0;
  return Math.max(0, Math.min(Math.max(first.a.y, first.b.y), Math.max(second.a.y, second.b.y))
    - Math.max(Math.min(first.a.y, first.b.y), Math.min(second.a.y, second.b.y)));
}

export function segmentRange(segment: Segment, axis: 'x' | 'y'): { min: number; max: number } {
  const first = axis === 'x' ? segment.a.x : segment.a.y;
  const second = axis === 'x' ? segment.b.x : segment.b.y;
  return { min: Math.min(first, second), max: Math.max(first, second) };
}

export function addAxisCandidate(candidates: Set<number>, value: number): void {
  if (!Number.isFinite(value)) return;
  candidates.add(Math.round(value));
}

export function shiftInteriorSegment(path: Point[], segmentIndex: number, axisValue: number): Point[] | null {
  if (segmentIndex <= 0 || segmentIndex >= path.length - 2) return null;
  if (!path[segmentIndex - 1] || !path[segmentIndex] || !path[segmentIndex + 1] || !path[segmentIndex + 2]) return null;
  const axis = axisOf(path[segmentIndex], path[segmentIndex + 1]);
  const previousAxis = axisOf(path[segmentIndex - 1], path[segmentIndex]);
  const nextAxis = axisOf(path[segmentIndex + 1], path[segmentIndex + 2]);
  if (!axis || !previousAxis || !nextAxis || previousAxis !== nextAxis || previousAxis === axis) return null;

  const shifted = path.map(point => ({ ...point }));
  if (axis === 'v') {
    if (Math.abs(axisValue - path[segmentIndex].x) <= EPS) return null;
    if (Math.abs(axisValue - path[segmentIndex - 1].x) < MIN_INTERIOR_LEG) return null;
    if (Math.abs(axisValue - path[segmentIndex + 2].x) < MIN_INTERIOR_LEG) return null;
    shifted[segmentIndex].x = axisValue;
    shifted[segmentIndex + 1].x = axisValue;
  } else {
    if (Math.abs(axisValue - path[segmentIndex].y) <= EPS) return null;
    if (Math.abs(axisValue - path[segmentIndex - 1].y) < MIN_INTERIOR_LEG) return null;
    if (Math.abs(axisValue - path[segmentIndex + 2].y) < MIN_INTERIOR_LEG) return null;
    shifted[segmentIndex].y = axisValue;
    shifted[segmentIndex + 1].y = axisValue;
  }

  const compacted = compactPath(shifted);
  return sameEndpoints(path, compacted) && isStrictlyOrthogonal(compacted) ? compacted : null;
}

export function shiftCandidatesAwayFromCrossing(path: Point[], segmentIndex: number, other: Segment): Point[][] {
  if (segmentIndex <= 0 || segmentIndex >= path.length - 2) return [];
  if (!path[segmentIndex - 1] || !path[segmentIndex] || !path[segmentIndex + 1] || !path[segmentIndex + 2]) return [];
  const axis = axisOf(path[segmentIndex], path[segmentIndex + 1]);
  const otherAxis = axisOf(other.a, other.b);
  if (!axis || !otherAxis || axis === otherAxis) return [];

  const candidates = new Set<number>();
  if (axis === 'v') {
    const otherRange = segmentRange(other, 'x');
    addAxisCandidate(candidates, otherRange.min - MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, otherRange.max + MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex - 1].x - MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex - 1].x + MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex + 2].x - MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex + 2].x + MIN_INTERIOR_LEG);
  } else {
    const otherRange = segmentRange(other, 'y');
    addAxisCandidate(candidates, otherRange.min - MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, otherRange.max + MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex - 1].y - MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex - 1].y + MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex + 2].y - MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex + 2].y + MIN_INTERIOR_LEG);
  }

  return [...candidates]
    .map(axisValue => shiftInteriorSegment(path, segmentIndex, axisValue))
    .filter((candidate): candidate is Point[] => candidate !== null);
}

export function shiftCandidatesAwayFromOverlap(path: Point[], segmentIndex: number, other: Segment): Point[][] {
  if (segmentIndex <= 0 || segmentIndex >= path.length - 2) return [];
  if (!path[segmentIndex - 1] || !path[segmentIndex] || !path[segmentIndex + 1] || !path[segmentIndex + 2]) return [];
  const axis = axisOf(path[segmentIndex], path[segmentIndex + 1]);
  const otherAxis = axisOf(other.a, other.b);
  if (!axis || axis !== otherAxis || parallelOverlapLength({ a: path[segmentIndex], b: path[segmentIndex + 1] }, other) <= MIN_INTERIOR_LEG) {
    return [];
  }

  const candidates = new Set<number>();
  if (axis === 'v') {
    addAxisCandidate(candidates, other.a.x - MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, other.a.x + MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex - 1].x - MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex - 1].x + MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex + 2].x - MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex + 2].x + MIN_INTERIOR_LEG);
  } else {
    addAxisCandidate(candidates, other.a.y - MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, other.a.y + MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex - 1].y - MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex - 1].y + MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex + 2].y - MIN_INTERIOR_LEG);
    addAxisCandidate(candidates, path[segmentIndex + 2].y + MIN_INTERIOR_LEG);
  }

  return [...candidates]
    .map(axisValue => shiftInteriorSegment(path, segmentIndex, axisValue))
    .filter((candidate): candidate is Point[] => candidate !== null);
}
