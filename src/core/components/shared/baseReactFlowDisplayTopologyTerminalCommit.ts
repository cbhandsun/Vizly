import type { Edge, Node } from '@xyflow/react';

import { lockFinalDisplayComputedPaths } from './baseReactFlowDisplayEdgeCore';
import { commitComputedDisplayEdgeTerminals } from './baseReactFlowDisplayEndpointAnchoring';
import { preservesBaseReactFlowIncrementalBoundary as preservesTopologyBoundary } from './baseReactFlowDisplayIncrementalContracts';
import { repairAxisMismatchedTerminalsWithBoundedPortRoles } from './baseReactFlowDisplayTerminalPortRepair';

export const recommitBaseReactFlowTopologyEligibleTerminals = ({
  edges,
  baselineEdges,
  nodes,
  eligibleEdgeIds,
}: {
  edges: Edge[];
  baselineEdges: Edge[];
  nodes: Node[];
  eligibleEdgeIds: ReadonlySet<string>;
}): Edge[] | null => {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const eligibleEdges = edges.filter(edge => eligibleEdgeIds.has(edge.id));
  const committedById = new Map(
    repairAxisMismatchedTerminalsWithBoundedPortRoles(
      commitComputedDisplayEdgeTerminals(
        eligibleEdges,
        nodes,
        nodeById,
      ),
      nodes,
      Math.max(8, eligibleEdgeIds.size * 4),
    ).map(edge => [edge.id, edge] as const),
  );
  const lockedById = new Map(lockFinalDisplayComputedPaths(
    eligibleEdges.map(edge => committedById.get(edge.id) ?? edge),
    nodes,
    nodeById,
  ).map(edge => [edge.id, edge] as const));
  const committed = edges.map(edge => lockedById.get(edge.id) ?? edge);
  return preservesTopologyBoundary(baselineEdges, committed, eligibleEdgeIds)
    ? committed
    : null;
};
