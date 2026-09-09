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
  const committedById = new Map(
    repairAxisMismatchedTerminalsWithBoundedPortRoles(
      commitComputedDisplayEdgeTerminals(
        edges.filter(edge => eligibleEdgeIds.has(edge.id)),
        nodes,
      ),
      nodes,
      Math.max(8, eligibleEdgeIds.size * 4),
    ).map(edge => [edge.id, edge] as const),
  );
  const lockedById = new Map(lockFinalDisplayComputedPaths(
    edges
      .filter(edge => eligibleEdgeIds.has(edge.id))
      .map(edge => committedById.get(edge.id) ?? edge),
    nodes,
  ).map(edge => [edge.id, edge] as const));
  const committed = edges.map(edge => lockedById.get(edge.id) ?? edge);
  return preservesTopologyBoundary(baselineEdges, committed, eligibleEdgeIds)
    ? committed
    : null;
};