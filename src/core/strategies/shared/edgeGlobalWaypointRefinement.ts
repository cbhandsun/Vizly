import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import { refineOrthogonalWaypointsDetailed } from '../../algorithms/orthogonalWaypointRefiner';
import { buildPipelineBuddyGroups } from './edgeRoutingTopology';
import {
  addAxisCandidate,
  axisOf,
  bendCount,
  compactPath,
  DEFAULT_SPACING,
  EPS,
  firstDirection,
  getEdgePath,
  getNodeRect,
  isStrictlyOrthogonal,
  lastDirection,
  MIN_ENDPOINT_STUB,
  MIN_INTERIOR_LEG,
  parallelOverlapLength,
  pathEquals,
  pathLength,
  routingObstacles,
  sameEndpoints,
  segmentIntersectsRect,
  segmentLength,
  segmentRange,
  shiftCandidatesAwayFromCrossing,
  shiftCandidatesAwayFromOverlap,
  shiftInteriorSegment,
  SIDE_TOLERANCE,
  strictCrosses,
  toSegments,
  turnbackCount,
  visualStrictCrosses,
  type Point,
  type Rect,
  type Segment,
  type Side,
} from './edgeGlobalWaypointGeometry';

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

type PathCandidateMetrics = {
  strictCrossings: number;
  unrelatedCrossings: number;
  visualUnrelatedCrossings: number;
  unrelatedOverlap: number;
  obstacleHits: number;
  turnbacks: number;
  bends: number;
  length: number;
  score: number;
};

type PathCandidateEvaluationContext = {
  evaluate: (path: Point[]) => PathCandidateMetrics;
};

const toVisualSegments = (path: Point[]): Segment[] => {
  const segments: Segment[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    segments.push({ a: path[index], b: path[index + 1] });
  }
  return segments;
};

function createPathCandidateEvaluationContext(
  edge: Edge,
  key: string,
  workingPaths: Map<string, Point[]>,
  edgeByKey: Map<string, Edge>,
  obstacles: Map<string, Rect>,
): PathCandidateEvaluationContext {
  const otherPaths = [...workingPaths.entries()]
    .filter(([otherKey]) => otherKey !== key)
    .map(([otherKey, otherPath]) => {
      const otherEdge = edgeByKey.get(otherKey);
      return {
        segments: toSegments(otherPath),
        visualSegments: toVisualSegments(otherPath),
        unrelated: Boolean(otherEdge && !sharesEndpoint(edge, otherEdge)),
      };
    });
  const relevantObstacles = [...obstacles.entries()]
    .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
    .map(([, rect]) => rect);
  const cache = new WeakMap<Point[], PathCandidateMetrics>();

  return {
    evaluate: (path: Point[]): PathCandidateMetrics => {
      const cached = cache.get(path);
      if (cached) return cached;
      const segments = toSegments(path);
      const visualSegments = toVisualSegments(path);
      let strictCrossings = 0;
      let unrelatedCrossingCount = 0;
      let visualUnrelatedCrossingCount = 0;
      let unrelatedOverlap = 0;
      let obstacleHitCount = 0;

      for (const other of otherPaths) {
        for (const first of segments) {
          for (const second of other.segments) {
            if (strictCrosses(first, second)) {
              strictCrossings += 1;
              if (other.unrelated) unrelatedCrossingCount += 1;
            }
            if (other.unrelated) {
              const overlap = parallelOverlapLength(first, second);
              if (overlap > MIN_INTERIOR_LEG) unrelatedOverlap += overlap - MIN_INTERIOR_LEG;
            }
          }
        }
        if (other.unrelated) {
          for (const first of visualSegments) {
            for (const second of other.visualSegments) {
              if (visualStrictCrosses(first, second)) visualUnrelatedCrossingCount += 1;
            }
          }
        }
      }
      for (const segment of segments) {
        for (const rect of relevantObstacles) {
          if (segmentIntersectsRect(segment, rect)) obstacleHitCount += 1;
        }
      }

      const turnbacks = turnbackCount(path);
      const bends = bendCount(path);
      const length = pathLength(path);
      const metrics: PathCandidateMetrics = {
        strictCrossings,
        unrelatedCrossings: unrelatedCrossingCount,
        visualUnrelatedCrossings: visualUnrelatedCrossingCount,
        unrelatedOverlap,
        obstacleHits: obstacleHitCount,
        turnbacks,
        bends,
        length,
        score: unrelatedCrossingCount * 10000
          + visualUnrelatedCrossingCount * 9000
          + strictCrossings * 7000
          + unrelatedOverlap * 80
          + obstacleHitCount * 5000
          + turnbacks * 500
          + bends * 40
          + length,
      };
      cache.set(path, metrics);
      return metrics;
    },
  };
}

function sharesEndpoint(first: Edge, second: Edge): boolean {
  return first.source === second.source
    || first.source === second.target
    || first.target === second.source
    || first.target === second.target;
}

function inferEndpointSide(point: Point, rect: Rect): Side | null {
  const candidates = ([
    { side: 't', distance: Math.abs(point.y - rect.y) },
    { side: 'b', distance: Math.abs(point.y - (rect.y + rect.height)) },
    { side: 'l', distance: Math.abs(point.x - rect.x) },
    { side: 'r', distance: Math.abs(point.x - (rect.x + rect.width)) },
  ] satisfies Array<{ side: Side; distance: number }>).sort((first, second) => first.distance - second.distance);
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
  const data: Record<string, unknown> = {
    ...(edge.data || {}),
    computedPath: path,
    globalWaypointRefined: true,
  };
  const treeRouting = data.treeRouting;
  if (treeRouting && typeof treeRouting === 'object' && !Array.isArray(treeRouting)) {
    const route = treeRouting as Record<string, unknown>;
    if (Array.isArray(route.points)) data.treeRouting = { ...route, points: path };
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
  evaluationContext = createPathCandidateEvaluationContext(edge, key, workingPaths, edgeByKey, obstacles),
): boolean {
  if (!sameEndpoints(original, candidate)) return false;
  if (!isStrictlyOrthogonal(candidate)) return false;
  if (firstDirection(candidate) !== firstDirection(original)) return false;
  if (lastDirection(candidate) !== lastDirection(original)) return false;
  if (!keepsEndpointStubs(original, candidate)) return false;

  const originalMetrics = evaluationContext.evaluate(original);
  const candidateMetrics = evaluationContext.evaluate(candidate);
  const originalObstacleHits = originalMetrics.obstacleHits;
  const candidateObstacleHits = candidateMetrics.obstacleHits;
  if (candidateObstacleHits > originalObstacleHits) return false;

  const originalStrictCrossings = originalMetrics.strictCrossings;
  const candidateStrictCrossings = candidateMetrics.strictCrossings;
  const originalCrossings = originalMetrics.unrelatedCrossings;
  const candidateCrossings = candidateMetrics.unrelatedCrossings;
  const originalVisualCrossings = originalMetrics.visualUnrelatedCrossings;
  const candidateVisualCrossings = candidateMetrics.visualUnrelatedCrossings;
  const originalOverlap = originalMetrics.unrelatedOverlap;
  const candidateOverlap = candidateMetrics.unrelatedOverlap;
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
  if (candidateStrictCrossings < originalStrictCrossings) return true;

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
  evaluationContext = createPathCandidateEvaluationContext(edge, key, workingPaths, edgeByKey, obstacles),
): boolean {
  if (slidingEndpoint === 'source' && !samePoint(original[original.length - 1], candidate[candidate.length - 1])) return false;
  if (slidingEndpoint === 'target' && !samePoint(original[0], candidate[0])) return false;
  if (!isStrictlyOrthogonal(candidate)) return false;
  if (firstDirection(candidate) !== firstDirection(original)) return false;
  if (lastDirection(candidate) !== lastDirection(original)) return false;
  if (!keepsEndpointStubs(original, candidate)) return false;

  const originalMetrics = evaluationContext.evaluate(original);
  const candidateMetrics = evaluationContext.evaluate(candidate);
  const originalObstacleHits = originalMetrics.obstacleHits;
  const candidateObstacleHits = candidateMetrics.obstacleHits;
  if (candidateObstacleHits > originalObstacleHits) return false;

  const originalStrictCrossings = originalMetrics.strictCrossings;
  const candidateStrictCrossings = candidateMetrics.strictCrossings;
  const originalCrossings = originalMetrics.unrelatedCrossings;
  const candidateCrossings = candidateMetrics.unrelatedCrossings;
  const originalVisualCrossings = originalMetrics.visualUnrelatedCrossings;
  const candidateVisualCrossings = candidateMetrics.visualUnrelatedCrossings;
  if (candidateStrictCrossings > originalStrictCrossings) return false;
  if (candidateCrossings > originalCrossings) return false;
  if (candidateVisualCrossings > originalVisualCrossings) return false;

  const originalOverlap = originalMetrics.unrelatedOverlap;
  const candidateOverlap = candidateMetrics.unrelatedOverlap;
  return candidateStrictCrossings < originalStrictCrossings
    || candidateCrossings < originalCrossings
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
  evaluationContext = createPathCandidateEvaluationContext(edge, key, workingPaths, edgeByKey, obstacles),
): number {
  return evaluationContext.evaluate(path).score;
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
  const evaluationContext = createPathCandidateEvaluationContext(
    edge,
    key,
    workingPaths,
    edgeByKey,
    obstacles,
  );
  let best: Point[] | null = null;
  let bestScore = pathQualityScore(
    edge,
    key,
    path,
    workingPaths,
    edgeByKey,
    obstacles,
    evaluationContext,
  );
  const seenCandidates = new Set<string>();
  const laneBandCandidates = new Map<number, Point[][]>();

  for (const [otherKey, otherPath] of workingPaths) {
    if (otherKey === key) continue;
    const other = edgeByKey.get(otherKey);
    if (!other) continue;
    const relatedByEndpoint = sharesEndpoint(edge, other);
    const otherSegments = toSegments(otherPath);

    for (let segmentIndex = 0; segmentIndex < path.length - 1; segmentIndex += 1) {
      if (!axisOf(path[segmentIndex], path[segmentIndex + 1])) continue;
      const segment = { a: path[segmentIndex], b: path[segmentIndex + 1] };
      for (const otherSegment of otherSegments) {
        const hasStrictCrossing = strictCrosses(segment, otherSegment) || visualStrictCrosses(segment, otherSegment);
        const hasLongOverlap = parallelOverlapLength(segment, otherSegment) > MIN_INTERIOR_LEG;
        if (relatedByEndpoint && !hasStrictCrossing) continue;
        if (!hasStrictCrossing && !hasLongOverlap) continue;
        let bandCandidates = laneBandCandidates.get(segmentIndex);
        if (!bandCandidates) {
          bandCandidates = shiftCandidatesAwayFromLaneBand(
            edge,
            path,
            segmentIndex,
            workingPaths,
            edgeByKey,
            obstacles,
          );
          laneBandCandidates.set(segmentIndex, bandCandidates);
        }
        const candidates = [
          ...(hasStrictCrossing ? shiftCandidatesAwayFromCrossing(path, segmentIndex, otherSegment) : []),
          ...(hasLongOverlap ? shiftCandidatesAwayFromOverlap(path, segmentIndex, otherSegment) : []),
          ...bandCandidates,
        ];
        for (const candidate of candidates) {
          const candidateKey = candidate.map(point => `${point.x},${point.y}`).join(';');
          if (seenCandidates.has(candidateKey)) continue;
          seenCandidates.add(candidateKey);
          if (!safeToAcceptCandidate(
            edge,
            key,
            path,
            candidate,
            workingPaths,
            edgeByKey,
            obstacles,
            evaluationContext,
          )) continue;
          const score = pathQualityScore(
            edge,
            key,
            candidate,
            workingPaths,
            edgeByKey,
            obstacles,
            evaluationContext,
          );
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
              evaluationContext,
            )) {
              continue;
            }
            const score = pathQualityScore(
              edge,
              key,
              endpointCandidate.path,
              workingPaths,
              edgeByKey,
              obstacles,
              evaluationContext,
            );
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
