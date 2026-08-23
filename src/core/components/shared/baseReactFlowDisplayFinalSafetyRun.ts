import type { Edge, Node } from '@xyflow/react';

import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { auditBaseReactFlowFinalSafetyClosure } from './baseReactFlowDisplayFinalSafetyAudit';
import { repairBaseReactFlowFinalSafetyClosure } from './baseReactFlowDisplayFinalSafetyClosure';
import type { DisplayEdgesWorkerResponse } from './baseReactFlowDisplayWorkerProtocol';
import {
  startDisplayRoutingPhaseTrace,
  type DisplayRoutingPhaseTrace,
} from './baseReactFlowDisplayRoutingTrace';

export const runBaseReactFlowFinalSafetyClosure = <T extends Edge[]>({
  edges,
  eligibleEdgeIds,
  evaluation,
  nodes,
  onPhaseTrace,
  routeResolution,
}: Readonly<{
  edges: T;
  eligibleEdgeIds?: ReadonlySet<string>;
  evaluation: BaseReactFlowFinalEndpointEvaluation;
  nodes: Node[];
  onPhaseTrace?: (trace: DisplayRoutingPhaseTrace) => void;
  routeResolution: DisplayEdgesWorkerResponse['routeResolution'];
}>): Readonly<{
  edges: T;
  endpointDefectDelegated: boolean;
  safetyAudit: ReturnType<typeof auditBaseReactFlowFinalSafetyClosure>;
}> => {
  const timer = startDisplayRoutingPhaseTrace({
    phase: 'final-safety-closure',
    candidateCount: edges.length,
    onTrace: onPhaseTrace,
  });
  const safetyAudit = auditBaseReactFlowFinalSafetyClosure(
    edges,
    nodes,
    evaluation,
    onPhaseTrace,
  );
  const endpointDefectDelegated = routeResolution === 'incremental-route'
    && safetyAudit.endpointDefectOnly;
  let noopCacheHit = false;
  const closedEdges = safetyAudit.canSkip || endpointDefectDelegated
    ? edges
    : repairBaseReactFlowFinalSafetyClosure(edges, nodes, {
      eligibleEdgeIds,
      evaluation,
      onNoopCacheHit: () => {
        noopCacheHit = true;
      },
    }) as T;
  timer.finish(
    noopCacheHit ? 'hit' : closedEdges === edges ? 'skip' : 'accepted',
  );
  return { edges: closedEdges, endpointDefectDelegated, safetyAudit };
};
