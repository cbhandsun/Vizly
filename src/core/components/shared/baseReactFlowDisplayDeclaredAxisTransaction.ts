import type { Edge, Node } from '@xyflow/react';

import { displayTerminalRoleNeedsDeclaredAxisRepair } from './baseReactFlowDisplayTerminalPortCandidates';
import { getDisplayComputedPath, getDisplayNodeRect } from './baseReactFlowDisplayGeometry';

export const createDisplayDeclaredAxisMismatchCounter = (
  nodes: Node[],
): ((edge: Edge) => number) => {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  return (edge: Edge): number => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
    const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
    if (!sourceRect || !targetRect) return 2;
    const path = getDisplayComputedPath(edge);
    return Number(displayTerminalRoleNeedsDeclaredAxisRepair(
      edge,
      path,
      'source',
      sourceRect,
    )) + Number(displayTerminalRoleNeedsDeclaredAxisRepair(
      edge,
      path,
      'target',
      targetRect,
    ));
  };
};

export const rollbackIncompleteDeclaredAxisTransactions = <T extends Edge[]>(
  baseline: T,
  candidate: T,
  countMismatches: (edge: Edge) => number,
): T => {
  let rolledBack = false;
  const completed = candidate.map((edge, index) => {
    const original = baseline[index];
    if (
      edge === original
      || countMismatches(original) === 0
      || countMismatches(edge) === 0
    ) return edge;
    rolledBack = true;
    return original;
  }) as T;
  return rolledBack ? completed : candidate;
};
