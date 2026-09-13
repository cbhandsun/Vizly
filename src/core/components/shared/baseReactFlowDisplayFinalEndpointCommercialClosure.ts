import type { Edge, Node } from '@xyflow/react';

import { evaluateBaseReactFlowChangedCandidateReport } from './baseReactFlowDisplayChangedCandidateReport';
import {
  diffBaseReactFlowEvaluationMetrics,
  type BaseReactFlowFinalEndpointEvaluation,
} from './baseReactFlowDisplayFinalEndpointEvaluation';
import {
  passesBaseReactFlowFinalDisplayGate as passesFinalDisplayGate,
  type BaseReactFlowFinalEndpointOrderOptions,
} from './baseReactFlowDisplayFinalEndpointGate';
import { repairDisplayLoopShortcuts } from './baseReactFlowDisplayLoopShortcutRepair';
import {
  countChangedRoutingItems,
  startDisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

type FinalEndpointCommercialClosureCallbacks = Readonly<{
  restorePreferredSourceTrunks: (baseline: Edge[]) => Edge[];
  repairEndpointOrder: (baseline: Edge[]) => Edge[];
  separatePreferredSourceBranches: (baseline: Edge[]) => Edge[];
}>;

const commitExcessiveDetourCandidate = (
  baseline: Edge[],
  repairNodes: Node[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: BaseReactFlowFinalEndpointEvaluation,
): Edge[] => {
  if (options.eligibleEdgeIds) return baseline;
  const baselineReport = evaluation.hardReport(baseline);
  const candidate = repairDisplayLoopShortcuts(
    baseline,
    repairNodes,
    16,
  );
  if (candidate === baseline) return baseline;
  const changed = evaluateBaseReactFlowChangedCandidateReport(baseline, candidate, evaluation);
  if (!changed) return baseline;
  const { changedEdgeIndexes, report: candidateReport } = changed;
  if (
    !candidateReport.hardClean
    || candidateReport.quality.detourPenalty >= baselineReport.quality.detourPenalty
    || candidateReport.quality.totalLength >= baselineReport.quality.totalLength
  ) return baseline;
  return passesFinalDisplayGate(
    baseline,
    candidate,
    changedEdgeIndexes,
    options,
    evaluation,
  )
    ? candidate
    : baseline;
};

const startCommercialClosureStage = (
  phase: Extract<
    Parameters<typeof startDisplayRoutingPhaseTrace>[0]['phase'],
    | 'final-endpoint-closure-commercial-detour'
    | 'final-endpoint-closure-commercial-hard-gate'
    | 'final-endpoint-closure-commercial-restore-source'
    | 'final-endpoint-closure-commercial-endpoint-order'
    | 'final-endpoint-closure-commercial-source-branches'
  >,
  candidateCount: number,
  onPhaseTrace: BaseReactFlowFinalEndpointOrderOptions['onPhaseTrace'],
) => startDisplayRoutingPhaseTrace({
  phase,
  parentPhase: 'final-endpoint-closure-commercial',
  candidateCount,
  onTrace: onPhaseTrace,
});

/**
 * Final, commercial-style endpoint cleanup after geometric hard closure.
 *
 * This stays separate from the main endpoint transaction so every expensive
 * substep gets its own bounded, content-free trace entry.  The trace exposes
 * which contract consumed time without leaking edge ids, labels, or route
 * coordinates through diagnostics.
 */
export const repairBaseReactFlowFinalEndpointCommercialClosure = (
  baseline: Edge[],
  repairNodes: Node[],
  options: BaseReactFlowFinalEndpointOrderOptions,
  evaluation: BaseReactFlowFinalEndpointEvaluation,
  callbacks: FinalEndpointCommercialClosureCallbacks,
): Edge[] => {
  let repaired = baseline;
  const detourClosureTimer = startCommercialClosureStage(
    'final-endpoint-closure-commercial-detour',
    repaired.length,
    options.onPhaseTrace,
  );
  const beforeDetourClosure = repaired;
  const beforeDetourMetrics = evaluation.readMetrics();
  repaired = commitExcessiveDetourCandidate(repaired, repairNodes, options, evaluation);
  detourClosureTimer.finish(
    repaired === beforeDetourClosure ? 'skip' : 'accepted',
    countChangedRoutingItems(beforeDetourClosure, repaired),
    diffBaseReactFlowEvaluationMetrics(beforeDetourMetrics, evaluation.readMetrics()),
  );

  const hardGateClosureTimer = startCommercialClosureStage(
    'final-endpoint-closure-commercial-hard-gate',
    repaired.length,
    options.onPhaseTrace,
  );
  const beforeHardGateMetrics = evaluation.readMetrics();
  const commercialHardClean = evaluation.hardReport(repaired).hardClean;
  hardGateClosureTimer.finish(
    commercialHardClean ? 'hit' : 'fallback',
    0,
    diffBaseReactFlowEvaluationMetrics(beforeHardGateMetrics, evaluation.readMetrics()),
  );
  if (!commercialHardClean) return repaired;

  const restoreSourceTimer = startCommercialClosureStage(
    'final-endpoint-closure-commercial-restore-source',
    repaired.length,
    options.onPhaseTrace,
  );
  const beforeRestoreSource = repaired;
  const beforeRestoreSourceMetrics = evaluation.readMetrics();
  repaired = callbacks.restorePreferredSourceTrunks(repaired);
  restoreSourceTimer.finish(
    repaired === beforeRestoreSource ? 'skip' : 'accepted',
    countChangedRoutingItems(beforeRestoreSource, repaired),
    diffBaseReactFlowEvaluationMetrics(
      beforeRestoreSourceMetrics,
      evaluation.readMetrics(),
    ),
  );

  // Restoring an authored trunk can pull a nearby independent branch back
  // inside the visual port-gap floor. Revalidate the endpoint contract after
  // restoration; true trunk blocks stay atomic, so only the independent branch
  // moves when that is the safe minimal correction.
  const endpointOrderTimer = startCommercialClosureStage(
    'final-endpoint-closure-commercial-endpoint-order',
    repaired.length,
    options.onPhaseTrace,
  );
  const beforeEndpointOrder = repaired;
  const beforeEndpointOrderMetrics = evaluation.readMetrics();
  repaired = callbacks.repairEndpointOrder(repaired);
  endpointOrderTimer.finish(
    repaired === beforeEndpointOrder ? 'skip' : 'accepted',
    countChangedRoutingItems(beforeEndpointOrder, repaired),
    diffBaseReactFlowEvaluationMetrics(
      beforeEndpointOrderMetrics,
      evaluation.readMetrics(),
    ),
  );

  const sourceBranchesTimer = startCommercialClosureStage(
    'final-endpoint-closure-commercial-source-branches',
    repaired.length,
    options.onPhaseTrace,
  );
  const beforeSourceBranches = repaired;
  const beforeSourceBranchesMetrics = evaluation.readMetrics();
  repaired = callbacks.separatePreferredSourceBranches(repaired);
  sourceBranchesTimer.finish(
    repaired === beforeSourceBranches ? 'skip' : 'accepted',
    countChangedRoutingItems(beforeSourceBranches, repaired),
    diffBaseReactFlowEvaluationMetrics(
      beforeSourceBranchesMetrics,
      evaluation.readMetrics(),
    ),
  );

  return repaired;
};
