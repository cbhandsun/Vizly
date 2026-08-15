import type { Edge, Node } from '@xyflow/react';

import { repairBoundedReverseParallelOverlapsWithCandidates } from './baseReactFlowDisplayOverlapRepair';
import { buildOppositeRoleSharedNodeCandidates } from './baseReactFlowDisplayTerminalPortCandidates';

export const repairBoundedReverseParallelOverlaps = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 8,
): T => repairBoundedReverseParallelOverlapsWithCandidates(
  edges,
  nodes,
  maxQualityEvaluations,
  buildOppositeRoleSharedNodeCandidates,
);
