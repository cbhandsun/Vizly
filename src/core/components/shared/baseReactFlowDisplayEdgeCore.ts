import type { Edge, Node, XYPosition } from '@xyflow/react';

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
  toBasicDisplayEdge,
  toCanvasRefEdge,
  toSmartDisplayEdge,
} from './baseReactFlowDisplayEdgeConversions';
export { anchorComputedDisplayEdgeEndpoints } from './baseReactFlowDisplayEndpointAnchoring';
export {
  compactOrthogonalPath,
  synthesizeStableFallbackPath,
} from './baseReactFlowDisplayEdgeGeometry';

const clearComputedLayoutData = ({
  edge,
  data,
  displayEdgeEpoch,
}: {
  edge: Edge;
  data: Record<string, any>;
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
  const data = ((edge.data || {}) as Record<string, any>);
  if (!data.isTreeBus && !data.treeRouting) return edge;
  const treeRouting = data.treeRouting && typeof data.treeRouting === 'object' ? data.treeRouting : {};
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
  const data = ((edge.data || {}) as Record<string, any>);
  const path = data.computedPath;
  if (!Array.isArray(path) || path.length < 2) return edge;
  if (hasLockedComputedPath(edge)) return edge;

  const sourceRect = getNodeRect(nodeById.get(edge.source), nodeById);
  const targetRect = getNodeRect(nodeById.get(edge.target), nodeById);
  if (!sourceRect || !targetRect || !sourceRect.width || !sourceRect.height || !targetRect.width || !targetRect.height) {
    return edge;
  }

  const first = path[0];
  const last = path[path.length - 1];
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
  if (isNearPoint(first, sourceAnchor) && isNearPoint(last, targetAnchor)) return edge;

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
  const data = ((edge.data || {}) as Record<string, any>);
  const manualSides = Array.isArray(data.manualHandleSides)
    ? data.manualHandleSides.map((side: any) => String(side).toLowerCase())
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
  const data = ((edge.data || {}) as Record<string, any>);
  if (data.isTreeBus || data.treeRouting) return edge;

  const autoSides = Array.isArray(data.auto)
    ? data.auto.map((side: any) => String(side).toLowerCase())
    : [];
  const manualSides = Array.isArray(data.manualHandleSides)
    ? data.manualHandleSides.map((side: any) => String(side).toLowerCase())
    : [];
  const autoSource = autoSides.includes('source') || data.autoSource === true;
  const autoTarget = autoSides.includes('target') || data.autoTarget === true;
  if (!autoSource || !autoTarget || manualSides.includes('source') || manualSides.includes('target')) return edge;

  const sourceNode = nodeById.get(edge.source);
  const targetNode = nodeById.get(edge.target);
  if (!sourceNode || !targetNode) return edge;

  const sourcePos = (sourceNode as any).positionAbsolute ?? sourceNode.position ?? { x: 0, y: 0 };
  const targetPos = (targetNode as any).positionAbsolute ?? targetNode.position ?? { x: 0, y: 0 };
  const sourceW = (sourceNode as any).measured?.width ?? sourceNode.width ?? (sourceNode.style as any)?.width ?? 0;
  const sourceH = (sourceNode as any).measured?.height ?? sourceNode.height ?? (sourceNode.style as any)?.height ?? 0;
  const targetW = (targetNode as any).measured?.width ?? targetNode.width ?? (targetNode.style as any)?.width ?? 0;
  const targetH = (targetNode as any).measured?.height ?? targetNode.height ?? (targetNode.style as any)?.height ?? 0;
  const dx = (Number(targetPos.x || 0) + Number(targetW || 0) / 2) - (Number(sourcePos.x || 0) + Number(sourceW || 0) / 2);
  const dy = (Number(targetPos.y || 0) + Number(targetH || 0) / 2) - (Number(sourcePos.y || 0) + Number(sourceH || 0) / 2);
  const layoutDir = String(data.layoutDirection || (sourceNode.data as any)?.layoutDirection || 'TB').toUpperCase();
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
        ...(data.runtimeHandleLock && typeof data.runtimeHandleLock === 'object' ? data.runtimeHandleLock : {}),
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

export const withDisplayAbsolutePositions = (nodes: Node[], nodeById: Map<string, Node>): Node[] => {
  const finiteNumber = (value: unknown, fallback: number): number => (
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  );
  const resolvePosition = (node: Node, seen = new Set<string>()): XYPosition => {
    const parentId = (node as any).parentId;
    const localPosition = node.position ?? (node as any).positionAbsolute ?? { x: 0, y: 0 };
    const local = {
      x: finiteNumber((localPosition as any).x, 0),
      y: finiteNumber((localPosition as any).y, 0),
    };
    if (!parentId || seen.has(parentId)) {
      const absolute = (node as any).positionAbsolute;
      return absolute
        ? { x: finiteNumber((absolute as any).x, local.x), y: finiteNumber((absolute as any).y, local.y) }
        : local;
    }
    const parent = nodeById.get(parentId);
    if (!parent) return local;
    seen.add(parentId);
    const parentPosition = resolvePosition(parent, seen);
    return {
      x: parentPosition.x + local.x,
      y: parentPosition.y + local.y,
    };
  };

  return nodes.map((node) => ({ ...node, positionAbsolute: resolvePosition(node) }) as Node);
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
