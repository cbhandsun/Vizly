import type { Edge, Node } from '@xyflow/react';

import { readEdgeTerminalPolicy } from '../../routing/utils/edgeTerminalPolicy';
import { normalizeHandle } from '../../routing/utils/handleUtils';
import { countEndpointNodeTraversalHits } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { createEdgePathQualityEvaluationContext } from '../../strategies/shared/edgeStrictCrossingGuard';

type Point = { x: number; y: number };
type Axis = 'h' | 'v';
type Side = 't' | 'b' | 'l' | 'r';
type Rect = { x: number; y: number; width: number; height: number };

const EPS = 0.5;
const TERMINAL_ATTACHMENT_TOLERANCE = 1.5;
const MAX_RENDERED_FILLET_TRANSITION = 24;
const MIN_STUB = 48;
const LANE_GAP = 24;
const VISUAL_LANE_TOLERANCE = 4;
const OBSTACLE_PADDING = 4;
const MAX_TERMINAL_LANES = 8;
const MAX_TRUNK_LANES = 24;
const MAX_AXIS_CANDIDATES = 4_096;
const MAX_TERMINAL_AXIS_REPAIR_PASSES = 4;
const LOCAL_OVERLAP_BYPASS_SPAN = 140;

const finite = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const expectedAxis = (side: Side | null): Axis | null => (
  side === 't' || side === 'b' ? 'v' : side === 'l' || side === 'r' ? 'h' : null
);

const fixedTerminalHandleSide = (edge: Edge, role: 'source' | 'target'): Side | null => {
  const policy = readEdgeTerminalPolicy(edge, role);
  return policy.sideFixed ? normalizeHandle(edge[`${role}Handle`]) : null;
};

const axisOf = (a: Point, b: Point): Axis | null => {
  if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) return 'h';
  if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) return 'v';
  return null;
};

const edgePath = (edge: Edge): Point[] => {
  const raw = (edge.data as any)?.computedPath || (edge.data as any)?.treeRouting?.points || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((point: any) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y));
};

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

const nodeRect = (node: Node): Rect | null => {
  const position = (node as any).positionAbsolute ?? node.position;
  const width = finite((node as any).measured?.width ?? node.width ?? (node.style as any)?.width);
  const height = finite((node as any).measured?.height ?? node.height ?? (node.style as any)?.height);
  if (!position || width <= 1 || height <= 1) return null;
  return { x: finite(position.x), y: finite(position.y), width, height };
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

const boundarySideFromEndpoint = (point: Point, rect: Rect | undefined): Side | null => {
  if (!rect) return null;
  const withinX = point.x >= rect.x - TERMINAL_ATTACHMENT_TOLERANCE
    && point.x <= rect.x + rect.width + TERMINAL_ATTACHMENT_TOLERANCE;
  const withinY = point.y >= rect.y - TERMINAL_ATTACHMENT_TOLERANCE
    && point.y <= rect.y + rect.height + TERMINAL_ATTACHMENT_TOLERANCE;
  if (withinX && Math.abs(point.y - rect.y) <= TERMINAL_ATTACHMENT_TOLERANCE) return 't';
  if (
    withinX
    && Math.abs(point.y - (rect.y + rect.height)) <= TERMINAL_ATTACHMENT_TOLERANCE
  ) return 'b';
  if (withinY && Math.abs(point.x - rect.x) <= TERMINAL_ATTACHMENT_TOLERANCE) return 'l';
  if (
    withinY
    && Math.abs(point.x - (rect.x + rect.width)) <= TERMINAL_ATTACHMENT_TOLERANCE
  ) return 'r';
  return null;
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

const isOutward = (coordinate: number, point: Point, side: Side): boolean => {
  if (side === 't') return coordinate <= point.y - MIN_STUB;
  if (side === 'b') return coordinate >= point.y + MIN_STUB;
  if (side === 'l') return coordinate <= point.x - MIN_STUB;
  return coordinate >= point.x + MIN_STUB;
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
  const data: any = { ...(edge.data || {}), computedPath: path, terminalHandleAxisRepaired: true };
  if (data.treeRouting && Array.isArray(data.treeRouting.points)) {
    data.treeRouting = { ...data.treeRouting, points: path };
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

const endpointDirectionsMatchNodes = (
  edge: Edge,
  path: Point[],
  nodeRects: Map<string, Rect>,
  allowRenderedFilletTransitions = false,
): boolean => {
  if (path.length < 2) return false;
  const source = path[0];
  const target = path[path.length - 1];
  const sourceRect = nodeRects.get(edge.source);
  const targetRect = nodeRects.get(edge.target);
  const declaredSourceSide = fixedTerminalHandleSide(edge, 'source');
  const declaredTargetSide = fixedTerminalHandleSide(edge, 'target');
  const hintedSourceSide = normalizeHandle(edge.sourceHandle);
  const hintedTargetSide = normalizeHandle(edge.targetHandle);
  const endpointLiesOnSide = (point: Point, rect: Rect | undefined, side: Side): boolean => {
    if (!rect) return false;
    const withinX = point.x >= rect.x - TERMINAL_ATTACHMENT_TOLERANCE
      && point.x <= rect.x + rect.width + TERMINAL_ATTACHMENT_TOLERANCE;
    const withinY = point.y >= rect.y - TERMINAL_ATTACHMENT_TOLERANCE
      && point.y <= rect.y + rect.height + TERMINAL_ATTACHMENT_TOLERANCE;
    if (side === 't') return withinX && Math.abs(point.y - rect.y) <= TERMINAL_ATTACHMENT_TOLERANCE;
    if (side === 'b') {
      return withinX
        && Math.abs(point.y - (rect.y + rect.height)) <= TERMINAL_ATTACHMENT_TOLERANCE;
    }
    if (side === 'l') return withinY && Math.abs(point.x - rect.x) <= TERMINAL_ATTACHMENT_TOLERANCE;
    return withinY
      && Math.abs(point.x - (rect.x + rect.width)) <= TERMINAL_ATTACHMENT_TOLERANCE;
  };
  // A corner belongs to two geometric sides. When the edge declares a handle,
  // that declaration is the only stable way to disambiguate the intended port
  // hemisphere; the generic boundary detector deliberately remains the
  // fallback for auto-port edges.
  const sourceSide = hintedSourceSide && endpointLiesOnSide(source, sourceRect, hintedSourceSide)
    ? hintedSourceSide
    : boundarySideFromEndpoint(source, sourceRect);
  const targetSide = hintedTargetSide && endpointLiesOnSide(target, targetRect, hintedTargetSide)
    ? hintedTargetSide
    : boundarySideFromEndpoint(target, targetRect);
  if (!sourceSide || !targetSide) return false;
  if (declaredSourceSide && declaredSourceSide !== sourceSide) return false;
  if (declaredTargetSide && declaredTargetSide !== targetSide) return false;

  const terminalEscapesOutward = (
    orderedPath: Point[],
    side: Side,
    rect: Rect | undefined,
    allowBoundaryTrunk: boolean,
  ): boolean => {
    const [terminal, adjacent, next, afterNext] = orderedPath;
    if (!terminal || !adjacent) return false;
    const outwardAxis = expectedAxis(side);
    const firstAxis = axisOf(terminal, adjacent);
    if (firstAxis === outwardAxis) {
      const coordinate = side === 't' || side === 'b' ? adjacent.y : adjacent.x;
      return isOutward(coordinate, terminal, side);
    }
    if (!allowBoundaryTrunk || !rect || !next || !firstAxis || firstAxis === outwardAxis) return false;
    const adjacentStaysOnBoundary = side === 't'
      ? Math.abs(adjacent.y - rect.y) <= 3
      : side === 'b'
        ? Math.abs(adjacent.y - (rect.y + rect.height)) <= 3
        : side === 'l'
          ? Math.abs(adjacent.x - rect.x) <= 3
          : Math.abs(adjacent.x - (rect.x + rect.width)) <= 3;
    if (!adjacentStaysOnBoundary) return false;
    let outwardPoint = next;
    if (axisOf(adjacent, next) !== outwardAxis) {
      const transitionDx = Math.abs(next.x - adjacent.x);
      const transitionDy = Math.abs(next.y - adjacent.y);
      const transitionMovesOutward = side === 't'
        ? next.y < adjacent.y
        : side === 'b'
          ? next.y > adjacent.y
          : side === 'l'
            ? next.x < adjacent.x
            : next.x > adjacent.x;
      const isBoundedRenderedFillet = allowRenderedFilletTransitions
        && Boolean(afterNext)
        && axisOf(adjacent, next) === null
        && axisOf(next, afterNext) === outwardAxis
        && transitionDx > EPS
        && transitionDy > EPS
        && transitionDx <= MAX_RENDERED_FILLET_TRANSITION
        && transitionDy <= MAX_RENDERED_FILLET_TRANSITION
        && transitionMovesOutward;
      if (!isBoundedRenderedFillet || !afterNext) return false;
      outwardPoint = afterNext;
    }
    const coordinate = side === 't' || side === 'b' ? outwardPoint.y : outwardPoint.x;
    return isOutward(coordinate, adjacent, side);
  };

  return terminalEscapesOutward(path, sourceSide, sourceRect, !declaredSourceSide)
    && terminalEscapesOutward([...path].reverse(), targetSide, targetRect, !declaredTargetSide);
};

export type DisplayTerminalValidation = {
  attached: boolean;
  anchored: boolean;
};

export type DisplayTerminalValidationSnapshot = {
  validateEdge: (edge: Edge) => DisplayTerminalValidation;
};

export type DisplayTerminalValidationOptions = {
  allowRenderedFilletTransitions?: boolean;
};

export type DisplayTerminalValidationReport = {
  allAttached: boolean;
  allAnchored: boolean;
  unanchoredEdgeIndexes: number[];
};

/**
 * Builds the node-boundary lookup once for callers that validate multiple edge
 * collections against the same graph geometry.
 */
export const createDisplayTerminalValidationSnapshot = (
  nodes: Node[],
  options: DisplayTerminalValidationOptions = {},
): DisplayTerminalValidationSnapshot => {
  const nodeRects = new Map<string, Rect>();
  for (const node of nodes) {
    const rect = nodeRect(node);
    if (rect) nodeRects.set(node.id, rect);
  }

  return {
    validateEdge: (edge) => {
      const path = edgePath(edge);
      const anchored = endpointDirectionsMatchNodes(
        edge,
        path,
        nodeRects,
        options.allowRenderedFilletTransitions === true,
      );
      if (anchored) return { attached: true, anchored: true };
      if (path.length < 2) return { attached: false, anchored: false };
      return {
        attached: Boolean(
          boundarySideFromEndpoint(path[0], nodeRects.get(edge.source))
          && boundarySideFromEndpoint(path[path.length - 1], nodeRects.get(edge.target))
        ),
        anchored: false,
      };
    },
  };
};

export const getDisplayTerminalValidationReport = (
  edges: readonly Edge[],
  snapshot: DisplayTerminalValidationSnapshot,
): DisplayTerminalValidationReport => {
  let allAttached = true;
  const unanchoredEdgeIndexes: number[] = [];
  edges.forEach((edge, index) => {
    const validation = snapshot.validateEdge(edge);
    if (!validation.attached) allAttached = false;
    if (!validation.anchored) unanchoredEdgeIndexes.push(index);
  });
  return {
    allAttached,
    allAnchored: unanchoredEdgeIndexes.length === 0,
    unanchoredEdgeIndexes,
  };
};

export const displayEdgesHaveNodeAnchoredTerminals = (
  edges: Edge[],
  nodes: Node[],
  options: DisplayTerminalValidationOptions = {},
): boolean => {
  const snapshot = createDisplayTerminalValidationSnapshot(nodes, options);
  return getDisplayTerminalValidationReport(edges, snapshot).allAnchored;
};

export const displayEdgesHaveNodeAttachedTerminals = (
  edges: Edge[],
  nodes: Node[],
): boolean => {
  const snapshot = createDisplayTerminalValidationSnapshot(nodes);
  return getDisplayTerminalValidationReport(edges, snapshot).allAttached;
};

export const keepNodeAnchoredTerminalCandidates = (
  candidates: Edge[],
  baseline: Edge[],
  nodes: Node[],
): Edge[] => {
  const nodeRects = new Map<string, Rect>();
  for (const node of nodes) {
    const rect = nodeRect(node);
    if (rect) nodeRects.set(node.id, rect);
  }
  return candidates.map((edge, index) => {
    const path = edgePath(edge);
    return endpointDirectionsMatchNodes(edge, path, nodeRects)
      ? edge
      : baseline[index] ?? edge;
  });
};
