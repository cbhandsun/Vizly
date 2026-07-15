import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from './edgeStrictCrossingGuard';

import {
  createQualityEvaluationBudget,
  type QualityEvaluationBudget,
} from './edgeDetachedOverlapEvaluationCache';

import { countRoutingObstacleHits } from './edgeWaypointCandidateRepair';
import { buildDetachedOuterBypassCandidates } from './edgeDetachedOuterBypass';
import {
  createDetachedOverlapStateEvaluationContext,
  scoreDetachedOverlapState,
  type DetachedOverlapStateEvaluationContext,
} from './edgeDetachedOverlapStateEvaluation';
import type {
  DetachedParallelOverlapRepairOptions,
  RoutingObstacleGate,
  StrictCrossingMazeContext,
  StrictCrossingMazeDiagnostics,
  StrictCrossingMazeResultReason,
} from './edgeDetachedOverlapRepairTypes';

import {
  type Point,
  type Rect,
  type Segment,
  type PathSegmentRef,
  EPS,
  MAZE_COORD_OFFSETS,
  MAX_MAZE_GRID_CELLS,
  getEdgePath,
  withComputedPath,
  axisOf,
  allSegmentsOrthogonal,
  pointNear,
  compactPath,
  pathEquals,
  segmentOverlap,
  strictCross,
  nodeRect,
  getRoutingObstacles,
  segmentIntersectsRect,
  extractPathSegmentRefs,
  sharesAnyEndpoint,
  segmentAxisDirection,
  segmentDirection,
  segmentsRunOppositeDirections,
  isOppositeEndpointOverlap,
  extractPathSegmentRefsForPath,
  strictCrossingsForEdgeSegments,
  findDetachedParallelOverlaps,
  scoreActionableDetachedOverlaps,
  shiftInternalSegment,
  bypassParallelOverlap,
  bypassAdjacentLegsAroundOverlap,
  buildAdjacentLaneEscapeCandidates,
  trimSegmentEndpointOverlap,
  endpointBypassCoordinates,
  endpointReadableStubCoordinates,
  bypassEndpointParallelOverlapAtCoordinate,
  bypassEndpointParallelOverlap,
  buildTerminalSegmentParallelLaneCandidates,
  buildTerminalApproachBypassCandidates,
  buildTerminalEndpointSlideShortcutCandidates,
  slideEndpointAlongSide,
} from './edgeDetachedOverlapCandidates';

export * from './edgeDetachedOverlapCandidates';
export {
  createDetachedOverlapStateEvaluationContext,
  scoreDetachedOverlapState,
};
export type { DetachedOverlapStateEvaluationContext };
export type {
  DetachedParallelOverlapRepairOptions,
  StrictCrossingMazeContext,
  StrictCrossingMazeDiagnostics,
  StrictCrossingMazeResultReason,
} from './edgeDetachedOverlapRepairTypes';

function shiftEndpointSegment(
  path: Point[],
  edge: Edge,
  segment: PathSegmentRef,
  nodeById: Map<string, ReactFlowNode>,
  delta: number,
): Point[] | null {
  if (path.length < 2) return null;
  const lastSegmentIndex = path.length - 2;
  if (segment.segIdx !== 0 && segment.segIdx !== lastSegmentIndex) return null;

  const sourceRect = nodeRect(nodeById.get(edge.source));
  const targetRect = nodeRect(nodeById.get(edge.target));
  const shifted = path.map(point => ({ ...point }));

  if (path.length === 2) {
    const start = slideEndpointAlongSide(path[0], sourceRect, segment.axis, delta);
    const end = slideEndpointAlongSide(path[1], targetRect, segment.axis, delta);
    if (!start || !end) return null;
    shifted[0] = start;
    shifted[1] = end;
  } else if (segment.segIdx === 0) {
    const start = slideEndpointAlongSide(path[0], sourceRect, segment.axis, delta);
    if (!start) return null;
    shifted[0] = start;
    if (segment.axis === 'v') shifted[1].x += delta;
    else shifted[1].y += delta;
  } else {
    const end = slideEndpointAlongSide(path[path.length - 1], targetRect, segment.axis, delta);
    if (!end) return null;
    shifted[path.length - 1] = end;
    if (segment.axis === 'v') shifted[path.length - 2].x += delta;
    else shifted[path.length - 2].y += delta;
  }

  const compacted = compactPath(shifted);
  return allSegmentsOrthogonal(compacted) ? compacted : null;
}

export function edgesWithPaths(
  edges: Edge[],
  paths: Point[][],
  changedIndexes?: readonly number[],
): Edge[] {
  if (!changedIndexes) {
    return edges.map((edge, index) => ({
      ...edge,
      data: {
        ...(edge.data || {}),
        computedPath: paths[index],
      },
    }));
  }
  const result = edges.slice();
  for (const index of new Set(changedIndexes)) {
    const edge = edges[index];
    if (!edge || !paths[index]) continue;
    result[index] = {
      ...edge,
      data: {
        ...(edge.data || {}),
        computedPath: paths[index],
      },
    };
  }
  return result;
}

export function compareQualityScores(first: EdgePathQualityScore, second: EdgePathQualityScore): number {
  const keys: Array<keyof EdgePathQualityScore> = [
    'nonOrthogonalSegments',
    'strictCrossings',
    'reverseOverlap',
    'unrelatedOverlap',
    'unexplainedRelatedOverlap',
    'shortEndpointStubs',
    'tinyInteriorDoglegs',
    'hairpins',
    'backtrackPenalty',
    'detourPenalty',
    'bends',
    'totalLength',
  ];
  for (const key of keys) {
    const delta = first[key] - second[key];
    if (delta !== 0) return delta;
  }
  return 0;
}

function improvesQualityWithoutAddingLocalNoise(
  candidate: EdgePathQualityScore,
  baseline: EdgePathQualityScore,
): boolean {
  return compareQualityScores(candidate, baseline) < 0
    && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
    && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
    && candidate.hairpins <= baseline.hairpins;
}

function hardQualityDoesNotRegress(
  candidate: EdgePathQualityScore,
  baseline: EdgePathQualityScore,
): boolean {
  return candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
    && candidate.strictCrossings <= baseline.strictCrossings
    && candidate.reverseOverlap <= baseline.reverseOverlap
    && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
    && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
    && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
    && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
    && candidate.hairpins <= baseline.hairpins;
}

function cloneCandidatePath(path: Point[]): Point[] {
  return path.map(point => ({ ...point }));
}

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

export function pathManhattanLength(path: Point[]): number {
  let length = 0;
  for (let index = 1; index < path.length; index += 1) {
    length += Math.abs(path[index].x - path[index - 1].x) + Math.abs(path[index].y - path[index - 1].y);
  }
  return length;
}

export function hasShortHairpin(path: Point[]): boolean {
  const segments = extractPathSegmentRefsForPath(path, 0, []);
  for (let index = 0; index + 2 < segments.length; index += 1) {
    const first = segments[index];
    const middle = segments[index + 1];
    const last = segments[index + 2];
    if (first.axis !== last.axis || first.axis === middle.axis) continue;
    const firstDirection = first.axis === 'h' ? Math.sign(first.b.x - first.a.x) : Math.sign(first.b.y - first.a.y);
    const lastDirection = last.axis === 'h' ? Math.sign(last.b.x - last.a.x) : Math.sign(last.b.y - last.a.y);
    const middleLength = Math.abs(middle.b.x - middle.a.x) + Math.abs(middle.b.y - middle.a.y);
    if (firstDirection !== 0 && firstDirection === -lastDirection && middleLength <= 96) return true;
  }
  return false;
}

function createRoutingObstacleGate(
  edges: Edge[],
  obstacles: Map<string, Rect>,
): RoutingObstacleGate {
  const hitsByPath = new WeakMap<Point[], Map<number, number>>();
  const hitsFor = (path: Point[], edgeIndex: number): number => {
    let byEdge = hitsByPath.get(path);
    if (!byEdge) {
      byEdge = new Map<number, number>();
      hitsByPath.set(path, byEdge);
    }
    const cached = byEdge.get(edgeIndex);
    if (cached !== undefined) return cached;
    const edge = edges[edgeIndex];
    const hits = edge ? countRoutingObstacleHits(path, edge, obstacles) : Number.POSITIVE_INFINITY;
    byEdge.set(edgeIndex, hits);
    return hits;
  };

  return (baselinePaths, candidatePaths, changedIndexes) => changedIndexes.every(edgeIndex => (
    candidatePaths[edgeIndex]
    && baselinePaths[edgeIndex]
    && hitsFor(candidatePaths[edgeIndex], edgeIndex) <= hitsFor(baselinePaths[edgeIndex], edgeIndex)
  ));
}

const toBoundedPositiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

export function separateDetachedParallelOverlaps(
  edges: Edge[],
  nodes: ReactFlowNode[],
  minOverlap = 96,
  options: DetachedParallelOverlapRepairOptions = {},
): Edge[] {
  const maxIterations = toBoundedPositiveInteger(options.maxIterations, 4);
  const maxHitBudget = toBoundedPositiveInteger(options.maxHitBudget, minOverlap <= 24 ? 4 : 16);
  const maxQualityEvaluations = toBoundedPositiveInteger(options.maxQualityEvaluations, Number.POSITIVE_INFINITY);
  const maxResidualPasses = toBoundedPositiveInteger(options.maxResidualPasses, 4);
  const qualityOnly = options.qualityOnly === true;
  const enableActionableSubthresholdRepair = minOverlap <= 24 && edges.length <= 8;
  const qualityBudget = createQualityEvaluationBudget(maxQualityEvaluations);

  const initialQuality = qualityBudget.evaluate(edges);
  if (!initialQuality) return edges;
  let paths = edges.map(edge => compactPath(getEdgePath(edge)));
  if (paths.filter(path => path.length >= 2).length < 2) return edges;
  if (
    initialQuality.reverseOverlap === 0
    && initialQuality.unrelatedOverlap === 0
    && initialQuality.unexplainedRelatedOverlap === 0
  ) {
    const actionableOverlapScore = enableActionableSubthresholdRepair
      ? scoreActionableDetachedOverlaps(paths, edges, minOverlap)
      : 0;
    const hasLongRelatedDetachedOverlap = edges.length <= 24
      && minOverlap >= 24
      && findDetachedParallelOverlaps(paths, edges, minOverlap)
        .some(hit => sharesAnyEndpoint(hit.a, hit.b, edges) && hit.overlap >= Math.max(96, minOverlap * 4));
    if (actionableOverlapScore === 0 && !hasLongRelatedDetachedOverlap) return edges;
  }

  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const routingObstacleGate = createRoutingObstacleGate(edges, getRoutingObstacles(nodes));

  let changed = false;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const hits = findDetachedParallelOverlaps(paths, edges, minOverlap);
    if (hits.length === 0) break;
    let detachedScoreContext: DetachedOverlapStateEvaluationContext | null = null;
    const getDetachedScoreContext = (): DetachedOverlapStateEvaluationContext => {
      if (!detachedScoreContext) {
        detachedScoreContext = createDetachedOverlapStateEvaluationContext(paths, edges, nodes);
      }
      return detachedScoreContext;
    };

    let currentScore = 0;
    let hasCurrentScore = false;
    const getCurrentScore = () => {
      if (!hasCurrentScore) {
        currentScore = getDetachedScoreContext().evaluate(paths);
        hasCurrentScore = true;
      }
      return currentScore;
    };
    if (qualityBudget.exhausted()) break;
    const currentEdges = edgesWithPaths(edges, paths);
    const qualityEvaluationContext = createEdgePathQualityEvaluationContext(currentEdges);
    const currentQualityScore = qualityBudget.evaluate(currentEdges);
    if (!currentQualityScore) break;
    const currentActionableOverlapScore = enableActionableSubthresholdRepair
      ? scoreActionableDetachedOverlaps(paths, edges, minOverlap)
      : 0;
    const currentSegments = extractPathSegmentRefs(paths, edges);
    let bestScore: number | null = null;
    const getBestScore = () => {
      if (bestScore === null) bestScore = getCurrentScore();
      return bestScore;
    };
    let bestQualityScore = currentQualityScore;
    let bestActionableOverlapScore = currentActionableOverlapScore;
    let bestPaths: Point[][] | null = null;
    const hitBudget = maxHitBudget;
    const narrowDeltas = minOverlap <= 24
      ? [-96, -64, -48, -32, 32, 48, 64, 96]
      : [-160, -128, -96, -64, -48, -32, 32, 48, 64, 96, 128, 160];
    const wideDeltas = [-160, -128, -96, -64, -48, -32, 32, 48, 64, 96, 128, 160];

    for (const hit of hits.slice(0, hitBudget)) {
      const unrelated = !sharesAnyEndpoint(hit.a, hit.b, edges);
      const narrowSmallOverlapSearch = minOverlap <= 24 && hit.overlap < 96;
      const allowDetachedEndpointLaneShift = segmentsRunOppositeDirections(hit.a, hit.b)
        || hit.overlap >= (unrelated ? minOverlap : Math.max(24, minOverlap));
      const oppositeEndpointOverlap = isOppositeEndpointOverlap(hit, edges);
      const oppositeDirectionOverlap = segmentsRunOppositeDirections(hit.a, hit.b);
      const bothSegmentsNearEndpoint = (
        (hit.a.fromStart <= 32 || hit.a.fromEnd <= 32)
        && (hit.b.fromStart <= 32 || hit.b.fromEnd <= 32)
      );
      const allowEndpointLaneShift = oppositeEndpointOverlap
        || !unrelated
        || allowDetachedEndpointLaneShift;
      if (
        allowEndpointLaneShift
        && (!narrowSmallOverlapSearch || oppositeEndpointOverlap || (oppositeDirectionOverlap && bothSegmentsNearEndpoint))
      ) {
        const pairClearances = narrowSmallOverlapSearch ? [Math.max(2, Math.floor(minOverlap / 2)), Math.max(2, minOverlap - 1), 16, 24, 32] : [16, 24, 32, 48, 64, 96, 128];
        const useReadableOpposedTerminalLanes = oppositeDirectionOverlap && bothSegmentsNearEndpoint;
        const firstCoordinates = [...new Set([
          ...(useReadableOpposedTerminalLanes
            ? endpointReadableStubCoordinates(paths[hit.a.edgeIndex], hit.a)
            : []),
          ...pairClearances.flatMap(clearance => endpointBypassCoordinates(hit.a, hit.b, clearance)),
        ])].slice(0, narrowSmallOverlapSearch ? 4 : 18);
        const secondCoordinates = [...new Set([
          ...(useReadableOpposedTerminalLanes
            ? endpointReadableStubCoordinates(paths[hit.b.edgeIndex], hit.b)
            : []),
          ...pairClearances.flatMap(clearance => endpointBypassCoordinates(hit.b, hit.a, clearance)),
        ])].slice(0, narrowSmallOverlapSearch ? 4 : 18);
        for (const firstCoordinate of firstCoordinates) {
          const firstBypass = bypassEndpointParallelOverlapAtCoordinate(
            paths[hit.a.edgeIndex],
            hit.a,
            firstCoordinate,
          );
          if (!firstBypass) continue;
          for (const secondCoordinate of secondCoordinates) {
            const secondBypass = bypassEndpointParallelOverlapAtCoordinate(
              paths[hit.b.edgeIndex],
              hit.b,
              secondCoordinate,
            );
            if (!secondBypass) continue;
            const candidatePaths = paths.map((path, index) => {
              if (index === hit.a.edgeIndex) return firstBypass;
              if (index === hit.b.edgeIndex) return secondBypass;
              return path;
            });
            const changedIndexes = [...new Set([hit.a.edgeIndex, hit.b.edgeIndex])];
            if (!routingObstacleGate(paths, candidatePaths, changedIndexes)) continue;
            const candidateEdges = edgesWithPaths(currentEdges, candidatePaths, changedIndexes);
            const candidateQualityScore = qualityBudget.evaluateChanged(
              candidateEdges,
              qualityEvaluationContext,
              changedIndexes,
            );
            if (!candidateQualityScore) break;
            if (candidateQualityScore.strictCrossings > currentQualityScore.strictCrossings) continue;
            if (narrowSmallOverlapSearch) {
              if (enableActionableSubthresholdRepair) {
                const candidateActionableOverlapScore = scoreActionableDetachedOverlaps(
                  candidatePaths,
                  edges,
                  minOverlap,
                );
                if (
                  hardQualityDoesNotRegress(candidateQualityScore, currentQualityScore)
                  && (
                    candidateActionableOverlapScore < bestActionableOverlapScore
                    || (
                      candidateActionableOverlapScore === bestActionableOverlapScore
                      && improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
                    )
                  )
                ) {
                  bestQualityScore = candidateQualityScore;
                  bestActionableOverlapScore = candidateActionableOverlapScore;
                  bestPaths = candidatePaths;
                }
              } else if (
                candidateQualityScore.reverseOverlap < bestQualityScore.reverseOverlap
                || candidateQualityScore.unrelatedOverlap < bestQualityScore.unrelatedOverlap
                || candidateQualityScore.unexplainedRelatedOverlap < bestQualityScore.unexplainedRelatedOverlap
                || improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
              ) {
                bestQualityScore = candidateQualityScore;
                bestPaths = candidatePaths;
              }
              continue;
            }
            if (qualityOnly) {
              if (
                compareQualityScores(candidateQualityScore, bestQualityScore) < 0
                || improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
              ) {
                bestQualityScore = candidateQualityScore;
                bestPaths = candidatePaths;
              }
              continue;
            }
            const currentBestScore = getBestScore();
            const candidateScore = getDetachedScoreContext().evaluateChanged(candidatePaths, changedIndexes);
            if (
              candidateScore < currentBestScore - 25
              || improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
            ) {
              bestScore = candidateScore;
              bestQualityScore = candidateQualityScore;
              bestPaths = candidatePaths;
            }
          }
        }
      }
      for (const segment of [hit.a, hit.b]) {
        const activeDeltas = narrowSmallOverlapSearch ? narrowDeltas : wideDeltas;
        const edge = edges[segment.edgeIndex];
        const otherSegment = segment === hit.a ? hit.b : hit.a;
        const otherEdge = edges[otherSegment.edgeIndex];
        const protectedSharedTrunk = (edge?.data as any)?.sharedTrunkSynthesized === true
          && (otherEdge?.data as any)?.sharedTrunkSynthesized !== true
          && sharesAnyEndpoint(segment, otherSegment, edges)
          && !segmentsRunOppositeDirections(segment, otherSegment);
        if (protectedSharedTrunk) continue;
        const currentEdgeSegments = currentSegments.filter(item => item.edgeIndex === segment.edgeIndex);
        const currentEdgeCrossings = strictCrossingsForEdgeSegments(
          currentEdgeSegments,
          currentSegments,
          segment.edgeIndex,
        );
        const endpointBypassByClearance = new Map<number, Point[] | null>();
        const terminalLaneCandidatesByClearance = new Map<number, Point[][]>();
        for (const delta of activeDeltas) {
          const includeDeltaIndependentCandidates = delta === activeDeltas[0];
          const endpointClearance = Math.max(16, Math.abs(delta));
          let endpointBypass: Point[] | null = null;
          let terminalLaneCandidates: Point[][] = [];
          if (allowEndpointLaneShift) {
            if (!endpointBypassByClearance.has(endpointClearance)) {
              endpointBypassByClearance.set(
                endpointClearance,
                bypassEndpointParallelOverlap(
                  paths[segment.edgeIndex],
                  segment,
                  otherSegment,
                  endpointClearance,
                ),
              );
            }
            endpointBypass = endpointBypassByClearance.get(endpointClearance) ?? null;
            const terminalLaneClearance = Math.max(32, Math.abs(delta));
            terminalLaneCandidates = terminalLaneCandidatesByClearance.get(terminalLaneClearance) ?? [];
            if (!terminalLaneCandidatesByClearance.has(terminalLaneClearance)) {
              terminalLaneCandidates = buildTerminalSegmentParallelLaneCandidates(
                paths[segment.edgeIndex],
                segment,
                otherSegment,
                terminalLaneClearance,
              );
              terminalLaneCandidatesByClearance.set(terminalLaneClearance, terminalLaneCandidates);
            }
          }
          const candidatePathsForSegment = [
            shiftInternalSegment(paths[segment.edgeIndex], segment, delta),
            allowEndpointLaneShift && edge
              ? shiftEndpointSegment(paths[segment.edgeIndex], edge, segment, nodeById, delta)
              : null,
            endpointBypass ? cloneCandidatePath(endpointBypass) : null,
            bypassParallelOverlap(paths[segment.edgeIndex], segment, otherSegment, delta),
            bypassAdjacentLegsAroundOverlap(paths[segment.edgeIndex], segment, otherSegment, delta),
            ...terminalLaneCandidates.map(cloneCandidatePath),
            ...(allowEndpointLaneShift && includeDeltaIndependentCandidates && enableActionableSubthresholdRepair
              ? buildTerminalApproachBypassCandidates(
                paths[segment.edgeIndex],
                segment,
                paths[otherSegment.edgeIndex],
                otherSegment,
                minOverlap,
              )
              : []),
            ...(allowEndpointLaneShift && includeDeltaIndependentCandidates
              ? buildTerminalEndpointSlideShortcutCandidates(paths[segment.edgeIndex], segment)
              : []),
            ...(includeDeltaIndependentCandidates
              ? buildAdjacentLaneEscapeCandidates(paths[segment.edgeIndex], segment, otherSegment)
              : []),
          ].filter((candidate): candidate is Point[] => candidate !== null);

          for (const candidatePath of candidatePathsForSegment) {
            const candidatePaths = paths.map((path, index) => (index === segment.edgeIndex ? candidatePath : path));
            if (!routingObstacleGate(paths, candidatePaths, [segment.edgeIndex])) continue;
            const candidateEdgeCrossings = strictCrossingsForEdgeSegments(
              extractPathSegmentRefsForPath(candidatePath, segment.edgeIndex, edges),
              currentSegments,
              segment.edgeIndex,
            );
            if (candidateEdgeCrossings > currentEdgeCrossings) continue;
            const candidateEdges = edgesWithPaths(currentEdges, candidatePaths, [segment.edgeIndex]);
            const candidateQualityScore = qualityBudget.evaluateChanged(
              candidateEdges,
              qualityEvaluationContext,
              [segment.edgeIndex],
            );
            if (!candidateQualityScore) break;
            if (narrowSmallOverlapSearch) {
              if (enableActionableSubthresholdRepair) {
                const candidateActionableOverlapScore = scoreActionableDetachedOverlaps(
                  candidatePaths,
                  edges,
                  minOverlap,
                );
                if (
                  hardQualityDoesNotRegress(candidateQualityScore, currentQualityScore)
                  && (
                    candidateActionableOverlapScore < bestActionableOverlapScore
                    || (
                      candidateActionableOverlapScore === bestActionableOverlapScore
                      && improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
                    )
                  )
                ) {
                  bestQualityScore = candidateQualityScore;
                  bestActionableOverlapScore = candidateActionableOverlapScore;
                  bestPaths = candidatePaths;
                }
              } else if (
                candidateQualityScore.reverseOverlap < bestQualityScore.reverseOverlap
                || candidateQualityScore.unrelatedOverlap < bestQualityScore.unrelatedOverlap
                || candidateQualityScore.unexplainedRelatedOverlap < bestQualityScore.unexplainedRelatedOverlap
                || improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
              ) {
                bestQualityScore = candidateQualityScore;
                bestPaths = candidatePaths;
              }
              continue;
            }
            if (qualityOnly) {
              if (
                compareQualityScores(candidateQualityScore, bestQualityScore) < 0
                || improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
              ) {
                bestQualityScore = candidateQualityScore;
                bestPaths = candidatePaths;
              }
              continue;
            }
            const currentBestScore = getBestScore();
            const candidateScore = getDetachedScoreContext().evaluateChanged(candidatePaths, [segment.edgeIndex]);
            if (
              candidateScore < currentBestScore - 25
              || improvesQualityWithoutAddingLocalNoise(candidateQualityScore, bestQualityScore)
            ) {
              bestScore = candidateScore;
              bestQualityScore = candidateQualityScore;
              bestPaths = candidatePaths;
            }
          }
        }
      }
    }

    if (!bestPaths) break;
    paths = bestPaths;
    changed = true;
  }

  for (let pass = 0; pass < 4; pass += 1) {
    if (pass >= maxResidualPasses) break;
    if (qualityBudget.exhausted()) break;
    const repaired = repairResidualReverseOrUnrelatedOverlap(
      paths,
      edges,
      nodes,
      minOverlap,
      enableActionableSubthresholdRepair,
      qualityBudget,
      routingObstacleGate,
    );
    if (!repaired) break;
    paths = repaired;
    changed = true;
  }

  if (!changed) return edges;
  return edges.map((edge, index) => {
    const path = paths[index];
    const original = compactPath(getEdgePath(edge));
    return path.length < 2 || pathEquals(path, original) ? edge : withComputedPath(edge, path);
  });
}

function repairResidualReverseOrUnrelatedOverlap(
  paths: Point[][],
  edges: Edge[],
  nodes: ReactFlowNode[],
  minOverlap: number,
  useActionableOverlapScore: boolean,
  qualityBudget: QualityEvaluationBudget,
  routingObstacleGate: RoutingObstacleGate,
): Point[][] | null {
  const currentEdges = edgesWithPaths(edges, paths);
  const qualityEvaluationContext = createEdgePathQualityEvaluationContext(currentEdges);
  const currentQuality = qualityBudget.evaluate(currentEdges);
  if (!currentQuality) return null;
  const hits = findDetachedParallelOverlaps(paths, edges, minOverlap)
    .filter(hit => segmentsRunOppositeDirections(hit.a, hit.b) || !sharesAnyEndpoint(hit.a, hit.b, edges));
  if (hits.length === 0) return null;

  const currentSegments = extractPathSegmentRefs(paths, edges);
  let bestQuality = currentQuality;
  let bestActionableOverlapScore = useActionableOverlapScore
    ? scoreActionableDetachedOverlaps(paths, edges, minOverlap)
    : 0;
  let bestPaths: Point[][] | null = null;
  const deltas = [-224, 224, -160, 160, -128, 128, -96, 96, -64, 64, -48, 48, -32, 32];

  for (const hit of hits.slice(0, 8)) {
    const segments = [hit.a, hit.b].sort((first, second) => first.fromStart + first.fromEnd - second.fromStart - second.fromEnd);
    for (const segment of segments) {
      const other = segment === hit.a ? hit.b : hit.a;
      const edgePath = paths[segment.edgeIndex];
      const fixedTrimCandidate = trimSegmentEndpointOverlap(edgePath, segment, other);
      const fixedEndpointBypassCandidate = bypassEndpointParallelOverlap(
        edgePath,
        segment,
        other,
        Math.max(32, minOverlap + 1),
      );
      const fixedEndpointSlideCandidates = buildTerminalEndpointSlideShortcutCandidates(edgePath, segment);
      const fixedAdjacentLaneCandidates = buildAdjacentLaneEscapeCandidates(edgePath, segment, other);
      const includeAxisPreservingEnvelope = hit.overlap >= Math.max(96, minOverlap * 4)
        && (
          segmentsRunOppositeDirections(segment, other)
          || !sharesAnyEndpoint(segment, other, edges)
        );
      const fixedOuterCandidates = buildDetachedOuterBypassCandidates(
        edgePath,
        edges[segment.edgeIndex],
        nodes,
        { includeAxisPreservingEnvelope },
      );
      const terminalLaneCandidatesByClearance = new Map<number, Point[][]>();
      const currentEdgeSegments = currentSegments.filter(item => item.edgeIndex === segment.edgeIndex);
      const currentEdgeCrossings = strictCrossingsForEdgeSegments(
        currentEdgeSegments,
        currentSegments,
        segment.edgeIndex,
      );
      for (const delta of deltas) {
        const includeDeltaIndependentCandidates = delta === deltas[0];
        const terminalLaneClearance = Math.max(32, Math.abs(delta));
        let terminalLaneCandidates = terminalLaneCandidatesByClearance.get(terminalLaneClearance);
        if (!terminalLaneCandidates) {
          terminalLaneCandidates = buildTerminalSegmentParallelLaneCandidates(
            edgePath,
            segment,
            other,
            terminalLaneClearance,
          );
          terminalLaneCandidatesByClearance.set(terminalLaneClearance, terminalLaneCandidates);
        }
        const candidatePathsForSegment = [
          ...(includeDeltaIndependentCandidates ? fixedOuterCandidates.map(cloneCandidatePath) : []),
          ...fixedAdjacentLaneCandidates.map(cloneCandidatePath),
          shiftInternalSegment(edgePath, segment, delta),
          fixedTrimCandidate ? cloneCandidatePath(fixedTrimCandidate) : null,
          fixedEndpointBypassCandidate ? cloneCandidatePath(fixedEndpointBypassCandidate) : null,
          bypassAdjacentLegsAroundOverlap(edgePath, segment, other, delta, Math.max(32, minOverlap + 1)),
          ...terminalLaneCandidates.map(cloneCandidatePath),
          ...fixedEndpointSlideCandidates.map(cloneCandidatePath),
        ].filter((candidate): candidate is Point[] => candidate !== null);

        for (const candidatePath of candidatePathsForSegment) {
          const candidateSegments = extractPathSegmentRefsForPath(candidatePath, segment.edgeIndex, edges);
          if (strictCrossingsForEdgeSegments(
            candidateSegments,
            currentSegments,
            segment.edgeIndex,
          ) > currentEdgeCrossings) continue;

          const candidatePaths = paths.map((path, index) => (index === segment.edgeIndex ? candidatePath : path));
          if (!routingObstacleGate(paths, candidatePaths, [segment.edgeIndex])) continue;
          const candidateEdges = edgesWithPaths(currentEdges, candidatePaths, [segment.edgeIndex]);
          const candidateQuality = qualityBudget.evaluateChanged(
            candidateEdges,
            qualityEvaluationContext,
            [segment.edgeIndex],
          );
          if (!candidateQuality) return bestPaths;
          if (!hardQualityDoesNotRegress(candidateQuality, currentQuality)) continue;
          const candidateActionableOverlapScore = useActionableOverlapScore
            ? scoreActionableDetachedOverlaps(candidatePaths, edges, minOverlap)
            : 0;
          if (useActionableOverlapScore) {
            if (
              candidateActionableOverlapScore > bestActionableOverlapScore
              || (
                candidateActionableOverlapScore === bestActionableOverlapScore
                && compareQualityScores(candidateQuality, bestQuality) >= 0
              )
            ) continue;
          } else {
            if (
              candidateQuality.reverseOverlap >= bestQuality.reverseOverlap
              && candidateQuality.unrelatedOverlap >= bestQuality.unrelatedOverlap
            ) continue;
            if (compareQualityScores(candidateQuality, bestQuality) >= 0) continue;
          }

          bestQuality = candidateQuality;
          bestActionableOverlapScore = candidateActionableOverlapScore;
          bestPaths = candidatePaths;
          if (
            candidateQuality.reverseOverlap === 0
            && candidateQuality.unrelatedOverlap === 0
            && (!useActionableOverlapScore || candidateActionableOverlapScore === 0)
          ) {
            return bestPaths;
          }
        }
      }
    }
  }

  return bestPaths;
}
