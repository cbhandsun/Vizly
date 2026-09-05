import type { Edge, Node } from '@xyflow/react';

import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { lockFinalDisplayComputedPaths } from './baseReactFlowDisplayEdgeCore';
import { repairTerminalPreservingOuterStairs } from './baseReactFlowDisplayCommercialOuterStairRepair';
import { baseReactFlowDisplayCandidateCommercialQualityIsClean } from './baseReactFlowDisplayCommercialQuality';
import { createBaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
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
  let noopCacheHit = false;
  const repairedEdges = canReuseClosure
    ? edges
    : repairBaseReactFlowFinalSafetyClosure(edges, nodes, {
      eligibleEdgeIds,
      evaluation,
      onPhaseTrace,
      onNoopCacheHit: () => {
        noopCacheHit = true;
      },
      traceParentPhase: 'final-commercial-safety-closure',
    });
  const closedEdges = canReuseClosure || (
    evaluation.hardReport(repairedEdges).hardClean
    && eligibleCommercialClearanceDoesNotRegress(
      edges,
      repairedEdges,
      nodes,
      eligibleEdgeIds,
    )
  )
    ? repairedEdges
    : edges;
  timer.finish(
    canReuseClosure || noopCacheHit
      ? 'hit'
      : doBaseReactFlowDisplayRoutesMatchExactly(edges, closedEdges) ? 'skip' : 'accepted',
  );
  return closedEdges;
};

export const commitBaseReactFlowFinalCommercialSafety = ({
  closedEdges,
  eligibleEdgeIds,
  evaluation,
  nodes,
  onPhaseTrace,
  repairNodes,
  response,
}: Readonly<{
  closedEdges: Edge[];
  eligibleEdgeIds?: ReadonlySet<string>;
  evaluation?: BaseReactFlowFinalEndpointEvaluation;
  nodes: DisplayEdgesWorkerRequest['nodes'];
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
  repairNodes: Node[];
  response: DisplayEdgesWorkerResponse;
}>): DisplayEdgesWorkerResponse => {
  if (!response.edges) return response;
  const outcome = closeBaseReactFlowDisplayFinalHardContract(
    closedEdges,
    nodes,
    onPhaseTrace,
    evaluation,
  );
  const contractEdges = outcome.report.hardClean
    && eligibleCommercialClearanceDoesNotRegress(
      closedEdges,
      outcome.edges,
      repairNodes,
      eligibleEdgeIds,
    )
    ? outcome.edges
    : response.edges;
  const lockedEdges = lockFinalDisplayComputedPaths(contractEdges, repairNodes);
  // Port locking may add a narrow bridge after the earlier commercial pass.
  // Close that structural contract on the exact render geometry without
  // moving either terminal, then re-lock to retain the render authority.
  const finalEvaluation = evaluation
    ?? createBaseReactFlowFinalEndpointEvaluation(repairNodes);
  const commerciallyClosedEdges = baseReactFlowDisplayCandidateCommercialQualityIsClean(lockedEdges)
    ? lockedEdges
    : repairTerminalPreservingOuterStairs(
      lockedEdges,
      repairNodes,
      // The final structural contract audits every rendered edge. Restricting
      // its repair to an incremental eligible set can leave an already locked
      // non-eligible edge in a state that the same contract rejects.
      { evaluation: finalEvaluation },
      finalEvaluation,
    );
  const relockedEdges = lockFinalDisplayComputedPaths(commerciallyClosedEdges, repairNodes);
  const relockedReport = finalEvaluation.hardReport(relockedEdges);
  const edges = relockedReport.hardClean
    && baseReactFlowDisplayCandidateCommercialQualityIsClean(relockedEdges)
    ? relockedEdges
    : lockedEdges;
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
    hardClean: edges === relockedEdges ? relockedReport.hardClean : response.hardClean,
    hardReport: edges === relockedEdges ? relockedReport : response.hardReport,
    routeResolution: response.routeResolution === 'validated-candidate'
      ? 'repaired-candidate'
      : response.routeResolution,
  };
};
