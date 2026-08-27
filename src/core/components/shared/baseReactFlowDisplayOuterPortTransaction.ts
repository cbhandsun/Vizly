import type { Edge, Node } from '@xyflow/react';

import { repairDeclaredTerminalRolesWithHardGateWithOutcome } from './baseReactFlowDeclaredTerminalRoleRepair';
import { anchorComputedDisplayEdgeEndpoints } from './baseReactFlowDisplayEdgeCore';
import {
  MIN_RENDER_SAFE_ENDPOINT_STUB,
  repairFinalShortEndpointStubs,
  repairRenderSafeEndpointStubs,
} from './baseReactFlowDisplayEndpointStubRepair';
import { repairSubpixelEndpointStubPrecision } from './baseReactFlowDisplayEndpointStubPrecision';
import { buildBoundedOuterPortTransactionCandidates } from './baseReactFlowDisplayOuterPortCandidates';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import {
  diffBaseReactFlowEvaluationMetrics,
  type BaseReactFlowFinalEndpointEvaluation,
} from './baseReactFlowDisplayFinalEndpointEvaluation';
import { getChangedBaseReactFlowDisplayRoutingIndexes } from './baseReactFlowDisplayRoutingTransaction';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

export type BaseReactFlowOuterPortTransactionOptions = Readonly<{
  evaluation?: BaseReactFlowFinalEndpointEvaluation;
  initialReport?: Readonly<{
    edges: readonly Edge[];
    report: ReturnType<typeof getDisplayHardQualityGateReport>;
  }>;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}>;

const reportIsGeometricallyClean = (
  report: ReturnType<typeof getDisplayHardQualityGateReport>,
): boolean => (
  report.terminalsAttached
  && report.obstacleHits === 0
  && report.quality.strictCrossings === 0
  && report.quality.nonOrthogonalSegments === 0
  && report.quality.hairpins === 0
  && report.quality.shortEndpointStubs === 0
  && report.quality.tinyInteriorDoglegs === 0
  && report.quality.reverseOverlap === 0
  && report.quality.unrelatedOverlap === 0
  && report.quality.unexplainedRelatedOverlap === 0
);

/**
 * Resolves the final detached overlap/strict interlock by changing both port
 * roles and one bounded double-axis outer path as a single hard-gated
 * transaction. No partial candidate is returned.
 */
export const repairResidualOuterPortTransactionWithHardGate = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxExactEvaluations = 64,
  options: BaseReactFlowOuterPortTransactionOptions = {},
): T => {
  if (edges.length === 0 || maxExactEvaluations <= 0) return edges;
  const timer = startDisplayRoutingPhaseTrace({
    phase: 'finalizer-outer-port',
    candidateCount: 0,
    onTrace: options.onPhaseTrace,
  });
  const metricsBefore = options.evaluation?.readMetrics();
  const baseline = options.initialReport?.edges === edges
    ? options.initialReport.report
    : options.evaluation?.hardReport(edges)
      ?? getDisplayHardQualityGateReport(edges, nodes, 'polished');
  if (baseline.hardClean || (
    baseline.quality.unrelatedOverlap === 0
    && baseline.quality.reverseOverlap === 0
    && baseline.quality.strictCrossings === 0
  )) {
    timer.finish('skip', 0, metricsBefore && options.evaluation
      ? diffBaseReactFlowEvaluationMetrics(metricsBefore, options.evaluation.readMetrics())
      : {});
    return edges;
  }

  const candidates = buildBoundedOuterPortTransactionCandidates(edges, nodes, {
    includeStrictCrossings: true,
    maxCandidates: Math.min(64, maxExactEvaluations),
  });
  let remainingEvaluations = Math.min(64, Math.max(1, maxExactEvaluations));
  let evaluatedCandidateCount = 0;
  const finish = (resolution: 'accepted' | 'fallback', result: T): T => {
    const metrics = metricsBefore && options.evaluation
      ? diffBaseReactFlowEvaluationMetrics(metricsBefore, options.evaluation.readMetrics())
      : {};
    timer.finish(
      resolution,
      getChangedBaseReactFlowDisplayRoutingIndexes(edges, result).length,
      { ...metrics, candidateCount: evaluatedCandidateCount },
    );
    return result;
  };
  for (const candidate of candidates) {
    if (remainingEvaluations <= 0) break;
    const terminalBase = repairSubpixelEndpointStubPrecision(
      anchorComputedDisplayEdgeEndpoints(
        repairRenderSafeEndpointStubs(
          repairFinalShortEndpointStubs(
            repairSubpixelEndpointStubPrecision(candidate.edges),
            nodes,
          ),
          nodes,
          64,
        ),
        nodes,
      ) as T,
      MIN_RENDER_SAFE_ENDPOINT_STUB,
    ) as T;
    const changedEdgeIndexes = getChangedBaseReactFlowDisplayRoutingIndexes(edges, terminalBase);
    const changedEdgeIndexSet = new Set(changedEdgeIndexes);
    const evaluationCandidate = terminalBase.map((edge, index) => (
      changedEdgeIndexSet.has(index) ? edge : edges[index]
    )) as T;
    const report = options.evaluation?.hardReportChanged(
      edges,
      evaluationCandidate,
      changedEdgeIndexes,
    ) ?? getDisplayHardQualityGateReport(terminalBase, nodes, 'polished');
    evaluatedCandidateCount += 1;
    remainingEvaluations -= 1;
    if (report.hardClean) return finish('accepted', terminalBase);
    if (!reportIsGeometricallyClean(report) || report.terminalsAnchored) continue;

    const declaredRoleBudget = remainingEvaluations;
    if (declaredRoleBudget <= 0) break;
    const declaredRoleOutcome = repairDeclaredTerminalRolesWithHardGateWithOutcome(
      terminalBase,
      nodes,
      declaredRoleBudget,
    );
    remainingEvaluations -= Math.min(
      remainingEvaluations,
      declaredRoleOutcome.exactEvaluations,
    );
    if (declaredRoleOutcome.edges !== terminalBase) {
      return finish('accepted', declaredRoleOutcome.edges as T);
    }
  }
  return finish('fallback', edges);
};
