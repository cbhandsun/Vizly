import type { Edge, Node } from '@xyflow/react';

import { separateDetachedParallelOverlaps } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { repairDisplayMicroArtifacts } from '../../strategies/shared/edgeDisplayMicroCleanup';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import {
  calculateEdgePathQualityScore,
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  compactOrthogonalPath,
  isFinitePoint,
} from './baseReactFlowDisplayEdgeCore';
import {
  displayAxisOf,
  displayEdgesRelated,
  displaySegmentOverlap,
  displaySegmentsForPath,
  extractDisplaySegments,
  getDisplayComputedPath,
  getDisplayNodeRect,
  isDisplayContainerNode,
  NEAR_PARALLEL_LANE_TOLERANCE,
  OBSTACLE_REPAIR_NODE_PADDING,
  RESIDUAL_PARALLEL_LANE_GAP,
  shiftDisplayInternalSegment,
  sortedUniqueNumbers,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplayRect,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import { DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS, DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS, DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS } from './baseReactFlowDisplayOverlapRepairOptions';
export { DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS, DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS, DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS, DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS } from './baseReactFlowDisplayOverlapRepairOptions';
import {
  chooseFinalObstacleAwarePolishCandidate,
  createDisplayObstacleEvaluationContext,
  displayObstacleEdgeSignature,
  evaluateDisplayObstacleCandidate,
  evaluateDisplayQualityCandidate,
  hasHardDisplayOverlapRisk,
  visualPolishHardQualityDoesNotRegress,
} from './baseReactFlowDisplayEvaluation';
import { buildObstacleSkirtCandidates } from './baseReactFlowDisplayObstacleCandidates';
import { repairDisplayLoopShortcuts } from './baseReactFlowDisplayLoopShortcutRepair';
import { buildNearParallelLaneNudgePaths } from './baseReactFlowDisplayNearParallelCandidates';
import {
  collectExactThresholdResidualPairs,
} from './baseReactFlowDisplayReverseParallelRepair';

export { repairBoundedReverseParallelOverlapsWithCandidates } from './baseReactFlowDisplayReverseParallelRepair';

const RESIDUAL_PARALLEL_OVERLAP = 16;

export const repairResidualDisplayOverlaps = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  options = DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  extendedOptions = DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
): T => {
  const loopShortened = repairDisplayLoopShortcuts(edges, nodes, 32);
  const initialQuality = calculateEdgePathQualityScore(loopShortened);
  const initialExactResidualPairs = collectExactThresholdResidualPairs(loopShortened);
  if (!hasHardDisplayOverlapRisk(initialQuality) && initialExactResidualPairs.length === 0) {
    return loopShortened;
  }
  const exactQualityBudget = Math.max(
    8,
    Math.min(128, extendedOptions.maxQualityEvaluations * 2),
  );
  const nearParallelQualityBudget = Math.max(
    8,
    Math.min(96, extendedOptions.maxQualityEvaluations),
  );

  // Exact lane shifts are bounded and use the same full quality/obstacle gates. Run them before
  // the combinatorial near-parallel search so a small terminal or interior lane conflict does not
  // force thousands of outer-bridge candidates.
  const exactFirstRepaired = repairExactThresholdResidualOverlaps(
    loopShortened,
    nodes,
    exactQualityBudget,
  );
  const exactFirstSelected = chooseExactThresholdResidualCandidate(
    nodes,
    loopShortened,
    exactFirstRepaired,
  );
  const quality = calculateEdgePathQualityScore(exactFirstSelected);
  const exactResidualPairs = collectExactThresholdResidualPairs(exactFirstSelected);
  const hardOverlapRisk = hasHardDisplayOverlapRisk(quality);
  if (!hardOverlapRisk && exactResidualPairs.length === 0) return exactFirstSelected;
  if (!hardOverlapRisk) {
    const nearParallelCleaned = repairNearParallelResidualOverlaps(
      exactFirstSelected,
      nodes,
      nearParallelQualityBudget,
    );
    const exactCleaned = repairExactThresholdResidualOverlaps(
      nearParallelCleaned,
      nodes,
      exactQualityBudget,
    );
    return chooseExactThresholdResidualCandidate(
      nodes,
      exactFirstSelected,
      nearParallelCleaned,
      exactCleaned,
    );
  }

  const overlapRepaired = separateDetachedParallelOverlaps(
    exactFirstSelected,
    nodes,
    16,
    options,
  ) as T;
  const shouldRunDefaultOverlapCandidate = options === DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS;
  const defaultOverlapRepaired = shouldRunDefaultOverlapCandidate
    ? separateDetachedParallelOverlaps(exactFirstSelected, nodes, 16) as T
    : overlapRepaired;
  const overlapMicroRepaired = repairDisplayMicroArtifacts(overlapRepaired) as T;
  const endpointRepaired = repairEndpointOrthogonalPaths(overlapRepaired, nodes) as T;
  const microRepaired = repairDisplayMicroArtifacts(endpointRepaired) as T;
  const defaultOverlapMicroRepaired = defaultOverlapRepaired === overlapRepaired
    ? overlapMicroRepaired
    : repairDisplayMicroArtifacts(defaultOverlapRepaired) as T;
  const defaultEndpointRepaired = defaultOverlapRepaired === overlapRepaired
    ? endpointRepaired
    : repairEndpointOrthogonalPaths(defaultOverlapRepaired, nodes) as T;
  let selected = chooseFinalObstacleAwarePolishCandidate(
    nodes,
    exactFirstSelected,
    overlapRepaired,
    overlapMicroRepaired,
    endpointRepaired,
    microRepaired,
    defaultOverlapRepaired,
    defaultOverlapMicroRepaired,
    defaultEndpointRepaired,
  );
  selected = chooseExactThresholdResidualCandidate(
    nodes,
    selected,
    overlapRepaired,
    overlapMicroRepaired,
    endpointRepaired,
    microRepaired,
    defaultOverlapRepaired,
    defaultOverlapMicroRepaired,
    defaultEndpointRepaired,
  );
  if (hasHardDisplayOverlapRisk(calculateEdgePathQualityScore(selected))) {
    const extendedOverlapRepaired = separateDetachedParallelOverlaps(
      selected,
      nodes,
      16,
      extendedOptions,
    ) as T;
    const extendedOverlapMicroRepaired = repairDisplayMicroArtifacts(extendedOverlapRepaired) as T;
    const extendedEndpointRepaired = repairEndpointOrthogonalPaths(extendedOverlapRepaired, nodes) as T;
    const extendedMicroRepaired = repairDisplayMicroArtifacts(extendedEndpointRepaired) as T;
    selected = chooseFinalObstacleAwarePolishCandidate(
      nodes,
      selected,
      extendedOverlapRepaired,
      extendedOverlapMicroRepaired,
      extendedEndpointRepaired,
      extendedMicroRepaired,
    );
    selected = chooseExactThresholdResidualCandidate(
      nodes,
      selected,
      extendedOverlapRepaired,
      extendedOverlapMicroRepaired,
      extendedEndpointRepaired,
      extendedMicroRepaired,
    );
  }
  const exactShiftCleaned = repairExactThresholdResidualOverlaps(
    selected,
    nodes,
    exactQualityBudget,
  );
  selected = chooseExactThresholdResidualCandidate(nodes, selected, exactShiftCleaned);
  if (extendedOptions === DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS) return selected;
  const residualCleaned = repairNearParallelResidualOverlaps(
    selected,
    nodes,
    nearParallelQualityBudget,
  );
  const residualMicroCleaned = repairDisplayMicroArtifacts(residualCleaned) as T;
  return chooseFinalObstacleAwarePolishCandidate(nodes, selected, residualCleaned, residualMicroCleaned);
};

export const repairNearParallelResidualOverlaps = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 96,
): T => {
  const qualityContext = createEdgePathQualityEvaluationContext(edges);
  const obstacleContext = createDisplayObstacleEvaluationContext(edges, nodes);
  const exactResidualContext = createDisplayExactResidualEvaluationContext(edges);
  const baselineQuality = qualityContext.evaluate(edges);
  const baselineExactScore = exactResidualContext.evaluate(edges);
  if (
    baselineQuality.reverseOverlap === 0
    && baselineQuality.unrelatedOverlap === 0
    && baselineQuality.unexplainedRelatedOverlap === 0
    && baselineExactScore === 0
  ) return edges;
  const hasNoResidualOverlap = (quality: EdgePathQualityScore): boolean => (
    quality.reverseOverlap === 0
    && quality.unrelatedOverlap === 0
    && quality.unexplainedRelatedOverlap === 0
  );

  let bestEdges: T = edges;
  let bestQuality = baselineQuality;
  let bestObstacleHits = obstacleContext.evaluate(bestEdges);
  let bestExactScore = baselineExactScore;
  let qualityEvaluations = 0;
  const segments = extractDisplaySegments(edges);
  const overlapPairs: Array<{
    first: DisplaySegment;
    second: DisplaySegment;
    overlap: number;
    oppositeDirection: boolean;
  }> = [];
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
      if (overlap < RESIDUAL_PARALLEL_OVERLAP) continue;
      overlapPairs.push({ first, second, overlap, oppositeDirection });
    }
  }
  overlapPairs.sort((first, second) => (
    Number(second.oppositeDirection) - Number(first.oppositeDirection)
    || second.overlap - first.overlap
  ));

  for (const pair of overlapPairs) {
    for (const segment of [pair.second, pair.first]) {
        const other = segment === pair.second ? pair.first : pair.second;
        const path = getDisplayComputedPath(edges[segment.edgeIndex]);
        const otherPath = getDisplayComputedPath(edges[other.edgeIndex]);
        for (const candidatePath of buildNearParallelLaneNudgePaths(
          path,
          segment,
          other,
          otherPath,
          nodes,
          edges[segment.edgeIndex],
          edges,
        ).concat(buildOppositeOverlapOuterBridgeCandidates(
          path,
          segment,
          other,
          otherPath,
          nodes,
          edges[segment.edgeIndex],
        )).slice(0, Math.max(8, Math.min(64, maxQualityEvaluations)))) {
          if (qualityEvaluations >= maxQualityEvaluations) return bestEdges;
          const candidateEdges = edges.map((edge, edgeIndex) => (
            edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
          )) as T;
          const candidateVariants = [
            candidatePath,
            ...buildObstacleSkirtCandidates(
              candidatePath,
              nodes,
              edges[segment.edgeIndex],
              candidateEdges,
            ),
          ];
          for (const candidateVariant of candidateVariants) {
            if (qualityEvaluations >= maxQualityEvaluations) return bestEdges;
            qualityEvaluations += 1;
            const variantEdges = edges.map((edge, edgeIndex) => (
              edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidateVariant) : edge
            )) as T;
            const candidateQuality = qualityContext.evaluateChanged(variantEdges, [segment.edgeIndex]);
            if (!visualPolishHardQualityDoesNotRegress(bestQuality, candidateQuality)) continue;
            const candidateObstacleHits = obstacleContext.evaluateKnownChanges(variantEdges, [segment.edgeIndex]);
            if (candidateObstacleHits > bestObstacleHits) continue;
            const candidateExactScore = exactResidualContext.evaluate(variantEdges);
            if (
              candidateQuality.reverseOverlap < bestQuality.reverseOverlap
              || candidateQuality.unrelatedOverlap < bestQuality.unrelatedOverlap
              || candidateQuality.unexplainedRelatedOverlap < bestQuality.unexplainedRelatedOverlap
              || candidateExactScore < bestExactScore
            ) {
              bestEdges = variantEdges;
              bestQuality = candidateQuality;
              bestObstacleHits = candidateObstacleHits;
              bestExactScore = candidateExactScore;
              if (hasNoResidualOverlap(bestQuality) && bestExactScore === 0) return bestEdges;
            }
          }
        }
      }
  }
  return bestEdges;
};

const residualOverlapScore = (quality: EdgePathQualityScore): number => (
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
  secondPath: DisplayPoint[],
  related: boolean,
): number => {
  const firstSegments = displaySegmentsForPath(firstPath, 0);
  const secondSegments = displaySegmentsForPath(secondPath, 1);
  let total = 0;
  for (const first of firstSegments) {
    for (const second of secondSegments) {
      if (first.axis !== second.axis) continue;
      const oppositeDirection = first.direction !== 0
        && second.direction !== 0
        && first.direction === -second.direction;
      if (!oppositeDirection && related) continue;
      const overlap = displaySegmentOverlap(first, second);
      if (overlap >= 24) total += overlap;
    }
  }
  return total;
};

const createDisplayExactResidualEvaluationContext = (
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
        baselinePaths[secondIndex],
        displayEdgesRelated(baseline[firstIndex], baseline[secondIndex]),
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
          candidatePaths[secondIndex],
          displayEdgesRelated(baseline[firstIndex], baseline[secondIndex]),
        );
      }
      return total;
    },
  };
};

const buildOppositeOverlapOuterBridgeCandidates = (
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

const chooseExactThresholdResidualCandidate = <T extends Edge[]>(
  nodes: Node[],
  baseline: T,
  ...candidates: T[]
): T => {
  const qualityContext = createEdgePathQualityEvaluationContext(baseline);
  const obstacleContext = createDisplayObstacleEvaluationContext(baseline, nodes);
  const exactResidualContext = createDisplayExactResidualEvaluationContext(baseline);
  const baselineQuality = qualityContext.evaluate(baseline);
  let best = baseline;
  let bestQuality = baselineQuality;
  let bestExactScore = exactResidualContext.evaluate(baseline);
  let bestObstacleHits = obstacleContext.evaluate(baseline);
  const seen = new Set<T>([baseline]);
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
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

const exactResidualHardQualityIsAcceptable = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
  bestExactScore: number,
  candidateExactScore: number,
): boolean => {
  const clearsExactResidual = candidateExactScore === 0 && bestExactScore > 0;
  return candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
    && candidate.strictCrossings <= baseline.strictCrossings + (clearsExactResidual ? 2 : 0)
    && candidate.reverseOverlap <= baseline.reverseOverlap
    && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
    && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
    && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
    && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
    && candidate.hairpins <= baseline.hairpins;
};

export const repairExactThresholdResidualOverlaps = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 128,
): T => {
  const qualityContext = createEdgePathQualityEvaluationContext(edges);
  const obstacleContext = createDisplayObstacleEvaluationContext(edges, nodes);
  const exactResidualContext = createDisplayExactResidualEvaluationContext(edges);
  const baselineQuality = qualityContext.evaluate(edges);
  const exactPairs = collectExactThresholdResidualPairs(edges);
  if (exactPairs.length === 0 && residualOverlapScore(baselineQuality) === 0) return edges;

  let bestEdges = edges;
  let bestQuality = baselineQuality;
  let bestObstacleHits = obstacleContext.evaluate(edges);
  let bestExactScore = exactPairs.reduce((total, pair) => total + pair.overlap, 0);
  let qualityEvaluations = 0;

  for (const pair of exactPairs) {
    for (const segment of [pair.second, pair.first]) {
      const other = segment === pair.second ? pair.first : pair.second;
      const path = getDisplayComputedPath(bestEdges[segment.edgeIndex]);
      const currentLane = segment.axis === 'v' ? segment.a.x : segment.a.y;
      const otherLane = segment.axis === 'v' ? other.a.x : other.a.y;
      const away = Math.sign(currentLane - otherLane)
        || (segment.edgeIndex > other.edgeIndex ? 1 : -1);
      const laneValues = sortedUniqueNumbers([
        otherLane + away * (NEAR_PARALLEL_LANE_TOLERANCE + 1),
        currentLane + away * (NEAR_PARALLEL_LANE_TOLERANCE + 1),
        otherLane + away * (NEAR_PARALLEL_LANE_TOLERANCE * 2),
        currentLane + away * (NEAR_PARALLEL_LANE_TOLERANCE * 2),
        currentLane + away * 12,
        currentLane - 12,
        currentLane + 12,
        currentLane - RESIDUAL_PARALLEL_LANE_GAP,
        currentLane + RESIDUAL_PARALLEL_LANE_GAP,
        currentLane - RESIDUAL_PARALLEL_LANE_GAP * 2,
        currentLane + RESIDUAL_PARALLEL_LANE_GAP * 2,
      ], currentLane);

      const candidatePaths: DisplayPoint[][] = [];
      candidatePaths.push(
        ...buildOppositeOverlapOuterBridgeCandidates(
          path,
          segment,
          other,
          getDisplayComputedPath(bestEdges[other.edgeIndex]),
          nodes,
          bestEdges[segment.edgeIndex],
        ),
      );
      for (const lane of laneValues) {
        const candidatePath = shiftDisplayInternalSegment(path, segment.segmentIndex, segment.axis, lane);
        if (candidatePath) candidatePaths.push(candidatePath);
      }
      candidatePaths.push(
        ...buildNearParallelLaneNudgePaths(
          path,
          segment,
          other,
          getDisplayComputedPath(bestEdges[other.edgeIndex]),
          nodes,
          bestEdges[segment.edgeIndex],
          bestEdges,
        ).slice(0, 24),
      );

      for (const candidatePath of candidatePaths.slice(
        0,
        Math.max(8, Math.min(64, maxQualityEvaluations)),
      )) {
        if (qualityEvaluations >= maxQualityEvaluations) return bestEdges;
        qualityEvaluations += 1;
        const candidateEdges = bestEdges.map((edge, edgeIndex) => (
          edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
        )) as T;
        const candidateQuality = evaluateDisplayQualityCandidate(qualityContext, edges, candidateEdges);
        const candidateExactScore = exactResidualContext.evaluate(candidateEdges);
        if (!exactResidualHardQualityIsAcceptable(bestQuality, candidateQuality, bestExactScore, candidateExactScore)) {
          continue;
        }
        const candidateOverlapScore = residualOverlapScore(candidateQuality);
        if (
          candidateOverlapScore >= residualOverlapScore(bestQuality)
          && candidateExactScore >= bestExactScore
          && candidateQuality.strictCrossings >= bestQuality.strictCrossings
        ) {
          continue;
        }
        const candidateObstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, edges, candidateEdges);
        if (candidateObstacleHits > bestObstacleHits) continue;
        bestEdges = candidateEdges;
        bestQuality = candidateQuality;
        bestObstacleHits = candidateObstacleHits;
        bestExactScore = candidateExactScore;
        if (
          candidateOverlapScore === 0
          && candidateExactScore === 0
          && candidateQuality.strictCrossings <= baselineQuality.strictCrossings
        ) return bestEdges;
      }
    }
  }

  return bestEdges;
};
