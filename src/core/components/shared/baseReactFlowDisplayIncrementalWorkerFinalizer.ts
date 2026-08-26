import { withDisplayAbsolutePositions } from './baseReactFlowDisplayEdgeCore';
import { baseReactFlowIncrementalDisplayCommitIsSafe } from './baseReactFlowDisplayIncrementalCommitGate';
import type { BaseReactFlowDisplayIncrementalRouteOutcome } from './baseReactFlowDisplayIncrementalRoute';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';
import type {
  DisplayEdgesWorkerIncrementalRouteRequest,
  DisplayEdgesWorkerResponse,
} from './baseReactFlowDisplayWorkerProtocol';
import { finishDisplayWorkerFinalization } from './baseReactFlowDisplayWorkerFinalEvaluation';

export const displayIncrementalCandidateRequiresTopologyCommitGate = (
  classification: DisplayEdgesWorkerIncrementalRouteRequest['changeSet']['classification'],
): boolean => classification === 'topology';

export const finalizeDisplayWorkerIncrementalCandidate = ({
  request,
  incremental,
  onPhaseTrace,
  finalizeResponse,
}: {
  request: DisplayEdgesWorkerIncrementalRouteRequest;
  incremental: BaseReactFlowDisplayIncrementalRouteOutcome;
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
  finalizeResponse: (
    response: DisplayEdgesWorkerResponse,
    eligibleEdgeIds: ReadonlySet<string>,
  ) => DisplayEdgesWorkerResponse;
}): DisplayEdgesWorkerResponse | null => {
  if (!incremental.edges) return null;
  const timer = startDisplayRoutingPhaseTrace({
    phase: 'finalizer',
    candidateCount: incremental.edges.length,
    onTrace: onPhaseTrace,
  });
  const eligibleEdgeIds = new Set(incremental.eligibleEdgeIds);
  const response = finalizeResponse({
    requestId: request.requestId,
    edges: incremental.edges,
    hardClean: true,
    hardReport: incremental.hardReport,
    routeResolution: 'incremental-route',
    phaseTrace: [],
    affectedEdgeCount: incremental.affectedEdgeCount,
    fallbackLevel: 'none',
  }, eligibleEdgeIds);
  if (!displayIncrementalCandidateRequiresTopologyCommitGate(request.changeSet.classification)) {
    return finishDisplayWorkerFinalization(timer, response, 0);
  }
  const repairNodes = withDisplayAbsolutePositions(
    request.nodes,
    new Map(request.nodes.map(node => [node.id, node] as const)),
  );
  if (baseReactFlowIncrementalDisplayCommitIsSafe({
    sourceEdges: request.edges,
    initialEdges: incremental.edges,
    response,
    nodes: repairNodes,
    eligibleEdgeIds,
  })) return finishDisplayWorkerFinalization(timer, response, 0);
  timer.finish('fallback', 0);
  return null;
};
