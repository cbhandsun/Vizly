import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import type {
  StrictCrossingMazeContext,
  StrictCrossingMazeResultReason,
} from './edgeDetachedOverlapRepairTypes';
import {
  type PathSegmentRef,
  type Point,
  type Segment,
  EPS,
  MAZE_COORD_OFFSETS,
  MAX_MAZE_GRID_CELLS,
  allSegmentsOrthogonal,
  axisOf,
  compactPath,
  extractPathSegmentRefs,
  getRoutingObstacles,
  pathEquals,
  pointNear,
  segmentAxisDirection,
  segmentDirection,
  segmentIntersectsRect,
  segmentOverlap,
  strictCross,
} from './edgeDetachedOverlapCandidates';
function segmentPenaltyAgainstOtherEdges(
  segment: Segment,
  otherSegments: PathSegmentRef[],
  edge: Edge,
  edges: Edge[],
): number {
  let penalty = 0;
  for (const other of otherSegments) {
    if (strictCross(segment, other)) {
      penalty += 100000;
      continue;
    }
    const overlap = segmentOverlap(segment, other);
    if (overlap <= 1) continue;
    const otherEdge = edges[other.edgeIndex];
    const related = otherEdge && (
      edge.source === otherEdge.source
      || edge.source === otherEdge.target
      || edge.target === otherEdge.source
      || edge.target === otherEdge.target
    );
    const oppositeDirection = segment.axis === other.axis
      && segmentAxisDirection(segment) * segmentDirection(other) < 0;
    penalty += overlap * (oppositeDirection ? 180 : related ? 8 : 80);
  }
  return penalty;
}

export function routeStrictCrossingMazeCandidate(
  path: Point[],
  edgeIndex: number,
  paths: Point[][],
  edges: Edge[],
  nodes: ReactFlowNode[],
  context?: StrictCrossingMazeContext,
): Point[] | null {
  const diagnostics = context?.diagnostics;
  const recordDiagnostics = (
    reason: StrictCrossingMazeResultReason,
    xCoordinateCount = 0,
    yCoordinateCount = 0,
  ) => {
    if (!diagnostics) return;
    diagnostics.reason = reason;
    diagnostics.xCoordinateCount = xCoordinateCount;
    diagnostics.yCoordinateCount = yCoordinateCount;
    diagnostics.gridCellCount = xCoordinateCount * yCoordinateCount;
  };
  if (path.length < 2) {
    recordDiagnostics('invalid');
    return null;
  }
  const edge = edges[edgeIndex];
  if (!edge) {
    recordDiagnostics('invalid');
    return null;
  }
  const start = path[0];
  const end = path[path.length - 1];
  const penaltyPaths = context?.penaltyPaths ?? paths;
  const penaltyEdges = context?.penaltyEdges ?? edges;
  const penaltyEdgeIndex = context?.penaltyEdgeIndex ?? edgeIndex;
  const allSegments = extractPathSegmentRefs(penaltyPaths, penaltyEdges);
  const otherSegments = allSegments.filter(segment => segment.edgeIndex !== penaltyEdgeIndex);
  const gridSegments = extractPathSegmentRefs(paths, edges)
    .filter(segment => segment.edgeIndex !== edgeIndex);
  const obstacles = getRoutingObstacles(nodes);
  const gridObstacles = context?.gridNodes
    ? getRoutingObstacles(context.gridNodes)
    : obstacles;
  const xs = new Set<number>();
  const ys = new Set<number>();
  const addX = (value: number) => {
    if (Number.isFinite(value)) xs.add(Math.round(value));
  };
  const addY = (value: number) => {
    if (Number.isFinite(value)) ys.add(Math.round(value));
  };
  const addAroundPoint = (point: Point, includeOffsets = false) => {
    addX(point.x);
    addY(point.y);
    if (!includeOffsets) return;
    for (const offset of MAZE_COORD_OFFSETS) {
      addX(point.x + offset);
      addY(point.y + offset);
    }
  };

  addAroundPoint(start, true);
  addAroundPoint(end, true);
  for (const candidatePath of paths) {
    for (const point of candidatePath) addAroundPoint(point);
  }
  for (const segment of gridSegments) {
    addAroundPoint(segment.a);
    addAroundPoint(segment.b);
    if (segment.axis === 'v') {
      for (const offset of MAZE_COORD_OFFSETS) {
        addX(segment.a.x + offset);
        addY(segment.a.y + offset);
        addY(segment.b.y + offset);
      }
    } else {
      for (const offset of MAZE_COORD_OFFSETS) {
        addY(segment.a.y + offset);
        addX(segment.a.x + offset);
        addX(segment.b.x + offset);
      }
    }
  }
  for (const [nodeId, rect] of gridObstacles) {
    if (nodeId === edge.source || nodeId === edge.target) continue;
    for (const offset of [0, 12, -12, 24, -24]) {
      addX(rect.x + offset);
      addX(rect.x + rect.width + offset);
      addY(rect.y + offset);
      addY(rect.y + rect.height + offset);
    }
  }

  const allX = [...xs].sort((a, b) => a - b);
  const allY = [...ys].sort((a, b) => a - b);
  const startX = allX.indexOf(Math.round(start.x));
  const startY = allY.indexOf(Math.round(start.y));
  const endX = allX.indexOf(Math.round(end.x));
  const endY = allY.indexOf(Math.round(end.y));
  if (startX < 0 || startY < 0 || endX < 0 || endY < 0) {
    recordDiagnostics('invalid', allX.length, allY.length);
    return null;
  }
  if (allX.length * allY.length > MAX_MAZE_GRID_CELLS) {
    recordDiagnostics('grid-budget', allX.length, allY.length);
    return null;
  }

  type AxisState = 0 | 1 | 2;
  type QueueItem = { cost: number; xIndex: number; yIndex: number; axis: AxisState };
  const keyOf = (xIndex: number, yIndex: number, axis: AxisState) => `${xIndex}:${yIndex}:${axis}`;
  const pointOf = (xIndex: number, yIndex: number): Point => ({ x: allX[xIndex], y: allY[yIndex] });
  const queue: QueueItem[] = [];
  const pushQueue = (item: QueueItem) => {
    queue.push(item);
    let index = queue.length - 1;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (queue[parentIndex].cost <= item.cost) break;
      queue[index] = queue[parentIndex];
      index = parentIndex;
    }
    queue[index] = item;
  };
  const popQueue = (): QueueItem | undefined => {
    if (queue.length === 0) return undefined;
    const first = queue[0];
    const last = queue.pop()!;
    if (queue.length > 0) {
      let index = 0;
      while (true) {
        const leftIndex = index * 2 + 1;
        const rightIndex = leftIndex + 1;
        if (leftIndex >= queue.length) break;
        const childIndex = rightIndex < queue.length && queue[rightIndex].cost < queue[leftIndex].cost
          ? rightIndex
          : leftIndex;
        if (queue[childIndex].cost >= last.cost) break;
        queue[index] = queue[childIndex];
        index = childIndex;
      }
      queue[index] = last;
    }
    return first;
  };
  pushQueue({ cost: 0, xIndex: startX, yIndex: startY, axis: 0 });
  const distByKey = new Map<string, number>([[keyOf(startX, startY, 0), 0]]);
  const prevByKey = new Map<string, string>();

  const isSegmentBlockedByNode = (segment: Segment): boolean => {
    for (const [nodeId, rect] of obstacles) {
      if (nodeId === edge.source || nodeId === edge.target) continue;
      if (segmentIntersectsRect(segment, rect, 12)) return true;
    }
    return false;
  };

  let bestEndKey: string | null = null;
  while (queue.length > 0) {
    const current = popQueue()!;
    const currentKey = keyOf(current.xIndex, current.yIndex, current.axis);
    if ((distByKey.get(currentKey) ?? Number.POSITIVE_INFINITY) < current.cost - EPS) continue;
    if (current.xIndex === endX && current.yIndex === endY) {
      bestEndKey = currentKey;
      break;
    }

    const neighbors = [
      { xIndex: current.xIndex - 1, yIndex: current.yIndex, axis: 1 as AxisState },
      { xIndex: current.xIndex + 1, yIndex: current.yIndex, axis: 1 as AxisState },
      { xIndex: current.xIndex, yIndex: current.yIndex - 1, axis: 2 as AxisState },
      { xIndex: current.xIndex, yIndex: current.yIndex + 1, axis: 2 as AxisState },
    ];
    const from = pointOf(current.xIndex, current.yIndex);
    for (const next of neighbors) {
      if (next.xIndex < 0 || next.xIndex >= allX.length || next.yIndex < 0 || next.yIndex >= allY.length) {
        continue;
      }
      const to = pointOf(next.xIndex, next.yIndex);
      const axis = axisOf(from, to);
      if (!axis) continue;
      const segment = { a: from, b: to, axis };
      if (isSegmentBlockedByNode(segment)) continue;
      const length = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
      const turnPenalty = current.axis !== 0 && current.axis !== next.axis ? 40 : 0;
      const nextCost = current.cost
        + length
        + turnPenalty
        + segmentPenaltyAgainstOtherEdges(segment, otherSegments, edge, penaltyEdges);
      const nextKey = keyOf(next.xIndex, next.yIndex, next.axis);
      if (nextCost + EPS >= (distByKey.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      distByKey.set(nextKey, nextCost);
      prevByKey.set(nextKey, currentKey);
      pushQueue({ cost: nextCost, xIndex: next.xIndex, yIndex: next.yIndex, axis: next.axis });
    }
  }

  if (!bestEndKey) {
    recordDiagnostics('no-route', allX.length, allY.length);
    return null;
  }
  const points: Point[] = [];
  let cursor: string | undefined = bestEndKey;
  while (cursor) {
    const [xText, yText] = cursor.split(':');
    points.push(pointOf(Number(xText), Number(yText)));
    cursor = prevByKey.get(cursor);
  }
  points.reverse();
  const compacted = compactPath(points);
  if (!pointNear(compacted[0], start, 1)) {
    recordDiagnostics('invalid', allX.length, allY.length);
    return null;
  }
  if (!pointNear(compacted[compacted.length - 1], end, 1)) {
    recordDiagnostics('invalid', allX.length, allY.length);
    return null;
  }
  if (!allSegmentsOrthogonal(compacted)) {
    recordDiagnostics('invalid', allX.length, allY.length);
    return null;
  }
  if (pathEquals(compacted, compactPath(path))) {
    recordDiagnostics('same-path', allX.length, allY.length);
    return null;
  }
  recordDiagnostics('candidate', allX.length, allY.length);
  return compacted;
}
