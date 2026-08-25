import type { Edge, Node } from '@xyflow/react';

import { withDisplayAbsolutePositions } from './baseReactFlowDisplayEdgeCore';
import { createBaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import {
  createBaseReactFlowDisplayExactReport,
  type BaseReactFlowDisplayExactReport,
} from './baseReactFlowDisplayFinalizer';

export type BaseReactFlowFullRouteEvaluationSession = Readonly<{
  evaluation: ReturnType<typeof createBaseReactFlowFinalEndpointEvaluation>;
  exactReport: (edges: Edge[]) => BaseReactFlowDisplayExactReport | undefined;
  repairNodes: Node[];
}>;

/**
 * Owns the request-local geometry projection and its exact hard-report proof.
 * The proof remains bound to both the original node array and output route
 * signature, so crossing a Worker pipeline module never grants extra trust.
 */
export const createBaseReactFlowFullRouteEvaluationSession = (
  nodes: Node[],
): BaseReactFlowFullRouteEvaluationSession => {
  const repairNodes = withDisplayAbsolutePositions(
    nodes,
    new Map(nodes.map(node => [node.id, node] as const)),
  );
  const evaluation = createBaseReactFlowFinalEndpointEvaluation(repairNodes);
  return {
    evaluation,
    repairNodes,
    exactReport: edges => createBaseReactFlowDisplayExactReport(
      edges,
      nodes,
      repairNodes,
      evaluation.hardReport(edges),
    ),
  };
};
