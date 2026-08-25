import type { Edge } from '@xyflow/react';

import type { BusinessNodeClearanceRepairDiagnostics } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import {
  diffBaseReactFlowEvaluationMetrics,
  type BaseReactFlowFinalEndpointEvaluation,
} from './baseReactFlowDisplayFinalEndpointEvaluation';
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

type ObstacleClosurePhase =
  | 'final-endpoint-closure-obstacles-post-trunk'
  | 'final-endpoint-closure-obstacles-sibling'
  | 'final-endpoint-closure-obstacles-micro';

interface StartObstacleClosureTraceOptions {
  phase: ObstacleClosurePhase;
  candidateCount: number;
  evaluation: BaseReactFlowFinalEndpointEvaluation;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}

export const startBaseReactFlowObstacleClosureTrace = ({
  phase,
  candidateCount,
  evaluation,
  onPhaseTrace,
}: StartObstacleClosureTraceOptions) => {
  const metricsBefore = evaluation.readMetrics();
  const timer = startDisplayRoutingPhaseTrace({
    phase,
    parentPhase: 'final-endpoint-closure-obstacles',
    candidateCount,
    onTrace: onPhaseTrace,
  });

  return (
    baseline: Edge[],
    candidate: Edge[],
    candidateDiagnostics?: BusinessNodeClearanceRepairDiagnostics,
  ): void => {
    const metrics = diffBaseReactFlowEvaluationMetrics(
      metricsBefore,
      evaluation.readMetrics(),
    );
    const duplicateCandidateCount = candidateDiagnostics
      ? Math.max(
        0,
        candidateDiagnostics.generatedCandidateCount
          - candidateDiagnostics.uniqueCandidateCount,
      )
      : 0;
    timer.finish(
      candidate === baseline ? 'skip' : 'accepted',
      countChangedRoutingItems(baseline, candidate),
      candidateDiagnostics
        ? {
          ...metrics,
          candidateCount: candidateDiagnostics.generatedCandidateCount,
          cacheHitCount: metrics.cacheHitCount
            + duplicateCandidateCount
            + candidateDiagnostics.candidateCollectionCacheHitCount
            + candidateDiagnostics.clearanceScoreCacheHitCount
            + candidateDiagnostics.qualityContextCacheHitCount,
          evaluationCount: metrics.evaluationCount
            + candidateDiagnostics.qualityContextBuildCount,
          scannedNodeCount: metrics.scannedNodeCount
            + candidateDiagnostics.clearanceScannedNodeCount,
        }
        : metrics,
    );
  };
};
