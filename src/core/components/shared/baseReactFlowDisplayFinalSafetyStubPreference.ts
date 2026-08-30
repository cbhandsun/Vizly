import type { Edge, Node } from '@xyflow/react';

import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { repairRenderSafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';

export const repairFinalSafetyRenderSafeEndpointStubs = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  evaluation: BaseReactFlowFinalEndpointEvaluation | undefined,
  allowStrictFallback: boolean,
): T => (
  evaluation
    ? evaluation.repairRenderSafeEndpointStubs(edges, 32, allowStrictFallback) as T
    : repairRenderSafeEndpointStubs(
      edges,
      nodes,
      32,
      undefined,
      undefined,
      undefined,
      allowStrictFallback,
    )
);
