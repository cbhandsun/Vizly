import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import { refineOrthogonalWaypointsDetailed } from '../../algorithms/orthogonalWaypointRefiner';
import { buildPipelineBuddyGroups } from './edgeRoutingTopology';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Segment = { a: Point; b: Point };
type Direction = 'L' | 'R' | 'U' | 'D';
type Side = 't' | 'b' | 'l' | 'r';

const EPS = 0.5;
const MIN_ENDPOINT_STUB = 48;
const MIN_INTERIOR_LEG = 48;
const DEFAULT_SPACING = 12;
const SIDE_TOLERANCE = 10;
const VISUAL_AXIS_TOLERANCE = 12;

const num = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

function getEdgePath(edge: Edge): Point[] {
  const raw = (edge.data as any)?.computedPath || (edge.data as any)?.treeRouting?.points || (edge.data as any)?.elkPath || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((point: any) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y));
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

function compactPath(points: Point[]): Point[] {
  return compactCollinearPath(expandDiagonalSegments(compactCollinearPath(points)));
}

function pathEquals(first: Point[], second: Point[]): boolean {
  return first.length === second.length
    && first.every((point, index) => (
      Math.abs(point.x - second[index]?.x) <= EPS && Math.abs(point.y - second[index]?.y) <= EPS
    ));
}

function axisOf(a: Point, b: Point): 'h' | 'v' | null {
  if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
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

function firstDirection(path: Point[]): Direction | null {
  for (let index = 0; index < path.length - 1; index += 1) {
    const direction = directionOf(path[index], path[index + 1]);
    if (direction) return direction;
  }
  return null;
}

function lastDirection(path: Point[]): Direction | null {
  for (let index = path.length - 2; index >= 0; index -= 1) {
    const direction = directionOf(path[index], path[index + 1]);
    if (direction) return direction;
  }
  return null;
}

function pathLength(path: Point[]): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    total += Math.abs(path[index].x - path[index + 1].x) + Math.abs(path[index].y - path[index + 1].y);
  }
  return total;
}

function bendCount(path: Point[]): number {
  let total = 0;
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = axisOf(path[index - 1], path[index]);
    const next = axisOf(path[index], path[index + 1]);
    if (previous && next && previous !== next) total += 1;
  }
  return total;
}

function turnbackCount(path: Point[]): number {
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

function toSegments(path: Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    if (axisOf(path[index], path[index + 1])) segments.push({ a: path[index], b: path[index + 1] });
  }
  return segments;
}

function getNodeRect(node: ReactFlowNode): Rect | null {
  const position = (node as any).positionAbsolute ?? node.position ?? { x: 0, y: 0 };
  const width = num((node as any).measured?.width ?? node.width ?? (node.style as any)?.width, 0);
  const height = num((node as any).measured?.height ?? node.height ?? (node.style as any)?.height, 0);
  if (width <= 1 || height <= 1) return null;
  return {
    x: num((position as any).x, 0),
    y: num((position as any).y, 0),
    width,
    height,
  };
}

function isContainerNode(node: ReactFlowNode): boolean {
  return new Set(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane'])
    .has(String(node.type ?? ''));
}

function routingObstacles(nodes: ReactFlowNode[]): Map<string, Rect> {
  const obstacles = new Map<string, Rect>();
  for (const node of nodes) {
    if (isContainerNode(node)) continue;
    const rect = getNodeRect(node);
    if (rect) obstacles.set(node.id, rect);
  }
  return obstacles;
}

function segmentIntersectsRect(segment: Segment, rect: Rect, padding = 4): boolean {
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

function obstacleHits(path: Point[], edge: Edge, obstacles: Map<string, Rect>): number {
  let hits = 0;
  for (const segment of toSegments(path)) {
    for (const [nodeId, rect] of obstacles) {
      if (nodeId === edge.source || nodeId === edge.target) continue;
      if (segmentIntersectsRect(segment, rect)) hits += 1;
    }
  }
  return hits;
}

function strictCrosses(first: Segment, second: Segment): boolean {
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

function visualStrictCrosses(first: Segment, second: Segment): boolean {
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

function parallelOverlapLength(first: Segment, second: Segment): number {
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

function segmentRange(segment: Segment, axis: 'x' | 'y'): { min: number; max: number } {
  const first = axis === 'x' ? segment.a.x : segment.a.y;
  const second = axis === 'x' ? segment.b.x : segment.b.y;
  return { min: Math.min(first, second), max: Math.max(first, second) };
}

function addAxisCandidate(candidates: Set<number>, value: number): void {
  if (!Number.isFinite(value)) return;
  candidates.add(Math.round(value));
}

function shiftInteriorSegment(path: Point[], segmentIndex: number, axisValue: number): Point[] | null {
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

function shiftCandidatesAwayFromCrossing(path: Point[], segmentIndex: number, other: Segment): Point[][] {
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

function shiftCandidatesAwayFromOverlap(path: Point[], segmentIndex: number, other: Segment): Point[][] {
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

function shiftCandidatesAwayFromLaneBand(
  edge: Edge,
  path: Point[],
  segmentIndex: number,
  workingPaths: Map<string, Point[]>,
  edgeByKey: Map<string, Edge>,
  obstacles: Map<string, Rect>,
): Point[][] {
  if (segmentIndex <= 0 || segmentIndex >= path.length - 2) return [];
  const axis = axisOf(path[segmentIndex], path[segmentIndex + 1]);
  if (!axis) return [];

  const candidates = new Set<number>();
  const segment = { a: path[segmentIndex], b: path[segmentIndex + 1] };
  const segmentCrossRange = segmentRange(segment, axis === 'v' ? 'y' : 'x');

  for (const [otherKey, otherPath] of workingPaths) {
    const other = edgeByKey.get(otherKey);
    if (!other || other === edge || sharesEndpoint(edge, other)) continue;
    for (const otherSegment of toSegments(otherPath)) {
      const otherAxis = axisOf(otherSegment.a, otherSegment.b);
      if (!otherAxis || otherAxis === axis) continue;

      if (axis === 'v') {
        const y = otherSegment.a.y;
        if (y <= segmentCrossRange.min + 1 || y >= segmentCrossRange.max - 1) continue;
        const otherRange = segmentRange(otherSegment, 'x');
        addAxisCandidate(candidates, otherRange.min - MIN_INTERIOR_LEG);
        addAxisCandidate(candidates, otherRange.max + MIN_INTERIOR_LEG);
      } else {
        const x = otherSegment.a.x;
        if (x <= segmentCrossRange.min + 1 || x >= segmentCrossRange.max - 1) continue;
        const otherRange = segmentRange(otherSegment, 'y');
        addAxisCandidate(candidates, otherRange.min - MIN_INTERIOR_LEG);
        addAxisCandidate(candidates, otherRange.max + MIN_INTERIOR_LEG);
      }
    }
  }

  for (const [nodeId, rect] of obstacles) {
    if (nodeId === edge.source || nodeId === edge.target) continue;
    if (axis === 'v') {
      if (rect.y >= segmentCrossRange.max || rect.y + rect.height <= segmentCrossRange.min) continue;
      addAxisCandidate(candidates, rect.x - MIN_INTERIOR_LEG - 4);
      addAxisCandidate(candidates, rect.x + rect.width + MIN_INTERIOR_LEG + 4);
    } else {
      if (rect.x >= segmentCrossRange.max || rect.x + rect.width <= segmentCrossRange.min) continue;
      addAxisCandidate(candidates, rect.y - MIN_INTERIOR_LEG - 4);
      addAxisCandidate(candidates, rect.y + rect.height + MIN_INTERIOR_LEG + 4);
    }
  }

  return [...candidates]
    .map(axisValue => shiftInteriorSegment(path, segmentIndex, axisValue))
    .filter((candidate): candidate is Point[] => candidate !== null);
}

function unrelatedCrossings(
  path: Point[],
  edgeKey: string,
  paths: Map<string, Point[]>,
  edgeByKey: Map<string, Edge>,
): number {
  const edge = edgeByKey.get(edgeKey);
  if (!edge) return 0;
  let total = 0;
  for (const [otherKey, otherPath] of paths) {
    if (otherKey === edgeKey) continue;
    const other = edgeByKey.get(otherKey);
    if (!other || sharesEndpoint(edge, other)) continue;
    for (const first of toSegments(path)) {
      for (const second of toSegments(otherPath)) {
        if (strictCrosses(first, second)) total += 1;
      }
    }
  }
  return total;
}

function visualUnrelatedCrossings(
  path: Point[],
  edgeKey: string,
  paths: Map<string, Point[]>,
  edgeByKey: Map<string, Edge>,
): number {
  const edge = edgeByKey.get(edgeKey);
  if (!edge) return 0;
  let total = 0;
  for (const [otherKey, otherPath] of paths) {
    if (otherKey === edgeKey) continue;
    const other = edgeByKey.get(otherKey);
    if (!other || sharesEndpoint(edge, other)) continue;
    for (let firstIndex = 0; firstIndex < path.length - 1; firstIndex += 1) {
      const first = { a: path[firstIndex], b: path[firstIndex + 1] };
      for (let secondIndex = 0; secondIndex < otherPath.length - 1; secondIndex += 1) {
        const second = { a: otherPath[secondIndex], b: otherPath[secondIndex + 1] };
        if (visualStrictCrosses(first, second)) total += 1;
      }
    }
  }
  return total;
}

function unrelatedOverlapScore(
  path: Point[],
  edgeKey: string,
  paths: Map<string, Point[]>,
  edgeByKey: Map<string, Edge>,
): number {
  const edge = edgeByKey.get(edgeKey);
  if (!edge) return 0;
  let total = 0;
  for (const [otherKey, otherPath] of paths) {
    if (otherKey === edgeKey) continue;
    const other = edgeByKey.get(otherKey);
    if (!other || sharesEndpoint(edge, other)) continue;
    for (const first of toSegments(path)) {
      for (const second of toSegments(otherPath)) {
        const overlap = parallelOverlapLength(first, second);
        if (overlap > MIN_INTERIOR_LEG) total += overlap - MIN_INTERIOR_LEG;
      }
    }
  }
  return total;
}

function strictCrossingCount(
  path: Point[],
  edgeKey: string,
  paths: Map<string, Point[]>,
  edgeByKey: Map<string, Edge>,
): number {
  const edge = edgeByKey.get(edgeKey);
  let total = 0;
  for (const [otherKey, otherPath] of paths) {
    if (otherKey === edgeKey) continue;
    const other = edgeByKey.get(otherKey);
    if (edge && other && sharesEndpoint(edge, other)) continue;
    for (const first of toSegments(path)) {
      for (const second of toSegments(otherPath)) {
        if (strictCrosses(first, second)) total += 1;
      }
    }
  }
  return total;
}

function sharesEndpoint(first: Edge, second: Edge): boolean {
  return first.source === second.source
    || first.source === second.target
    || first.target === second.source
    || first.target === second.target;
}

function isStrictlyOrthogonal(path: Point[]): boolean {
  if (path.length < 2) return false;
  for (let index = 0; index < path.length - 1; index += 1) {
    if (!axisOf(path[index], path[index + 1])) return false;
  }
  return true;
}

function sameEndpoints(first: Point[], second: Point[]): boolean {
  return Math.abs(first[0]?.x - second[0]?.x) <= EPS
    && Math.abs(first[0]?.y - second[0]?.y) <= EPS
    && Math.abs(first[first.length - 1]?.x - second[second.length - 1]?.x) <= EPS
    && Math.abs(first[first.length - 1]?.y - second[second.length - 1]?.y) <= EPS;
}

function segmentLength(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function inferEndpointSide(point: Point, rect: Rect): Side | null {
  const candidates: Array<{ side: Side; distance: number }> = [
    { side: 't', distance: Math.abs(point.y - rect.y) },
    { side: 'b', distance: Math.abs(point.y - (rect.y + rect.height)) },
    { side: 'l', distance: Math.abs(point.x - rect.x) },
    { side: 'r', distance: Math.abs(point.x - (rect.x + rect.width)) },
  ].sort((first, second) => first.distance - second.distance);
  const nearest = candidates[0];
  return nearest && nearest.distance <= SIDE_TOLERANCE ? nearest.side : null;
}

function slideEndpointOnSide(rect: Rect, side: Side, mainValue: number): Point | null {
  if (side === 't' || side === 'b') {
    if (mainValue < rect.x - SIDE_TOLERANCE || mainValue > rect.x + rect.width + SIDE_TOLERANCE) return null;
    return { x: Math.max(rect.x, Math.min(rect.x + rect.width, Math.round(mainValue))), y: side === 't' ? rect.y : rect.y + rect.height };
  }
  if (mainValue < rect.y - SIDE_TOLERANCE || mainValue > rect.y + rect.height + SIDE_TOLERANCE) return null;
  return { x: side === 'l' ? rect.x : rect.x + rect.width, y: Math.max(rect.y, Math.min(rect.y + rect.height, Math.round(mainValue))) };
}

function outwardPoint(point: Point, side: Side, length: number): Point {
  switch (side) {
    case 't': return { x: point.x, y: point.y - length };
    case 'b': return { x: point.x, y: point.y + length };
    case 'l': return { x: point.x - length, y: point.y };
    case 'r': return { x: point.x + length, y: point.y };
  }
}

function bridgePoints(from: Point, to: Point, preferVerticalFirst: boolean): Point[] {
  if (Math.abs(from.x - to.x) <= EPS || Math.abs(from.y - to.y) <= EPS) return [to];
  return [preferVerticalFirst ? { x: from.x, y: to.y } : { x: to.x, y: from.y }, to];
}

function keepsEndpointStubs(original: Point[], candidate: Point[]): boolean {
  const originalFirst = segmentLength(original[0], original[1]);
  const originalLast = segmentLength(original[original.length - 2], original[original.length - 1]);
  const candidateFirst = segmentLength(candidate[0], candidate[1]);
  const candidateLast = segmentLength(candidate[candidate.length - 2], candidate[candidate.length - 1]);

  if (originalFirst >= MIN_ENDPOINT_STUB && candidateFirst < MIN_ENDPOINT_STUB) return false;
  if (originalLast >= MIN_ENDPOINT_STUB && candidateLast < MIN_ENDPOINT_STUB) return false;
  if (originalFirst < MIN_ENDPOINT_STUB && candidateFirst + 1 < originalFirst) return false;
  if (originalLast < MIN_ENDPOINT_STUB && candidateLast + 1 < originalLast) return false;
  return true;
}

function enforceMinimumEndpointStubs(candidate: Point[], original: Point[]): Point[] {
  const path = compactPath(candidate);
  if (path.length !== 4) return path;

  const start = path[0];
  const end = path[path.length - 1];
  const startDirection = firstDirection(original);
  const endDirection = lastDirection(original);
  const firstAxis = axisOf(path[0], path[1]);
  const middleAxis = axisOf(path[1], path[2]);
  const lastAxis = axisOf(path[2], path[3]);
  if (!firstAxis || !middleAxis || !lastAxis || firstAxis !== lastAxis || firstAxis === middleAxis) return path;

  if (firstAxis === 'h') {
    let x = path[1].x;
    if (startDirection === 'R') x = Math.max(x, start.x + MIN_ENDPOINT_STUB);
    if (startDirection === 'L') x = Math.min(x, start.x - MIN_ENDPOINT_STUB);
    if (endDirection === 'L') x = Math.max(x, end.x + MIN_ENDPOINT_STUB);
    if (endDirection === 'R') x = Math.min(x, end.x - MIN_ENDPOINT_STUB);
    return compactPath([start, { x, y: start.y }, { x, y: end.y }, end]);
  }

  let y = path[1].y;
  if (startDirection === 'D') y = Math.max(y, start.y + MIN_ENDPOINT_STUB);
  if (startDirection === 'U') y = Math.min(y, start.y - MIN_ENDPOINT_STUB);
  if (endDirection === 'U') y = Math.max(y, end.y + MIN_ENDPOINT_STUB);
  if (endDirection === 'D') y = Math.min(y, end.y - MIN_ENDPOINT_STUB);
  return compactPath([start, { x: start.x, y }, { x: end.x, y }, end]);
}

function withComputedPath(edge: Edge, path: Point[]): Edge {
  const data: any = { ...(edge.data || {}), computedPath: path, globalWaypointRefined: true };
  if (data.treeRouting && Array.isArray(data.treeRouting.points)) {
    data.treeRouting = { ...data.treeRouting, points: path };
  }
  return { ...edge, data };
}

function edgeKey(edge: Edge, index: number): string {
  return edge.id || `${edge.source}->${edge.target}#${index}`;
}

function candidateImproves(
  original: Point[],
  candidate: Point[],
  originalCrossings: number,
  candidateCrossings: number,
  originalVisualCrossings: number,
  candidateVisualCrossings: number,
  originalObstacleHits: number,
  candidateObstacleHits: number,
  originalOverlap: number,
  candidateOverlap: number,
): boolean {
  if (candidateCrossings < originalCrossings) return true;
  if (candidateVisualCrossings < originalVisualCrossings && candidateCrossings <= originalCrossings) return true;
  if (candidateObstacleHits < originalObstacleHits && candidateCrossings <= originalCrossings) return true;
  if (
    candidateOverlap + MIN_INTERIOR_LEG < originalOverlap
    && candidateCrossings <= originalCrossings
    && candidateObstacleHits <= originalObstacleHits
  ) {
    return true;
  }

  const originalTurnbacks = turnbackCount(original);
  const candidateTurnbacks = turnbackCount(candidate);
  if (candidateTurnbacks < originalTurnbacks && candidateCrossings <= originalCrossings) return true;

  const originalBends = bendCount(original);
  const candidateBends = bendCount(candidate);
  const originalLength = pathLength(original);
  const candidateLength = pathLength(candidate);
  if (candidateBends < originalBends && candidateLength <= originalLength + MIN_ENDPOINT_STUB) return true;
  return candidateLength < originalLength - MIN_ENDPOINT_STUB
    && candidateBends <= originalBends
    && candidateTurnbacks <= originalTurnbacks
    && candidateCrossings <= originalCrossings;
}

function safeToAcceptCandidate(
  edge: Edge,
  key: string,
  original: Point[],
  candidate: Point[],
  workingPaths: Map<string, Point[]>,
  edgeByKey: Map<string, Edge>,
  obstacles: Map<string, Rect>,
): boolean {
  if (!sameEndpoints(original, candidate)) return false;
  if (!isStrictlyOrthogonal(candidate)) return false;
  if (firstDirection(candidate) !== firstDirection(original)) return false;
  if (lastDirection(candidate) !== lastDirection(original)) return false;
  if (!keepsEndpointStubs(original, candidate)) return false;

  const originalObstacleHits = obstacleHits(original, edge, obstacles);
  const candidateObstacleHits = obstacleHits(candidate, edge, obstacles);
  if (candidateObstacleHits > originalObstacleHits) return false;

  const originalPaths = new Map(workingPaths);
  originalPaths.set(key, original);
  const candidatePaths = new Map(workingPaths);
  candidatePaths.set(key, candidate);
  const originalStrictCrossings = strictCrossingCount(original, key, originalPaths, edgeByKey);
  const candidateStrictCrossings = strictCrossingCount(candidate, key, candidatePaths, edgeByKey);
  const originalCrossings = unrelatedCrossings(original, key, originalPaths, edgeByKey);
  const candidateCrossings = unrelatedCrossings(candidate, key, candidatePaths, edgeByKey);
  const originalVisualCrossings = visualUnrelatedCrossings(original, key, originalPaths, edgeByKey);
  const candidateVisualCrossings = visualUnrelatedCrossings(candidate, key, candidatePaths, edgeByKey);
  const originalOverlap = unrelatedOverlapScore(original, key, originalPaths, edgeByKey);
  const candidateOverlap = unrelatedOverlapScore(candidate, key, candidatePaths, edgeByKey);
  if (candidateCrossings > originalCrossings) return false;
  if (candidateVisualCrossings > originalVisualCrossings) return false;
  if (candidateStrictCrossings > originalStrictCrossings) return false;
  if (
    originalStrictCrossings > 0
    && candidateStrictCrossings >= originalStrictCrossings
    && candidateCrossings >= originalCrossings
  ) {
    return false;
  }

  return candidateImproves(
    original,
    candidate,
    originalCrossings,
    candidateCrossings,
    originalVisualCrossings,
    candidateVisualCrossings,
    originalObstacleHits,
    candidateObstacleHits,
    originalOverlap,
    candidateOverlap,
  );
}

function samePoint(first: Point | undefined, second: Point | undefined): boolean {
  return !!first && !!second
    && Math.abs(first.x - second.x) <= EPS
    && Math.abs(first.y - second.y) <= EPS;
}

function safeToAcceptEndpointSlideCandidate(
  edge: Edge,
  key: string,
  original: Point[],
  candidate: Point[],
  slidingEndpoint: 'source' | 'target',
  workingPaths: Map<string, Point[]>,
  edgeByKey: Map<string, Edge>,
  obstacles: Map<string, Rect>,
): boolean {
  if (slidingEndpoint === 'source' && !samePoint(original[original.length - 1], candidate[candidate.length - 1])) return false;
  if (slidingEndpoint === 'target' && !samePoint(original[0], candidate[0])) return false;
  if (!isStrictlyOrthogonal(candidate)) return false;
  if (firstDirection(candidate) !== firstDirection(original)) return false;
  if (lastDirection(candidate) !== lastDirection(original)) return false;
  if (!keepsEndpointStubs(original, candidate)) return false;

  const originalObstacleHits = obstacleHits(original, edge, obstacles);
  const candidateObstacleHits = obstacleHits(candidate, edge, obstacles);
  if (candidateObstacleHits > originalObstacleHits) return false;

  const originalPaths = new Map(workingPaths);
  originalPaths.set(key, original);
  const candidatePaths = new Map(workingPaths);
  candidatePaths.set(key, candidate);
  const originalCrossings = unrelatedCrossings(original, key, originalPaths, edgeByKey);
  const candidateCrossings = unrelatedCrossings(candidate, key, candidatePaths, edgeByKey);
  const originalVisualCrossings = visualUnrelatedCrossings(original, key, originalPaths, edgeByKey);
  const candidateVisualCrossings = visualUnrelatedCrossings(candidate, key, candidatePaths, edgeByKey);
  if (candidateCrossings > originalCrossings) return false;
  if (candidateVisualCrossings > originalVisualCrossings) return false;

  const originalOverlap = unrelatedOverlapScore(original, key, originalPaths, edgeByKey);
  const candidateOverlap = unrelatedOverlapScore(candidate, key, candidatePaths, edgeByKey);
  return candidateCrossings < originalCrossings
    || candidateVisualCrossings < originalVisualCrossings
    || candidateObstacleHits < originalObstacleHits
    || candidateOverlap + MIN_INTERIOR_LEG < originalOverlap;
}

function endpointSlideAxisValues(rect: Rect, side: Side, conflict: Segment): number[] {
  const values = new Set<number>();
  if (side === 't' || side === 'b') {
    const conflictRange = segmentRange(conflict, 'x');
    addAxisCandidate(values, conflictRange.min - MIN_ENDPOINT_STUB);
    addAxisCandidate(values, conflictRange.max + MIN_ENDPOINT_STUB);
    addAxisCandidate(values, rect.x + MIN_ENDPOINT_STUB);
    addAxisCandidate(values, rect.x + rect.width - MIN_ENDPOINT_STUB);
    addAxisCandidate(values, rect.x + rect.width / 2);
  } else {
    const conflictRange = segmentRange(conflict, 'y');
    addAxisCandidate(values, conflictRange.min - MIN_ENDPOINT_STUB);
    addAxisCandidate(values, conflictRange.max + MIN_ENDPOINT_STUB);
    addAxisCandidate(values, rect.y + MIN_ENDPOINT_STUB);
    addAxisCandidate(values, rect.y + rect.height - MIN_ENDPOINT_STUB);
    addAxisCandidate(values, rect.y + rect.height / 2);
  }
  return [...values];
}

function endpointSlideCandidatesAwayFromCrossing(
  edge: Edge,
  path: Point[],
  segmentIndex: number,
  conflict: Segment,
  nodeById: Map<string, ReactFlowNode>,
): Array<{ endpoint: 'source' | 'target'; path: Point[] }> {
  const candidates: Array<{ endpoint: 'source' | 'target'; path: Point[] }> = [];
  if (path.length < 3) return candidates;

  if (segmentIndex === 0) {
    const sourceNode = nodeById.get(edge.source);
    const sourceRect = sourceNode ? getNodeRect(sourceNode) : null;
    const sourceSide = sourceRect ? inferEndpointSide(path[0], sourceRect) : null;
    if (sourceRect && sourceSide) {
      const length = Math.max(MIN_ENDPOINT_STUB, Math.min(96, segmentLength(path[0], path[1])));
      const preferVerticalFirst = sourceSide === 'l' || sourceSide === 'r';
      for (const value of endpointSlideAxisValues(sourceRect, sourceSide, conflict)) {
        const start = slideEndpointOnSide(sourceRect, sourceSide, value);
        if (!start || samePoint(start, path[0])) continue;
        const stub = outwardPoint(start, sourceSide, length);
        candidates.push({
          endpoint: 'source',
          path: compactPath([start, stub, ...bridgePoints(stub, path[2], preferVerticalFirst), ...path.slice(3)]),
        });
      }
    }
  }

  if (segmentIndex === path.length - 2) {
    const targetNode = nodeById.get(edge.target);
    const targetRect = targetNode ? getNodeRect(targetNode) : null;
    const targetSide = targetRect ? inferEndpointSide(path[path.length - 1], targetRect) : null;
    if (targetRect && targetSide) {
      const end = path[path.length - 1];
      const previous = path[path.length - 2];
      const beforePrevious = path[path.length - 3];
      const length = Math.max(MIN_ENDPOINT_STUB, Math.min(96, segmentLength(previous, end)));
      const preferVerticalFirst = targetSide === 't' || targetSide === 'b';
      for (const value of endpointSlideAxisValues(targetRect, targetSide, conflict)) {
        const adjustedEnd = slideEndpointOnSide(targetRect, targetSide, value);
        if (!adjustedEnd || samePoint(adjustedEnd, end)) continue;
        const stub = outwardPoint(adjustedEnd, targetSide, length);
        candidates.push({
          endpoint: 'target',
          path: compactPath([
            ...path.slice(0, -3),
            beforePrevious,
            ...bridgePoints(beforePrevious, stub, preferVerticalFirst),
            stub,
            adjustedEnd,
          ]),
        });
      }
    }
  }

  return candidates;
}

function pathQualityScore(
  edge: Edge,
  key: string,
  path: Point[],
  workingPaths: Map<string, Point[]>,
  edgeByKey: Map<string, Edge>,
  obstacles: Map<string, Rect>,
): number {
  const paths = new Map(workingPaths);
  paths.set(key, path);
  return unrelatedCrossings(path, key, paths, edgeByKey) * 10000
    + visualUnrelatedCrossings(path, key, paths, edgeByKey) * 9000
    + strictCrossingCount(path, key, paths, edgeByKey) * 7000
    + unrelatedOverlapScore(path, key, paths, edgeByKey) * 80
    + obstacleHits(path, edge, obstacles) * 5000
    + turnbackCount(path) * 500
    + bendCount(path) * 40
    + pathLength(path);
}

function findBestInteriorCrossingShiftCandidate(
  edge: Edge,
  key: string,
  path: Point[],
  workingPaths: Map<string, Point[]>,
  edgeByKey: Map<string, Edge>,
  obstacles: Map<string, Rect>,
  nodeById: Map<string, ReactFlowNode>,
): Point[] | null {
  let best: Point[] | null = null;
  let bestScore = pathQualityScore(edge, key, path, workingPaths, edgeByKey, obstacles);

  for (const [otherKey, otherPath] of workingPaths) {
    if (otherKey === key) continue;
    const other = edgeByKey.get(otherKey);
    if (!other || sharesEndpoint(edge, other)) continue;
    const otherSegments = toSegments(otherPath);

    for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
      if (!axisOf(path[segmentIndex], path[segmentIndex + 1])) continue;
      const segment = { a: path[segmentIndex], b: path[segmentIndex + 1] };
      for (const otherSegment of otherSegments) {
        const hasStrictCrossing = strictCrosses(segment, otherSegment) || visualStrictCrosses(segment, otherSegment);
        const hasLongOverlap = parallelOverlapLength(segment, otherSegment) > MIN_INTERIOR_LEG;
        if (!hasStrictCrossing && !hasLongOverlap) continue;
        const candidates = [
          ...(hasStrictCrossing ? shiftCandidatesAwayFromCrossing(path, segmentIndex, otherSegment) : []),
          ...(hasLongOverlap ? shiftCandidatesAwayFromOverlap(path, segmentIndex, otherSegment) : []),
          ...shiftCandidatesAwayFromLaneBand(edge, path, segmentIndex, workingPaths, edgeByKey, obstacles),
        ];
        const seenCandidates = new Set<string>();
        for (const candidate of candidates) {
          const candidateKey = candidate.map(point => `${point.x},${point.y}`).join(';');
          if (seenCandidates.has(candidateKey)) continue;
          seenCandidates.add(candidateKey);
          if (!safeToAcceptCandidate(edge, key, path, candidate, workingPaths, edgeByKey, obstacles)) continue;
          const score = pathQualityScore(edge, key, candidate, workingPaths, edgeByKey, obstacles);
          if (score < bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
        if (hasStrictCrossing) {
          for (const endpointCandidate of endpointSlideCandidatesAwayFromCrossing(edge, path, segmentIndex, otherSegment, nodeById)) {
            const candidateKey = endpointCandidate.path.map(point => `${point.x},${point.y}`).join(';');
            if (seenCandidates.has(candidateKey)) continue;
            seenCandidates.add(candidateKey);
            if (!safeToAcceptEndpointSlideCandidate(
              edge,
              key,
              path,
              endpointCandidate.path,
              endpointCandidate.endpoint,
              workingPaths,
              edgeByKey,
              obstacles,
            )) {
              continue;
            }
            const score = pathQualityScore(edge, key, endpointCandidate.path, workingPaths, edgeByKey, obstacles);
            if (score < bestScore) {
              best = endpointCandidate.path;
              bestScore = score;
            }
          }
        }
      }
    }
  }

  return best;
}

export function refineGlobalEdgeWaypoints(edges: Edge[], nodes: ReactFlowNode[]): Edge[] {
  if (edges.length === 0) return edges;

  const paths = new Map<string, Point[]>();
  const edgeByKey = new Map<string, Edge>();
  edges.forEach((edge, index) => {
    const path = compactPath(getEdgePath(edge));
    if (path.length < 2) return;
    const key = edgeKey(edge, index);
    paths.set(key, path);
    edgeByKey.set(key, edge);
  });
  if (paths.size === 0) return edges;

  const softObstacles = [...routingObstacles(nodes).values()];
  const refined = refineOrthogonalWaypointsDetailed(paths, {
    buddyGroups: buildPipelineBuddyGroups(edges),
    hardObstacles: [],
    softObstacles,
    spacing: DEFAULT_SPACING,
    maxPasses: 2,
    maxEdgesPerPass: 48,
    enableReroute: true,
    maxRerouteEdges: Math.min(8, paths.size),
    maxRerouteCandidates: 128,
    maxSegmentShiftCandidatesPerEdge: 64,
    scoring: {
      hardCrossingWeight: 6000,
      buddyCrossingWeight: 900,
      parallelOverlapWeight: 42,
      softObstacleWeight: 240,
      softNearMissWeight: 45,
      softNearMissPadding: 18,
      turnbackWeight: 160,
      bendWeight: 20,
    },
  });

  const obstacles = routingObstacles(nodes);
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const workingPaths = new Map(paths);
  const acceptedPaths = new Map<string, Point[]>();

  if (refined.summary.changedEdgeIds.length > 0) {
    edges.forEach((edge, index) => {
      const key = edgeKey(edge, index);
      const original = paths.get(key);
      const candidate = refined.paths.get(key);
      if (!original || !candidate) return;

      const normalized = enforceMinimumEndpointStubs(candidate, original);
      if (pathEquals(original, normalized)) return;
      if (!safeToAcceptCandidate(edge, key, original, normalized, workingPaths, edgeByKey, obstacles)) return;

      workingPaths.set(key, normalized);
      acceptedPaths.set(key, normalized);
    });
  }

  for (let pass = 0; pass < 2; pass += 1) {
    let changed = false;
    edges.forEach((edge, index) => {
      const key = edgeKey(edge, index);
      const current = workingPaths.get(key);
      if (!current) return;

      const candidate = findBestInteriorCrossingShiftCandidate(
        edge,
        key,
        current,
        workingPaths,
        edgeByKey,
        obstacles,
        nodeById,
      );
      if (!candidate || pathEquals(current, candidate)) return;

      workingPaths.set(key, candidate);
      acceptedPaths.set(key, candidate);
      changed = true;
    });
    if (!changed) break;
  }

  if (acceptedPaths.size === 0) return edges;

  return edges.map((edge, index) => {
    const key = edgeKey(edge, index);
    const accepted = acceptedPaths.get(key);
    return accepted ? withComputedPath(edge, accepted) : edge;
  });
}
