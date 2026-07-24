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

export {
  createDisplayTerminalValidationSnapshot,
  displayEdgesHaveNodeAnchoredTerminals,
  displayEdgesHaveNodeAttachedTerminals,
  getDisplayTerminalValidationReport,
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
const MAX_AXIS_CANDIDATES = 4_096;
const MAX_TERMINAL_AXIS_REPAIR_PASSES = 4;
const LOCAL_OVERLAP_BYPASS_SPAN = 140;

const compactPath = (path: Point[]): Point[] => {
  const deduped: Point[] = [];
  for (const point of path) {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.abs(previous.x - point.x) > EPS || Math.abs(previous.y - point.y) > EPS) {
      deduped.push({ x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 });
    }
  }
  if (deduped.length < 3) return deduped;
  const result: Point[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    if (axisOf(previous, current) && axisOf(current, next) === axisOf(previous, current)) continue;
    result.push(current);
  }
  result.push(deduped[deduped.length - 1]);
  return result;
};

const segments = (path: Point[]) => path.slice(0, -1)
  .map((a, index) => ({ a, b: path[index + 1], axis: axisOf(a, path[index + 1]), index }))
  .filter((segment): segment is { a: Point; b: Point; axis: Axis; index: number } => Boolean(segment.axis));

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
  firstSegments: ReturnType<typeof segments>,
  secondSegments: ReturnType<typeof segments>,
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
  const segmentsByEdge = paths.map(segments);
  const pairScores = new Map<number, number>();
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
    }
  }
  return {
    baseline,
    evaluate(edgeIndex: number, candidatePath: Point[]): number {
      const candidateSegments = segments(candidatePath);
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

const harmfulOverlapEdgeIndexes = (paths: Point[][], edges: Edge[]): Set<number> => {
  const indexes = new Set<number>();
  for (let first = 0; first < paths.length; first += 1) {
    const firstSegments = segments(paths[first]);
    for (let second = first + 1; second < paths.length; second += 1) {
      const secondSegments = segments(paths[second]);
      const related = edges[first]?.source === edges[second]?.source
        || edges[first]?.source === edges[second]?.target
        || edges[first]?.target === edges[second]?.source
        || edges[first]?.target === edges[second]?.target;
      const harmful = firstSegments.some(a => secondSegments.some(b => {
        const overlap = parallelOverlapLength(a, b);
        if (overlap <= EPS) return false;
        const firstDirection = a.axis === 'v' ? Math.sign(a.b.y - a.a.y) : Math.sign(a.b.x - a.a.x);
        const secondDirection = b.axis === 'v' ? Math.sign(b.b.y - b.a.y) : Math.sign(b.b.x - b.a.x);
        return !related || firstDirection === -secondDirection;
      }));
      if (harmful) {
        indexes.add(first);
        indexes.add(second);
      }
    }
  }
  return indexes;
};

const crossingEdgeIndexes = (paths: Point[][]): Set<number> => {
  const indexes = new Set<number>();
  for (let first = 0; first < paths.length; first += 1) {
    const firstSegments = segments(paths[first]);
    for (let second = first + 1; second < paths.length; second += 1) {
      const secondSegments = segments(paths[second]);
      if (firstSegments.some(a => secondSegments.some(b => strictCrosses(a, b)))) {
        indexes.add(first);
        indexes.add(second);
      }
    }
  }
  return indexes;
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

const pathLength = (path: Point[]): number => path.slice(0, -1).reduce((total, point, index) => (
  total + Math.abs(point.x - path[index + 1].x) + Math.abs(point.y - path[index + 1].y)
), 0);

const hasAxisHairpin = (path: Point[]): boolean => {
  const pathSegments = segments(path).map(segment => ({
    ...segment,
    direction: segment.axis === 'v'
      ? Math.sign(segment.b.y - segment.a.y)
      : Math.sign(segment.b.x - segment.a.x),
    length: Math.abs(segment.b.x - segment.a.x) + Math.abs(segment.b.y - segment.a.y),
  }));
  for (let index = 0; index < pathSegments.length - 2; index += 1) {
    const first = pathSegments[index];
    const middle = pathSegments[index + 1];
    const last = pathSegments[index + 2];
    if (
      first.axis === last.axis
      && first.direction === -last.direction
      && middle.length < 140
    ) return true;
  }
  return false;
};

const hasTinyInteriorDogleg = (path: Point[]): boolean => {
  for (let index = 1; index < path.length - 2; index += 1) {
    const length = Math.abs(path[index].x - path[index + 1].x)
      + Math.abs(path[index].y - path[index + 1].y);
    if (length < LANE_GAP) return true;
  }
  return false;
};

const outwardCoordinate = (point: Point, side: Side, distance = MIN_STUB): number => {
  if (side === 't') return point.y - distance;
  if (side === 'b') return point.y + distance;
  if (side === 'l') return point.x - distance;
  return point.x + distance;
};

const nearestUnique = (values: number[], preferred: number, limit: number): number[] => {
  const unique = [...new Set(values.filter(Number.isFinite).map(value => Math.round(value * 100) / 100))];
  return unique.sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred)).slice(0, limit);
};

const coordinatePools = (paths: Point[][], obstacles: Map<string, Rect>) => {
  const x: number[] = [];
  const y: number[] = [];
  const add = (target: number[], value: number): void => {
    target.push(value, value - LANE_GAP, value + LANE_GAP, value - MIN_STUB, value + MIN_STUB);
  };
  for (const path of paths) for (const point of path) {
    add(x, point.x);
    add(y, point.y);
  }
  for (const rect of obstacles.values()) {
    add(x, rect.x);
    add(x, rect.x + rect.width);
    add(y, rect.y);
    add(y, rect.y + rect.height);
  }
  return { x, y };
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
  const sourceLanes = nearestUnique(
    [sourcePreferred, ...axisValues.filter(value => isOutward(value, source, sourceSide))],
    sourcePreferred,
    MAX_TERMINAL_LANES,
  );
  const targetLanes = nearestUnique(
    [targetPreferred, ...axisValues.filter(value => isOutward(value, target, targetSide))],
    sourceAxis === 'v' ? path[path.length - 2].y : path[path.length - 2].x,
    MAX_TERMINAL_LANES,
  );
  const currentTrunk = sourceAxis === 'v'
    ? path[Math.min(1, path.length - 1)].x
    : path[Math.min(1, path.length - 1)].y;
  const trunks = nearestUnique(trunkValues, currentTrunk, MAX_TRUNK_LANES);
  const candidates: Point[][] = [];

  const sharedLanes = [...new Set(axisValues
    .filter(value => isOutward(value, source, sourceSide) && isOutward(value, target, targetSide))
    .map(value => Math.round(value * 100) / 100))];
  for (const lane of sharedLanes) {
    candidates.push(sourceAxis === 'v'
      ? compactPath([source, { x: source.x, y: lane }, { x: target.x, y: lane }, target])
      : compactPath([source, { x: lane, y: source.y }, { x: lane, y: target.y }, target]));
  }

  const outerTargetLanes = [...new Set(axisValues
    .filter(value => isOutward(value, target, targetSide))
    .map(value => Math.round(value * 100) / 100))];
  const outerTrunks = [...new Set(trunkValues.map(value => Math.round(value * 100) / 100))];
  for (const targetLane of outerTargetLanes) for (const trunk of outerTrunks) {
    candidates.push(sourceAxis === 'v'
      ? compactPath([
        source,
        { x: source.x, y: sourcePreferred },
        { x: trunk, y: sourcePreferred },
        { x: trunk, y: targetLane },
        { x: target.x, y: targetLane },
        target,
      ])
      : compactPath([
        source,
        { x: sourcePreferred, y: source.y },
        { x: sourcePreferred, y: trunk },
        { x: targetLane, y: trunk },
        { x: targetLane, y: target.y },
        target,
      ]));
  }

  for (const sourceLane of sourceLanes) for (const targetLane of targetLanes) for (const trunk of trunks) {
    const candidate = sourceAxis === 'v'
      ? compactPath([
        source,
        { x: source.x, y: sourceLane },
        { x: trunk, y: sourceLane },
        { x: trunk, y: targetLane },
        { x: target.x, y: targetLane },
        target,
      ])
      : compactPath([
        source,
        { x: sourceLane, y: source.y },
        { x: sourceLane, y: trunk },
        { x: targetLane, y: trunk },
        { x: targetLane, y: target.y },
        target,
      ]);
    if (candidate.length >= 4) candidates.push(candidate);
  }
  return candidates
    .map((candidate, originalIndex) => ({
      candidate,
      length: pathLength(candidate),
      originalIndex,
    }))
    .sort((first, second) => first.length - second.length || first.originalIndex - second.originalIndex)
    .slice(0, MAX_AXIS_CANDIDATES)
    .map(entry => entry.candidate);
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
        candidates.push(compactPath([{ x, y: source.y }, { x, y: sourceNeighbor.y }, ...path.slice(2)]));
      }
    } else {
      for (const y of shiftedCoordinates(source.y, sourceRect.y, sourceRect.y + sourceRect.height)) {
        candidates.push(compactPath([{ x: source.x, y }, { x: sourceNeighbor.x, y }, ...path.slice(2)]));
      }
    }
  }

  if (targetRect && targetSide && expectedAxis(targetSide) === axisOf(targetNeighbor, target)) {
    if (targetSide === 't' || targetSide === 'b') {
      for (const x of shiftedCoordinates(target.x, targetRect.x, targetRect.x + targetRect.width)) {
        candidates.push(compactPath([
          ...path.slice(0, -2),
          { x, y: targetNeighbor.y },
          { x, y: target.y },
        ]));
      }
    } else {
      for (const y of shiftedCoordinates(target.y, targetRect.y, targetRect.y + targetRect.height)) {
        candidates.push(compactPath([
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

  for (const movable of segments(path)) {
    if (movable.index <= 0 || movable.index >= path.length - 2) continue;
    for (let otherIndex = 0; otherIndex < paths.length; otherIndex += 1) {
      if (otherIndex === edgeIndex) continue;
      const otherEdge = edges[otherIndex];
      if (!otherEdge) continue;
      const related = edge.source === otherEdge.source
        || edge.source === otherEdge.target
        || edge.target === otherEdge.source
        || edge.target === otherEdge.target;
      for (const blocker of segments(paths[otherIndex])) {
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
            candidates.push(compactPath([
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
            candidates.push(compactPath([
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

export const repairTerminalHandleAxisCrossings = (edges: Edge[], nodes: Node[]): Edge[] => {
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
    const involvedIndexes = baselineCrossings > 0
      ? crossingEdgeIndexes(paths)
      : harmfulOverlapEdgeIndexes(paths, current);
    const involved = [...involvedIndexes]
      .sort((first, second) => (
        Number(terminalAxisMismatch(current[second], paths[second], nodeRects))
        - Number(terminalAxisMismatch(current[first], paths[first], nodeRects))
        || (baselineCrossings > 0
          ? pathLength(paths[second]) - pathLength(paths[first])
          : pathLength(paths[first]) - pathLength(paths[second]))
      ))
      .slice(0, 2);
    const pools = coordinatePools(paths, obstacles);
    let best = current;
    let bestScore = Number.POSITIVE_INFINITY;
    let solvedPhase = false;

    for (const edgeIndex of involved) {
      const edge = current[edgeIndex];
      const path = paths[edgeIndex];
      const candidateGroups = [
        terminalEndpointNudgeCandidates(edge, path, nodeRects),
        localOverlapBypassCandidates(edgeIndex, paths, current),
        terminalAxisCandidates(edge, path, pools, nodeRects),
      ];
      for (const candidatePathsForEdge of candidateGroups) {
        for (const candidatePath of candidatePathsForEdge) {
          if (!terminalDirectionsAreValid(candidatePath, edge, nodeRects)) continue;
          if (hasAxisHairpin(candidatePath)) continue;
          if (hasTinyInteriorDogleg(candidatePath)) continue;
          if (pathHitsObstacle(candidatePath, edge, obstacles)) continue;
          const candidateEdges = current.map((candidate, index) => (
            index === edgeIndex ? withPath(candidate, candidatePath) : candidate
          ));
          const crossings = qualityContext.evaluateChanged(candidateEdges, [edgeIndex]).strictCrossings;
          const overlap = overlapContext.evaluate(edgeIndex, candidatePath);
          if (baselineCrossings > 0) {
            if (crossings >= baselineCrossings || overlap > baselineOverlap + EPS) continue;
          } else if (crossings > 0 || overlap >= baselineOverlap - EPS) {
            continue;
          }
          const directLaneBonus = candidatePath.length <= 4 ? 10_000 : 0;
          const score = baselineCrossings > 0
            ? crossings * 1_000_000 + pathLength(candidatePath)
              + Math.max(0, candidatePath.length - 2) * 400 - directLaneBonus
            : overlap * 1_000 + pathLength(candidatePath)
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
