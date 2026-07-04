import type { Edge, Node } from '@xyflow/react';

import { expandHandle } from '../../routing/utils/handleUtils';
import { separateDetachedParallelOverlaps } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { repairEndpointLaneCrossings } from '../../strategies/shared/edgeEndpointLaneNudgeRepair';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import { refineGlobalEdgeWaypoints } from '../../strategies/shared/edgeGlobalWaypointRefinement';
import { repairLocalDoglegArtifacts } from '../../strategies/shared/edgeLocalDoglegRepair';
import { repairReverseFlowBypassCrossings } from '../../strategies/shared/edgeReverseFlowBypassRepair';
import { repairSameNodeInOutCrossings } from '../../strategies/shared/edgeSameNodeRoleRepair';
import {
  synthesizeSharedEndpointTrunks,
  synthesizeSharedTargetTrunks,
} from '../../strategies/shared/edgeSharedTrunkSynthesis';
import {
  reduceEdgeCrossingsWithWaypoints,
  repairSharedTrunkAwareCrossings,
} from '../../strategies/shared/edgeRoutingPipeline';

const preserveSmartEdgeTypes = new Set([
  'mindmapedge',
  'editable',
  'domain',
  'stablepath',
  'elk',
  'canvas-ref',
]);

type NodeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const isVerticalHandle = (handle?: string | null) => {
  const s = String(handle || '').toLowerCase();
  return s === 'top' || s === 'bottom' || s === 't' || s === 'b';
};

const getNodeX = (node: Node | undefined) => {
  const pos = (node as any)?.positionAbsolute ?? node?.position ?? { x: 0 };
  return Number(pos.x || 0);
};

const getNodePosition = (
  node: Node | undefined,
  nodeById?: Map<string, Node>,
): { x: number; y: number } | null => {
  if (!node) return null;
  const hasAbsolutePosition = Boolean((node as any).positionAbsolute);
  const pos = (node as any).positionAbsolute ?? node.position ?? { x: 0, y: 0 };
  let x = Number(pos.x || 0);
  let y = Number(pos.y || 0);
  if (!hasAbsolutePosition && nodeById) {
    const visited = new Set<string>();
    let parentId = (node as any).parentId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = nodeById.get(parentId);
      if (!parent) break;
      const parentHasAbsolutePosition = Boolean((parent as any).positionAbsolute);
      const parentPos = (parent as any).positionAbsolute ?? parent.position ?? { x: 0, y: 0 };
      x += Number(parentPos.x || 0);
      y += Number(parentPos.y || 0);
      if (parentHasAbsolutePosition) break;
      parentId = (parent as any).parentId;
    }
  }
  return { x, y };
};

const getNodeRect = (node: Node | undefined, nodeById?: Map<string, Node>): NodeRect | null => {
  const pos = getNodePosition(node, nodeById);
  if (!node || !pos) return null;
  const width = (node as any).measured?.width ?? node.width ?? (node.style as any)?.width ?? 0;
  const height = (node as any).measured?.height ?? node.height ?? (node.style as any)?.height ?? 0;
  return {
    x: pos.x,
    y: pos.y,
    width: Number(width || 0),
    height: Number(height || 0),
  };
};

const anchorForHandle = (rect: NodeRect, handle?: string | null) => {
  const h = (expandHandle(String(handle || '')) || '').toLowerCase();
  if (h === 'left') return { x: rect.x, y: rect.y + rect.height / 2 };
  if (h === 'right') return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  if (h === 'top') return { x: rect.x + rect.width / 2, y: rect.y };
  if (h === 'bottom') return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
};

const isNearPoint = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  tolerance = 80,
) => Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;

const isFinitePoint = (value: unknown): value is { x: number; y: number } => {
  if (!value || typeof value !== 'object') return false;
  const point = value as Record<string, unknown>;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
};

const hasLockedComputedPath = (edge: Edge): boolean => {
  const data = ((edge.data || {}) as Record<string, any>);
  return (data.layoutPathLocked === true || data._layoutPathLocked === true)
    && Array.isArray(data.computedPath)
    && data.computedPath.length >= 2
    && data.computedPath.every(isFinitePoint);
};

const hasTrustedComputedPath = (edge: Edge): boolean => hasLockedComputedPath(edge);

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
  const sourceHandle = edge.sourceHandle ? expandHandle(String(edge.sourceHandle)) : edge.sourceHandle;
  const targetHandle = edge.targetHandle ? expandHandle(String(edge.targetHandle)) : edge.targetHandle;
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

  const nextSource = sourceHandle || edge.sourceHandle;
  const nextTarget = targetHandle || edge.targetHandle;
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
    ? { sourceHandle: 'right', targetHandle: 'left' }
    : { sourceHandle: 'left', targetHandle: 'right' };

  return clearComputedLayoutData({
    edge: {
      ...edge,
      ...nextHandles,
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
    ? { sourceHandle: 'right', targetHandle: 'left' }
    : { sourceHandle: 'left', targetHandle: 'right' };
  if (edge.sourceHandle === nextHandles.sourceHandle && edge.targetHandle === nextHandles.targetHandle) return edge;

  return clearComputedLayoutData({
    edge: {
      ...edge,
      ...nextHandles,
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

const normalizeBaseEdge = ({
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

const withDisplayAbsolutePositions = (nodes: Node[], nodeById: Map<string, Node>): Node[] => nodes.map((node) => {
  if ((node as any).positionAbsolute) return node;
  const positionAbsolute = getNodePosition(node, nodeById);
  return positionAbsolute ? { ...node, positionAbsolute } as Node : node;
});

const toCanvasRefEdge = (edge: Edge): Edge => ({
  ...edge,
  type: 'canvas-ref',
  data: {
    ...((edge.data || {}) as Record<string, unknown>),
    originalType: edge.type || 'default',
  },
});

const toSmartDisplayEdge = ({
  edge,
  rawEdge,
  smartEdgePadding,
}: {
  edge: Edge;
  rawEdge: Edge;
  smartEdgePadding: number;
}): Edge => {
  const type = String(edge.type || '');
  const lower = type.toLowerCase();
  const targetType = (lower.includes('smart') || preserveSmartEdgeTypes.has(lower))
    ? edge.type
    : 'advanced-smart-step';

  const data = (edge as any).data;
  const dataObj = (data && typeof data === 'object') ? data : {};
  const edgeConfig = (dataObj as any).edgeConfig;
  const edgeCfgObj = (edgeConfig && typeof edgeConfig === 'object') ? edgeConfig : {};
  const nextLabel = (edge as any).label ?? (dataObj as any).label;

  if (hasTrustedComputedPath(edge)) {
    if (edge.type === 'stablePath' && nextLabel === (edge as any).label && edge === rawEdge) return edge;
    return { ...edge, type: 'stablePath', label: nextLabel } as Edge;
  }

  const hasDataPad = (dataObj as any).obstaclePadding !== undefined && (dataObj as any).obstaclePadding !== null;
  const hasCfgPad = (edgeCfgObj as any).obstaclePadding !== undefined && (edgeCfgObj as any).obstaclePadding !== null;
  const needsPadPatch = !(hasDataPad && hasCfgPad);

  const dataWithPad = needsPadPatch
    ? {
      ...dataObj,
      obstaclePadding: hasDataPad ? (dataObj as any).obstaclePadding : smartEdgePadding,
      edgeConfig: {
        ...edgeCfgObj,
        obstaclePadding: hasCfgPad ? (edgeCfgObj as any).obstaclePadding : smartEdgePadding,
      },
    }
    : dataObj;

  const needsLabelPatch = typeof nextLabel !== 'undefined'
    && ((edge as any).label !== nextLabel || (dataWithPad as any).label !== nextLabel);
  const needsTypePatch = targetType !== edge.type;
  if (!needsPadPatch && !needsLabelPatch && !needsTypePatch && edge === rawEdge) return edge;

  const finalData = needsLabelPatch ? { ...dataWithPad, label: nextLabel } : dataWithPad;
  return { ...edge, type: targetType, data: finalData, label: nextLabel } as Edge;
};

const toBasicDisplayEdge = ({
  edge,
  rawEdge,
}: {
  edge: Edge;
  rawEdge: Edge;
}): Edge => {
  if (hasTrustedComputedPath(edge)) {
    const nextLabel = (edge as any).label ?? ((edge.data && typeof edge.data === 'object') ? (edge.data as any).label : undefined);
    if (edge.type === 'stablePath' && nextLabel === (edge as any).label && edge === rawEdge) return edge;
    return { ...edge, type: 'stablePath', label: nextLabel } as Edge;
  }

  const type = String(edge.type || '');
  const lower = type.toLowerCase();
  const nextType = (() => {
    if (lower === 'advanced-smart-step' || lower === 'smart-step') return 'step';
    if (lower === 'advanced-smart-straight' || lower === 'smart-straight') return 'straight';
    if (lower === 'advanced-smart-bezier' || lower === 'smart-bezier' || lower === 'advanced-smart' || lower === 'smart') return 'bezier';
    return edge.type;
  })();
  const nextLabel = (edge as any).label ?? ((edge.data && typeof edge.data === 'object') ? (edge.data as any).label : undefined);
  if (nextType === edge.type && nextLabel === (edge as any).label && edge === rawEdge) return edge;
  return { ...edge, type: nextType as any, label: nextLabel } as Edge;
};

export const computeBaseReactFlowDisplayEdgeEpoch = ({
  nodes,
  edges,
}: {
  nodes: Node[];
  edges: Edge[];
}): number => {
  let hash = 2166136261;
  const feed = (value: unknown) => {
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  };

  nodes.forEach((node) => {
    const pos = (node as any)?.positionAbsolute ?? node.position ?? { x: 0, y: 0 };
    const measured = (node as any).measured;
    feed(node.id);
    feed(Math.round(Number(pos.x || 0)));
    feed(Math.round(Number(pos.y || 0)));
    feed(Math.round(Number(measured?.width ?? node.width ?? (node.style as any)?.width ?? 0)));
    feed(Math.round(Number(measured?.height ?? node.height ?? (node.style as any)?.height ?? 0)));
  });

  edges.forEach((edge) => {
    feed(edge.id);
    feed(edge.source);
    feed(edge.target);
    feed(edge.sourceHandle);
    feed(edge.targetHandle);
    feed(edge.type);
  });

  return hash >>> 0;
};

export const createBaseReactFlowDisplayEdges = ({
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
  const repairNodes = withDisplayAbsolutePositions(nodes, nodeById);
  const normalizedEdges = edges.map((rawEdge) => normalizeBaseEdge({
    edge: rawEdge,
    nodeById,
    displayEdgeEpoch,
  }));
  const layoutDirection = String((normalizedEdges[0]?.data as any)?.layoutDirection || 'TB');
  const trunkAwareEdges = synthesizeSharedEndpointTrunks(
    separateDetachedParallelOverlaps(
      synthesizeSharedEndpointTrunks(
        repairLocalDoglegArtifacts(
          synthesizeSharedEndpointTrunks(
            repairEndpointOrthogonalPaths(
              repairEndpointOrthogonalPaths(
                separateDetachedParallelOverlaps(
                  reduceEdgeCrossingsWithWaypoints(normalizedEdges, repairNodes, layoutDirection, { onlyNodeRiskEdges: true }),
                  repairNodes,
                ),
                repairNodes,
              ),
              repairNodes,
            ),
          ),
          repairNodes,
        ),
      ),
      repairNodes,
      24,
    ),
  );
  const endpointRepairedEdges = repairEndpointOrthogonalPaths(
    repairEndpointOrthogonalPaths(trunkAwareEdges, repairNodes),
    repairNodes,
  );
  const targetTrunkEdges = synthesizeSharedTargetTrunks(endpointRepairedEdges);
  const finalEndpointRepairedEdges = repairEndpointOrthogonalPaths(
    repairEndpointOrthogonalPaths(targetTrunkEdges, repairNodes),
    repairNodes,
  );
  const sameNodeRoleRepairedEdges = repairEndpointOrthogonalPaths(
    repairSameNodeInOutCrossings(finalEndpointRepairedEdges, repairNodes),
    repairNodes,
  );
  const reverseFlowBypassEdges = repairEndpointOrthogonalPaths(
    repairReverseFlowBypassCrossings(sameNodeRoleRepairedEdges, repairNodes),
    repairNodes,
  );
  const finalCrossingRepairedEdges = repairEndpointOrthogonalPaths(
    repairSharedTrunkAwareCrossings(reverseFlowBypassEdges, repairNodes),
    repairNodes,
  );
  const finalReverseFlowBypassEdges = repairEndpointOrthogonalPaths(
    repairReverseFlowBypassCrossings(finalCrossingRepairedEdges, repairNodes),
    repairNodes,
  );
  const finalDisplayCrossingRepairedEdges = repairEndpointOrthogonalPaths(
    repairSharedTrunkAwareCrossings(finalReverseFlowBypassEdges, repairNodes),
    repairNodes,
  );
  const endpointLaneNudgedEdges = repairEndpointLaneCrossings(
    finalDisplayCrossingRepairedEdges,
    repairNodes,
  );
  const globallyRefinedEdges = repairEndpointOrthogonalPaths(
    refineGlobalEdgeWaypoints(endpointLaneNudgedEdges, repairNodes),
    repairNodes,
  );
  const finalGloballyRefinedEdges = refineGlobalEdgeWaypoints(
    globallyRefinedEdges,
    repairNodes,
  );
  const doglegRepairedEdges = repairLocalDoglegArtifacts(
    finalGloballyRefinedEdges,
    repairNodes,
  );
  const finalCrossingSweepEdges = refineGlobalEdgeWaypoints(
    doglegRepairedEdges,
    repairNodes,
  );
  const repairedEdges = repairLocalDoglegArtifacts(
    finalCrossingSweepEdges,
    repairNodes,
  );

  if (isLargeGraph) {
    return repairedEdges.map((edge) => toCanvasRefEdge(edge));
  }

  if (enableSmartEdges) {
    if (typeof smartEdgePadding !== 'number' || !Number.isFinite(smartEdgePadding)) {
      return repairedEdges;
    }

    return repairedEdges.map((edge, index) => toSmartDisplayEdge({
      edge,
      rawEdge: edges[index],
      smartEdgePadding,
    }));
  }

  return repairedEdges.map((edge, index) => toBasicDisplayEdge({
    edge,
    rawEdge: edges[index],
  }));
};
