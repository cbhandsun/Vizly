import type { Edge } from '@xyflow/react';

import { withDisplayComputedPath, type DisplayPoint } from './baseReactFlowDisplayGeometry';
import { resolveDisplayTerminalHandleForSide } from './baseReactFlowDisplayTerminalPolicy';

export const withDisplayPortBridge = (
  edge: Edge,
  path: DisplayPoint[],
  sourceHandle: 'top' | 'bottom' | 'left' | 'right',
  targetHandle: 'top' | 'bottom' | 'left' | 'right',
): Edge => {
  const candidate = withDisplayComputedPath(edge, path);
  const data = (candidate.data || {}) as Record<string, unknown>;
  const resolvedSourceHandle = resolveDisplayTerminalHandleForSide(
    edge,
    'source',
    sourceHandle,
  );
  const resolvedTargetHandle = resolveDisplayTerminalHandleForSide(
    edge,
    'target',
    targetHandle,
  );
  const treeRouting = data.treeRouting && typeof data.treeRouting === 'object'
    ? data.treeRouting as Record<string, unknown>
    : undefined;
  return {
    ...candidate,
    sourceHandle: resolvedSourceHandle,
    targetHandle: resolvedTargetHandle,
    data: {
      ...data,
      treeRouting: treeRouting && Array.isArray(treeRouting.points)
        ? {
          ...treeRouting,
          effectiveSourceHandle: resolvedSourceHandle,
          effectiveTargetHandle: resolvedTargetHandle,
          points: path,
        }
        : data.treeRouting,
      terminalPortBridgeRepaired: true,
    },
  };
};
