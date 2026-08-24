import type { Edge, Node } from '@xyflow/react';

import { MINIMUM_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { createEdgePathQualityEvaluationContext } from '../../strategies/shared/edgeStrictCrossingGuard';
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

const MAX_INCREMENTAL_HARD_REPORT_EDGE_CHANGES = 8;

export type BaseReactFlowChangedHardReportEvaluation = Readonly<{
  evaluate: (
    candidate: Edge[],
    changedEdgeIndexes: readonly number[],
    candidateKind: BaseDisplayBoundedCandidateReport['candidate'],
  ) => BaseDisplayBoundedCandidateReport | null;
  readMetrics: () => Readonly<{
    evaluationCount: number;
    scannedNodeCount: number;
    scannedEdgePairCount: number;
  }>;
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
    || indexes.length > MAX_INCREMENTAL_HARD_REPORT_EDGE_CHANGES
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
  const qualityInitialization = {
    cacheHit: false,
    scannedEdgePairCount: 0,
    scannedSegmentCount: 0,
  };
  const quality = createEdgePathQualityEvaluationContext(
    normalizedBaseline,
    qualityInitialization,
  );
  const obstacleInitialization: DisplayObstacleEvaluationInitializationMetrics = {
    cacheHit: false,
    scannedNodeCount: 0,
  };
  const obstacles = createDisplayObstacleEvaluationContext(
    normalizedBaseline,
    nodes,
    obstacleInitialization,
  );
  const obstacleHitContext = createDisplayObstacleHitContext(nodes);
  const clearance = createNodeClearanceGraphEvaluationContext(nodes);
  const baselineClearanceViolations = normalizedBaseline.map(edge => (
    clearance.score(
      getDisplayComputedPath(edge),
      edge,
      MINIMUM_BUSINESS_NODE_CLEARANCE,
    ) > 0.5
  ));
  let evaluationCount = 0;
  let scannedNodeCount = obstacleInitialization.scannedNodeCount
    + clearance.readMetrics().scannedNodeCount;
  let scannedEdgePairCount = qualityInitialization.scannedEdgePairCount;

  return {
    evaluate(candidate, changedEdgeIndexes, candidateKind) {
      const indexes = exactDeclaredChanges(baseline, candidate, changedEdgeIndexes);
      if (!indexes) return null;
      const normalizedCandidate = compactDisplayEdgePaths(candidate);
      const qualityBefore = quality.readMetrics?.();
      const obstacleBefore = obstacleHitContext.readMetrics();
      const clearanceBefore = clearance.readMetrics();
      const candidateQuality = quality.evaluateChanged(normalizedCandidate, indexes);
      const obstacleHits = obstacles.evaluateKnownChanges(normalizedCandidate, indexes);
      const clearanceViolations = baselineClearanceViolations.slice();
      for (const index of indexes) {
        const edge = normalizedCandidate[index];
        clearanceViolations[index] = Boolean(edge) && clearance.score(
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
      const qualityAfter = quality.readMetrics?.();
      evaluationCount += 1;
      scannedNodeCount += Math.max(
        0,
        obstacleHitContext.readMetrics().scannedNodeCount - obstacleBefore.scannedNodeCount,
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
