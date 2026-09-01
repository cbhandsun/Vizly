import type { Edge, Node } from '@xyflow/react';

import { MINIMUM_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { shouldUseIncrementalEdgePathQualityEvaluation } from '../../strategies/shared/edgePathQualityIncrementalPolicy';
import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { createNodeClearanceGraphEvaluationContext } from '../../strategies/shared/edgeWaypointCandidateRepair';
import {
  createDisplayObstacleEvaluationContext,
  displayHardQualityReportGeometryIsClean,
  type BaseDisplayBoundedCandidateReport,
  type DisplayObstacleEvaluationInitializationMetrics,
} from './baseReactFlowDisplayEvaluation';
import { compactDisplayEdgePaths, getDisplayComputedPath } from './baseReactFlowDisplayGeometry';
import { createDisplayObstacleHitContext } from './baseReactFlowDisplayObstacleHitCache';
import { evaluateDisplayTerminalHardGates } from './baseReactFlowDisplayQualityGates';
import type { DisplayTerminalValidationSnapshot } from './baseReactFlowTerminalAxisRepair';

export type BaseReactFlowChangedHardReportEvaluation = Readonly<{
  evaluate: (
    candidate: Edge[],
    changedEdgeIndexes: readonly number[],
    candidateKind: BaseDisplayBoundedCandidateReport['candidate'],
    knownEvidence?: BaseReactFlowChangedHardReportEvidence,
  ) => BaseDisplayBoundedCandidateReport | null;
  readMetrics: () => Readonly<{
    evaluationCount: number;
    scannedNodeCount: number;
    scannedEdgePairCount: number;
  }>;
}>;

export type BaseReactFlowChangedHardReportEvidence = Readonly<{
  minimumClearanceViolation?: boolean;
  obstacleHits?: number;
  quality?: EdgePathQualityScore;
}>;

const exactDeclaredChanges = (
  baseline: readonly Edge[],
  candidate: readonly Edge[],
  changedEdgeIndexes: readonly number[],
): number[] | null => {
  if (baseline.length !== candidate.length) return null;
  const indexes = [...new Set(changedEdgeIndexes)]
    .filter(index => Number.isInteger(index) && index >= 0 && index < baseline.length)
    .sort((first, second) => first - second);
  if (
    indexes.length !== changedEdgeIndexes.length
    || indexes.length === 0
    || !shouldUseIncrementalEdgePathQualityEvaluation(baseline.length, indexes.length)
  ) return null;
  const changed = new Set(indexes);
  for (let index = 0; index < baseline.length; index += 1) {
    if (!changed.has(index) && baseline[index] !== candidate[index]) return null;
    if (
      changed.has(index)
      && (
        !baseline[index]
        || !candidate[index]
        || baseline[index].id !== candidate[index].id
      )
    ) return null;
  }
  return indexes;
};

/**
 * Exact baseline-relative hard report for immutable, bounded edge changes.
 * Every component uses the same full-graph semantics as the normal hard gate;
 * only unchanged edge contributions are reused.
 */
export const createBaseReactFlowChangedHardReportEvaluation = (
  baseline: Edge[],
  nodes: Node[],
  terminalSnapshot?: DisplayTerminalValidationSnapshot,
): BaseReactFlowChangedHardReportEvaluation => {
  const normalizedBaseline = compactDisplayEdgePaths(baseline);
  const clearance = createNodeClearanceGraphEvaluationContext(nodes);
  const baselineClearanceViolations = normalizedBaseline.map(edge => (
    clearance.score(
      getDisplayComputedPath(edge),
      edge,
      MINIMUM_BUSINESS_NODE_CLEARANCE,
    ) > 0.5
  ));
  let evaluationCount = 0;
  let scannedNodeCount = clearance.readMetrics().scannedNodeCount;
  let scannedEdgePairCount = 0;
  let obstacleEvidence: Readonly<{
    evaluation: ReturnType<typeof createDisplayObstacleEvaluationContext>;
    hitContext: ReturnType<typeof createDisplayObstacleHitContext>;
  }> | null = null;
  const getObstacleEvidence = () => {
    if (obstacleEvidence) return obstacleEvidence;
    const initialization: DisplayObstacleEvaluationInitializationMetrics = {
      cacheHit: false,
      scannedNodeCount: 0,
    };
    const evaluation = createDisplayObstacleEvaluationContext(
      normalizedBaseline,
      nodes,
      initialization,
    );
    scannedNodeCount += initialization.scannedNodeCount;
    obstacleEvidence = {
      evaluation,
      hitContext: createDisplayObstacleHitContext(nodes),
    };
    return obstacleEvidence;
  };
  let quality: ReturnType<typeof createEdgePathQualityEvaluationContext> | null = null;
  const getQuality = (): ReturnType<typeof createEdgePathQualityEvaluationContext> => {
    if (quality) return quality;
    const initialization = {
      cacheHit: false,
      scannedEdgePairCount: 0,
      scannedSegmentCount: 0,
    };
    quality = createEdgePathQualityEvaluationContext(normalizedBaseline, initialization);
    scannedEdgePairCount += initialization.scannedEdgePairCount;
    return quality;
  };

  return {
    evaluate(candidate, changedEdgeIndexes, candidateKind, knownEvidence) {
      const indexes = exactDeclaredChanges(baseline, candidate, changedEdgeIndexes);
      if (!indexes) return null;
      const normalizedCandidate = compactDisplayEdgePaths(candidate);
      const clearanceBefore = clearance.readMetrics();
      const qualityContext = knownEvidence?.quality ? null : getQuality();
      const qualityBefore = qualityContext?.readMetrics?.();
      const candidateQuality = knownEvidence?.quality
        ?? qualityContext?.evaluateChanged(normalizedCandidate, indexes);
      if (!candidateQuality) return null;
      const knownObstacleHits = knownEvidence?.obstacleHits;
      const knownObstacleHitsAreValid = typeof knownObstacleHits === 'number'
        && Number.isSafeInteger(knownObstacleHits)
        && knownObstacleHits >= 0;
      const candidateObstacleEvidence = knownObstacleHitsAreValid
        ? null
        : getObstacleEvidence();
      const obstacleBefore = candidateObstacleEvidence?.hitContext.readMetrics();
      const obstacleHits = knownObstacleHitsAreValid
        ? knownObstacleHits
        : candidateObstacleEvidence?.evaluation.evaluateKnownChanges(
          normalizedCandidate,
          indexes,
        );
      if (typeof obstacleHits !== 'number') return null;
      const clearanceViolations = baselineClearanceViolations.slice();
      for (const index of indexes) {
        const edge = normalizedCandidate[index];
        clearanceViolations[index] = typeof knownEvidence?.minimumClearanceViolation === 'boolean'
          ? knownEvidence.minimumClearanceViolation
          : Boolean(edge) && clearance.score(
            getDisplayComputedPath(edge),
            edge,
            MINIMUM_BUSINESS_NODE_CLEARANCE,
          ) > 0.5;
      }
      const minimumClearanceViolationEdgeIds = normalizedCandidate.flatMap((edge, index) => (
        clearanceViolations[index] ? [edge.id] : []
      ));
      const { terminalsAttached, terminalsAnchored } = evaluateDisplayTerminalHardGates(
        normalizedCandidate,
        nodes,
        terminalSnapshot,
      );
      const report: BaseDisplayBoundedCandidateReport = {
        candidate: candidateKind,
        hardClean: false,
        obstacleHits,
        terminalsAttached,
        terminalsAnchored,
        quality: candidateQuality,
        minimumClearanceViolations: minimumClearanceViolationEdgeIds.length,
        minimumClearanceViolationEdgeIds: minimumClearanceViolationEdgeIds.slice(0, 32),
      };
      report.hardClean = displayHardQualityReportGeometryIsClean(report) && terminalsAnchored;
      const qualityAfter = qualityContext?.readMetrics?.();
      evaluationCount += 1;
      scannedNodeCount += (
        candidateObstacleEvidence && obstacleBefore
          ? Math.max(
            0,
            candidateObstacleEvidence.hitContext.readMetrics().scannedNodeCount
              - obstacleBefore.scannedNodeCount,
          )
          : 0
      ) + Math.max(
        0,
        clearance.readMetrics().scannedNodeCount - clearanceBefore.scannedNodeCount,
      );
      scannedEdgePairCount += Math.max(
        0,
        (qualityAfter?.scannedEdgePairCount ?? 0)
          - (qualityBefore?.scannedEdgePairCount ?? 0),
      );
      return report;
    },
    readMetrics: () => ({ evaluationCount, scannedNodeCount, scannedEdgePairCount }),
  };
};
