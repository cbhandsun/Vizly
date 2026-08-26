import type { Edge, Node } from '@xyflow/react';

import { displayBusinessNodeCommercialClearanceIsClean } from './baseReactFlowDisplayBusinessNodeClearance';
import { doesDisplayCandidateMatchSourceGraph } from './baseReactFlowDisplayCandidateValidation';
import { auditBaseReactFlowFinalSafetyClosure } from './baseReactFlowDisplayFinalSafetyAudit';
import { doBaseReactFlowDisplayRoutesMatchExactly } from './baseReactFlowDisplayRoutingTransaction';
import { finalSameSideTrueTrunksDoNotRegress } from './baseReactFlowDisplayTrueTrunkContract';
import type { DisplayEdgesWorkerResponse } from './baseReactFlowDisplayWorkerProtocol';

/** Final atomic gate for a topology or geometry-local Worker transaction. */
export const baseReactFlowIncrementalDisplayCommitIsSafe = ({
  sourceEdges,
  initialEdges,
  response,
  nodes,
  eligibleEdgeIds,
}: {
  sourceEdges: Edge[];
  initialEdges: Edge[];
  response: DisplayEdgesWorkerResponse;
  nodes: Node[];
  eligibleEdgeIds: ReadonlySet<string>;
}): boolean => {
  const responseEdges = response.edges;
  if (
    !responseEdges
    || response.hardClean !== true
    || !doesDisplayCandidateMatchSourceGraph(sourceEdges, responseEdges)
    || !displayBusinessNodeCommercialClearanceIsClean(responseEdges, nodes)
    || !auditBaseReactFlowFinalSafetyClosure(responseEdges, nodes).canSkip
    || !finalSameSideTrueTrunksDoNotRegress(initialEdges, responseEdges, nodes)
  ) return false;
  const responseById = new Map(responseEdges.map(edge => [edge.id, edge] as const));
  return initialEdges.every(edge => {
    if (eligibleEdgeIds.has(edge.id)) return true;
    const responseEdge = responseById.get(edge.id);
    return Boolean(responseEdge) && doBaseReactFlowDisplayRoutesMatchExactly(
      [edge],
      responseEdge ? [responseEdge] : [],
    );
  });
};
