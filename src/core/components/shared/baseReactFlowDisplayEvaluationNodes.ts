import type { Node } from '@xyflow/react';

import { withDisplayAbsolutePositions } from './baseReactFlowDisplayEdgeCore';
import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';

/** Keeps every node-identity keyed context on the same request snapshot. */
export const resolveBaseReactFlowEvaluationNodes = (
  nodes: Node[],
  evaluation?: BaseReactFlowFinalEndpointEvaluation,
): Node[] => evaluation?.nodes ?? withDisplayAbsolutePositions(
  nodes,
  new Map(nodes.map(node => [node.id, node] as const)),
);
