import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import { mazeDirectionsReverse, resolveMazeTerminalCaps, type MazeDirection } from './edgeStrictCrossingMazeTerminals';

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
  continuation?: Segment,
): number {
  let penalty = 0;
  for (const other of otherSegments) {
    // A grid vertex is not a route endpoint. Charge a straight-through
    // crossing there once, on departure, before final path compaction.
    const crossesAtDeparture = continuation && segment.axis !== other.axis
      && Math.abs(other.axis === 'v' ? other.a.x - segment.a.x : other.a.y - segment.a.y) <= EPS
      && strictCross(continuation, other);
    if (strictCross(segment, other) || crossesAtDeparture) {
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
  const terminalCaps = resolveMazeTerminalCaps(context?.terminalCaps, start, end);
  if (terminalCaps === null) {
    recordDiagnostics('invalid');
    return null;
  }
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

  // Arrival direction distinguishes a straight crossing from a touch/turn.
  type DirectionState = MazeDirection;
  type QueueItem = { cost: number; xIndex: number; yIndex: number; direction: DirectionState };
  const keyOf = (xIndex: number, yIndex: number, direction: DirectionState) => `${xIndex}:${yIndex}:${direction}`;
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
  pushQueue({ cost: 0, xIndex: startX, yIndex: startY, direction: 0 });
  const distByKey = new Map<string, number>([[keyOf(startX, startY, 0), 0]]);
  const prevByKey = new Map<string, string>();
  // The same directed grid step is revisited with different arrival states.
  // Keep geometry costs local to this search; the existing cell budget bounds
  // storage. Straight-through crossings must use a distinct penalty slot.
  const blockedSteps = new Uint8Array(allX.length * allY.length * 4);
  const stepPenalties = new Float64Array(allX.length * allY.length * 8).fill(Number.NaN);
  const terminalPenalties = new Float64Array(5).fill(Number.NaN);

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
    const currentKey = keyOf(current.xIndex, current.yIndex, current.direction);
    if ((distByKey.get(currentKey) ?? Number.POSITIVE_INFINITY) < current.cost - EPS) continue;
    if (current.xIndex === endX && current.yIndex === endY) {
      bestEndKey = currentKey;
      break;
    }

    const neighbors = [
      { xIndex: current.xIndex - 1, yIndex: current.yIndex, direction: 1 as DirectionState },
      { xIndex: current.xIndex + 1, yIndex: current.yIndex, direction: 2 as DirectionState },
      { xIndex: current.xIndex, yIndex: current.yIndex - 1, direction: 3 as DirectionState },
      { xIndex: current.xIndex, yIndex: current.yIndex + 1, direction: 4 as DirectionState },
    ];
    const from = pointOf(current.xIndex, current.yIndex);
    const incomingDirection = current.direction === 0
      ? terminalCaps?.incomingDirection ?? 0 : current.direction;
    for (const next of neighbors) {
      if (next.xIndex < 0 || next.xIndex >= allX.length || next.yIndex < 0 || next.yIndex >= allY.length) {
        continue;
      }
      if (mazeDirectionsReverse(incomingDirection, next.direction)) continue;
      const reachesEnd = next.xIndex === endX && next.yIndex === endY;
      if (reachesEnd && terminalCaps && mazeDirectionsReverse(next.direction, terminalCaps.outgoingDirection)) continue;
      const to = pointOf(next.xIndex, next.yIndex);
      const axis = axisOf(from, to);
      if (!axis) continue;
      const segment = { a: from, b: to, axis };
      const stepIndex = (current.yIndex * allX.length + current.xIndex) * 4 + next.direction - 1;
      if (blockedSteps[stepIndex] === 0) {
        blockedSteps[stepIndex] = isSegmentBlockedByNode(segment) ? 2 : 1;
      }
      if (blockedSteps[stepIndex] === 2) continue;
      const length = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
      const turnPenalty = incomingDirection !== 0
        && (incomingDirection <= 2) !== (next.direction <= 2) ? 40 : 0;
      const continuation = incomingDirection === next.direction ? {
        a: current.direction === 0 && terminalCaps ? terminalCaps.incoming.a : pointOf(
          current.xIndex + (current.direction === 1 ? 1 : current.direction === 2 ? -1 : 0),
          current.yIndex + (current.direction === 3 ? 1 : current.direction === 4 ? -1 : 0),
        ),
        b: to,
        axis,
      } : undefined;
      const penaltyIndex = stepIndex * 2 + Number(Boolean(continuation));
      let penalty = stepPenalties[penaltyIndex];
      const isCapStart = current.direction === 0 && terminalCaps !== undefined;
      if (isCapStart || Number.isNaN(penalty)) {
        penalty = segmentPenaltyAgainstOtherEdges(segment, otherSegments, edge, penaltyEdges, continuation);
        if (!isCapStart) stepPenalties[penaltyIndex] = penalty;
      }
      let terminalPenalty = 0;
      if (reachesEnd && terminalCaps) {
        terminalPenalty = terminalPenalties[next.direction];
        if (Number.isNaN(terminalPenalty)) {
          terminalPenalty = (next.direction <= 2) !== (terminalCaps.outgoingDirection <= 2) ? 40 : 0;
          if (next.direction === terminalCaps.outgoingDirection) {
            const cap = terminalCaps.outgoing;
            terminalPenalty += segmentPenaltyAgainstOtherEdges(cap, otherSegments, edge, penaltyEdges, { ...cap, a: from })
              - segmentPenaltyAgainstOtherEdges(cap, otherSegments, edge, penaltyEdges);
          }
          terminalPenalties[next.direction] = terminalPenalty;
        }
      }
      const nextCost = current.cost
        + length
        + turnPenalty
        + penalty + terminalPenalty;
      const nextKey = keyOf(next.xIndex, next.yIndex, next.direction);
      if (nextCost + EPS >= (distByKey.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      distByKey.set(nextKey, nextCost);
      prevByKey.set(nextKey, currentKey);
      pushQueue({ cost: nextCost, xIndex: next.xIndex, yIndex: next.yIndex, direction: next.direction });
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
