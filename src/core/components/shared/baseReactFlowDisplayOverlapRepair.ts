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
  displayEdgesRelated,
  displaySegmentOverlap,
  extractDisplaySegments,
  getDisplayComputedPath,
  isProtectedDisplaySharedTrunkPair,
  withDisplayComputedPath,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import { DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS, DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS, DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS } from './baseReactFlowDisplayOverlapRepairOptions';
export { DISPLAY_BOUNDED_DETACHED_OVERLAP_REPAIR_OPTIONS, DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS, DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS, DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS } from './baseReactFlowDisplayOverlapRepairOptions';
import {
  buildOppositeOverlapOuterBridgeCandidates,
  chooseExactThresholdResidualCandidate,
  createDisplayExactResidualEvaluationContext,
} from './baseReactFlowDisplayOverlapEvaluation';
import { repairExactThresholdResidualOverlaps } from './baseReactFlowDisplayExactOverlapRepair';
import {
  chooseFinalObstacleAwarePolishCandidate,
  createDisplayObstacleEvaluationContext,
  hasHardDisplayOverlapRisk,
  visualPolishHardQualityDoesNotRegress,
} from './baseReactFlowDisplayEvaluation';
import { buildObstacleSkirtCandidates } from './baseReactFlowDisplayObstacleCandidates';
import { repairDisplayLoopShortcuts } from './baseReactFlowDisplayLoopShortcutRepair';
import { buildNearParallelLaneNudgePaths } from './baseReactFlowDisplayNearParallelCandidates';
import {
  collectExactThresholdResidualPairs,
} from './baseReactFlowDisplayReverseParallelRepair';
import {
  createDisplayTerminalValidationSnapshot,
  displayTerminalValidationDoesNotRegress,
} from './baseReactFlowTerminalValidation';

export { repairBoundedReverseParallelOverlapsWithCandidates } from './baseReactFlowDisplayReverseParallelRepair';

const RESIDUAL_PARALLEL_OVERLAP = 16;

export const repairResidualDisplayOverlaps = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  options = DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  extendedOptions = DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
): T => {
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  const rawLoopShortened = repairDisplayLoopShortcuts(edges, nodes, 32) as T;
  const loopShortened = displayTerminalValidationDoesNotRegress(
    edges,
    rawLoopShortened,
    terminalValidation,
  ) ? rawLoopShortened : edges;
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
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
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
  const paths = edges.map(getDisplayComputedPath);
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
      const protectedSharedTrunk = related && isProtectedDisplaySharedTrunkPair(
        first,
        paths[first.edgeIndex],
        edges[first.edgeIndex],
        second,
        paths[second.edgeIndex],
        edges[second.edgeIndex],
      );
      if (!oppositeDirection && protectedSharedTrunk) continue;
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
            if (!displayTerminalValidationDoesNotRegress(edges, variantEdges, terminalValidation)) {
              continue;
            }
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

export { repairExactThresholdResidualOverlaps };
