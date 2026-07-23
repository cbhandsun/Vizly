import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import {
  compactPath,
  EPS,
  MIN_BRANCH_SPAN,
  signDelta,
  type Point,
  type Side,
} from './edgeSharedTrunkSynthesisUtils';

export type EndpointKind = 'source' | 'target';
export type SharedTrunkSynthesisOptions = {
  nodes?: ReactFlowNode[];
};

export const MIN_GROUP_SIZE = 2;
export const MIN_PARALLEL_GAP = 8;
export const TARGET_ENTRY_CROSSING_WINDOW = 320;
export const MIN_DIRECTIONAL_TARGET_ANCHOR_SPAN = 180;
export const HEMISPHERE_ESCAPE_RATIO = 1.25;
export const HEMISPHERE_ESCAPE_MIN = 50;
const MAX_COORDINATE = 10_000_000;
const MAX_PATH_POINTS = 10_000;
const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

export function normalizeSharedTrunkEdges(value: unknown): Edge[] {
  if (!Array.isArray(value)) return [];
  return value.filter((edge): edge is Edge => Boolean(
    edge
      && typeof edge === 'object'
      && typeof (edge as Partial<Edge>).id === 'string'
      && typeof (edge as Partial<Edge>).source === 'string'
      && typeof (edge as Partial<Edge>).target === 'string',
  ));
}

export function normalizeSharedTrunkOptions(
  value: unknown,
): SharedTrunkSynthesisOptions {
  if (!value || typeof value !== 'object') return {};
  const nodes = Array.isArray((value as SharedTrunkSynthesisOptions).nodes)
    ? (value as SharedTrunkSynthesisOptions).nodes?.filter(node =>
      Boolean(node && typeof node === 'object' && typeof node.id === 'string'))
    : undefined;
  return { nodes };
}

export function getEdgePath(edge: Edge): Point[] {
  const treeRouting = asRecord(edge.data?.treeRouting);
  const raw = edge.data?.computedPath || treeRouting.points || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_PATH_POINTS)
    .map(point => {
      const candidate = asRecord(point);
      return { x: Number(candidate.x), y: Number(candidate.y) };
    })
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map(point => ({
      x: Math.min(MAX_COORDINATE, Math.max(-MAX_COORDINATE, point.x)),
      y: Math.min(MAX_COORDINATE, Math.max(-MAX_COORDINATE, point.y)),
    }));
}

export function withComputedPath(edge: Edge, path: Point[]): Edge {
  const data: Record<string, unknown> = { ...(edge.data || {}), computedPath: path, sharedTrunkSynthesized: true };
  const updatedTreeRouting = asRecord(data.treeRouting);
  if (Array.isArray(updatedTreeRouting.points)) {
    data.treeRouting = { ...updatedTreeRouting, points: path };
  }
  return { ...edge, data };
}

export function median(values: number[]): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function sourceSide(path: Point[]): Side | null {
  return endpointSide(path, 'source');
}

export function targetSide(path: Point[]): Side | null {
  return endpointSide(path, 'target');
}

export function endpointSide(path: Point[], endpoint: EndpointKind): Side | null {
  if (path.length < 2) return null;
  const point = endpoint === 'source' ? path[0] : path[path.length - 1];
  const adjacent = endpoint === 'source' ? path[1] : path[path.length - 2];
  if (Math.abs(point.x - adjacent.x) <= EPS) {
    if (endpoint === 'source') {
      if (adjacent.y > point.y + EPS) return 'bottom';
      if (adjacent.y < point.y - EPS) return 'top';
    } else {
      if (point.y > adjacent.y + EPS) return 'top';
      if (point.y < adjacent.y - EPS) return 'bottom';
    }
  }
  if (Math.abs(point.y - adjacent.y) <= EPS) {
    if (endpoint === 'source') {
      if (adjacent.x > point.x + EPS) return 'right';
      if (adjacent.x < point.x - EPS) return 'left';
    } else {
      if (point.x > adjacent.x + EPS) return 'left';
      if (point.x < adjacent.x - EPS) return 'right';
    }
  }
  return null;
}

export function branchValue(path: Point[], side: Side, endpoint: EndpointKind): number | null {
  const segment = branchSegment(path, side, endpoint);
  if (segment) return side === 'top' || side === 'bottom' ? segment.a.y : segment.a.x;
  if (path.length < 2) return null;
  const adjacent = endpoint === 'source' ? path[1] : path[path.length - 2];
  return side === 'top' || side === 'bottom' ? adjacent.y : adjacent.x;
}

export function branchSegment(path: Point[], side: Side, endpoint: EndpointKind): { index: number; a: Point; b: Point } | null {
  if (endpoint === 'target') {
    for (let index = path.length - 2; index >= 1; index -= 1) {
      const a = path[index];
      const b = path[index + 1];
      if ((side === 'top' || side === 'bottom') && Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) >= MIN_BRANCH_SPAN) {
        return { index, a, b };
      }
      if ((side === 'left' || side === 'right') && Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) >= MIN_BRANCH_SPAN) {
        return { index, a, b };
      }
    }
    return null;
  }

  for (let index = 1; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    if ((side === 'top' || side === 'bottom') && Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) >= MIN_BRANCH_SPAN) {
      return { index, a, b };
    }
    if ((side === 'left' || side === 'right') && Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) >= MIN_BRANCH_SPAN) {
      return { index, a, b };
    }
  }
  return null;
}

export function sharedBranchValue(values: number[], side: Side): number {
  if (side === 'top' || side === 'left') return Math.max(...values);
  if (side === 'bottom' || side === 'right') return Math.min(...values);
  return median(values);
}

export function branchTailMovesTowardEnd(path: Point[], side: Side, anchorMain: number, branch: { a: Point; b: Point }): boolean {
  const end = path[path.length - 1];
  const branchDelta = side === 'top' || side === 'bottom'
    ? branch.b.x - anchorMain
    : branch.b.y - anchorMain;
  const endDelta = side === 'top' || side === 'bottom'
    ? end.x - anchorMain
    : end.y - anchorMain;
  const branchSign = signDelta(branchDelta);
  const endSign = signDelta(endDelta);
  return branchSign === 0 || endSign === 0 || branchSign === endSign;
}

export function branchDirection(path: Point[], side: Side, endpoint: EndpointKind): number | null {
  const branch = branchSegment(path, side, endpoint);
  if (!branch) return null;
  const delta = side === 'top' || side === 'bottom'
    ? branch.b.x - branch.a.x
    : branch.b.y - branch.a.y;
  if (Math.abs(delta) <= EPS) return null;
  return delta > 0 ? 1 : -1;
}

export function endpointAnchorMain(path: Point[], side: Side, endpoint: EndpointKind): number | null {
  const point = path[endpoint === 'source' ? 0 : path.length - 1];
  if (!point) return null;
  return side === 'top' || side === 'bottom' ? point.x : point.y;
}

export function targetApproachDirection(path: Point[], side: Side): number {
  const start = path[0];
  const end = path[path.length - 1];
  if (!start || !end) return 0;
  const endpointMain = side === 'top' || side === 'bottom' ? end.x : end.y;

  for (let index = path.length - 2; index >= 0; index -= 1) {
    const point = path[index];
    const pointMain = side === 'top' || side === 'bottom' ? point.x : point.y;
    const direction = signDelta(endpointMain - pointMain);
    if (direction !== 0) return direction;
  }

  const sourceMain = side === 'top' || side === 'bottom' ? start.x : start.y;
  return signDelta(endpointMain - sourceMain);
}

export function targetAnchorHalfDirection(anchorMain: number, centerMain: number): number {
  return signDelta(centerMain - anchorMain);
}

export function oppositeGeometrySide(first: string, second: string): boolean {
  return (first === 'top' && second === 'bottom')
    || (first === 'bottom' && second === 'top')
    || (first === 'left' && second === 'right')
    || (first === 'right' && second === 'left');
}

export function synthesizeSourcePath(path: Point[], side: Side, anchorMain: number, branchValue: number): Point[] {
  const start = path[0];
  const end = path[path.length - 1];
  const branch = branchSegment(path, side, 'source');
  if (side === 'top' || side === 'bottom') {
    const anchor = { x: anchorMain, y: start.y };
    if (branch && branchTailMovesTowardEnd(path, side, anchorMain, branch)) {
      return compactPath([
        anchor,
        { x: anchorMain, y: branchValue },
        { x: branch.b.x, y: branchValue },
        ...path.slice(branch.index + 2),
      ]);
    }
    return compactPath([
      anchor,
      { x: anchorMain, y: branchValue },
      { x: end.x, y: branchValue },
      end,
    ]);
  }
  const anchor = { x: start.x, y: anchorMain };
  if (branch && branchTailMovesTowardEnd(path, side, anchorMain, branch)) {
    return compactPath([
      anchor,
      { x: branchValue, y: anchorMain },
      { x: branchValue, y: branch.b.y },
      ...path.slice(branch.index + 2),
    ]);
  }
  return compactPath([
    anchor,
    { x: branchValue, y: anchorMain },
    { x: branchValue, y: end.y },
    end,
  ]);
}

export function samePath(first: Point[], second: Point[]): boolean {
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

export function strictCrossPoint(firstA: Point, firstB: Point, secondA: Point, secondB: Point): Point | null {
  const firstAxis = axisOf(firstA, firstB);
  const secondAxis = axisOf(secondA, secondB);
  if (!firstAxis || !secondAxis || firstAxis === secondAxis) return null;
  const horizontal = firstAxis === 'h'
    ? { a: firstA, b: firstB }
    : { a: secondA, b: secondB };
  const vertical = firstAxis === 'v'
    ? { a: firstA, b: firstB }
    : { a: secondA, b: secondB };
  const minX = Math.min(horizontal.a.x, horizontal.b.x);
  const maxX = Math.max(horizontal.a.x, horizontal.b.x);
  const minY = Math.min(vertical.a.y, vertical.b.y);
  const maxY = Math.max(vertical.a.y, vertical.b.y);
  const x = vertical.a.x;
  const y = horizontal.a.y;
  return x > minX + EPS && x < maxX - EPS && y > minY + EPS && y < maxY - EPS
    ? { x, y }
    : null;
}

export function segmentLength(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function pathLength(path: Point[]): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    total += segmentLength(path[index], path[index + 1]);
  }
  return total;
}

export function distanceFromSegmentEnd(path: Point[], segmentIndex: number): number {
  let total = 0;
  for (let index = segmentIndex + 1; index < path.length - 1; index += 1) {
    total += segmentLength(path[index], path[index + 1]);
  }
  return total;
}

export function totalStrictCrossings(edges: Edge[], paths: Point[][]): number {
  let total = 0;
  for (let firstIndex = 0; firstIndex < paths.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < paths.length; secondIndex += 1) {
      const firstPath = paths[firstIndex];
      const secondPath = paths[secondIndex];
      for (let i = 0; i < firstPath.length - 1; i += 1) {
        for (let j = 0; j < secondPath.length - 1; j += 1) {
          if (strictCrossPoint(firstPath[i], firstPath[i + 1], secondPath[j], secondPath[j + 1])) {
            total += edges[firstIndex]?.target === edges[secondIndex]?.target ? 2 : 1;
          }
        }
      }
    }
  }
  return total;
}

export function buildTargetEntryJoinCandidate(path: Point[], segmentIndex: number, crossing: Point): Point[] | null {
  if (path.length < 4 || segmentIndex < 0 || segmentIndex >= path.length - 1) return null;
  const end = path[path.length - 1];
  const beforeEnd = path[path.length - 2];
  const targetAxis = axisOf(beforeEnd, end);
  const crossingAxis = axisOf(path[segmentIndex], path[segmentIndex + 1]);
  if (!targetAxis || !crossingAxis || targetAxis !== crossingAxis) return null;

  if (targetAxis === 'v') {
    return compactPath([
      ...path.slice(0, segmentIndex + 1),
      crossing,
      { x: end.x, y: crossing.y },
      end,
    ]);
  }

  return compactPath([
    ...path.slice(0, segmentIndex + 1),
    crossing,
    { x: crossing.x, y: end.y },
    end,
  ]);
}

export function crossingScore(edges: Edge[], paths: Point[][], groupIndices: Set<number>): number {
  const crossingPoints = new Set<string>();
  for (let firstIndex = 0; firstIndex < paths.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < paths.length; secondIndex += 1) {
      if (!groupIndices.has(firstIndex) && !groupIndices.has(secondIndex)) continue;
      if (groupIndices.has(firstIndex) && groupIndices.has(secondIndex)) continue;
      if (edges[firstIndex]?.source === edges[secondIndex]?.source) continue;
      if (edges[firstIndex]?.target === edges[secondIndex]?.target) continue;
      const firstPath = paths[firstIndex];
      const secondPath = paths[secondIndex];
      for (let i = 0; i < firstPath.length - 1; i += 1) {
        for (let j = 0; j < secondPath.length - 1; j += 1) {
          const point = strictCrossPoint(firstPath[i], firstPath[i + 1], secondPath[j], secondPath[j + 1]);
          if (point) crossingPoints.add(`${Math.round(point.x)},${Math.round(point.y)}`);
        }
      }
    }
  }
  return crossingPoints.size;
}
