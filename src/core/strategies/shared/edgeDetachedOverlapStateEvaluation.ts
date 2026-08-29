import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  type PathSegmentRef,
  type Point,
  type Rect,
  extractPathSegmentRefs,
  extractPathSegmentRefsForPath,
  getRoutingObstacles,
  isEndpointSharedTrunkOverlap,
  isReversePairOverlap,
  pathEquals,
  pathLength,
  segmentIntersectsRect,
  segmentOverlap,
  segmentsRunOppositeDirections,
  sharesAnyEndpoint,
  strictCross,
} from './edgeDetachedOverlapCandidates';

export type DetachedOverlapStateEvaluationContext = {
  evaluate: (candidatePaths: Point[][]) => number;
  evaluateChanged: (candidatePaths: Point[][], changedIndexes: readonly number[]) => number;
  readMetrics: () => Readonly<{
    pairCacheHitCount: number;
    pairEvaluationCount: number;
  }>;
};

const MAX_DETACHED_PAIR_SCORE_CACHE_ENTRIES = 32_768;
const MAX_DETACHED_PATH_SIGNATURE_ENTRIES = 65_536;

export function scoreDetachedOverlapState(
  paths: Point[][],
  edges: Edge[],
  nodes: ReactFlowNode[],
): number {
  const segments = extractPathSegmentRefs(paths, edges);
  const segmentsByEdgeIndex = new Map<number, PathSegmentRef[]>();
  for (const segment of segments) {
    const current = segmentsByEdgeIndex.get(segment.edgeIndex) ?? [];
    current.push(segment);
    segmentsByEdgeIndex.set(segment.edgeIndex, current);
  }
  const obstacles = getRoutingObstacles(nodes);
  let score = 0;

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (segments[i].edgeIndex === segments[j].edgeIndex) continue;
      if (segments[i].axis !== segments[j].axis) {
        if (strictCross(segments[i], segments[j])) score += 4500;
        continue;
      }
      const overlap = segmentOverlap(segments[i], segments[j]);
      if (overlap <= 8) continue;
      const reversePair = isReversePairOverlap(segments[i], segments[j], edges);
      const oppositeDirection = segmentsRunOppositeDirections(segments[i], segments[j]);
      const unrelated = !sharesAnyEndpoint(segments[i], segments[j], edges);
      const minimumPenaltyOverlap = reversePair || oppositeDirection ? 8 : 16;
      if (overlap <= minimumPenaltyOverlap) continue;
      if (isEndpointSharedTrunkOverlap(
        segments[i],
        segments[j],
        edges,
        overlap,
        segmentsByEdgeIndex.get(segments[i].edgeIndex),
        segmentsByEdgeIndex.get(segments[j].edgeIndex),
      )) continue;
      const multiplier = reversePair || oppositeDirection
        ? 128
        : unrelated
          ? 72
          : 24;
      score += overlap * multiplier;
    }
  }

  for (const segment of segments) {
    const edge = edges[segment.edgeIndex];
    for (const [nodeId, rect] of obstacles) {
      if (nodeId === edge?.source || nodeId === edge?.target) continue;
      if (segmentIntersectsRect(segment, rect, 12)) score += 50000;
    }
  }

  return score + paths.reduce((sum, path) => sum + pathLength(path) * 0.01, 0);
}

const candidatePathSignature = (path: readonly Point[]): string => (
  path.map(point => `${point.x}:${point.y}`).join('|')
);

const changedPathsSignature = (
  candidatePaths: Point[][],
  changedIndexes: readonly number[],
): string => changedIndexes
  .map(index => `${index}:${candidatePathSignature(candidatePaths[index] ?? [])}`)
  .join('||');

const detachedPairScore = (
  firstSegments: PathSegmentRef[],
  secondSegments: PathSegmentRef[],
  edges: Edge[],
): number => {
  const firstSegment = firstSegments[0];
  const secondSegment = secondSegments[0];
  if (!firstSegment || !secondSegment) return 0;
  const reversePair = isReversePairOverlap(firstSegment, secondSegment, edges);
  const unrelated = !sharesAnyEndpoint(firstSegment, secondSegment, edges);
  let score = 0;
  for (const first of firstSegments) {
    for (const second of secondSegments) {
      if (first.axis !== second.axis) {
        if (strictCross(first, second)) score += 4500;
        continue;
      }
      const overlap = segmentOverlap(first, second);
      if (overlap <= 8) continue;
      const oppositeDirection = segmentsRunOppositeDirections(first, second);
      const minimumPenaltyOverlap = reversePair || oppositeDirection ? 8 : 16;
      if (overlap <= minimumPenaltyOverlap) continue;
      if (isEndpointSharedTrunkOverlap(
        first,
        second,
        edges,
        overlap,
        firstSegments,
        secondSegments,
      )) continue;
      const multiplier = reversePair || oppositeDirection
        ? 128
        : unrelated
          ? 72
          : 24;
      score += overlap * multiplier;
    }
  }
  return score;
};

const detachedEdgeScore = (
  path: Point[],
  segments: PathSegmentRef[],
  edge: Edge | undefined,
  obstacles: Map<string, Rect>,
): number => {
  let score = pathLength(path) * 0.01;
  for (const segment of segments) {
    for (const [nodeId, rect] of obstacles) {
      if (nodeId === edge?.source || nodeId === edge?.target) continue;
      if (segmentIntersectsRect(segment, rect, 12)) score += 50000;
    }
  }
  return score;
};

export const createDetachedOverlapStateEvaluationContext = (
  baselinePaths: Point[][],
  edges: Edge[],
  nodes: ReactFlowNode[],
): DetachedOverlapStateEvaluationContext => {
  const edgeCount = edges.length;
  const obstacles = getRoutingObstacles(nodes);
  const baselineSegments = baselinePaths.map((path, edgeIndex) => (
    extractPathSegmentRefsForPath(path, edgeIndex, edges)
  ));
  const baselineEdgeScores = baselinePaths.map((path, edgeIndex) => (
    detachedEdgeScore(path, baselineSegments[edgeIndex], edges[edgeIndex], obstacles)
  ));
  const baselinePairScores = new Map<number, number>();
  const changedScoreCache = new Map<string, number>();
  const pathIdBySignature = new Map<string, number>();
  let nextPathId = 1;
  const pathId = (path: Point[]): number => {
    const signature = candidatePathSignature(path);
    const cached = pathIdBySignature.get(signature);
    if (cached !== undefined) return cached;
    const id = nextPathId;
    nextPathId += 1;
    if (pathIdBySignature.size < MAX_DETACHED_PATH_SIGNATURE_ENTRIES) {
      pathIdBySignature.set(signature, id);
    }
    return id;
  };
  const baselinePathIds = baselinePaths.map(pathId);
  const pairScoreCache = new Map<string, number>();
  let pairCacheHitCount = 0;
  let pairEvaluationCount = 0;
  const scorePair = (
    firstIndex: number,
    firstSegments: PathSegmentRef[],
    firstPathId: number,
    secondIndex: number,
    secondSegments: PathSegmentRef[],
    secondPathId: number,
  ): number => {
    const key = `${firstIndex}:${firstPathId}|${secondIndex}:${secondPathId}`;
    const cached = pairScoreCache.get(key);
    if (cached !== undefined) {
      pairCacheHitCount += 1;
      return cached;
    }
    pairEvaluationCount += 1;
    const score = detachedPairScore(firstSegments, secondSegments, edges);
    if (pairScoreCache.size < MAX_DETACHED_PAIR_SCORE_CACHE_ENTRIES) {
      pairScoreCache.set(key, score);
    }
    return score;
  };
  let baselineScore = baselineEdgeScores.reduce((total, value) => total + value, 0);
  for (let first = 0; first < edgeCount; first += 1) {
    for (let second = first + 1; second < edgeCount; second += 1) {
      const key = first * edgeCount + second;
      const score = scorePair(
        first,
        baselineSegments[first],
        baselinePathIds[first],
        second,
        baselineSegments[second],
        baselinePathIds[second],
      );
      baselinePairScores.set(key, score);
      baselineScore += score;
    }
  }

  const evaluateKnownChanges = (
    candidatePaths: Point[][],
    changedIndexes: readonly number[],
  ): number => {
    if (changedIndexes.length === 0) return baselineScore;
    if (changedIndexes.length > Math.max(8, Math.ceil(edgeCount / 2))) {
      return scoreDetachedOverlapState(candidatePaths, edges, nodes);
    }

    const candidateSegments = [...baselineSegments];
    const candidatePathIds = [...baselinePathIds];
    let score = baselineScore;
    for (const edgeIndex of changedIndexes) {
      candidatePathIds[edgeIndex] = pathId(candidatePaths[edgeIndex]);
      candidateSegments[edgeIndex] = extractPathSegmentRefsForPath(
        candidatePaths[edgeIndex],
        edgeIndex,
        edges,
      );
      score -= baselineEdgeScores[edgeIndex];
      score += detachedEdgeScore(
        candidatePaths[edgeIndex],
        candidateSegments[edgeIndex],
        edges[edgeIndex],
        obstacles,
      );
    }

    const affectedPairs = new Set<number>();
    for (const changedIndex of changedIndexes) {
      for (let otherIndex = 0; otherIndex < edgeCount; otherIndex += 1) {
        if (changedIndex === otherIndex) continue;
        const first = Math.min(changedIndex, otherIndex);
        const second = Math.max(changedIndex, otherIndex);
        affectedPairs.add(first * edgeCount + second);
      }
    }
    for (const key of affectedPairs) {
      const first = Math.floor(key / edgeCount);
      const second = key % edgeCount;
      score -= baselinePairScores.get(key) ?? 0;
      score += scorePair(
        first,
        candidateSegments[first],
        candidatePathIds[first],
        second,
        candidateSegments[second],
        candidatePathIds[second],
      );
    }
    return score;
  };

  return {
    readMetrics: () => ({ pairCacheHitCount, pairEvaluationCount }),
    evaluate(candidatePaths: Point[][]): number {
      if (candidatePaths.length !== baselinePaths.length) {
        return scoreDetachedOverlapState(candidatePaths, edges, nodes);
      }
      const changedIndexes = candidatePaths
        .map((path, index) => (pathEquals(path, baselinePaths[index]) ? -1 : index))
        .filter(index => index >= 0);
      return evaluateKnownChanges(candidatePaths, changedIndexes);
    },
    evaluateChanged(candidatePaths: Point[][], changedIndexes: readonly number[]): number {
      if (candidatePaths.length !== baselinePaths.length) {
        return scoreDetachedOverlapState(candidatePaths, edges, nodes);
      }
      const uniqueIndexes = [...new Set(changedIndexes)]
        .filter(index => Number.isInteger(index) && index >= 0 && index < edgeCount);
      if (uniqueIndexes.length !== changedIndexes.length) {
        return scoreDetachedOverlapState(candidatePaths, edges, nodes);
      }
      const cacheKey = changedPathsSignature(candidatePaths, uniqueIndexes);
      const cached = changedScoreCache.get(cacheKey);
      if (cached !== undefined) return cached;
      const score = evaluateKnownChanges(candidatePaths, uniqueIndexes);
      changedScoreCache.set(cacheKey, score);
      return score;
    },
  };
};
