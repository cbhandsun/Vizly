import type { Edge, Node } from '@xyflow/react';

import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { auditFinalSameSidePassageOrder } from '../../strategies/shared/edgeFinalSameSidePassageOrderRepair';
import { countRenderUnsafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

export type BaseReactFlowFinalSafetyAudit = Readonly<{
  canSkip: boolean;
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
  const report = evaluation?.hardReport(edges)
    ?? getDisplayHardQualityGateReport(edges.slice(), nodes, 'polished');
  hardGateTimer.finish(report.hardClean ? 'accepted' : 'rejected');
  if (!report.hardClean) return { canSkip: false, endpointDefectOnly: false };

  const stubTimer = timer('final-safety-stubs');
  const stubsClean = (evaluation?.unsafeEndpointStubs(edges)
    ?? countRenderUnsafeEndpointStubs(edges.slice())) === 0;
  stubTimer.finish(stubsClean ? 'accepted' : 'rejected');
  if (!stubsClean) return { canSkip: false, endpointDefectOnly: false };

  const endpointTimer = timer('final-safety-endpoint-order');
  const endpointOrder = evaluation?.endpointOrder(edges)
    ?? auditFinalSameSideEndpointOrder(edges, nodes);
  const endpointClean = endpointOrder.inversions === 0
    && endpointOrder.ambiguousLaneTies === 0
    && endpointOrder.collapsedLanePairs === 0;
  endpointTimer.finish(endpointClean ? 'accepted' : 'rejected');
  if (!endpointClean) {
    timer('final-safety-passage-order').finish('skip');
    return { canSkip: false, endpointDefectOnly: true };
  }

  const passageTimer = timer('final-safety-passage-order');
  const passageOrder = evaluation?.passageOrder(edges)
    ?? auditFinalSameSidePassageOrder(edges, nodes);
  const passageClean = passageOrder.passageDefects === 0
    && passageOrder.nearTrunkOpportunities === 0;
  passageTimer.finish(passageClean ? 'accepted' : 'rejected');
  return { canSkip: passageClean, endpointDefectOnly: false };
};
