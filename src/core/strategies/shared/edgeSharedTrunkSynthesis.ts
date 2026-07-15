import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import {
  buildHemisphereTargetCandidatePaths,
  compactPath,
  EPS,
  expectedTargetSideFromGeometry,
  firstStepBacktracksFromTarget,
  MIN_BRANCH_SPAN,
  MIN_ENDPOINT_TAIL,
  nodeRect,
  oppositeSide,
  pathHitsUnrelatedNode,
  rectCenter,
  signDelta,
  type Point,
  type Side,
} from './edgeSharedTrunkSynthesisUtils';

type EndpointKind = 'source' | 'target';
type SharedTrunkSynthesisOptions = {
  nodes?: ReactFlowNode[];
};

const MIN_GROUP_SIZE = 2;
const MIN_PARALLEL_GAP = 8;
const TARGET_ENTRY_CROSSING_WINDOW = 320;
const MIN_DIRECTIONAL_TARGET_ANCHOR_SPAN = 180;
const HEMISPHERE_ESCAPE_RATIO = 1.25;
const HEMISPHERE_ESCAPE_MIN = 50;

function getEdgePath(edge: Edge): Point[] {
  const raw = (edge.data as any)?.computedPath || (edge.data as any)?.treeRouting?.points || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((point: any) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function withComputedPath(edge: Edge, path: Point[]): Edge {
  const data: any = { ...(edge.data || {}), computedPath: path, sharedTrunkSynthesized: true };
  if (data.treeRouting && Array.isArray(data.treeRouting.points)) {
    data.treeRouting = { ...data.treeRouting, points: path };
  }
  return { ...edge, data };
}

function median(values: number[]): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sourceSide(path: Point[]): Side | null {
  return endpointSide(path, 'source');
}

function targetSide(path: Point[]): Side | null {
  return endpointSide(path, 'target');
}

function endpointSide(path: Point[], endpoint: EndpointKind): Side | null {
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

function branchValue(path: Point[], side: Side, endpoint: EndpointKind): number | null {
  const segment = branchSegment(path, side, endpoint);
  if (segment) return side === 'top' || side === 'bottom' ? segment.a.y : segment.a.x;
  if (path.length < 2) return null;
  const adjacent = endpoint === 'source' ? path[1] : path[path.length - 2];
  return side === 'top' || side === 'bottom' ? adjacent.y : adjacent.x;
}

function branchSegment(path: Point[], side: Side, endpoint: EndpointKind): { index: number; a: Point; b: Point } | null {
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

function sharedBranchValue(values: number[], side: Side): number {
  if (side === 'top' || side === 'left') return Math.max(...values);
  if (side === 'bottom' || side === 'right') return Math.min(...values);
  return median(values);
}

function branchTailMovesTowardEnd(path: Point[], side: Side, anchorMain: number, branch: { a: Point; b: Point }): boolean {
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

function branchDirection(path: Point[], side: Side, endpoint: EndpointKind): number | null {
  const branch = branchSegment(path, side, endpoint);
  if (!branch) return null;
  const delta = side === 'top' || side === 'bottom'
    ? branch.b.x - branch.a.x
    : branch.b.y - branch.a.y;
  if (Math.abs(delta) <= EPS) return null;
  return delta > 0 ? 1 : -1;
}

function endpointAnchorMain(path: Point[], side: Side, endpoint: EndpointKind): number | null {
  const point = path[endpoint === 'source' ? 0 : path.length - 1];
  if (!point) return null;
  return side === 'top' || side === 'bottom' ? point.x : point.y;
}

function targetApproachDirection(path: Point[], side: Side): number {
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

function targetAnchorHalfDirection(anchorMain: number, centerMain: number): number {
  return signDelta(centerMain - anchorMain);
}

function oppositeGeometrySide(first: string, second: string): boolean {
  return (first === 'top' && second === 'bottom')
    || (first === 'bottom' && second === 'top')
    || (first === 'left' && second === 'right')
    || (first === 'right' && second === 'left');
}

function splitNodeGeometryHemisphereGroups(
  edges: Edge[],
  indices: number[],
  endpoint: EndpointKind,
  nodes: ReactFlowNode[] | undefined,
): number[][] | null {
  if (!nodes || indices.length < MIN_GROUP_SIZE) return null;
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const hubId = endpoint === 'source' ? edges[indices[0]]?.source : edges[indices[0]]?.target;
  const hubRect = nodeRect(nodeById.get(hubId), nodeById);
  if (!hubRect) return null;
  const hubCenter = rectCenter(hubRect);

  const entries: Array<{ index: number; peerCenter: Point; dx: number; dy: number }> = [];
  for (const index of indices) {
    const edge = edges[index];
    const peerId = endpoint === 'source' ? edge?.target : edge?.source;
    const peerRect = nodeRect(nodeById.get(peerId), nodeById);
    if (!peerRect) continue;
    const peerCenter = rectCenter(peerRect);
    entries.push({
      index,
      peerCenter,
      dx: peerCenter.x - hubCenter.x,
      dy: peerCenter.y - hubCenter.y,
    });
  }
  if (entries.length < MIN_GROUP_SIZE) return null;

  const centroid = entries.reduce(
    (acc, entry) => ({ x: acc.x + entry.peerCenter.x, y: acc.y + entry.peerCenter.y }),
    { x: 0, y: 0 },
  );
  centroid.x /= entries.length;
  centroid.y /= entries.length;
  const flowDx = centroid.x - hubCenter.x;
  const flowDy = centroid.y - hubCenter.y;
  const isVerticalFlow = Math.abs(flowDy) >= Math.abs(flowDx);

  const sideGroups = new Map<string, number[]>();
  for (const entry of entries) {
    let side: string;
    if (isVerticalFlow) {
      side = Math.abs(entry.dx) > Math.abs(entry.dy) * HEMISPHERE_ESCAPE_RATIO
        && Math.abs(entry.dx) > HEMISPHERE_ESCAPE_MIN
        ? (entry.dx < 0 ? 'left' : 'right')
        : (entry.dy < 0 ? 'top' : 'bottom');
    } else {
      side = Math.abs(entry.dy) > Math.abs(entry.dx) * HEMISPHERE_ESCAPE_RATIO
        && Math.abs(entry.dy) > HEMISPHERE_ESCAPE_MIN
        ? (entry.dy < 0 ? 'top' : 'bottom')
        : (entry.dx < 0 ? 'left' : 'right');
    }
    if (!sideGroups.has(side)) sideGroups.set(side, []);
    sideGroups.get(side)?.push(entry.index);
  }

  if (sideGroups.size < 2) return null;

  let largestSide = '';
  let largestCount = 0;
  for (const [side, group] of sideGroups) {
    if (group.length > largestCount) {
      largestSide = side;
      largestCount = group.length;
    }
  }

  if (largestCount >= MIN_GROUP_SIZE) {
    const singletonKeys: string[] = [];
    for (const [side, group] of sideGroups) {
      if (side === largestSide || group.length !== 1) continue;
      if (!oppositeGeometrySide(side, largestSide)) {
        sideGroups.get(largestSide)?.push(...group);
        singletonKeys.push(side);
      }
    }
    for (const key of singletonKeys) sideGroups.delete(key);
  }

  return sideGroups.size >= 2 ? [...sideGroups.values()] : null;
}

function splitTargetDirectionGroups(paths: Point[][], indices: number[], side: Side): number[][] {
  if (indices.length < MIN_GROUP_SIZE) return [indices];
  const anchorByIndex = new Map<number, number>();
  for (const index of indices) {
    const anchor = endpointAnchorMain(paths[index], side, 'target');
    if (typeof anchor === 'number' && Number.isFinite(anchor)) {
      anchorByIndex.set(index, anchor);
    }
  }
  const anchorValues = [...anchorByIndex.values()];
  if (anchorValues.length < MIN_GROUP_SIZE) return [indices];
  const anchorSpan = Math.max(...anchorValues) - Math.min(...anchorValues);
  if (anchorSpan < MIN_DIRECTIONAL_TARGET_ANCHOR_SPAN) return [indices];
  const anchorCenter = median(anchorValues);

  const directionGroups = new Map<number, number[]>();
  const neutralIndices: number[] = [];
  const neutralSingletonGroups: number[][] = [];
  for (const index of indices) {
    const direction = targetApproachDirection(paths[index], side);
    if (direction === 0) {
      neutralIndices.push(index);
      continue;
    }
    if (!directionGroups.has(direction)) directionGroups.set(direction, []);
    directionGroups.get(direction)?.push(index);
  }

  for (const index of neutralIndices) {
    const anchor = anchorByIndex.get(index);
    const anchorDirection = typeof anchor === 'number'
      ? targetAnchorHalfDirection(anchor, anchorCenter)
      : 0;
    if (anchorDirection === 0) {
      neutralSingletonGroups.push([index]);
      continue;
    }
    if (!directionGroups.has(anchorDirection)) directionGroups.set(anchorDirection, []);
    directionGroups.get(anchorDirection)?.push(index);
  }

  if (directionGroups.size + neutralSingletonGroups.length < 2) return [indices];
  return [...directionGroups.values(), ...neutralSingletonGroups];
}

function synthesizeSourcePath(path: Point[], side: Side, anchorMain: number, branchValue: number): Point[] {
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

function synthesizeTargetPath(path: Point[], side: Side, anchorMain: number, branchValue: number): Point[] {
  const end = path[path.length - 1];
  const branch = branchSegment(path, side, 'target');
  if (!branch) {
    const beforeEnd = path[path.length - 2];
    const prefix = path.slice(0, -1);
    if (!beforeEnd) return path;

    if (side === 'top' || side === 'bottom') {
      const anchor = { x: anchorMain, y: end.y };
      return compactPath([
        ...prefix,
        { x: beforeEnd.x, y: branchValue },
        { x: anchorMain, y: branchValue },
        anchor,
      ]);
    }

    const anchor = { x: end.x, y: anchorMain };
    return compactPath([
      ...prefix,
      { x: branchValue, y: beforeEnd.y },
      { x: branchValue, y: anchorMain },
      anchor,
    ]);
  }

  if (side === 'top' || side === 'bottom') {
    const anchor = { x: anchorMain, y: end.y };
    const prefix = path.slice(0, branch.index + 2);
    if (Math.abs(branch.a.y - branchValue) <= EPS) {
      return compactPath([
        ...prefix,
        { x: anchorMain, y: branchValue },
        anchor,
      ]);
    }
    return compactPath([
      ...prefix,
      { x: branch.b.x, y: branchValue },
      { x: anchorMain, y: branchValue },
      anchor,
    ]);
  }

  const anchor = { x: end.x, y: anchorMain };
  const prefix = path.slice(0, branch.index + 2);
  if (Math.abs(branch.a.x - branchValue) <= EPS) {
    return compactPath([
      ...prefix,
      { x: branchValue, y: anchorMain },
      anchor,
    ]);
  }
  return compactPath([
    ...prefix,
    { x: branchValue, y: branch.b.y },
    { x: branchValue, y: anchorMain },
    anchor,
  ]);
}

function samePath(first: Point[], second: Point[]): boolean {
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

function strictCrossPoint(firstA: Point, firstB: Point, secondA: Point, secondB: Point): Point | null {
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

function segmentLength(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function pathLength(path: Point[]): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    total += segmentLength(path[index], path[index + 1]);
  }
  return total;
}

function distanceFromSegmentEnd(path: Point[], segmentIndex: number): number {
  let total = 0;
  for (let index = segmentIndex + 1; index < path.length - 1; index += 1) {
    total += segmentLength(path[index], path[index + 1]);
  }
  return total;
}

function totalStrictCrossings(edges: Edge[], paths: Point[][]): number {
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

function buildTargetEntryJoinCandidate(path: Point[], segmentIndex: number, crossing: Point): Point[] | null {
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

export function repairSharedTargetEntryCrossings(edges: Edge[]): Edge[] {
  let paths = edges.map(edge => getEdgePath(edge));
  if (paths.filter(path => path.length >= 2).length < 2) return edges;

  const nextEdges = [...edges];
  let changed = false;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const currentScore = totalStrictCrossings(nextEdges, paths);
    let bestScore = currentScore;
    let bestIndex = -1;
    let bestPath: Point[] | null = null;

    for (let firstIndex = 0; firstIndex < paths.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < paths.length; secondIndex += 1) {
        if (!nextEdges[firstIndex]?.target || nextEdges[firstIndex]?.target !== nextEdges[secondIndex]?.target) continue;
        const firstPath = paths[firstIndex];
        const secondPath = paths[secondIndex];
        for (let i = 0; i < firstPath.length - 1; i += 1) {
          for (let j = 0; j < secondPath.length - 1; j += 1) {
            const crossing = strictCrossPoint(firstPath[i], firstPath[i + 1], secondPath[j], secondPath[j + 1]);
            if (!crossing) continue;

            const candidates: Array<{ edgeIndex: number; path: Point[] | null }> = [];
            if (distanceFromSegmentEnd(firstPath, i) <= TARGET_ENTRY_CROSSING_WINDOW) {
              candidates.push({ edgeIndex: firstIndex, path: buildTargetEntryJoinCandidate(firstPath, i, crossing) });
            }
            if (distanceFromSegmentEnd(secondPath, j) <= TARGET_ENTRY_CROSSING_WINDOW) {
              candidates.push({ edgeIndex: secondIndex, path: buildTargetEntryJoinCandidate(secondPath, j, crossing) });
            }

            for (const candidate of candidates) {
              if (!candidate.path || samePath(paths[candidate.edgeIndex], candidate.path)) continue;
              const candidatePaths = paths.map((path, index) => (index === candidate.edgeIndex ? candidate.path as Point[] : path));
              const candidateScore = totalStrictCrossings(nextEdges, candidatePaths);
              const currentLength = pathLength(paths[candidate.edgeIndex]);
              const candidateLength = pathLength(candidate.path);
              if (candidateScore < bestScore || (candidateScore === bestScore && candidateLength + 32 < currentLength)) {
                bestScore = candidateScore;
                bestIndex = candidate.edgeIndex;
                bestPath = candidate.path;
              }
            }
          }
        }
      }
    }

    if (bestIndex < 0 || !bestPath) break;
    paths = paths.map((path, index) => (index === bestIndex ? bestPath as Point[] : path));
    nextEdges[bestIndex] = withComputedPath(nextEdges[bestIndex], bestPath);
    changed = true;
  }

  return changed ? nextEdges : edges;
}

function crossingScore(edges: Edge[], paths: Point[][], groupIndices: Set<number>): number {
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

function projectionOverlap(first: SegmentLike, second: SegmentLike): number {
  if (first.axis === 'h') {
    const min = Math.max(Math.min(first.a.x, first.b.x), Math.min(second.a.x, second.b.x));
    const max = Math.min(Math.max(first.a.x, first.b.x), Math.max(second.a.x, second.b.x));
    return Math.max(0, max - min);
  }
  const min = Math.max(Math.min(first.a.y, first.b.y), Math.min(second.a.y, second.b.y));
  const max = Math.min(Math.max(first.a.y, first.b.y), Math.max(second.a.y, second.b.y));
  return Math.max(0, max - min);
}

type SegmentLike = { a: Point; b: Point; axis: 'h' | 'v' };

function toAxisSegments(path: Point[]): SegmentLike[] {
  const segments: SegmentLike[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index];
    const b = path[index + 1];
    const axis = axisOf(a, b);
    if (axis) segments.push({ a, b, axis });
  }
  return segments;
}

function hasParallelLaneConflict(
  edges: Edge[],
  paths: Point[][],
  groupIndices: Set<number>,
): boolean {
  const segmentsByPath = paths.map(toAxisSegments);
  for (const groupIndex of groupIndices) {
    for (let otherIndex = 0; otherIndex < paths.length; otherIndex += 1) {
      if (groupIndices.has(otherIndex)) continue;
      if (edges[groupIndex]?.source === edges[otherIndex]?.source) continue;
      if (edges[groupIndex]?.target === edges[otherIndex]?.target) continue;
      for (const first of segmentsByPath[groupIndex]) {
        for (const second of segmentsByPath[otherIndex]) {
          if (first.axis !== second.axis) continue;
          const gap = first.axis === 'h'
            ? Math.abs(first.a.y - second.a.y)
            : Math.abs(first.a.x - second.a.x);
          if (gap >= MIN_PARALLEL_GAP) continue;
          if (projectionOverlap(first, second) >= MIN_BRANCH_SPAN) return true;
        }
      }
    }
  }
  return false;
}

function sourceBranchCandidates(paths: Point[][], indices: number[], side: Side): number[] {
  const values = indices
    .map(index => branchValue(paths[index], side, 'source'))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (values.length === 0) return [];
  const current = median(values);
  const starts = indices.map(index => paths[index][0]).filter(Boolean);
  const sourceAxis = side === 'top' || side === 'bottom'
    ? starts.map(point => point.y)
    : starts.map(point => point.x);
  const minSource = Math.min(...sourceAxis);
  const maxSource = Math.max(...sourceAxis);
  const sideSign = side === 'bottom' || side === 'right' ? 1 : -1;
  const endAxis = indices.map(index => {
    const path = paths[index];
    const end = path[path.length - 1];
    return side === 'top' || side === 'bottom' ? end?.y : end?.x;
  }).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const offsets = [32, 48, 56, 64, 72, 84, 96, 120, 144];
  const candidates = [current, ...offsets.map(offset => current + sideSign * offset)];
  return Array.from(new Set(candidates.map(value => Math.round(value))))
    .filter(value => {
      if (side === 'bottom' || side === 'right') {
        if (value < maxSource + 24) return false;
        const maxAllowed = Math.min(...endAxis) - MIN_ENDPOINT_TAIL;
        return !Number.isFinite(maxAllowed) || value <= maxAllowed;
      }
      if (value > minSource - 24) return false;
      const minAllowed = Math.max(...endAxis) + MIN_ENDPOINT_TAIL;
      return !Number.isFinite(minAllowed) || value >= minAllowed;
    });
}

function sourceTrunkSegment(path: Point[], side: Side, anchorMain: number, branchValue: number): SegmentLike | null {
  const start = path[0];
  if (!start) return null;
  if (side === 'top' || side === 'bottom') {
    return { a: { x: anchorMain, y: start.y }, b: { x: anchorMain, y: branchValue }, axis: 'v' };
  }
  return { a: { x: start.x, y: anchorMain }, b: { x: branchValue, y: anchorMain }, axis: 'h' };
}

function sourceBypassPoint(
  path: Point[],
  side: Side,
  anchorMain: number,
  branchValue: number,
  crossingPoint: Point,
  crossingSegments: SegmentLike[],
): Point | null {
  const start = path[0];
  if (!start || crossingSegments.length === 0) return null;
  const direction = branchDirection(path, side, 'source');
  if (direction === null) return null;
  const clearance = 15;
  const lateralClearance = 12;

  if (side === 'top' || side === 'bottom') {
    const beforeY = side === 'bottom' ? crossingPoint.y - clearance : crossingPoint.y + clearance;
    const minY = Math.min(start.y, branchValue);
    const maxY = Math.max(start.y, branchValue);
    if (beforeY <= minY + EPS || beforeY >= maxY - EPS) return null;
    const bypassX = direction > 0
      ? Math.min(...crossingSegments.map(segment => Math.min(segment.a.x, segment.b.x))) - lateralClearance
      : Math.max(...crossingSegments.map(segment => Math.max(segment.a.x, segment.b.x))) + lateralClearance;
    return { x: Math.round(bypassX), y: Math.round(beforeY) };
  }

  const beforeX = side === 'right' ? crossingPoint.x - clearance : crossingPoint.x + clearance;
  const minX = Math.min(start.x, branchValue);
  const maxX = Math.max(start.x, branchValue);
  if (beforeX <= minX + EPS || beforeX >= maxX - EPS) return null;
  const bypassY = direction > 0
    ? Math.min(...crossingSegments.map(segment => Math.min(segment.a.y, segment.b.y))) - lateralClearance
    : Math.max(...crossingSegments.map(segment => Math.max(segment.a.y, segment.b.y))) + lateralClearance;
  return { x: Math.round(beforeX), y: Math.round(bypassY) };
}

function synthesizeSourcePathWithBypass(
  path: Point[],
  side: Side,
  anchorMain: number,
  branchValue: number,
  bypass: Point,
): Point[] {
  const start = path[0];
  const end = path[path.length - 1];
  const branch = branchSegment(path, side, 'source');
  if (side === 'top' || side === 'bottom') {
    const tailPoint = branch && branchTailMovesTowardEnd(path, side, anchorMain, branch)
      ? branch.b
      : end;
    const tail = branch && branchTailMovesTowardEnd(path, side, anchorMain, branch)
      ? path.slice(branch.index + 2)
      : [end];
    return compactPath([
      { x: anchorMain, y: start.y },
      { x: anchorMain, y: bypass.y },
      bypass,
      { x: bypass.x, y: branchValue },
      { x: tailPoint.x, y: branchValue },
      ...tail,
    ]);
  }

  const tailPoint = branch && branchTailMovesTowardEnd(path, side, anchorMain, branch)
    ? branch.b
    : end;
  const tail = branch && branchTailMovesTowardEnd(path, side, anchorMain, branch)
    ? path.slice(branch.index + 2)
    : [end];
  return compactPath([
    { x: start.x, y: anchorMain },
    { x: bypass.x, y: anchorMain },
    bypass,
    { x: branchValue, y: bypass.y },
    { x: branchValue, y: tailPoint.y },
    ...tail,
  ]);
}

function synthesizeSourcePathWithBridgeBypass(
  path: Point[],
  side: Side,
  anchorMain: number,
  branchValue: number,
  beforeValue: number,
  entryMain: number,
  crossValue: number,
  exitMain: number,
): Point[] {
  const start = path[0];
  const end = path[path.length - 1];
  const branch = branchSegment(path, side, 'source');
  const tailPoint = branch && branchTailMovesTowardEnd(path, side, anchorMain, branch)
    ? branch.b
    : end;
  const tail = branch && branchTailMovesTowardEnd(path, side, anchorMain, branch)
    ? path.slice(branch.index + 2)
    : [end];

  if (side === 'top' || side === 'bottom') {
    return compactPath([
      { x: anchorMain, y: start.y },
      { x: anchorMain, y: beforeValue },
      { x: entryMain, y: beforeValue },
      { x: entryMain, y: crossValue },
      { x: exitMain, y: crossValue },
      { x: exitMain, y: branchValue },
      { x: tailPoint.x, y: branchValue },
      ...tail,
    ]);
  }

  return compactPath([
    { x: start.x, y: anchorMain },
    { x: beforeValue, y: anchorMain },
    { x: beforeValue, y: entryMain },
    { x: crossValue, y: entryMain },
    { x: crossValue, y: exitMain },
    { x: branchValue, y: exitMain },
    { x: branchValue, y: tailPoint.y },
    ...tail,
  ]);
}

function sourceTrunkBypassCandidates(
  edges: Edge[],
  paths: Point[][],
  subgroup: number[],
  side: Side,
  anchorMain: number,
  branchValue: number,
): Point[][][] {
  const representative = paths[subgroup[0]];
  const trunk = representative ? sourceTrunkSegment(representative, side, anchorMain, branchValue) : null;
  if (!trunk) return [];
  const subgroupSet = new Set(subgroup);
  const crossingSegments: SegmentLike[] = [];
  const crossingPoints: Point[] = [];

  const allSegments = paths.map(toAxisSegments);
  for (let otherIndex = 0; otherIndex < paths.length; otherIndex += 1) {
    if (subgroupSet.has(otherIndex)) continue;
    if (edges[subgroup[0]]?.source === edges[otherIndex]?.source) continue;
    if (edges[subgroup[0]]?.target === edges[otherIndex]?.target) continue;
    for (const segment of allSegments[otherIndex]) {
      const point = strictCrossPoint(trunk.a, trunk.b, segment.a, segment.b);
      if (!point) continue;
      crossingSegments.push(segment);
      crossingPoints.push(point);
    }
  }

  if (crossingPoints.length === 0) return [];
  const primaryPoint = side === 'bottom'
    ? crossingPoints.reduce((best, point) => (point.y < best.y ? point : best), crossingPoints[0])
    : side === 'top'
      ? crossingPoints.reduce((best, point) => (point.y > best.y ? point : best), crossingPoints[0])
      : side === 'right'
        ? crossingPoints.reduce((best, point) => (point.x < best.x ? point : best), crossingPoints[0])
        : crossingPoints.reduce((best, point) => (point.x > best.x ? point : best), crossingPoints[0]);
  const bypass = sourceBypassPoint(representative, side, anchorMain, branchValue, primaryPoint, crossingSegments);
  const result: Point[][][] = [];
  if (bypass) {
    const candidatePaths = paths.map(path => path);
    for (const index of subgroup) {
      candidatePaths[index] = synthesizeSourcePathWithBypass(paths[index], side, anchorMain, branchValue, bypass);
    }
    result.push(candidatePaths);
  }

  if (side === 'top' || side === 'bottom') {
    const direction = branchDirection(representative, side, 'source');
    if (direction !== null) {
      const boundaryX = direction > 0
        ? Math.min(...crossingSegments.map(segment => Math.min(segment.a.x, segment.b.x)))
        : Math.max(...crossingSegments.map(segment => Math.max(segment.a.x, segment.b.x)));
      const touchingVerticals = allSegments
        .flat()
        .filter(segment => (
          segment.axis === 'v'
          && Math.abs(segment.a.x - boundaryX) <= EPS
          && primaryPoint.y >= Math.min(segment.a.y, segment.b.y) - EPS
          && primaryPoint.y <= Math.max(segment.a.y, segment.b.y) + EPS
        ));
      if (touchingVerticals.length > 0) {
        const beforeValue = side === 'bottom' ? primaryPoint.y - 15 : primaryPoint.y + 15;
        const crossValue = side === 'bottom'
          ? Math.min(...touchingVerticals.map(segment => Math.min(segment.a.y, segment.b.y))) - 12
          : Math.max(...touchingVerticals.map(segment => Math.max(segment.a.y, segment.b.y))) + 12;
        if (Math.abs(crossValue - branchValue) <= 96) {
          const entryMain = boundaryX - direction * 12;
          const exitMain = boundaryX + direction * 12;
          const bridgePaths = paths.map(path => path);
          for (const index of subgroup) {
            bridgePaths[index] = synthesizeSourcePathWithBridgeBypass(
              paths[index],
              side,
              anchorMain,
              branchValue,
              beforeValue,
              entryMain,
              crossValue,
              exitMain,
            );
          }
          result.push(bridgePaths);
        }
      }
    }
  }

  return result;
}

function refineSourceBranchLanesByDirection(edges: Edge[]): Edge[] {
  const nextEdges = [...edges];
  const paths = nextEdges.map(edge => getEdgePath(edge));
  const groups = new Map<string, number[]>();

  nextEdges.forEach((edge, index) => {
    const path = paths[index];
    const side = sourceSide(path);
    if (!side || branchValue(path, side, 'source') === null) return;
    const key = `${edge.source}:${side}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(index);
  });

  for (const [, indices] of groups) {
    if (indices.length < MIN_GROUP_SIZE) continue;
    const side = sourceSide(paths[indices[0]]);
    if (!side) continue;
    const directionGroups = new Map<number, number[]>();
    for (const index of indices) {
      const direction = branchDirection(paths[index], side, 'source');
      if (direction === null) continue;
      if (!directionGroups.has(direction)) directionGroups.set(direction, []);
      directionGroups.get(direction)?.push(index);
    }

    for (const subgroup of directionGroups.values()) {
      if (subgroup.length < MIN_GROUP_SIZE) continue;
      const groupSet = new Set(subgroup);
      const anchorMain = median(subgroup.map(index => (
        side === 'top' || side === 'bottom' ? paths[index][0].x : paths[index][0].y
      )));
      let bestPaths = paths;
      let bestScore = crossingScore(nextEdges, paths, groupSet);

      for (const value of sourceBranchCandidates(paths, subgroup, side)) {
        const candidatePaths = paths.map(path => path);
        for (const index of subgroup) {
          candidatePaths[index] = synthesizeSourcePath(paths[index], side, anchorMain, value);
        }
        const candidates = [
          candidatePaths,
          ...sourceTrunkBypassCandidates(nextEdges, paths, subgroup, side, anchorMain, value),
        ];
        for (const candidate of candidates) {
          if (hasParallelLaneConflict(nextEdges, candidate, groupSet)) continue;
          const score = crossingScore(nextEdges, candidate, groupSet);
          if (score < bestScore) {
            bestScore = score;
            bestPaths = candidate;
          }
        }
      }

      if (bestPaths === paths) continue;
      for (const index of subgroup) {
        if (!samePath(paths[index], bestPaths[index])) {
          paths[index] = bestPaths[index];
          nextEdges[index] = withComputedPath(nextEdges[index], bestPaths[index]);
        }
      }
    }
  }

  return nextEdges;
}

function applySharedEndpointTrunks(
  edges: Edge[],
  endpoint: EndpointKind,
  options: SharedTrunkSynthesisOptions = {},
): Edge[] {
  const paths = edges.map(edge => getEdgePath(edge));
  const groups = new Map<string, number[]>();

  edges.forEach((edge, index) => {
    const path = paths[index];
    const side = endpoint === 'source' ? sourceSide(path) : targetSide(path);
    const currentBranchValue = side ? branchValue(path, side, endpoint) : null;
    if (!side || currentBranchValue === null) return;
    const endpointId = endpoint === 'source' ? edge.source : edge.target;
    const key = `${endpointId}:${side}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(index);
  });

  const nextEdges = [...edges];
  for (const [, indices] of groups) {
    if (indices.length < MIN_GROUP_SIZE) continue;
    const side = endpoint === 'source' ? sourceSide(paths[indices[0]]) : targetSide(paths[indices[0]]);
    if (!side) continue;
    const nodeGeometryGroups = endpoint === 'target'
      ? splitNodeGeometryHemisphereGroups(edges, indices, endpoint, options.nodes)
      : null;
    const subgroupList = nodeGeometryGroups
      ?? (endpoint === 'target' ? splitTargetDirectionGroups(paths, indices, side) : [indices]);

    for (const subgroup of subgroupList) {
      if (subgroup.length < MIN_GROUP_SIZE) continue;
      const branchValues = subgroup
        .map(index => branchValue(paths[index], side, endpoint))
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      if (branchValues.length < MIN_GROUP_SIZE) continue;
      const anchorMain = median(subgroup.map(index => (
        side === 'top' || side === 'bottom'
          ? paths[index][endpoint === 'source' ? 0 : paths[index].length - 1].x
          : paths[index][endpoint === 'source' ? 0 : paths[index].length - 1].y
      )));
      const nextBranchValue = sharedBranchValue(branchValues, side);
      const groupSet = new Set(subgroup);
      const candidatePaths = paths.map(path => path);
      for (const index of subgroup) {
        candidatePaths[index] = endpoint === 'source'
          ? synthesizeSourcePath(paths[index], side, anchorMain, nextBranchValue)
          : synthesizeTargetPath(paths[index], side, anchorMain, nextBranchValue);
      }
      if (crossingScore(edges, candidatePaths, groupSet) > crossingScore(edges, paths, groupSet)) continue;

      for (const index of subgroup) {
        const path = paths[index];
        const candidate = candidatePaths[index];
        if (!samePath(path, candidate)) nextEdges[index] = withComputedPath(nextEdges[index], candidate);
      }
    }
  }

  return nextEdges;
}

function repairOppositeHemisphereTargetBacktracks(
  edges: Edge[],
  options: SharedTrunkSynthesisOptions = {},
): Edge[] {
  if (!options.nodes || edges.length === 0) return edges;
  const nodeById = new Map(options.nodes.map(node => [node.id, node] as const));
  let paths = edges.map(edge => getEdgePath(edge));
  let nextEdges = [...edges];
  let changed = false;

  for (let index = 0; index < nextEdges.length; index += 1) {
    const edge = nextEdges[index];
    const path = paths[index];
    if (!edge || path.length < 4) continue;
    const sourceRect = nodeRect(nodeById.get(edge.source), nodeById);
    const targetRect = nodeRect(nodeById.get(edge.target), nodeById);
    if (!sourceRect || !targetRect) continue;

    const expectedTargetSide = expectedTargetSideFromGeometry(sourceRect, targetRect);
    const currentTargetSide = targetSide(path);
    if (currentTargetSide === expectedTargetSide) continue;
    if (!firstStepBacktracksFromTarget(path, sourceRect, targetRect)) continue;

    const sourceSide = oppositeSide(expectedTargetSide);
    const candidates = buildHemisphereTargetCandidatePaths(
      path,
      sourceRect,
      targetRect,
      sourceSide,
      expectedTargetSide,
    ).filter(candidate => (
      pathLength(candidate) + MIN_ENDPOINT_TAIL < pathLength(path)
      && !pathHitsUnrelatedNode(candidate, edge, nodeById)
    ));
    if (candidates.length === 0) continue;

    let bestPath: Point[] | null = null;
    let bestScore = totalStrictCrossings(nextEdges, paths);
    let bestLength = pathLength(path);
    for (const candidate of candidates) {
      const candidatePaths = paths.map((existingPath, pathIndex) => (
        pathIndex === index ? candidate : existingPath
      ));
      const candidateScore = totalStrictCrossings(nextEdges, candidatePaths);
      const candidateLength = pathLength(candidate);
      if (
        candidateScore < bestScore
        || (candidateScore === bestScore && candidateLength < bestLength)
      ) {
        bestPath = candidate;
        bestScore = candidateScore;
        bestLength = candidateLength;
      }
    }
    if (!bestPath) continue;

    const repairedEdge = withComputedPath(edge, bestPath);
    nextEdges[index] = {
      ...repairedEdge,
      sourceHandle: sourceSide,
      targetHandle: expectedTargetSide,
      data: {
        ...(repairedEdge.data || {}),
        targetHemisphereBacktrackRepaired: true,
      },
    };
    paths = paths.map((existingPath, pathIndex) => (pathIndex === index ? bestPath as Point[] : existingPath));
    changed = true;
  }

  return changed ? nextEdges : edges;
}

export function synthesizeSharedEndpointTrunks(
  edges: Edge[],
  options: SharedTrunkSynthesisOptions = {},
): Edge[] {
  return refineSourceBranchLanesByDirection(
    repairOppositeHemisphereTargetBacktracks(
      applySharedEndpointTrunks(
        applySharedEndpointTrunks(edges, 'source', options),
        'target',
        options,
      ),
      options,
    ),
  );
}

export function synthesizeSharedTargetTrunks(
  edges: Edge[],
  options: SharedTrunkSynthesisOptions = {},
): Edge[] {
  return repairOppositeHemisphereTargetBacktracks(
    applySharedEndpointTrunks(edges, 'target', options),
    options,
  );
}

export function synthesizeSharedSourceTrunks(
  edges: Edge[],
  options: SharedTrunkSynthesisOptions = {},
): Edge[] {
  return refineSourceBranchLanesByDirection(
    applySharedEndpointTrunks(edges, 'source', options),
  );
}
