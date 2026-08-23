import type { Edge, Node } from '@xyflow/react';

import { createEdgePathQualityEvaluationContext, type EdgePathQualityScore } from '../../strategies/shared/edgeStrictCrossingGuard';
import { compactOrthogonalPath, isFinitePoint } from './baseReactFlowDisplayEdgeCore';
import {
  displayAxisOf,
  displayEdgesRelated,
  displaySegmentOverlap,
  displaySegmentsForPath,
  getDisplayComputedPath,
  getDisplayNodeRect,
  isDisplayContainerNode,
  isProtectedDisplaySharedTrunkPair,
  OBSTACLE_REPAIR_NODE_PADDING,
  RESIDUAL_PARALLEL_LANE_GAP,
  sortedUniqueNumbers,
  type DisplayPoint,
  type DisplayRect,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import {
  createDisplayObstacleEvaluationContext,
  displayObstacleEdgeSignature,
  evaluateDisplayObstacleCandidate,
  evaluateDisplayQualityCandidate,
  uniqueDisplayRoutingCandidates,
  visualPolishHardQualityDoesNotRegress,
} from './baseReactFlowDisplayEvaluation';
import { collectExactThresholdResidualPairs } from './baseReactFlowDisplayReverseParallelRepair';
import {
  createDisplayTerminalValidationSnapshot,
  displayTerminalValidationDoesNotRegress,
} from './baseReactFlowTerminalValidation';

export const residualOverlapScore = (quality: EdgePathQualityScore): number => (
  quality.reverseOverlap + quality.unrelatedOverlap + quality.unexplainedRelatedOverlap
);

const exactThresholdResidualScore = (edges: Edge[]): number => (
  collectExactThresholdResidualPairs(edges)
    .reduce((total, pair) => total + pair.overlap, 0)
);

type DisplayExactResidualEvaluationContext = {
  evaluate: (candidate: Edge[]) => number;
};
const exactThresholdPairScore = (
  firstPath: DisplayPoint[],
  firstEdge: Edge,
  secondPath: DisplayPoint[],
  secondEdge: Edge,
): number => {
  const firstSegments = displaySegmentsForPath(firstPath, 0);
  const secondSegments = displaySegmentsForPath(secondPath, 1);
  const related = displayEdgesRelated(firstEdge, secondEdge);
  let total = 0;
  for (const first of firstSegments) {
    for (const second of secondSegments) {
      if (first.axis !== second.axis) continue;
      const oppositeDirection = first.direction !== 0
        && second.direction !== 0
        && first.direction === -second.direction;
      const protectedSharedTrunk = related && isProtectedDisplaySharedTrunkPair(
        first,
        firstPath,
        firstEdge,
        second,
        secondPath,
        secondEdge,
      );
      if (!oppositeDirection && protectedSharedTrunk) continue;
      const overlap = displaySegmentOverlap(first, second);
      if (overlap >= 24) total += overlap;
    }
  }
  return total;
};

export const createDisplayExactResidualEvaluationContext = (
  baseline: Edge[],
): DisplayExactResidualEvaluationContext => {
  const edgeCount = baseline.length;
  const baselinePaths = baseline.map(getDisplayComputedPath);
  const baselineSignatures = baseline.map(displayObstacleEdgeSignature);
  const baselinePairScores = new Map<number, number>();
  let baselineTotal = 0;
  for (let firstIndex = 0; firstIndex < edgeCount; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < edgeCount; secondIndex += 1) {
      const score = exactThresholdPairScore(
        baselinePaths[firstIndex],
        baseline[firstIndex],
        baselinePaths[secondIndex],
        baseline[secondIndex],
      );
      if (score > 0) baselinePairScores.set(firstIndex * edgeCount + secondIndex, score);
      baselineTotal += score;
    }
  }

  return {
    evaluate(candidate: Edge[]): number {
      if (candidate.length !== edgeCount) return exactThresholdResidualScore(candidate);
      const changedIndexes: number[] = [];
      const candidatePaths = baselinePaths.slice();
      for (let index = 0; index < edgeCount; index += 1) {
        if (displayObstacleEdgeSignature(candidate[index]) === baselineSignatures[index]) continue;
        changedIndexes.push(index);
        candidatePaths[index] = getDisplayComputedPath(candidate[index]);
      }
      if (changedIndexes.length === 0) return baselineTotal;

      let total = baselineTotal;
      const affectedPairs = new Set<number>();
      for (const changedIndex of changedIndexes) {
        for (let otherIndex = 0; otherIndex < edgeCount; otherIndex += 1) {
          if (changedIndex === otherIndex) continue;
          const firstIndex = Math.min(changedIndex, otherIndex);
          const secondIndex = Math.max(changedIndex, otherIndex);
          affectedPairs.add(firstIndex * edgeCount + secondIndex);
        }
      }
      for (const pairKey of affectedPairs) {
        const firstIndex = Math.floor(pairKey / edgeCount);
        const secondIndex = pairKey % edgeCount;
        total -= baselinePairScores.get(pairKey) ?? 0;
        total += exactThresholdPairScore(
          candidatePaths[firstIndex],
          baseline[firstIndex],
          candidatePaths[secondIndex],
          baseline[secondIndex],
        );
      }
      return total;
    },
  };
};

export const buildOppositeOverlapOuterBridgeCandidates = (
  path: DisplayPoint[],
  segment: DisplaySegment,
  other: DisplaySegment,
  otherPath: DisplayPoint[],
  nodes: Node[] = [],
  edge?: Edge,
): DisplayPoint[][] => {
  if (segment.axis !== other.axis || path.length < 5 || otherPath.length < 5) return [];
  if (segment.segmentIndex <= 0 || segment.segmentIndex >= path.length - 2) return [];
  const before = path[segment.segmentIndex - 1];
  const start = path[segment.segmentIndex];
  const end = path[segment.segmentIndex + 1];
  const after = path[segment.segmentIndex + 2];
  if (!before || !start || !end || !after) return [];

  const otherWindow = otherPath.slice(
    Math.max(0, other.segmentIndex - 1),
    Math.min(otherPath.length, other.segmentIndex + 4),
  );
  if (otherWindow.length < 2) return [];
  const minX = Math.min(...otherWindow.map(point => point.x));
  const maxX = Math.max(...otherWindow.map(point => point.x));
  const minY = Math.min(...otherWindow.map(point => point.y));
  const maxY = Math.max(...otherWindow.map(point => point.y));
  const gap = RESIDUAL_PARALLEL_LANE_GAP;
  const candidates: DisplayPoint[][] = [];
  const obstacleRects = nodes
    .filter(node => !isDisplayContainerNode(node))
    .filter(node => !edge || (node.id !== edge.source && node.id !== edge.target))
    .map(getDisplayNodeRect)
    .filter((rect): rect is DisplayRect => rect !== null);
  const horizontalBridgeLanes = (entryY: number, exitY: number): number[] => {
    const bridgeMinY = Math.min(entryY, exitY) - OBSTACLE_REPAIR_NODE_PADDING;
    const bridgeMaxY = Math.max(entryY, exitY) + OBSTACLE_REPAIR_NODE_PADDING;
    const relevantRects = obstacleRects.filter((rect) => (
      Math.max(rect.y - OBSTACLE_REPAIR_NODE_PADDING, bridgeMinY)
        < Math.min(rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING, bridgeMaxY)
      && rect.x - OBSTACLE_REPAIR_NODE_PADDING < maxX + gap
      && rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING > minX - gap
    ));
    return relevantRects.flatMap(rect => [
      rect.x - OBSTACLE_REPAIR_NODE_PADDING - gap,
      rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + gap,
      rect.x - OBSTACLE_REPAIR_NODE_PADDING - gap * 2,
      rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING + gap * 2,
    ]);
  };
  const verticalBridgeLanes = (entryX: number, exitX: number): number[] => {
    const bridgeMinX = Math.min(entryX, exitX) - OBSTACLE_REPAIR_NODE_PADDING;
    const bridgeMaxX = Math.max(entryX, exitX) + OBSTACLE_REPAIR_NODE_PADDING;
    const relevantRects = obstacleRects.filter((rect) => (
      Math.max(rect.x - OBSTACLE_REPAIR_NODE_PADDING, bridgeMinX)
        < Math.min(rect.x + rect.width + OBSTACLE_REPAIR_NODE_PADDING, bridgeMaxX)
      && rect.y - OBSTACLE_REPAIR_NODE_PADDING < maxY + gap
      && rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING > minY - gap
    ));
    return relevantRects.flatMap(rect => [
      rect.y - OBSTACLE_REPAIR_NODE_PADDING - gap,
      rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + gap,
      rect.y - OBSTACLE_REPAIR_NODE_PADDING - gap * 2,
      rect.y + rect.height + OBSTACLE_REPAIR_NODE_PADDING + gap * 2,
    ]);
  };

  if (segment.axis === 'h') {
    if (displayAxisOf(before, start) !== 'v' || displayAxisOf(end, after) !== 'v') return [];
    const currentY = start.y;
    const exitDirection = Math.sign(after.y - currentY) || 1;
    const entryY = before.y < minY
      ? minY - gap
      : before.y > maxY
        ? maxY + gap
        : currentY - exitDirection * gap;
    const exitY = exitDirection > 0
      ? Math.max(currentY + gap, maxY + gap)
      : Math.min(currentY - gap, minY - gap);
    const bridgeXValues = sortedUniqueNumbers([
      minX - gap,
      maxX + gap,
      minX - gap * 2,
      maxX + gap * 2,
      minX - 96,
      maxX + 96,
      minX - 160,
      maxX + 160,
      ...horizontalBridgeLanes(entryY, exitY),
    ], start.x);
    for (const bridgeX of bridgeXValues.slice(0, 16)) {
      candidates.push(compactOrthogonalPath([
        ...path.slice(0, segment.segmentIndex),
        { x: start.x, y: entryY },
        { x: bridgeX, y: entryY },
        { x: bridgeX, y: exitY },
        { x: end.x, y: exitY },
        ...path.slice(segment.segmentIndex + 2),
      ]));
    }
  } else {
    if (displayAxisOf(before, start) !== 'h' || displayAxisOf(end, after) !== 'h') return [];
    const currentX = start.x;
    const exitDirection = Math.sign(after.x - currentX) || 1;
    const entryX = before.x < minX
      ? minX - gap
      : before.x > maxX
        ? maxX + gap
        : currentX - exitDirection * gap;
    const exitX = exitDirection > 0
      ? Math.max(currentX + gap, maxX + gap)
      : Math.min(currentX - gap, minX - gap);
    const bridgeYValues = sortedUniqueNumbers([
      minY - gap,
      maxY + gap,
      minY - gap * 2,
      maxY + gap * 2,
      minY - 96,
      maxY + 96,
      minY - 160,
      maxY + 160,
      ...verticalBridgeLanes(entryX, exitX),
    ], start.y);
    for (const bridgeY of bridgeYValues.slice(0, 16)) {
      candidates.push(compactOrthogonalPath([
        ...path.slice(0, segment.segmentIndex),
        { x: entryX, y: start.y },
        { x: entryX, y: bridgeY },
        { x: exitX, y: bridgeY },
        { x: exitX, y: end.y },
        ...path.slice(segment.segmentIndex + 2),
      ]));
    }
  }

  return candidates.filter(candidate => candidate.length >= 2 && candidate.every(isFinitePoint));
};

export const chooseExactThresholdResidualCandidate = <T extends Edge[]>(
  nodes: Node[],
  baseline: T,
  ...candidates: T[]
): T => {
  const uniqueCandidates = uniqueDisplayRoutingCandidates(baseline, candidates);
  if (uniqueCandidates.length === 0) return baseline;
  const qualityContext = createEdgePathQualityEvaluationContext(baseline);
  const obstacleContext = createDisplayObstacleEvaluationContext(baseline, nodes);
  const exactResidualContext = createDisplayExactResidualEvaluationContext(baseline);
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  const baselineQuality = qualityContext.evaluate(baseline);
  let best = baseline;
  let bestQuality = baselineQuality;
  let bestExactScore = exactResidualContext.evaluate(baseline);
  let bestObstacleHits = obstacleContext.evaluate(baseline);
  for (const candidate of uniqueCandidates) {
    if (!displayTerminalValidationDoesNotRegress(baseline, candidate, terminalValidation)) continue;
    const candidateExactScore = exactResidualContext.evaluate(candidate);
    if (candidateExactScore >= bestExactScore) continue;
    const candidateQuality = evaluateDisplayQualityCandidate(qualityContext, baseline, candidate);
    if (!visualPolishHardQualityDoesNotRegress(bestQuality, candidateQuality)) continue;
    const candidateObstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, baseline, candidate);
    if (candidateObstacleHits > bestObstacleHits) continue;
    best = candidate;
    bestQuality = candidateQuality;
    bestExactScore = candidateExactScore;
    bestObstacleHits = candidateObstacleHits;
    if (bestExactScore === 0) break;
  }
  return best;
};
