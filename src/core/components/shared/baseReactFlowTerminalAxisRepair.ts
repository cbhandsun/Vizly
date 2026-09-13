import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import { countEndpointNodeTraversalHits } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { createEdgePathQualityEvaluationContext } from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  boundarySideFromTerminalEndpoint as boundarySideFromEndpoint,
  expectedTerminalAxis as expectedAxis,
  MIN_TERMINAL_STUB as MIN_STUB,
  readTerminalEdgePath as edgePath,
  readTerminalNodeRect as nodeRect,
  TERMINAL_EPSILON as EPS,
  terminalAxisOf as axisOf,
  terminalCoordinateIsOutward as isOutward,
  type TerminalAxis as Axis,
  type TerminalPoint as Point,
  type TerminalRect as Rect,
  type TerminalHandleSide as Side,
} from './baseReactFlowTerminalGeometry';
import {
  createTerminalAxisCoordinatePools,
  selectBoundedTerminalAxisCandidates,
  selectNearestTerminalAxisCoordinates,
  selectTerminalAxisOuterCoordinates,
  type TerminalAxisCandidateSeed,
} from './baseReactFlowTerminalAxisCandidateSelection';
import {
  compactTerminalAxisPath,
  hasTerminalAxisHairpin,
  hasTinyTerminalInteriorDogleg,
  terminalAxisPathLength,
  terminalAxisSegments,
} from './baseReactFlowTerminalAxisPathMetrics';

export {
  createDisplayTerminalValidationSnapshot,
  displayTerminalValidationDoesNotRegress,
  displayEdgesHaveNodeAnchoredTerminals,
  displayEdgesHaveNodeAttachedTerminals,
  getDisplayTerminalValidationReport,
  keepDisplayTerminalValidationNonRegressing,
  keepNodeAnchoredTerminalCandidates,
  type DisplayTerminalValidation,
  type DisplayTerminalValidationOptions,
  type DisplayTerminalValidationReport,
  type DisplayTerminalValidationSnapshot,
} from './baseReactFlowTerminalValidation';

const LANE_GAP = 24;
const VISUAL_LANE_TOLERANCE = 4;
const OBSTACLE_PADDING = 4;
const MAX_TERMINAL_LANES = 8;
const MAX_TRUNK_LANES = 24;
const MAX_AXIS_CANDIDATES = 512;
const MAX_TERMINAL_AXIS_REPAIR_PASSES = 4;
const LOCAL_OVERLAP_BYPASS_SPAN = 140;

export type DisplayTerminalAxisRepairDiagnostics = {
  passCount: number;
  processedEdgeCount: number;
  candidateCount: number;
  maximumCandidateCount: number;
  qualityEvaluationCount: number;
};

export const createDisplayTerminalAxisRepairDiagnostics = (): DisplayTerminalAxisRepairDiagnostics => ({
  passCount: 0,
  processedEdgeCount: 0,
  candidateCount: 0,
  maximumCandidateCount: 0,
  qualityEvaluationCount: 0,
});

const strictCrosses = (
  first: { a: Point; b: Point; axis: Axis },
  second: { a: Point; b: Point; axis: Axis },
): boolean => {
  if (first.axis === second.axis) return false;
  const horizontal = first.axis === 'h' ? first : second;
  const vertical = first.axis === 'v' ? first : second;
  return vertical.a.x > Math.min(horizontal.a.x, horizontal.b.x) + 1
    && vertical.a.x < Math.max(horizontal.a.x, horizontal.b.x) - 1
    && horizontal.a.y > Math.min(vertical.a.y, vertical.b.y) + 1
    && horizontal.a.y < Math.max(vertical.a.y, vertical.b.y) - 1;
};

const parallelOverlapLength = (
  first: { a: Point; b: Point; axis: Axis },
  second: { a: Point; b: Point; axis: Axis },
): number => {
  if (first.axis !== second.axis) return 0;
  if (first.axis === 'h') {
    if (Math.abs(first.a.y - second.a.y) > VISUAL_LANE_TOLERANCE) return 0;
    return Math.max(0, Math.min(Math.max(first.a.x, first.b.x), Math.max(second.a.x, second.b.x))
      - Math.max(Math.min(first.a.x, first.b.x), Math.min(second.a.x, second.b.x)));
  }
  if (Math.abs(first.a.x - second.a.x) > VISUAL_LANE_TOLERANCE) return 0;
  return Math.max(0, Math.min(Math.max(first.a.y, first.b.y), Math.max(second.a.y, second.b.y))
    - Math.max(Math.min(first.a.y, first.b.y), Math.min(second.a.y, second.b.y)));
};

const harmfulParallelOverlapForPair = (
  firstSegments: ReturnType<typeof terminalAxisSegments>,
  secondSegments: ReturnType<typeof terminalAxisSegments>,
  firstEdge: Edge | undefined,
  secondEdge: Edge | undefined,
): number => {
  let total = 0;
  const related = firstEdge?.source === secondEdge?.source
    || firstEdge?.source === secondEdge?.target
    || firstEdge?.target === secondEdge?.source
    || firstEdge?.target === secondEdge?.target;
  for (const a of firstSegments) for (const b of secondSegments) {
    const overlap = parallelOverlapLength(a, b);
    if (overlap <= EPS) continue;
    const firstDirection = a.axis === 'v' ? Math.sign(a.b.y - a.a.y) : Math.sign(a.b.x - a.a.x);
    const secondDirection = b.axis === 'v' ? Math.sign(b.b.y - b.a.y) : Math.sign(b.b.x - b.a.x);
    if (!related || firstDirection === -secondDirection) total += overlap;
  }
  return total;
};

const createHarmfulParallelOverlapContext = (paths: Point[][], edges: Edge[]) => {
  const edgeCount = paths.length;
  const segmentsByEdge = paths.map(terminalAxisSegments);
  const pairScores = new Map<number, number>();
  const involvedIndexes = new Set<number>();
  let baseline = 0;
  for (let first = 0; first < edgeCount; first += 1) {
    for (let second = first + 1; second < edgeCount; second += 1) {
      const key = first * edgeCount + second;
      const score = harmfulParallelOverlapForPair(
        segmentsByEdge[first],
        segmentsByEdge[second],
        edges[first],
        edges[second],
      );
      pairScores.set(key, score);
      baseline += score;
      if (score > EPS) {
        involvedIndexes.add(first);
        involvedIndexes.add(second);
      }
    }
  }
  return {
    baseline,
    involvedIndexes,
    evaluate(edgeIndex: number, candidatePath: Point[]): number {
      const candidateSegments = terminalAxisSegments(candidatePath);
      let score = baseline;
      for (let otherIndex = 0; otherIndex < edgeCount; otherIndex += 1) {
        if (otherIndex === edgeIndex) continue;
        const first = Math.min(edgeIndex, otherIndex);
        const second = Math.max(edgeIndex, otherIndex);
        score -= pairScores.get(first * edgeCount + second) ?? 0;
        score += edgeIndex === first
          ? harmfulParallelOverlapForPair(
            candidateSegments,
            segmentsByEdge[second],
            edges[first],
            edges[second],
          )
          : harmfulParallelOverlapForPair(
            segmentsByEdge[first],
            candidateSegments,
            edges[first],
            edges[second],
          );
      }
      return score;
    },
  };
};

const crossingEdgeIndexes = (paths: Point[][]): Set<number> => {
  const indexes = new Set<number>();
  for (let first = 0; first < paths.length; first += 1) {
    const firstSegments = terminalAxisSegments(paths[first]);
    for (let second = first + 1; second < paths.length; second += 1) {
      const secondSegments = terminalAxisSegments(paths[second]);
      if (firstSegments.some(a => secondSegments.some(b => strictCrosses(a, b)))) {
        indexes.add(first);
        indexes.add(second);
      }
    }
  }
  return indexes;
};

const collectStrictCrossingEdgeIndexes = (
  paths: Point[][],
  qualityContext: ReturnType<typeof createEdgePathQualityEvaluationContext>,
): Set<number> => {
  if (!qualityContext.edgeHasPairRepairOpportunity) return crossingEdgeIndexes(paths);
  const indexes = new Set<number>();
  for (let edgeIndex = 0; edgeIndex < paths.length; edgeIndex += 1) {
    if (qualityContext.edgeHasPairRepairOpportunity(edgeIndex)) indexes.add(edgeIndex);
  }
  return indexes.size > 0 ? indexes : crossingEdgeIndexes(paths);
};

const routingObstacles = (nodes: Node[]): Map<string, Rect> => {
  const ignored = new Set(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane']);
  const result = new Map<string, Rect>();
  for (const node of nodes) {
    if (ignored.has(String(node.type || ''))) continue;
    const rect = nodeRect(node);
    if (rect) result.set(node.id, rect);
  }
  return result;
};

const inferSideFromEndpoint = (point: Point, rect: Rect | undefined): Side | null => {
  if (!rect) return null;
  const distances: Array<[Side, number]> = [
    ['t', Math.abs(point.y - rect.y)],
    ['b', Math.abs(point.y - (rect.y + rect.height))],
    ['l', Math.abs(point.x - rect.x)],
    ['r', Math.abs(point.x - (rect.x + rect.width))],
  ];
  distances.sort((first, second) => first[1] - second[1]);
  return distances[0][1] <= 3 ? distances[0][0] : null;
};

const segmentHitsRect = (a: Point, b: Point, rect: Rect): boolean => {
  const axis = axisOf(a, b);
  if (!axis) return true;
  const left = rect.x - OBSTACLE_PADDING;
  const right = rect.x + rect.width + OBSTACLE_PADDING;
  const top = rect.y - OBSTACLE_PADDING;
  const bottom = rect.y + rect.height + OBSTACLE_PADDING;
  if (axis === 'h') {
    return a.y >= top && a.y <= bottom
      && Math.max(Math.min(a.x, b.x), left) < Math.min(Math.max(a.x, b.x), right);
  }
  return a.x >= left && a.x <= right
    && Math.max(Math.min(a.y, b.y), top) < Math.min(Math.max(a.y, b.y), bottom);
};

const pathHitsObstacle = (path: Point[], edge: Edge, obstacles: Map<string, Rect>): boolean => {
  if (countEndpointNodeTraversalHits(path, edge, obstacles) > 0) return true;
  for (let index = 0; index < path.length - 1; index += 1) {
    for (const [nodeId, rect] of obstacles) {
      if (nodeId === edge.source || nodeId === edge.target) continue;
      if (segmentHitsRect(path[index], path[index + 1], rect)) return true;
    }
  }
  return false;
};

const outwardCoordinate = (point: Point, side: Side, distance = MIN_STUB): number => {
  if (side === 't') return point.y - distance;
  if (side === 'b') return point.y + distance;
  if (side === 'l') return point.x - distance;
  return point.x + distance;
};

const withPath = (edge: Edge, path: Point[]): Edge => {
  const data: Record<string, unknown> = {
    ...(edge.data || {}),
    computedPath: path,
    terminalHandleAxisRepaired: true,
  };
  const treeRouting = data.treeRouting;
  if (treeRouting && typeof treeRouting === 'object' && !Array.isArray(treeRouting)) {
    const route = treeRouting as Record<string, unknown>;
    if (Array.isArray(route.points)) data.treeRouting = { ...route, points: path };
  }
  return { ...edge, data };
};

const terminalDirectionsAreValid = (
  path: Point[],
  edge: Edge,
  nodeRects: Map<string, Rect>,
): boolean => {
  if (path.length < 2) return false;
  const source = path[0];
  const sourceNeighbor = path[1];
  const target = path[path.length - 1];
  const targetNeighbor = path[path.length - 2];
  const sourceSide = inferSideFromEndpoint(source, nodeRects.get(edge.source))
    ?? normalizeHandle(edge.sourceHandle)
    ?? null;
  const targetSide = inferSideFromEndpoint(target, nodeRects.get(edge.target))
    ?? normalizeHandle(edge.targetHandle)
    ?? null;
  if (!sourceSide || !targetSide) return false;
  const sourceCoordinate = sourceSide === 't' || sourceSide === 'b' ? sourceNeighbor.y : sourceNeighbor.x;
  const targetCoordinate = targetSide === 't' || targetSide === 'b' ? targetNeighbor.y : targetNeighbor.x;
  return isOutward(sourceCoordinate, source, sourceSide)
    && isOutward(targetCoordinate, target, targetSide);
};

const terminalAxisCandidates = (
  edge: Edge,
  path: Point[],
  pools: { x: number[]; y: number[] },
  nodeRects: Map<string, Rect>,
  boundOuterProduct: boolean,
): Point[][] => {
  if (path.length < 2) return [];
  const sourceSide = inferSideFromEndpoint(path[0], nodeRects.get(edge.source))
    ?? normalizeHandle(edge.sourceHandle)
    ?? null;
  const targetSide = inferSideFromEndpoint(path[path.length - 1], nodeRects.get(edge.target))
    ?? normalizeHandle(edge.targetHandle)
    ?? null;
  const sourceAxis = expectedAxis(sourceSide);
  const targetAxis = expectedAxis(targetSide);
  if (!sourceSide || !targetSide || !sourceAxis || sourceAxis !== targetAxis) return [];
  const firstAxis = axisOf(path[0], path[1]);
  const lastAxis = axisOf(path[path.length - 2], path[path.length - 1]);
  if (!firstAxis || !lastAxis) return [];

  const source = path[0];
  const target = path[path.length - 1];
  const sourcePreferred = outwardCoordinate(source, sourceSide);
  const targetPreferred = outwardCoordinate(target, targetSide);
  const axisValues = sourceAxis === 'v' ? pools.y : pools.x;
  const trunkValues = sourceAxis === 'v' ? pools.x : pools.y;
  const sourceLanes = selectNearestTerminalAxisCoordinates(
    [sourcePreferred, ...axisValues.filter(value => isOutward(value, source, sourceSide))],
    sourcePreferred,
    MAX_TERMINAL_LANES,
  );
  const targetLanes = selectNearestTerminalAxisCoordinates(
    [targetPreferred, ...axisValues.filter(value => isOutward(value, target, targetSide))],
    sourceAxis === 'v' ? path[path.length - 2].y : path[path.length - 2].x,
    MAX_TERMINAL_LANES,
  );
  const currentTrunk = sourceAxis === 'v'
    ? path[Math.min(1, path.length - 1)].x
    : path[Math.min(1, path.length - 1)].y;
  const trunks = selectNearestTerminalAxisCoordinates(
    trunkValues,
    currentTrunk,
    MAX_TRUNK_LANES,
  );
  const candidateSeeds: TerminalAxisCandidateSeed[] = [];
  const pushCandidate = (candidate: Point[], minimumPointCount = 0): void => {
    candidateSeeds.push({ path: candidate, minimumPointCount });
  };

  const sharedLanes = [...new Set(axisValues
    .filter(value => isOutward(value, source, sourceSide) && isOutward(value, target, targetSide))
    .map(value => Math.round(value * 100) / 100))];
  for (const lane of sharedLanes) {
    pushCandidate(sourceAxis === 'v'
      ? [source, { x: source.x, y: lane }, { x: target.x, y: lane }, target]
      : [source, { x: lane, y: source.y }, { x: lane, y: target.y }, target]);
  }

  // Bound the outer-lane cartesian product before materializing candidate
  // seeds. Large diagrams can expose hundreds of unique path and obstacle
  // coordinates; ranking every target-lane × trunk pair only to discard all
  // but 4,096 candidates made this terminal repair dominate cold routing.
  // Keep the nearest commercial lanes plus both global extremes so genuine
  // outer-skirt bypasses remain available.
  const {
    targetLanes: outerTargetLanes,
    trunks: outerTrunks,
  } = selectTerminalAxisOuterCoordinates({
    targetValues: axisValues.filter(value => isOutward(value, target, targetSide)),
    trunkValues,
    targetPreferred: sourceAxis === 'v'
      ? path[path.length - 2].y
      : path[path.length - 2].x,
    trunkPreferred: currentTrunk,
    boundProduct: boundOuterProduct,
    maximumCandidateCount: MAX_AXIS_CANDIDATES,
    targetNearestLimit: MAX_TERMINAL_LANES * 8,
    trunkNearestLimit: MAX_TRUNK_LANES * 4,
  });
  for (const targetLane of outerTargetLanes) for (const trunk of outerTrunks) {
    pushCandidate(sourceAxis === 'v'
      ? [
        source,
        { x: source.x, y: sourcePreferred },
        { x: trunk, y: sourcePreferred },
        { x: trunk, y: targetLane },
        { x: target.x, y: targetLane },
        target,
      ]
      : [
        source,
        { x: sourcePreferred, y: source.y },
        { x: sourcePreferred, y: trunk },
        { x: targetLane, y: trunk },
        { x: targetLane, y: target.y },
        target,
      ]);
  }

  for (const sourceLane of sourceLanes) for (const targetLane of targetLanes) for (const trunk of trunks) {
    const candidate = sourceAxis === 'v'
      ? [
        source,
        { x: source.x, y: sourceLane },
        { x: trunk, y: sourceLane },
        { x: trunk, y: targetLane },
        { x: target.x, y: targetLane },
        target,
      ]
      : [
        source,
        { x: sourceLane, y: source.y },
        { x: sourceLane, y: trunk },
        { x: targetLane, y: trunk },
        { x: targetLane, y: target.y },
        target,
      ];
    pushCandidate(candidate, 4);
  }

  return selectBoundedTerminalAxisCandidates(
    candidateSeeds,
    compactTerminalAxisPath,
    MAX_AXIS_CANDIDATES,
  );
};

const terminalEndpointNudgeCandidates = (
  edge: Edge,
  path: Point[],
  nodeRects: Map<string, Rect>,
): Point[][] => {
  if (path.length < 2) return [];
  const candidates: Point[][] = [];
  const source = path[0];
  const sourceNeighbor = path[1];
  const target = path[path.length - 1];
  const targetNeighbor = path[path.length - 2];
  const sourceRect = nodeRects.get(edge.source);
  const targetRect = nodeRects.get(edge.target);
  const sourceSide = boundarySideFromEndpoint(source, sourceRect);
  const targetSide = boundarySideFromEndpoint(target, targetRect);

  const shiftedCoordinates = (value: number, min: number, max: number): number[] => (
    [...new Set([value - 48, value - 24, value + 24, value + 48]
      .map(candidate => Math.round(candidate * 100) / 100)
      .filter(candidate => candidate >= min + 16 && candidate <= max - 16))]
      .sort((first, second) => Math.abs(first - value) - Math.abs(second - value))
  );

  if (sourceRect && sourceSide && expectedAxis(sourceSide) === axisOf(source, sourceNeighbor)) {
    if (sourceSide === 't' || sourceSide === 'b') {
      for (const x of shiftedCoordinates(source.x, sourceRect.x, sourceRect.x + sourceRect.width)) {
        candidates.push(compactTerminalAxisPath([{ x, y: source.y }, { x, y: sourceNeighbor.y }, ...path.slice(2)]));
      }
    } else {
      for (const y of shiftedCoordinates(source.y, sourceRect.y, sourceRect.y + sourceRect.height)) {
        candidates.push(compactTerminalAxisPath([{ x: source.x, y }, { x: sourceNeighbor.x, y }, ...path.slice(2)]));
      }
    }
  }

  if (targetRect && targetSide && expectedAxis(targetSide) === axisOf(targetNeighbor, target)) {
    if (targetSide === 't' || targetSide === 'b') {
      for (const x of shiftedCoordinates(target.x, targetRect.x, targetRect.x + targetRect.width)) {
        candidates.push(compactTerminalAxisPath([
          ...path.slice(0, -2),
          { x, y: targetNeighbor.y },
          { x, y: target.y },
        ]));
      }
    } else {
      for (const y of shiftedCoordinates(target.y, targetRect.y, targetRect.y + targetRect.height)) {
        candidates.push(compactTerminalAxisPath([
          ...path.slice(0, -2),
          { x: targetNeighbor.x, y },
          { x: target.x, y },
        ]));
      }
    }
  }

  return candidates;
};

const localOverlapBypassCandidates = (
  edgeIndex: number,
  paths: Point[][],
  edges: Edge[],
): Point[][] => {
  const path = paths[edgeIndex];
  const edge = edges[edgeIndex];
  if (!edge || path.length < 4) return [];
  const candidates: Point[][] = [];

  for (const movable of terminalAxisSegments(path)) {
    if (movable.index <= 0 || movable.index >= path.length - 2) continue;
    for (let otherIndex = 0; otherIndex < paths.length; otherIndex += 1) {
      if (otherIndex === edgeIndex) continue;
      const otherEdge = edges[otherIndex];
      if (!otherEdge) continue;
      const related = edge.source === otherEdge.source
        || edge.source === otherEdge.target
        || edge.target === otherEdge.source
        || edge.target === otherEdge.target;
      for (const blocker of terminalAxisSegments(paths[otherIndex])) {
        const overlap = parallelOverlapLength(movable, blocker);
        if (overlap <= 24) continue;
        const movableDirection = movable.axis === 'v'
          ? Math.sign(movable.b.y - movable.a.y)
          : Math.sign(movable.b.x - movable.a.x);
        const blockerDirection = blocker.axis === 'v'
          ? Math.sign(blocker.b.y - blocker.a.y)
          : Math.sign(blocker.b.x - blocker.a.x);
        if (related && movableDirection !== -blockerDirection) continue;

        if (movable.axis === 'v') {
          const exitY = movableDirection > 0
            ? Math.max(blocker.a.y, blocker.b.y) + LOCAL_OVERLAP_BYPASS_SPAN
            : Math.min(blocker.a.y, blocker.b.y) - LOCAL_OVERLAP_BYPASS_SPAN;
          if (
            exitY <= Math.min(movable.a.y, movable.b.y) + 24
            || exitY >= Math.max(movable.a.y, movable.b.y) - 24
          ) continue;
          for (const detourX of [movable.a.x - 48, movable.a.x - 24, movable.a.x + 24, movable.a.x + 48]) {
            candidates.push(compactTerminalAxisPath([
              ...path.slice(0, movable.index + 1),
              { x: detourX, y: movable.a.y },
              { x: detourX, y: exitY },
              { x: movable.a.x, y: exitY },
              ...path.slice(movable.index + 1),
            ]));
          }
        } else {
          const exitX = movableDirection > 0
            ? Math.max(blocker.a.x, blocker.b.x) + LOCAL_OVERLAP_BYPASS_SPAN
            : Math.min(blocker.a.x, blocker.b.x) - LOCAL_OVERLAP_BYPASS_SPAN;
          if (
            exitX <= Math.min(movable.a.x, movable.b.x) + 24
            || exitX >= Math.max(movable.a.x, movable.b.x) - 24
          ) continue;
          for (const detourY of [movable.a.y - 48, movable.a.y - 24, movable.a.y + 24, movable.a.y + 48]) {
            candidates.push(compactTerminalAxisPath([
              ...path.slice(0, movable.index + 1),
              { x: movable.a.x, y: detourY },
              { x: exitX, y: detourY },
              { x: exitX, y: movable.a.y },
              ...path.slice(movable.index + 1),
            ]));
          }
        }
      }
    }
  }
  return candidates;
};

const terminalAxisMismatch = (
  edge: Edge,
  path: Point[],
  nodeRects: Map<string, Rect>,
): boolean => {
  if (path.length < 2) return false;
  const sourceSide = inferSideFromEndpoint(path[0], nodeRects.get(edge.source))
    ?? normalizeHandle(edge.sourceHandle)
    ?? null;
  const targetSide = inferSideFromEndpoint(path[path.length - 1], nodeRects.get(edge.target))
    ?? normalizeHandle(edge.targetHandle)
    ?? null;
  const sourceAxis = expectedAxis(sourceSide);
  const targetAxis = expectedAxis(targetSide);
  return Boolean(
    sourceAxis
    && targetAxis
    && (
      axisOf(path[0], path[1]) !== sourceAxis
      || axisOf(path[path.length - 2], path[path.length - 1]) !== targetAxis
    )
  );
};

export const repairTerminalHandleAxisCrossings = (
  edges: Edge[],
  nodes: Node[],
  diagnostics?: DisplayTerminalAxisRepairDiagnostics,
): Edge[] => {
  let current = edges;
  const obstacles = routingObstacles(nodes);
  const nodeRects = new Map<string, Rect>();
  for (const node of nodes) {
    const rect = nodeRect(node);
    if (rect) nodeRects.set(node.id, rect);
  }
  for (let pass = 0; pass < MAX_TERMINAL_AXIS_REPAIR_PASSES; pass += 1) {
    const paths = current.map(edgePath);
    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const baselineCrossings = qualityContext.evaluate(current).strictCrossings;
    const overlapContext = createHarmfulParallelOverlapContext(paths, current);
    const baselineOverlap = overlapContext.baseline;
    if (baselineCrossings === 0 && baselineOverlap <= EPS) break;
    if (diagnostics) diagnostics.passCount += 1;
    const involvedIndexes = baselineCrossings > 0
      ? collectStrictCrossingEdgeIndexes(paths, qualityContext)
      : overlapContext.involvedIndexes;
    const involved = [...involvedIndexes]
      .sort((first, second) => (
        Number(terminalAxisMismatch(current[second], paths[second], nodeRects))
        - Number(terminalAxisMismatch(current[first], paths[first], nodeRects))
        || (baselineCrossings > 0
          ? terminalAxisPathLength(paths[second]) - terminalAxisPathLength(paths[first])
          : terminalAxisPathLength(paths[first]) - terminalAxisPathLength(paths[second]))
      ))
      .slice(0, 2);
    if (diagnostics) diagnostics.processedEdgeCount += involved.length;
    const pools = createTerminalAxisCoordinatePools(paths, obstacles, LANE_GAP, MIN_STUB);
    let best = current;
    let bestScore = Number.POSITIVE_INFINITY;
    let solvedPhase = false;

    for (const edgeIndex of involved) {
      const edge = current[edgeIndex];
      const path = paths[edgeIndex];
      const candidateGroups = [
        terminalEndpointNudgeCandidates(edge, path, nodeRects),
        localOverlapBypassCandidates(edgeIndex, paths, current),
        terminalAxisCandidates(edge, path, pools, nodeRects, current.length > 24),
      ];
      const edgeCandidateCount = candidateGroups.reduce(
        (total, candidates) => total + candidates.length,
        0,
      );
      if (diagnostics) {
        diagnostics.candidateCount += edgeCandidateCount;
        diagnostics.maximumCandidateCount = Math.max(
          diagnostics.maximumCandidateCount,
          edgeCandidateCount,
        );
      }
      for (const candidatePathsForEdge of candidateGroups) {
        for (const candidatePath of candidatePathsForEdge) {
          if (!terminalDirectionsAreValid(candidatePath, edge, nodeRects)) continue;
          if (hasTerminalAxisHairpin(candidatePath)) continue;
          if (hasTinyTerminalInteriorDogleg(candidatePath, LANE_GAP)) continue;
          if (pathHitsObstacle(candidatePath, edge, obstacles)) continue;
          const candidateEdges = current.map((candidate, index) => (
            index === edgeIndex ? withPath(candidate, candidatePath) : candidate
          ));
          if (diagnostics) diagnostics.qualityEvaluationCount += 1;
          const crossings = qualityContext.evaluateChanged(candidateEdges, [edgeIndex]).strictCrossings;
          const overlap = overlapContext.evaluate(edgeIndex, candidatePath);
          if (baselineCrossings > 0) {
            if (crossings >= baselineCrossings || overlap > baselineOverlap + EPS) continue;
          } else if (crossings > 0 || overlap >= baselineOverlap - EPS) {
            continue;
          }
          const directLaneBonus = candidatePath.length <= 4 ? 10_000 : 0;
          const score = baselineCrossings > 0
            ? crossings * 1_000_000 + terminalAxisPathLength(candidatePath)
              + Math.max(0, candidatePath.length - 2) * 400 - directLaneBonus
            : overlap * 1_000 + terminalAxisPathLength(candidatePath)
              + Math.max(0, candidatePath.length - 2) * 400 - directLaneBonus;
          if (score >= bestScore) continue;
          best = candidateEdges;
          bestScore = score;
          if ((baselineCrossings > 0 && crossings === 0) || (baselineCrossings === 0 && overlap <= EPS)) {
            solvedPhase = true;
            break;
          }
        }
        if (solvedPhase) break;
      }
      if (solvedPhase) break;
    }

    if (best === current) break;
    current = best;
  }
  return current;
};
