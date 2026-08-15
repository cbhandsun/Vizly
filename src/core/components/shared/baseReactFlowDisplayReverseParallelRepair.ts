import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import {
  createEdgePathQualityEvaluationContext,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { buildBoundedResidualOverlapMazeCandidate } from '../../strategies/shared/edgeDetachedResidualOverlapMaze';
import { buildDetachedOuterBypassCandidates } from '../../strategies/shared/edgeDetachedOuterBypass';
import { buildReverseOverlapRepairCandidates } from './baseReactFlowReverseOverlapRepairCandidates';
import { shiftInternalSegment } from '../../strategies/shared/edgeDetachedOverlapCandidateBuilders';
import {
  getDisplayComputedPath,
  withDisplayComputedPath,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import {
  collectExactThresholdResidualPairs,
} from './baseReactFlowDisplayParallelOverlapGeometry';
import {
  createDisplayObstacleEvaluationContext,
} from './baseReactFlowDisplayEvaluation';
import { buildAtomicOverlapCompanionCandidates } from './baseReactFlowDisplayAtomicMultiEdgeCandidates';
import { createAtomicRouteTransactionEvaluation } from './baseReactFlowDisplayAtomicTransactionEvaluation';
import { repairDisplayObstacleHits } from './baseReactFlowDisplayObstacleRepair';
import { buildStrictCrossingCompanionShiftVariants } from './baseReactFlowDisplayTerminalPortCandidates';
import { buildObstacleSkirtCandidates } from './baseReactFlowDisplayObstacleCandidates';

export {
  collectExactThresholdResidualPairs,
  type DisplayExactThresholdResidualPair,
} from './baseReactFlowDisplayParallelOverlapGeometry';

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
    const atomicEvaluation = createAtomicRouteTransactionEvaluation(current, nodes);
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
    let obstacleClosureAttempts = 0;
    let obstacleSkirtAttempts = 0;

    for (const pair of reversePairs) {
      const transactionCandidates = [
        ...buildOppositeRoleCandidates(current, nodes, pair.first, pair.second),
        ...buildAtomicOverlapCompanionCandidates(current, nodes, pair),
      ]
        .map((candidate) => {
          const changedIndexes = current.flatMap((edge, index) => (
            candidate[index] !== edge ? [index] : []
          ));
          return {
            candidate,
            changedIndexes,
            quality: changedIndexes.length > 0
              ? qualityContext.evaluateChanged(candidate, changedIndexes)
              : baselineQuality,
            obstacleHits: changedIndexes.length > 0
              ? obstacleContext.evaluateKnownChanges(candidate, changedIndexes)
              : baselineObstacleHits,
          };
        })
        .filter(entry => entry.changedIndexes.length > 0)
        .sort((first, second) => (
          first.quality.reverseOverlap - second.quality.reverseOverlap
          || first.quality.unrelatedOverlap - second.quality.unrelatedOverlap
          || first.quality.unexplainedRelatedOverlap - second.quality.unexplainedRelatedOverlap
          || first.quality.strictCrossings - second.quality.strictCrossings
          || first.obstacleHits - second.obstacleHits
          || first.quality.tinyInteriorDoglegs - second.quality.tinyInteriorDoglegs
          || first.quality.hairpins - second.quality.hairpins
        ))
        .slice(0, Math.min(16, maxQualityEvaluations));
      for (const transactionCandidate of transactionCandidates) {
        const candidateQueue: Array<{ edges: T; depth: number }> = [
          { edges: transactionCandidate.candidate, depth: 0 },
        ];
        const seenClosures = new Set<string>();
        while (candidateQueue.length > 0) {
          if (qualityEvaluations >= maxQualityEvaluations) return current;
          const queued = candidateQueue.shift();
          if (!queued) break;
          qualityEvaluations += 1;
          let closedCandidate = queued.edges;
          const closedChangedIndexes = current.flatMap((edge, index) => (
            closedCandidate[index] !== edge ? [index] : []
          ));
          if (closedChangedIndexes.length === 0) continue;
          let evaluated = atomicEvaluation.evaluate(closedCandidate, closedChangedIndexes);
          let candidateQuality = evaluated.quality;
          const boundedExceptStrict = (
            candidateQuality.reverseOverlap < baselineQuality.reverseOverlap
            && candidateQuality.nonOrthogonalSegments <= baselineQuality.nonOrthogonalSegments
            && candidateQuality.unrelatedOverlap <= baselineQuality.unrelatedOverlap
            && candidateQuality.unexplainedRelatedOverlap <= baselineQuality.unexplainedRelatedOverlap
            && candidateQuality.shortEndpointStubs <= baselineQuality.shortEndpointStubs
            && candidateQuality.tinyInteriorDoglegs <= baselineQuality.tinyInteriorDoglegs
            && candidateQuality.hairpins <= baselineQuality.hairpins
            && evaluated.terminalsAnchored
            && evaluated.trunksPreserved
            && evaluated.obstacleHitsDoNotRegress
          );
          if (
            boundedExceptStrict
            && candidateQuality.strictCrossings > baselineQuality.strictCrossings
            && candidateQuality.strictCrossings <= baselineQuality.strictCrossings + 3
            && queued.depth < 4
          ) {
            const closureCandidates = [pair.first.edgeIndex, pair.second.edgeIndex]
              .flatMap(primaryEdgeIndex => buildStrictCrossingCompanionShiftVariants(
                closedCandidate,
                primaryEdgeIndex,
              ).slice(0, 12))
              .map((closureCandidate) => {
                const changedIndexes = current.flatMap((edge, index) => (
                  closureCandidate[index] !== edge ? [index] : []
                ));
                return {
                  closureCandidate,
                  quality: qualityContext.evaluateChanged(closureCandidate, changedIndexes),
                  obstacleHits: obstacleContext.evaluateKnownChanges(closureCandidate, changedIndexes),
                };
              })
              .filter(entry => (
                entry.quality.strictCrossings < candidateQuality.strictCrossings
                && entry.quality.reverseOverlap < baselineQuality.reverseOverlap
                && entry.quality.unrelatedOverlap <= baselineQuality.unrelatedOverlap
                && entry.quality.unexplainedRelatedOverlap <= baselineQuality.unexplainedRelatedOverlap
                && entry.quality.nonOrthogonalSegments <= baselineQuality.nonOrthogonalSegments
                && entry.obstacleHits <= baselineObstacleHits
              ))
              .sort((first, second) => (
                first.quality.strictCrossings - second.quality.strictCrossings
                || first.quality.tinyInteriorDoglegs - second.quality.tinyInteriorDoglegs
                || first.quality.hairpins - second.quality.hairpins
                || first.quality.totalLength - second.quality.totalLength
              ))
              .slice(0, 4);
            for (const { closureCandidate } of closureCandidates) {
              const key = closureCandidate.map((edge, index) => (
                edge !== current[index]
                  ? `${index}:${String(edge.sourceHandle)}:${String(edge.targetHandle)}:${getDisplayComputedPath(edge)
                    .map(point => `${point.x}:${point.y}`).join(',')}`
                  : ''
              )).join('|');
              if (seenClosures.has(key)) continue;
              seenClosures.add(key);
              candidateQueue.push({ edges: closureCandidate, depth: queued.depth + 1 });
            }
          }
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
          if (!evaluated.terminalsAnchored || !evaluated.trunksPreserved) continue;
          if (
            !evaluated.obstacleHitsDoNotRegress
            && evaluated.obstacleHits <= baselineObstacleHits + 1
            && obstacleSkirtAttempts < 4
            && queued.depth < 4
          ) {
            obstacleSkirtAttempts += 1;
            for (const edgeIndex of closedChangedIndexes) {
              const edge = closedCandidate[edgeIndex];
              if (!edge) continue;
              const skirtPaths = buildObstacleSkirtCandidates(
                getDisplayComputedPath(edge),
                nodes,
                edge,
                closedCandidate,
              ).slice(0, 8);
              for (const skirtPath of skirtPaths) {
                const skirtCandidate = closedCandidate.map((item, index) => (
                  index === edgeIndex ? withDisplayComputedPath(item, skirtPath) : item
                )) as T;
                const key = skirtCandidate.map((item, index) => (
                  item !== current[index]
                    ? `${index}:${String(item.sourceHandle)}:${String(item.targetHandle)}:${getDisplayComputedPath(item)
                      .map(point => `${point.x}:${point.y}`).join(',')}`
                    : ''
                )).join('|');
                if (seenClosures.has(key)) continue;
                seenClosures.add(key);
                candidateQueue.push({ edges: skirtCandidate, depth: queued.depth + 1 });
              }
            }
          }
          if (
            !evaluated.obstacleHitsDoNotRegress
            && evaluated.obstacleHits <= baselineObstacleHits + 1
            && obstacleClosureAttempts < 4
          ) {
            obstacleClosureAttempts += 1;
            const obstacleClosed = repairDisplayObstacleHits(
              closedCandidate,
              nodes,
              pair.first.axis === 'h' ? 'TB' : 'LR',
              {
                maxEdges: 1,
                maxCandidatesPerEdge: 40,
                maxQualityEvaluations: 56,
                skipOuterFallback: true,
              },
            ) as T;
            const obstacleClosedChangedIndexes = current.flatMap((edge, index) => (
              obstacleClosed[index] !== edge ? [index] : []
            ));
            if (obstacleClosedChangedIndexes.length > 0) {
              const obstacleClosedEvaluation = atomicEvaluation.evaluate(
                obstacleClosed,
                obstacleClosedChangedIndexes,
              );
              if (obstacleClosedEvaluation.obstacleHits < evaluated.obstacleHits) {
                closedCandidate = obstacleClosed;
                evaluated = obstacleClosedEvaluation;
                candidateQuality = evaluated.quality;
              }
            }
          }
          if (
            candidateQuality.reverseOverlap >= baselineQuality.reverseOverlap
            || candidateQuality.nonOrthogonalSegments > baselineQuality.nonOrthogonalSegments
            || candidateQuality.strictCrossings > baselineQuality.strictCrossings
            || candidateQuality.unrelatedOverlap > baselineQuality.unrelatedOverlap
            || candidateQuality.unexplainedRelatedOverlap > baselineQuality.unexplainedRelatedOverlap
            || candidateQuality.shortEndpointStubs > baselineQuality.shortEndpointStubs
            || candidateQuality.tinyInteriorDoglegs > baselineQuality.tinyInteriorDoglegs
            || candidateQuality.hairpins > baselineQuality.hairpins
            || !evaluated.terminalsAnchored
            || !evaluated.trunksPreserved
            || !evaluated.obstacleHitsDoNotRegress
          ) continue;
          accepted = closedCandidate;
          break;
        }
        if (accepted) break;
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

const RESIDUAL_OPPOSITE_LANE_DELTAS = [16, -16, 24, -24, 32, -32, 48, -48, 64, -64] as const;

/**
 * Separates the final interior lane of two unrelated opposite-flow paths when
 * a terminal-aware repair cannot act on either endpoint. Only one internal
 * segment moves, and the whole-graph obstacle and hard-quality gates must stay
 * non-regressing.
 */
export const repairResidualOppositeInteriorLaneOverlaps = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 32,
): T => {
  let current = edges;
  let evaluations = 0;
  for (let pass = 0; pass < 3 && evaluations < maxQualityEvaluations; pass += 1) {
    const pairs = collectExactThresholdResidualPairs(current)
      .filter(pair => (
        pair.overlap > 24
        && pair.first.direction !== 0
        && pair.first.direction === -pair.second.direction
      ));
    if (pairs.length === 0) break;
    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineObstacleHits = obstacleContext.evaluate(current);
    let accepted: T | null = null;

    for (const pair of pairs.slice(0, 4)) {
      for (const segment of [pair.first, pair.second]) {
        const edge = current[segment.edgeIndex];
        const path = edge ? getDisplayComputedPath(edge) : [];
        if (!edge || segment.segmentIndex <= 0 || segment.segmentIndex >= path.length - 2) continue;
        const other = segment === pair.first ? pair.second : pair.first;
        const candidates = [
          ...RESIDUAL_OPPOSITE_LANE_DELTAS.map(delta => shiftInternalSegment(path, {
            a: segment.a,
            b: segment.b,
            axis: segment.axis,
            edgeId: edge.id,
            edgeIndex: segment.edgeIndex,
            segIdx: segment.segmentIndex,
            pointCount: path.length,
            fromStart: segment.segmentIndex,
            fromEnd: path.length - 2 - segment.segmentIndex,
          }, delta)),
          ...buildDetachedOuterBypassCandidates(
            path,
            edge,
            nodes,
            { includeAxisPreservingEnvelope: true },
          ).slice(0, 16),
          buildBoundedResidualOverlapMazeCandidate(
            current,
            nodes,
            segment.edgeIndex,
            [other.edgeIndex],
            { gridPadding: 320, preserveTerminalCaps: false },
          ),
        ];
        for (const shiftedPath of candidates) {
          if (evaluations >= maxQualityEvaluations) return current;
          evaluations += 1;
          if (!shiftedPath) continue;
          const candidate = current.map((candidateEdge, edgeIndex) => (
            edgeIndex === segment.edgeIndex
              ? withDisplayComputedPath(candidateEdge, shiftedPath)
              : candidateEdge
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
