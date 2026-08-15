import type { Edge, Node } from '@xyflow/react';

import {
  edgeTerminalSideCanSwitch,
  resolveEdgeTerminalHandleForSide,
  type EdgeTerminalRole,
} from '../../routing/utils/edgeTerminalPolicy';
import { isFinitePoint } from './baseReactFlowDisplayCache';
import { getNodeRect, sideForHandle } from './baseReactFlowDisplayEdgeGeometry';
import { inferTerminalGeometrySide } from './baseReactFlowDisplayTerminalSide';

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const getTerminalCommitPath = (edge: Edge): { x: number; y: number }[] => {
  const path = asRecord(edge.data).computedPath;
  return Array.isArray(path) && path.every(isFinitePoint) ? path : [];
};

/**
 * Commits geometry-selected automatic terminal sides to the stable route.
 *
 * Late quality selection can restore a legal path candidate whose terminal
 * handle token is absent even though its first/last segment unambiguously
 * leaves a node boundary. Persisting that inconsistency makes a precompiled
 * route render correctly once but prevents a later incremental reconnect from
 * identifying the terminal role. This boundary is intentionally geometry-only
 * and never changes source-authored fixed terminal declarations.
 */
export const materializeDisplayTerminalHandles = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
): T => {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  let changed = false;
  const resolved = edges.map((edge) => {
    const path = getTerminalCommitPath(edge);
    if (path.length < 2) return edge;
    const sourceRect = getNodeRect(nodeById.get(edge.source), nodeById);
    const targetRect = getNodeRect(nodeById.get(edge.target), nodeById);
    if (!sourceRect || !targetRect) return edge;

    const resolveRole = (
      role: EdgeTerminalRole,
      rect: NonNullable<typeof sourceRect>,
    ): string | null | undefined => {
      const current = role === 'source' ? edge.sourceHandle : edge.targetHandle;
      if (sideForHandle(current)) return current;
      const side = inferTerminalGeometrySide(path, role, rect);
      if (!side || !edgeTerminalSideCanSwitch(edge, role, side)) return current;
      return resolveEdgeTerminalHandleForSide(edge, role, side);
    };

    const sourceHandle = resolveRole('source', sourceRect);
    const targetHandle = resolveRole('target', targetRect);
    if (sourceHandle === edge.sourceHandle && targetHandle === edge.targetHandle) return edge;
    changed = true;
    const data = asRecord(edge.data);
    const treeRouting = asRecord(data.treeRouting);
    return {
      ...edge,
      sourceHandle,
      targetHandle,
      data: {
        ...data,
        treeRouting: Object.keys(treeRouting).length > 0
          ? {
            ...treeRouting,
            effectiveSourceHandle: sourceHandle,
            effectiveTargetHandle: targetHandle,
          }
          : data.treeRouting,
      },
    };
  });
  return (changed ? resolved : edges) as T;
};
