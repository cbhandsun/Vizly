import type { Edge } from '@xyflow/react';

import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';

export const evaluateBaseReactFlowChangedCandidateReport = (
  baseline: readonly Edge[],
  candidate: Edge[],
  evaluation: BaseReactFlowFinalEndpointEvaluation,
): Readonly<{
  changedEdgeIndexes: number[];
  report: ReturnType<BaseReactFlowFinalEndpointEvaluation['hardReportChanged']>;
}> | null => {
  const changedEdgeIndexes = candidate.flatMap((edge, index) => (
    edge !== baseline[index] ? [index] : []
  ));
  return changedEdgeIndexes.length === 0 ? null : {
    changedEdgeIndexes,
    report: evaluation.hardReportChanged(baseline, candidate, changedEdgeIndexes),
  };
};
