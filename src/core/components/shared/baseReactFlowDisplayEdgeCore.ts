import type { Edge, Node } from '@xyflow/react';

import { expandHandle, normalizeHandle } from '../../routing/utils/handleUtils';
import {
  edgeTerminalSideCanSwitch,
  readEdgeTerminalPolicy,
  resolveEdgeTerminalHandleForSide,
  type EdgeTerminalRole,
} from '../../routing/utils/edgeTerminalPolicy';
import { anchorComputedDisplayEdgeEndpoints } from './baseReactFlowDisplayEndpointAnchoring';
import {
  anchorForHandle,
  getNodeRect,
  getNodeX,
  hasLockedComputedPath,
  isNearPoint,
  isVerticalHandle,
  synthesizeStableFallbackPath,
} from './baseReactFlowDisplayEdgeGeometry';
import { repairFastDisplayHardSafety } from './baseReactFlowFastEdgeSafety';
import {
  toBasicDisplayEdge,
  toCanvasRefEdge,
  toSmartDisplayEdge,
} from './baseReactFlowDisplayEdgeConversions';
import { withDisplayAbsolutePositions } from './baseReactFlowAbsolutePositions';

export { withDisplayAbsolutePositions } from './baseReactFlowAbsolutePositions';

export {
  BASE_DISPLAY_ROUTING_VERSION,
  baseReactFlowDisplayOutputRouteSignatureMatches,
  computeBaseDisplayInputSignature,
  computeBaseReactFlowDisplayCacheSignature,
  computeBaseReactFlowDisplayEdgeEpoch,
  computeBaseReactFlowEndpointGeometryKey,
  computeBaseReactFlowDisplayOutputRouteSignature,
  isBaseDisplayFinalized,
  isFinitePoint,
  markBaseDisplayFinalized,
  readBaseReactFlowDisplayEdgesCache,
  readBaseReactFlowDisplayEdgesCacheEntry,
  writeBaseReactFlowDisplayEdgesCache,
} from './baseReactFlowDisplayCache';
export type { BaseReactFlowDisplayEdgesCacheEntry } from './baseReactFlowDisplayCache';
export {
  lockFinalDisplayComputedPaths,
  toBasicDisplayEdge,
  toCanvasRefEdge,
  toSmartDisplayEdge,
} from './baseReactFlowDisplayEdgeConversions';
export { anchorComputedDisplayEdgeEndpoints } from './baseReactFlowDisplayEndpointAnchoring';
export {
  compactOrthogonalPath,
  synthesizeStableFallbackPath,
} from './baseReactFlowDisplayEdgeGeometry';

type DisplayNode = Node & {
  positionAbsolute?: Node['position'];
  measured?: { width?: number; height?: number };
};

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const clearComputedLayoutData = ({
  edge,
  data,
  displayEdgeEpoch,
}: {
  edge: Edge;
  data: Record<string, unknown>;
  displayEdgeEpoch: number;
}): Edge => ({
  ...edge,
  data: {
    ...data,
    computedPath: undefined,
    elkPath: undefined,
    algorithm: undefined,
    _layoutEpoch: displayEdgeEpoch,
  },
});

const normalizeRuntimeHandles = (edge: Edge): Edge => {
  const normalizeHandleForRole = (role: EdgeTerminalRole): string | null | undefined => {
    const currentHandle = role === 'source' ? edge.sourceHandle : edge.targetHandle;
    if (!currentHandle || readEdgeTerminalPolicy(edge, role).sourceExactFixed) return currentHandle;
    return expandHandle(String(currentHandle));
  };
  const sourceHandle = normalizeHandleForRole('source');
  const targetHandle = normalizeHandleForRole('target');
  if (sourceHandle === edge.sourceHandle && targetHandle === edge.targetHandle) return edge;
  return { ...edge, sourceHandle, targetHandle };
};

const normalizeTreeBusHandles = ({
  edge,
  displayEdgeEpoch,
}: {
  edge: Edge;
  displayEdgeEpoch: number;
}): Edge => {
  const data = asRecord(edge.data);
  if (!data.isTreeBus && !data.treeRouting) return edge;
  const treeRouting = asRecord(data.treeRouting);
  const sourceHandle = expandHandle(String(treeRouting.effectiveSourceHandle || edge.sourceHandle || ''));
  const targetHandle = expandHandle(String(treeRouting.effectiveTargetHandle || edge.targetHandle || ''));
  if (!sourceHandle && !targetHandle) return edge;

  const resolveTreeHandle = (
    role: EdgeTerminalRole,
    candidateHandle: string,
  ): string | null | undefined => {
    const normalizedSide = normalizeHandle(candidateHandle);
    const side = normalizedSide === 't'
      ? 'top'
      : normalizedSide === 'b'
        ? 'bottom'
        : normalizedSide === 'l'
          ? 'left'
          : normalizedSide === 'r'
            ? 'right'
            : null;
    if (!side || !edgeTerminalSideCanSwitch(edge, role, side)) {
      return role === 'source' ? edge.sourceHandle : edge.targetHandle;
    }
    return resolveEdgeTerminalHandleForSide(edge, role, side);
  };
  const nextSource = sourceHandle
    ? resolveTreeHandle('source', sourceHandle)
    : edge.sourceHandle;
  const nextTarget = targetHandle
    ? resolveTreeHandle('target', targetHandle)
    : edge.targetHandle;
  if (nextSource === edge.sourceHandle && nextTarget === edge.targetHandle) return edge;

  return clearComputedLayoutData({
    edge: {
      ...edge,
      sourceHandle: nextSource,
      targetHandle: nextTarget,
    },
    data,
    displayEdgeEpoch,
  });
};

const normalizeStaleComputedPath = ({
  edge,
  nodeById,
  displayEdgeEpoch,
}: {
  edge: Edge;
  nodeById: Map<string, Node>;
  displayEdgeEpoch: number;
}): Edge => {
  const data = asRecord(edge.data);
  const path = data.computedPath;
  if (!Array.isArray(path) || path.length < 2) return edge;
  if (hasLockedComputedPath(edge)) return edge;

  const sourceRect = getNodeRect(nodeById.get(edge.source), nodeById);
  const targetRect = getNodeRect(nodeById.get(edge.target), nodeById);
  if (!sourceRect || !targetRect || !sourceRect.width || !sourceRect.height || !targetRect.width || !targetRect.height) {
    return edge;
  }

  const first = asRecord(path[0]);
  const last = asRecord(path[path.length - 1]);
  if (
    !first
    || !last
    || !Number.isFinite(Number(first.x))
    || !Number.isFinite(Number(first.y))
    || !Number.isFinite(Number(last.x))
    || !Number.isFinite(Number(last.y))
  ) {
    return clearComputedLayoutData({
      edge,
      data,
      displayEdgeEpoch,
    });
  }

  const sourceAnchor = anchorForHandle(sourceRect, edge.sourceHandle);
  const targetAnchor = anchorForHandle(targetRect, edge.targetHandle);
  const firstPoint = { x: Number(first.x), y: Number(first.y) };
  const lastPoint = { x: Number(last.x), y: Number(last.y) };
  if (isNearPoint(firstPoint, sourceAnchor) && isNearPoint(lastPoint, targetAnchor)) return edge;

  return clearComputedLayoutData({
    edge,
    data,
    displayEdgeEpoch,
  });
};

const normalizeCrossContainerManualHandles = ({
  edge,
  nodeById,
  displayEdgeEpoch,
}: {
  edge: Edge;
  nodeById: Map<string, Node>;
  displayEdgeEpoch: number;
}): Edge => {
  if (hasLockedComputedPath(edge)) return edge;
  const data = asRecord(edge.data);
  const manualSides = Array.isArray(data.manualHandleSides)
    ? data.manualHandleSides.map((side: unknown) => String(side).toLowerCase())
    : [];
  if (!manualSides.includes('source') || !manualSides.includes('target')) return edge;
  if (!isVerticalHandle(edge.sourceHandle) || !isVerticalHandle(edge.targetHandle)) return edge;

  const sourceNode = nodeById.get(edge.source);
  const targetNode = nodeById.get(edge.target);
  const dx = getNodeX(targetNode) - getNodeX(sourceNode);
  if (Math.abs(dx) < 80) return edge;

  const nextHandles = dx >= 0
    ? { sourceHandle: 'right', targetHandle: 'left' } as const
    : { sourceHandle: 'left', targetHandle: 'right' } as const;
  if (
    !edgeTerminalSideCanSwitch(edge, 'source', nextHandles.sourceHandle)
    || !edgeTerminalSideCanSwitch(edge, 'target', nextHandles.targetHandle)
  ) return edge;

  return clearComputedLayoutData({
    edge: {
      ...edge,
      sourceHandle: resolveEdgeTerminalHandleForSide(edge, 'source', nextHandles.sourceHandle),
      targetHandle: resolveEdgeTerminalHandleForSide(edge, 'target', nextHandles.targetHandle),
    },
    data,
    displayEdgeEpoch,
  });
};

const normalizeAutoReverseSideHandles = ({
  edge,
  nodeById,
  displayEdgeEpoch,
}: {
  edge: Edge;
  nodeById: Map<string, Node>;
  displayEdgeEpoch: number;
}): Edge => {
  if (hasLockedComputedPath(edge)) return edge;
  const data = asRecord(edge.data);
  if (data.isTreeBus || data.treeRouting) return edge;

  const autoSides = Array.isArray(data.auto)
    ? data.auto.map((side: unknown) => String(side).toLowerCase())
    : [];
  const manualSides = Array.isArray(data.manualHandleSides)
    ? data.manualHandleSides.map((side: unknown) => String(side).toLowerCase())
    : [];
  const autoSource = autoSides.includes('source') || data.autoSource === true;
  const autoTarget = autoSides.includes('target') || data.autoTarget === true;
  if (!autoSource || !autoTarget || manualSides.includes('source') || manualSides.includes('target')) return edge;

  const sourceNode = nodeById.get(edge.source);
  const targetNode = nodeById.get(edge.target);
  if (!sourceNode || !targetNode) return edge;

  const displaySourceNode = sourceNode as DisplayNode;
  const displayTargetNode = targetNode as DisplayNode;
  const sourceStyle = asRecord(sourceNode.style);
  const targetStyle = asRecord(targetNode.style);
  const sourcePos = displaySourceNode.positionAbsolute ?? sourceNode.position ?? { x: 0, y: 0 };
  const targetPos = displayTargetNode.positionAbsolute ?? targetNode.position ?? { x: 0, y: 0 };
  const sourceW = displaySourceNode.measured?.width ?? sourceNode.width ?? sourceStyle.width ?? 0;
  const sourceH = displaySourceNode.measured?.height ?? sourceNode.height ?? sourceStyle.height ?? 0;
  const targetW = displayTargetNode.measured?.width ?? targetNode.width ?? targetStyle.width ?? 0;
  const targetH = displayTargetNode.measured?.height ?? targetNode.height ?? targetStyle.height ?? 0;
  const dx = (Number(targetPos.x || 0) + Number(targetW || 0) / 2) - (Number(sourcePos.x || 0) + Number(sourceW || 0) / 2);
  const dy = (Number(targetPos.y || 0) + Number(targetH || 0) / 2) - (Number(sourcePos.y || 0) + Number(sourceH || 0) / 2);
  const layoutDir = String(data.layoutDirection || asRecord(sourceNode.data).layoutDirection || 'TB').toUpperCase();
  const isVerticalReverseWithSideRoom =
    ((layoutDir.includes('TB') && dy < 0) || (layoutDir.includes('BT') && dy > 0))
    && Math.abs(dx) > Math.abs(dy) * 0.35;
  if (!isVerticalReverseWithSideRoom) return edge;

  const nextHandles = dx >= 0
    ? { sourceHandle: 'right', targetHandle: 'left' } as const
    : { sourceHandle: 'left', targetHandle: 'right' } as const;
  if (
    !edgeTerminalSideCanSwitch(edge, 'source', nextHandles.sourceHandle)
    || !edgeTerminalSideCanSwitch(edge, 'target', nextHandles.targetHandle)
  ) return edge;
  const nextSourceHandle = resolveEdgeTerminalHandleForSide(edge, 'source', nextHandles.sourceHandle);
  const nextTargetHandle = resolveEdgeTerminalHandleForSide(edge, 'target', nextHandles.targetHandle);
  if (edge.sourceHandle === nextSourceHandle && edge.targetHandle === nextTargetHandle) return edge;

  return clearComputedLayoutData({
    edge: {
      ...edge,
      sourceHandle: nextSourceHandle,
      targetHandle: nextTargetHandle,
    },
    data: {
      ...data,
      runtimeHandleLock: {
        ...asRecord(data.runtimeHandleLock),
        source: true,
        target: true,
      },
    },
    displayEdgeEpoch,
  });
};

export const normalizeBaseEdge = ({
  edge,
  nodeById,
  displayEdgeEpoch,
}: {
  edge: Edge;
  nodeById: Map<string, Node>;
  displayEdgeEpoch: number;
}): Edge => {
  const withCrossContainerHandles = normalizeCrossContainerManualHandles({
    edge,
    nodeById,
    displayEdgeEpoch,
  });
  const withTreeBusHandles = normalizeTreeBusHandles({
    edge: withCrossContainerHandles,
    displayEdgeEpoch,
  });
  const withAutoReverseHandles = normalizeAutoReverseSideHandles({
    edge: withTreeBusHandles,
    nodeById,
    displayEdgeEpoch,
  });
  const withRuntimeHandles = normalizeRuntimeHandles(withAutoReverseHandles);
  return normalizeStaleComputedPath({
    edge: withRuntimeHandles,
    nodeById,
    displayEdgeEpoch,
  });
};

export const createBaseReactFlowFastDisplayEdges = ({
  edges,
  nodes,
  enableSmartEdges,
  smartEdgePadding,
  isLargeGraph,
  displayEdgeEpoch,
}: {
  edges: Edge[];
  nodes: Node[];
  enableSmartEdges: boolean;
  smartEdgePadding: number;
  isLargeGraph: boolean;
  displayEdgeEpoch: number;
}): Edge[] => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const normalizedEdges = edges.map((rawEdge) => normalizeBaseEdge({
    edge: rawEdge,
    nodeById,
    displayEdgeEpoch,
  })).map((edge) => synthesizeStableFallbackPath({ edge, nodeById }));
  const repairNodes = withDisplayAbsolutePositions(nodes, nodeById);
  const safeEdges = repairFastDisplayHardSafety(normalizedEdges, repairNodes);
  const anchoredSafeEdges = repairFastDisplayHardSafety(
    anchorComputedDisplayEdgeEndpoints(safeEdges, repairNodes),
    repairNodes,
  );

  if (isLargeGraph) {
    return anchoredSafeEdges.map((edge) => toCanvasRefEdge(edge));
  }

  if (enableSmartEdges) {
    return anchoredSafeEdges.map((edge, index) => toSmartDisplayEdge({
      edge,
      rawEdge: edges[index],
      smartEdgePadding,
    }));
  }

  return anchoredSafeEdges.map((edge, index) => toBasicDisplayEdge({
    edge,
    rawEdge: edges[index],
  }));
};
