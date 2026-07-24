import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import {
  createEdgePathQualityEvaluationContext,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { buildReverseOverlapRepairCandidates } from './baseReactFlowReverseOverlapRepairCandidates';
import {
  displayEdgesRelated,
  displaySegmentOverlap,
  extractDisplaySegments,
  getDisplayComputedPath,
  withDisplayComputedPath,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import {
  createDisplayObstacleEvaluationContext,
  evaluateDisplayObstacleCandidate,
  evaluateDisplayQualityCandidate,
} from './baseReactFlowDisplayEvaluation';

export interface DisplayExactThresholdResidualPair {
  first: DisplaySegment;
  second: DisplaySegment;
  overlap: number;
}

export const collectExactThresholdResidualPairs = (
  edges: Edge[],
): DisplayExactThresholdResidualPair[] => {
  const segments = extractDisplaySegments(edges);
  const pairs: DisplayExactThresholdResidualPair[] = [];
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      const first = segments[firstIndex];
      const second = segments[secondIndex];
      if (first.edgeIndex === second.edgeIndex) continue;
      const related = displayEdgesRelated(edges[first.edgeIndex], edges[second.edgeIndex]);
      const oppositeDirection = first.direction !== 0
        && second.direction !== 0
        && first.direction === -second.direction;
      if (!oppositeDirection && related) continue;
      const overlap = displaySegmentOverlap(first, second);
      if (overlap < 24) continue;
      pairs.push({ first, second, overlap });
    }
  }
  return pairs.toSorted((first, second) => second.overlap - first.overlap);
};

export const repairBoundedReverseParallelOverlapsWithCandidates = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations: number,
  buildOppositeRoleCandidates: (
    edges: T,
    nodes: Node[],
    first: DisplaySegment,
    second: DisplaySegment,
  ) => T[],
): T => {
  let current = edges;
  let qualityEvaluations = 0;
  for (let pass = 0; pass < 3 && qualityEvaluations < maxQualityEvaluations; pass += 1) {
    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
    const baselineQuality = qualityContext.evaluate(current);
    if (baselineQuality.reverseOverlap === 0) break;
    const baselineObstacleHits = obstacleContext.evaluate(current);
    const reversePairs = collectExactThresholdResidualPairs(current)
      .filter(pair => (
        pair.first.direction !== 0
        && pair.first.direction === -pair.second.direction
      ))
      .slice(0, 4);
    let accepted: T | null = null;

    for (const pair of reversePairs) {
      for (const candidate of buildOppositeRoleCandidates(
        current,
        nodes,
        pair.first,
        pair.second,
      )) {
        if (qualityEvaluations >= maxQualityEvaluations) return current;
        qualityEvaluations += 1;
        const candidateQuality = evaluateDisplayQualityCandidate(qualityContext, current, candidate);
        if (
          candidateQuality.reverseOverlap >= baselineQuality.reverseOverlap
          || candidateQuality.nonOrthogonalSegments > baselineQuality.nonOrthogonalSegments
          || candidateQuality.strictCrossings > baselineQuality.strictCrossings
          || candidateQuality.unrelatedOverlap > baselineQuality.unrelatedOverlap
          || candidateQuality.unexplainedRelatedOverlap > baselineQuality.unexplainedRelatedOverlap
          || candidateQuality.shortEndpointStubs > baselineQuality.shortEndpointStubs
          || candidateQuality.tinyInteriorDoglegs > baselineQuality.tinyInteriorDoglegs
          || candidateQuality.hairpins > baselineQuality.hairpins
        ) continue;
        if (evaluateDisplayObstacleCandidate(obstacleContext, current, candidate) > baselineObstacleHits) continue;
        accepted = candidate;
        break;
      }
      if (accepted) break;
      const orderedSegments = [pair.first, pair.second].sort((first, second) => (
        getDisplayComputedPath(current[first.edgeIndex]).length
          - getDisplayComputedPath(current[second.edgeIndex]).length
      ));
      for (const segment of orderedSegments) {
        const other = segment === pair.first ? pair.second : pair.first;
        const path = getDisplayComputedPath(current[segment.edgeIndex]);
        const sourceSide = normalizeHandle(current[segment.edgeIndex]?.sourceHandle);
        const preferredSourceAxis = sourceSide === 'l' || sourceSide === 'r'
          ? 'h'
          : sourceSide === 't' || sourceSide === 'b'
            ? 'v'
            : undefined;
        const candidatePaths = buildReverseOverlapRepairCandidates(
          path,
          segment,
          other,
          getDisplayComputedPath(current[other.edgeIndex]),
          preferredSourceAxis,
        );
        for (const candidatePath of candidatePaths.slice(0, 3)) {
          if (qualityEvaluations >= maxQualityEvaluations) return current;
          qualityEvaluations += 1;
          const candidate = current.map((edge, edgeIndex) => (
            edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
          )) as T;
          const candidateQuality = qualityContext.evaluateChanged(candidate, [segment.edgeIndex]);
          if (
            candidateQuality.reverseOverlap >= baselineQuality.reverseOverlap
            || candidateQuality.nonOrthogonalSegments > baselineQuality.nonOrthogonalSegments
            || candidateQuality.strictCrossings > baselineQuality.strictCrossings
            || candidateQuality.unrelatedOverlap > baselineQuality.unrelatedOverlap
            || candidateQuality.unexplainedRelatedOverlap > baselineQuality.unexplainedRelatedOverlap
            || candidateQuality.shortEndpointStubs > baselineQuality.shortEndpointStubs
            || candidateQuality.tinyInteriorDoglegs > baselineQuality.tinyInteriorDoglegs
            || candidateQuality.hairpins > baselineQuality.hairpins
          ) continue;
          if (obstacleContext.evaluateKnownChanges(candidate, [segment.edgeIndex]) > baselineObstacleHits) continue;
          accepted = candidate;
          break;
        }
        if (accepted) break;
      }
      if (accepted) break;
    }

    if (!accepted) break;
    current = accepted;
  }
  return current;
};
