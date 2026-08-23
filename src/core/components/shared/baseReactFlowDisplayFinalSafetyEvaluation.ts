import type { Edge, Node } from '@xyflow/react';

import {
  auditFinalSameSideEndpointOrder,
  type SameSideEndpointTrunkIdentity,
} from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { auditFinalSameSidePassageOrder } from '../../strategies/shared/edgeFinalSameSidePassageOrderRepair';
import { countRenderUnsafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';

export type BaseReactFlowFinalSafetyCandidateOptions = Readonly<{
  eligibleEdgeIds?: ReadonlySet<string>;
  evaluation?: BaseReactFlowFinalEndpointEvaluation;
}>;

export const sameFinalSafetyEdgeReferences = (
  first: readonly Edge[],
  second: readonly Edge[],
): boolean => first === second || (
  first.length === second.length
  && first.every((edge, index) => edge === second[index])
);

export const finalSafetyPreservesInitialTrueTrunks = (
  initial: readonly SameSideEndpointTrunkIdentity[],
  next: readonly SameSideEndpointTrunkIdentity[],
): boolean => initial.every(trunk => next.some(candidateTrunk => (
  candidateTrunk.nodeId === trunk.nodeId
  && candidateTrunk.role === trunk.role
  && trunk.edgeIds.every(edgeId => candidateTrunk.edgeIds.includes(edgeId))
  && candidateTrunk.commonStemLength + 1e-6 >= trunk.commonStemLength
)));

export const finalSafetyCandidateIsAccepted = (
  baseline: readonly Edge[],
  candidate: Edge[],
  nodes: Node[],
  options: BaseReactFlowFinalSafetyCandidateOptions,
  getInitialTrueTrunks: () => readonly SameSideEndpointTrunkIdentity[],
): boolean => {
  if (options.eligibleEdgeIds && candidate.some((edge, index) => (
    edge !== baseline[index] && !options.eligibleEdgeIds?.has(edge.id)
  ))) return false;
  if (countRenderUnsafeEndpointStubs(candidate) !== 0) return false;
  const endpointOrder = options.evaluation?.endpointOrder(candidate)
    ?? auditFinalSameSideEndpointOrder(candidate, nodes);
  const passageOrder = options.evaluation?.passageOrder(candidate)
    ?? auditFinalSameSidePassageOrder(candidate, nodes);
  if (
    endpointOrder.inversions !== 0
    || endpointOrder.ambiguousLaneTies !== 0
    || endpointOrder.collapsedLanePairs !== 0
    || passageOrder.passageDefects !== 0
    || passageOrder.nearTrunkOpportunities !== 0
  ) return false;
  const report = options.evaluation?.hardReport(candidate)
    ?? getDisplayHardQualityGateReport(candidate, nodes, 'polished');
  if (!report.hardClean) return false;
  const initialTrueTrunks = sameFinalSafetyEdgeReferences(baseline, candidate)
    ? endpointOrder.legalSharedTrunks
    : getInitialTrueTrunks();
  return finalSafetyPreservesInitialTrueTrunks(
    initialTrueTrunks,
    endpointOrder.legalSharedTrunks,
  );
};
