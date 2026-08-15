import type { Edge, Node } from '@xyflow/react';

import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { repairResidualDisplayOverlaps } from './baseReactFlowDisplayOverlapRepair';
import { collectExactThresholdResidualPairs } from './baseReactFlowDisplayReverseParallelRepair';
import { repairFinalResidualStrictCrossings } from './baseReactFlowDisplayStrictResidualRepair';

type FinalEndpointResidualCandidateValidator = (
  baselineEdges: readonly Edge[],
  candidateEdges: readonly Edge[],
  changedEdgeIndexes: readonly number[],
) => boolean;

export type BaseReactFlowFinalEndpointResidualRepair = Readonly<{
  strict: (baseline: Edge[]) => Edge[];
  overlap: (baseline: Edge[]) => Edge[];
  fixedPoint: (baseline: Edge[]) => Edge[];
}>;

const changedIndexes = (baseline: readonly Edge[], candidate: readonly Edge[]): number[] => (
  candidate.flatMap((edge, index) => edge !== baseline[index] ? [index] : [])
);

const exactResidualOverlapScore = (edges: readonly Edge[]): number => (
  collectExactThresholdResidualPairs([...edges])
    .reduce((total, pair) => total + pair.overlap, 0)
);

export const createBaseReactFlowFinalEndpointResidualRepair = ({
  nodes,
  evaluation,
  validate,
}: {
  nodes: Node[];
  evaluation: BaseReactFlowFinalEndpointEvaluation;
  validate: FinalEndpointResidualCandidateValidator;
}): BaseReactFlowFinalEndpointResidualRepair => {
  const strict = (baseline: Edge[]): Edge[] => {
    const baselineReport = evaluation.hardReport(baseline);
    const candidate = repairFinalResidualStrictCrossings(baseline, nodes);
    if (candidate === baseline) return baseline;
    const candidateReport = evaluation.hardReport(candidate);
    if (
      candidateReport.quality.strictCrossings
      >= baselineReport.quality.strictCrossings
    ) return baseline;
    const indexes = changedIndexes(baseline, candidate);
    return indexes.length > 0 && validate(baseline, candidate, indexes)
      ? candidate
      : baseline;
  };

  const overlap = (baseline: Edge[]): Edge[] => {
    const baselineScore = exactResidualOverlapScore(baseline);
    if (baselineScore === 0) return baseline;
    const candidate = repairResidualDisplayOverlaps(baseline, nodes);
    if (
      candidate === baseline
      || exactResidualOverlapScore(candidate) >= baselineScore
    ) return baseline;
    const indexes = changedIndexes(baseline, candidate);
    return indexes.length > 0 && validate(baseline, candidate, indexes)
      ? candidate
      : baseline;
  };

  const fixedPoint = (baseline: Edge[]): Edge[] => {
    let current = baseline;
    for (let pass = 0; pass < 4; pass += 1) {
      const before = current;
      current = strict(current);
      current = overlap(current);
      current = strict(current);
      if (current === before || current.every((edge, index) => edge === before[index])) break;
    }
    return current;
  };

  return Object.freeze({ strict, overlap, fixedPoint });
};
