import type { Edge, Node } from '@xyflow/react';

import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { lockFinalDisplayComputedPaths } from './baseReactFlowDisplayEdgeCore';
import { closeBaseReactFlowDisplayFinalHardContract } from './baseReactFlowDisplayFinalHardContract';
import { eligibleCommercialClearanceDoesNotRegress } from './baseReactFlowDisplayBusinessNodeClearance';
import { finalDisplayRenderContractIsLocked } from './baseReactFlowDisplayCandidateValidation';
import { repairBaseReactFlowFinalSafetyClosure } from './baseReactFlowDisplayFinalSafetyClosure';
import type {
  DisplayEdgesWorkerRequest,
  DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';
import { doBaseReactFlowDisplayRoutesMatchExactly } from './baseReactFlowDisplayRoutingTransaction';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

export const canReuseBaseReactFlowFinalCommercialSafety = ({
  commercialClosureReady,
  commercialEvaluationEdges,
  endpointDefectDelegated,
  finalEdges,
  orderedEdges,
}: Readonly<{
  commercialClosureReady: boolean;
  commercialEvaluationEdges: readonly Edge[] | null;
  endpointDefectDelegated: boolean;
  finalEdges: readonly Edge[];
  orderedEdges: readonly Edge[];
}>): boolean => (
  (
    commercialClosureReady
    && commercialEvaluationEdges === finalEdges
  )
  || (
    endpointDefectDelegated
    && doBaseReactFlowDisplayRoutesMatchExactly(orderedEdges, finalEdges)
  )
);

export const closeBaseReactFlowFinalCommercialSafety = <T extends Edge[]>({
  canReuseClosure,
  edges,
  eligibleEdgeIds,
  evaluation,
  nodes,
  onPhaseTrace,
}: Readonly<{
  canReuseClosure: boolean;
  edges: T;
  eligibleEdgeIds?: ReadonlySet<string>;
  evaluation: BaseReactFlowFinalEndpointEvaluation;
  nodes: Node[];
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
}>): T => {
  const timer = startDisplayRoutingPhaseTrace({
    phase: 'final-commercial-safety-closure',
    candidateCount: edges.length,
    onTrace: onPhaseTrace,
  });
  const closedEdges = canReuseClosure
    ? edges
    : repairBaseReactFlowFinalSafetyClosure(edges, nodes, {
      eligibleEdgeIds,
      evaluation,
    });
  timer.finish(
    canReuseClosure
      ? 'hit'
      : doBaseReactFlowDisplayRoutesMatchExactly(edges, closedEdges) ? 'skip' : 'accepted',
  );
  return closedEdges;
};

export const commitBaseReactFlowFinalCommercialSafety = ({
  closedEdges,
  eligibleEdgeIds,
  nodes,
  onPhaseTrace,
  repairNodes,
  response,
}: Readonly<{
  closedEdges: Edge[];
  eligibleEdgeIds?: ReadonlySet<string>;
  nodes: DisplayEdgesWorkerRequest['nodes'];
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
  repairNodes: Node[];
  response: DisplayEdgesWorkerResponse;
}>): DisplayEdgesWorkerResponse => {
  if (!response.edges) return response;
  const outcome = closeBaseReactFlowDisplayFinalHardContract(closedEdges, nodes, onPhaseTrace);
  const contractEdges = outcome.report.hardClean
    && eligibleCommercialClearanceDoesNotRegress(
      response.edges,
      outcome.edges,
      repairNodes,
      eligibleEdgeIds,
    )
    ? outcome.edges
    : response.edges;
  const edges = lockFinalDisplayComputedPaths(contractEdges, repairNodes);
  if (
    finalDisplayRenderContractIsLocked(contractEdges, edges)
    && (
      contractEdges === response.edges
      || doBaseReactFlowDisplayRoutesMatchExactly(response.edges, contractEdges)
    )
  ) return response;
  return {
    ...response,
    edges,
    hardClean: contractEdges === outcome.edges ? outcome.report.hardClean : response.hardClean,
    routeResolution: response.routeResolution === 'validated-candidate'
      ? 'repaired-candidate'
      : response.routeResolution,
  };
};
