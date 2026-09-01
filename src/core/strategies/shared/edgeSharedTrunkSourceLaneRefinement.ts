import type { Edge } from '@xyflow/react';
import {
  compactPath,
  EPS,
  MIN_BRANCH_SPAN,
  MIN_ENDPOINT_TAIL,
  type Point,
  type Side,
} from './edgeSharedTrunkSynthesisUtils';
import {
  MIN_GROUP_SIZE,
  MIN_PARALLEL_GAP,
  axisOf,
  branchDirection,
  branchSegment,
  branchTailMovesTowardEnd,
  branchValue,
  crossingScore,
  getEdgePath,
  median,
  samePath,
  sourceSide,
  strictCrossPoint,
  synthesizeSourcePath,
  withComputedPath,
} from './edgeSharedTrunkSynthesisCore';

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

export function refineSourceBranchLanesByDirection(edges: Edge[]): Edge[] {
  const nextEdges = [...edges];
  let changed = false;
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
          changed = true;
        }
      }
    }
  }

  return changed ? nextEdges : edges;
}
