import type { Edge, Node } from '@xyflow/react';

import { separateDetachedParallelOverlaps } from '../../strategies/shared/edgeDetachedOverlapRepair';
import {
  createDisplayMicroCleanupDiagnostics,
  repairDisplayMicroArtifacts,
} from '../../strategies/shared/edgeDisplayMicroCleanup';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import {
  calculateEdgePathQualityScore,
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { getSegments } from '../../strategies/shared/edgePathQualityGeometry';
import { createEdgePathQualitySegmentIndex } from '../../strategies/shared/edgePathQualitySegmentIndex';
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
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseMetrics,
  type DisplayRoutingPhaseName,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

export { repairBoundedReverseParallelOverlapsWithCandidates } from './baseReactFlowDisplayReverseParallelRepair';

const RESIDUAL_PARALLEL_OVERLAP = 16;

type DisplayResidualRepairTraceOptions = Readonly<{
  parentPhase: DisplayRoutingPhaseName;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}>;

const displayPathsEqual = (first: Edge, second: Edge): boolean => {
  const firstPath = getDisplayComputedPath(first);
  const secondPath = getDisplayComputedPath(second);
  return firstPath.length === secondPath.length
    && firstPath.every((point, index) => (
      point.x === secondPath[index]?.x
      && point.y === secondPath[index]?.y
    ));
};

export const changedDisplayPathIndexes = (
  baseline: Edge[],
  candidate: Edge[],
): number[] => {
  if (
    baseline.length !== candidate.length
    || baseline.some((edge, index) => edge.id !== candidate[index]?.id)
  ) {
    return candidate.map((_, index) => index);
  }
  return candidate.flatMap((edge, index) => (
    displayPathsEqual(baseline[index], edge) ? [] : [index]
  ));
};

export const collectResidualMicroCandidateEdgeIndexes = (
  baseline: Edge[],
  derivative: Edge[],
): number[] => {
  const changedIndexes = changedDisplayPathIndexes(baseline, derivative);
  if (changedIndexes.length === 0) return [];
  if (baseline.length !== derivative.length) return changedIndexes;

  const paths = derivative.map(getDisplayComputedPath);
  const allSegments = getSegments(paths);
  const edgeSegments = derivative.map((_, edgeIndex) => (
    allSegments.filter(segment => segment.edgeIndex === edgeIndex)
  ));
  const segmentIndex = createEdgePathQualitySegmentIndex(edgeSegments);
  const candidateIndexes = new Set(changedIndexes);
  const changedSet = new Set(changedIndexes);
  for (const changedIndex of changedIndexes) {
    const changedEdge = derivative[changedIndex];
    const query = segmentIndex.queryPotentialEdgeIndexes(
      edgeSegments[changedIndex] ?? [],
      changedSet,
    );
    query.edgeIndexes.forEach(index => candidateIndexes.add(index));
    derivative.forEach((edge, index) => {
      if (
        index !== changedIndex
        && (
          edge.source === changedEdge.source
          || edge.target === changedEdge.target
        )
      ) candidateIndexes.add(index);
    });
  }
  return [...candidateIndexes].sort((first, second) => first - second);
};

export const repairResidualDisplayOverlaps = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  options = DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS,
  extendedOptions = DISPLAY_EXTENDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS,
  traceOptions?: DisplayResidualRepairTraceOptions,
): T => {
  const runTracedRepair = (
    phase: Extract<
      DisplayRoutingPhaseName,
      | 'residual-exact'
      | 'residual-loop-shortcut'
      | 'residual-exact-selection'
      | 'residual-polish-selection'
      | 'residual-micro-derivative'
      | 'residual-endpoint-derivative'
      | 'residual-obstacle-selection'
      | 'residual-detached-primary'
      | 'residual-detached-default'
      | 'residual-detached-extended'
      | 'residual-near-parallel'
    >,
    baseline: T,
    repair: () => T,
    parentPhase = traceOptions?.parentPhase,
    readMetrics?: () => DisplayRoutingPhaseMetrics,
  ): T => {
    const timer = startDisplayRoutingPhaseTrace({
      phase,
      parentPhase,
      candidateCount: baseline.length,
      onTrace: traceOptions?.onPhaseTrace,
    });
    const result = repair();
    timer.finish(
      result === baseline ? 'skip' : 'accepted',
      result === baseline ? 0 : result.length,
      readMetrics?.(),
    );
    return result;
  };
  const runTracedMicroDerivative = (
    parent: T,
    derivative: T,
    parentPhase: DisplayRoutingPhaseName,
  ): T => {
    const diagnostics = createDisplayMicroCleanupDiagnostics();
    const candidateEdgeIndexes = collectResidualMicroCandidateEdgeIndexes(parent, derivative);
    return runTracedRepair(
      'residual-micro-derivative',
      derivative,
      () => repairDisplayMicroArtifacts(
        derivative,
        undefined,
        diagnostics,
        { candidateEdgeIndexes },
      ) as T,
      parentPhase,
      () => ({
        candidateCount: diagnostics.generatedCandidateCount,
        evaluationCount: diagnostics.evaluatedCandidateCount,
        cacheHitCount: diagnostics.cacheHitCount + diagnostics.pairCacheHitCount,
        scannedEdgePairCount: diagnostics.scannedEdgePairCount,
        scannedSegmentCount: diagnostics.scannedSegmentCount,
      }),
    );
  };
  const runTracedMicroRepair = (
    baseline: T,
    parentPhase: DisplayRoutingPhaseName,
  ): T => {
    const diagnostics = createDisplayMicroCleanupDiagnostics();
    return runTracedRepair(
      'residual-micro-derivative',
      baseline,
      () => repairDisplayMicroArtifacts(baseline, undefined, diagnostics) as T,
      parentPhase,
      () => ({
        candidateCount: diagnostics.generatedCandidateCount,
        evaluationCount: diagnostics.evaluatedCandidateCount,
        cacheHitCount: diagnostics.cacheHitCount + diagnostics.pairCacheHitCount,
        scannedEdgePairCount: diagnostics.scannedEdgePairCount,
        scannedSegmentCount: diagnostics.scannedSegmentCount,
      }),
    );
  };
  const useBoundedResidualRepair = extendedOptions === DISPLAY_BOUNDED_RESIDUAL_OVERLAP_REPAIR_OPTIONS;
  const endpointRepairOptions = useBoundedResidualRepair
    ? { detectExistingBridgeCrossings: false }
    : undefined;
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  const rawLoopShortened = runTracedRepair(
    'residual-loop-shortcut',
    edges,
    () => repairDisplayLoopShortcuts(edges, nodes, 32) as T,
  );
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
  const exactFirstRepaired = runTracedRepair(
    'residual-exact',
    loopShortened,
    () => repairExactThresholdResidualOverlaps(
      loopShortened,
      nodes,
      exactQualityBudget,
    ),
  );
  const exactFirstSelected = runTracedRepair(
    'residual-exact-selection',
    loopShortened,
    () => chooseExactThresholdResidualCandidate(
      nodes,
      loopShortened,
      exactFirstRepaired,
    ),
  );
  const quality = calculateEdgePathQualityScore(exactFirstSelected);
  const exactResidualPairs = collectExactThresholdResidualPairs(exactFirstSelected);
  const hardOverlapRisk = hasHardDisplayOverlapRisk(quality);
  if (!hardOverlapRisk && exactResidualPairs.length === 0) return exactFirstSelected;
  if (!hardOverlapRisk) {
    const nearParallelCleaned = runTracedRepair(
      'residual-near-parallel',
      exactFirstSelected,
      () => repairNearParallelResidualOverlaps(
        exactFirstSelected,
        nodes,
        nearParallelQualityBudget,
      ),
    );
    const exactCleaned = runTracedRepair(
      'residual-exact',
      nearParallelCleaned,
      () => repairExactThresholdResidualOverlaps(
        nearParallelCleaned,
        nodes,
        exactQualityBudget,
      ),
    );
    return runTracedRepair(
      'residual-exact-selection',
      exactFirstSelected,
      () => chooseExactThresholdResidualCandidate(
        nodes,
        exactFirstSelected,
        nearParallelCleaned,
        exactCleaned,
      ),
    );
  }

  const overlapRepaired = runTracedRepair(
    'residual-detached-primary',
    exactFirstSelected,
    () => separateDetachedParallelOverlaps(
      exactFirstSelected,
      nodes,
      16,
      options,
    ) as T,
  );
  const shouldRunDefaultOverlapCandidate = options === DISPLAY_DETACHED_OVERLAP_REPAIR_OPTIONS;
  const defaultOverlapRepaired = shouldRunDefaultOverlapCandidate
    ? runTracedRepair(
      'residual-detached-default',
      exactFirstSelected,
      () => separateDetachedParallelOverlaps(exactFirstSelected, nodes, 16) as T,
    )
    : overlapRepaired;
  let selected = runTracedRepair(
    'residual-polish-selection',
    exactFirstSelected,
    () => {
      const overlapMicroRepaired = runTracedMicroRepair(
        overlapRepaired,
        'residual-polish-selection',
      );
      // Crossing sweeps run before bounded residual overlap repair, and the final
      // hard closure validates crossings afterwards. Avoid repeating the endpoint
      // repairer's all-peer bridge scan while retaining its endpoint, anchor, and
      // obstacle corrections.
      const endpointRepaired = runTracedRepair(
        'residual-endpoint-derivative',
        overlapRepaired,
        () => repairEndpointOrthogonalPaths(
          overlapRepaired,
          nodes,
          endpointRepairOptions,
        ) as T,
        'residual-polish-selection',
      );
      const microRepaired = runTracedMicroDerivative(
        overlapRepaired,
        endpointRepaired,
        'residual-polish-selection',
      );
      const defaultOverlapMicroRepaired = defaultOverlapRepaired === overlapRepaired
        ? overlapMicroRepaired
        : runTracedMicroRepair(
          defaultOverlapRepaired,
          'residual-polish-selection',
        );
      const defaultEndpointRepaired = defaultOverlapRepaired === overlapRepaired
        ? endpointRepaired
        : runTracedRepair(
          'residual-endpoint-derivative',
          defaultOverlapRepaired,
          () => repairEndpointOrthogonalPaths(
            defaultOverlapRepaired,
            nodes,
            endpointRepairOptions,
          ) as T,
          'residual-polish-selection',
        );
      const obstacleAware = runTracedRepair(
        'residual-obstacle-selection',
        exactFirstSelected,
        () => chooseFinalObstacleAwarePolishCandidate(
          nodes,
          exactFirstSelected,
          overlapRepaired,
          overlapMicroRepaired,
          endpointRepaired,
          microRepaired,
          defaultOverlapRepaired,
          defaultOverlapMicroRepaired,
          defaultEndpointRepaired,
        ),
        'residual-polish-selection',
      );
      return runTracedRepair(
        'residual-exact-selection',
        obstacleAware,
        () => chooseExactThresholdResidualCandidate(
          nodes,
          obstacleAware,
          overlapRepaired,
          overlapMicroRepaired,
          endpointRepaired,
          microRepaired,
          defaultOverlapRepaired,
          defaultOverlapMicroRepaired,
          defaultEndpointRepaired,
        ),
        'residual-polish-selection',
      );
    },
  );
  if (hasHardDisplayOverlapRisk(calculateEdgePathQualityScore(selected))) {
    const extendedOverlapRepaired = runTracedRepair(
      'residual-detached-extended',
      selected,
      () => separateDetachedParallelOverlaps(
        selected,
        nodes,
        16,
        extendedOptions,
      ) as T,
    );
    const extendedBaseline = selected;
    selected = runTracedRepair(
      'residual-polish-selection',
      extendedBaseline,
      () => {
        const extendedOverlapMicroRepaired = runTracedMicroRepair(
          extendedOverlapRepaired,
          'residual-polish-selection',
        );
        const extendedEndpointRepaired = runTracedRepair(
          'residual-endpoint-derivative',
          extendedOverlapRepaired,
          () => repairEndpointOrthogonalPaths(
            extendedOverlapRepaired,
            nodes,
            endpointRepairOptions,
          ) as T,
          'residual-polish-selection',
        );
        const extendedMicroRepaired = runTracedMicroDerivative(
          extendedOverlapRepaired,
          extendedEndpointRepaired,
          'residual-polish-selection',
        );
        const obstacleAware = runTracedRepair(
          'residual-obstacle-selection',
          extendedBaseline,
          () => chooseFinalObstacleAwarePolishCandidate(
            nodes,
            extendedBaseline,
            extendedOverlapRepaired,
            extendedOverlapMicroRepaired,
            extendedEndpointRepaired,
            extendedMicroRepaired,
          ),
          'residual-polish-selection',
        );
        return runTracedRepair(
          'residual-exact-selection',
          obstacleAware,
          () => chooseExactThresholdResidualCandidate(
            nodes,
            obstacleAware,
            extendedOverlapRepaired,
            extendedOverlapMicroRepaired,
            extendedEndpointRepaired,
            extendedMicroRepaired,
          ),
          'residual-polish-selection',
        );
      },
    );
  }
  const exactShiftCleaned = runTracedRepair(
    'residual-exact',
    selected,
    () => repairExactThresholdResidualOverlaps(
      selected,
      nodes,
      exactQualityBudget,
    ),
  );
  const preExactSelection = selected;
  selected = runTracedRepair(
    'residual-exact-selection',
    preExactSelection,
    () => chooseExactThresholdResidualCandidate(nodes, preExactSelection, exactShiftCleaned),
  );
  if (useBoundedResidualRepair) return selected;
  const residualCleaned = runTracedRepair(
    'residual-near-parallel',
    selected,
    () => repairNearParallelResidualOverlaps(
      selected,
      nodes,
      nearParallelQualityBudget,
    ),
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
    if (qualityEvaluations >= maxQualityEvaluations) return bestEdges;
    for (const segment of [pair.second, pair.first]) {
        if (qualityEvaluations >= maxQualityEvaluations) return bestEdges;
        const other = segment === pair.second ? pair.first : pair.second;
        const path = getDisplayComputedPath(edges[segment.edgeIndex]);
        const otherPath = getDisplayComputedPath(edges[other.edgeIndex]);
        const remainingQualityEvaluations = Math.max(
          0,
          maxQualityEvaluations - qualityEvaluations,
        );
        const maxPathsForSegment = Math.min(64, remainingQualityEvaluations);
        const nearParallelCandidates = buildNearParallelLaneNudgePaths(
          path,
          segment,
          other,
          otherPath,
          nodes,
          edges[segment.edgeIndex],
          edges,
          maxPathsForSegment,
        );
        const remainingPathSlots = Math.max(
          0,
          maxPathsForSegment - nearParallelCandidates.length,
        );
        const candidatePaths = remainingPathSlots === 0
          ? nearParallelCandidates
          : nearParallelCandidates.concat(buildOppositeOverlapOuterBridgeCandidates(
            path,
            segment,
            other,
            otherPath,
            nodes,
            edges[segment.edgeIndex],
          ).slice(0, remainingPathSlots));
        for (const candidatePath of candidatePaths) {
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
              undefined,
              Math.max(0, maxQualityEvaluations - qualityEvaluations - 1),
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
