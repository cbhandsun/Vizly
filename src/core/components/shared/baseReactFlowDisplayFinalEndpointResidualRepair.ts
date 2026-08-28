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
  repairOverlap = repairResidualDisplayOverlaps,
  repairStrict = repairFinalResidualStrictCrossings,
  scoreResidualOverlap = exactResidualOverlapScore,
}: {
  nodes: Node[];
  evaluation: BaseReactFlowFinalEndpointEvaluation;
  validate: FinalEndpointResidualCandidateValidator;
  repairOverlap?: (edges: Edge[], nodes: Node[]) => Edge[];
  repairStrict?: (edges: Edge[], nodes: Node[]) => Edge[];
  scoreResidualOverlap?: (edges: readonly Edge[]) => number;
}): BaseReactFlowFinalEndpointResidualRepair => {
  const residualOverlapScoreByEdges = new WeakMap<readonly Edge[], number>();
  const strictOutcomeByEdges = new WeakMap<readonly Edge[], Edge[]>();
  const overlapOutcomeByEdges = new WeakMap<readonly Edge[], Edge[]>();
  const readResidualOverlapScore = (edges: readonly Edge[]): number => {
    const cached = residualOverlapScoreByEdges.get(edges);
    if (typeof cached === 'number') return cached;
    const score = scoreResidualOverlap(edges);
    residualOverlapScoreByEdges.set(edges, score);
    return score;
  };
  const strict = (baseline: Edge[]): Edge[] => {
    const cached = strictOutcomeByEdges.get(baseline);
    if (cached) return cached;
    const remember = (outcome: Edge[]): Edge[] => {
      strictOutcomeByEdges.set(baseline, outcome);
      return outcome;
    };
    const baselineReport = evaluation.hardReport(baseline);
    if (baselineReport.quality.strictCrossings === 0) return remember(baseline);
    const candidate = repairStrict(baseline, nodes);
    if (candidate === baseline) return remember(baseline);
    const indexes = changedIndexes(baseline, candidate);
    if (indexes.length === 0) return remember(baseline);
    const candidateReport = evaluation.hardReportChanged(baseline, candidate, indexes);
    if (
      candidateReport.quality.strictCrossings
      >= baselineReport.quality.strictCrossings
    ) return remember(baseline);
    return remember(validate(baseline, candidate, indexes)
      ? candidate
      : baseline);
  };

  const overlap = (baseline: Edge[]): Edge[] => {
    const cached = overlapOutcomeByEdges.get(baseline);
    if (cached) return cached;
    const remember = (outcome: Edge[]): Edge[] => {
      overlapOutcomeByEdges.set(baseline, outcome);
      return outcome;
    };
    const baselineScore = readResidualOverlapScore(baseline);
    if (baselineScore === 0) return remember(baseline);
    const candidate = repairOverlap(baseline, nodes);
    if (
      candidate === baseline
      || readResidualOverlapScore(candidate) >= baselineScore
    ) return remember(baseline);
    const indexes = changedIndexes(baseline, candidate);
    return remember(indexes.length > 0 && validate(baseline, candidate, indexes)
      ? candidate
      : baseline);
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
