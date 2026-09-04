import type { Edge, Node } from '@xyflow/react';

import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { auditFinalSameSidePassageOrder } from '../../strategies/shared/edgeFinalSameSidePassageOrderRepair';
import { countRenderUnsafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import {
  diffBaseReactFlowEvaluationMetrics,
  type BaseReactFlowFinalEndpointEvaluation,
} from './baseReactFlowDisplayFinalEndpointEvaluation';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

export type BaseReactFlowFinalSafetyAudit = Readonly<{
  canSkip: boolean;
  defect: 'none' | 'hard' | 'stubs' | 'endpoint-order' | 'passage-order';
  endpointDefectOnly: boolean;
}>;

export const auditBaseReactFlowFinalSafetyClosure = (
  edges: readonly Edge[],
  nodes: Node[],
  evaluation?: BaseReactFlowFinalEndpointEvaluation,
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void,
): BaseReactFlowFinalSafetyAudit => {
  const timer = (phase: 'final-safety-hard-gate' | 'final-safety-stubs'
    | 'final-safety-endpoint-order' | 'final-safety-passage-order') => (
    startDisplayRoutingPhaseTrace({ phase, candidateCount: edges.length, onTrace: onPhaseTrace })
  );
  const hardGateTimer = timer('final-safety-hard-gate');
  const hardGateMetricsBefore = evaluation?.readMetrics();
  const report = evaluation?.hardReport(edges)
    ?? getDisplayHardQualityGateReport(edges.slice(), nodes, 'polished');
  hardGateTimer.finish(
    report.hardClean ? 'accepted' : 'rejected',
    0,
    hardGateMetricsBefore && evaluation
      ? diffBaseReactFlowEvaluationMetrics(hardGateMetricsBefore, evaluation.readMetrics())
      : undefined,
  );
  if (!report.hardClean) {
    return { canSkip: false, defect: 'hard', endpointDefectOnly: false };
  }

  const stubTimer = timer('final-safety-stubs');
  const stubMetricsBefore = evaluation?.readMetrics();
  const unsafeStubCount = evaluation?.unsafeEndpointStubs(edges)
    ?? countRenderUnsafeEndpointStubs(edges.slice());
  const stubsClean = unsafeStubCount === 0;
  const stubMetrics = stubMetricsBefore && evaluation
    ? diffBaseReactFlowEvaluationMetrics(stubMetricsBefore, evaluation.readMetrics())
    : {};
  stubTimer.finish(
    stubsClean ? 'accepted' : 'rejected',
    0,
    { ...stubMetrics, workItemCount: unsafeStubCount },
  );
  if (!stubsClean) {
    return { canSkip: false, defect: 'stubs', endpointDefectOnly: false };
  }

  const endpointTimer = timer('final-safety-endpoint-order');
  const endpointMetricsBefore = evaluation?.readMetrics();
  const endpointOrder = evaluation?.endpointOrder(edges)
    ?? auditFinalSameSideEndpointOrder(edges, nodes);
  const endpointClean = endpointOrder.inversions === 0
    && endpointOrder.ambiguousLaneTies === 0
    && endpointOrder.collapsedLanePairs === 0;
  endpointTimer.finish(
    endpointClean ? 'accepted' : 'rejected',
    0,
    endpointMetricsBefore && evaluation
      ? diffBaseReactFlowEvaluationMetrics(endpointMetricsBefore, evaluation.readMetrics())
      : undefined,
  );
  if (!endpointClean) {
    timer('final-safety-passage-order').finish('skip');
    return { canSkip: false, defect: 'endpoint-order', endpointDefectOnly: true };
  }

  const passageTimer = timer('final-safety-passage-order');
  const passageMetricsBefore = evaluation?.readMetrics();
  const passageOrder = evaluation?.passageOrder(edges)
    ?? auditFinalSameSidePassageOrder(edges, nodes);
  const passageClean = passageOrder.passageDefects === 0
    && passageOrder.nearTrunkOpportunities === 0;
  passageTimer.finish(
    passageClean ? 'accepted' : 'rejected',
    0,
    passageMetricsBefore && evaluation
      ? diffBaseReactFlowEvaluationMetrics(passageMetricsBefore, evaluation.readMetrics())
      : undefined,
  );
  return {
    canSkip: passageClean,
    defect: passageClean ? 'none' : 'passage-order',
    endpointDefectOnly: false,
  };
};
