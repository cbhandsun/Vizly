import type { Edge, Node } from '@xyflow/react';

import { getDisplayComputedPath, getDisplayNodeRect } from './baseReactFlowDisplayGeometry';
import { visitBaseReactFlowDisplayInputIdentity } from './baseReactFlowDisplayInputIdentity';

export type BaseReactFlowRoutingChangeReason =
  | 'node-drag'
  | 'node-resize'
  | 'node-add'
  | 'node-remove'
  | 'edge-add'
  | 'edge-remove'
  | 'port-policy'
  | 'container-change'
  | 'layout'
  | 'unknown';

export type BaseReactFlowRoutingChangeSet = Readonly<{
  reason: BaseReactFlowRoutingChangeReason;
  changedNodeIds: string[];
  changedEdgeIds: string[];
  topologyChanged: boolean;
  geometryChanged: boolean;
}>;

export type BaseReactFlowRoutingAffectedClosure = Readonly<{
  mutableEdgeIds: string[];
  contextEdgeIds: string[];
}>;

const fingerprintRoutingItem = (nodes: Node[], edges: Edge[]): string => {
  let hash = 2166136261;
  visitBaseReactFlowDisplayInputIdentity({
    nodes,
    edges,
    enableSmartEdges: true,
    smartEdgePadding: 0,
    isLargeGraph: false,
  }, (value) => {
    const text = `${typeof value}:${String(value ?? '')}`;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  });
  return String(hash >>> 0);
};

const edgeTopologyMatches = (previous: Edge, next: Edge): boolean => (
  previous.source === next.source
  && previous.target === next.target
  && previous.sourceHandle === next.sourceHandle
  && previous.targetHandle === next.targetHandle
  && previous.type === next.type
);

const nodeTopologyMatches = (previous: Node, next: Node): boolean => (
  previous.parentId === next.parentId
  && previous.type === next.type
);

export const createBaseReactFlowRoutingChangeSet = ({
  previousNodes,
  previousEdges,
  nextNodes,
  nextEdges,
  reasonHint = 'unknown',
}: {
  previousNodes: readonly Node[];
  previousEdges: readonly Edge[];
  nextNodes: readonly Node[];
  nextEdges: readonly Edge[];
  reasonHint?: BaseReactFlowRoutingChangeReason;
}): BaseReactFlowRoutingChangeSet => {
  const previousNodesById = new Map(previousNodes.map(node => [node.id, node] as const));
  const nextNodesById = new Map(nextNodes.map(node => [node.id, node] as const));
  const previousEdgesById = new Map(previousEdges.map(edge => [edge.id, edge] as const));
  const nextEdgesById = new Map(nextEdges.map(edge => [edge.id, edge] as const));
  const changedNodeIds = new Set<string>();
  const changedEdgeIds = new Set<string>();
  let topologyChanged = false;
  let hasNodeAddition = false;
  let hasNodeRemoval = false;
  let hasEdgeAddition = false;
  let hasEdgeRemoval = false;

  for (const [nodeId, previous] of previousNodesById) {
    const next = nextNodesById.get(nodeId);
    if (!next) {
      changedNodeIds.add(nodeId);
      topologyChanged = true;
      hasNodeRemoval = true;
      continue;
    }
    if (!nodeTopologyMatches(previous, next)) topologyChanged = true;
    if (
      !nodeTopologyMatches(previous, next)
      || fingerprintRoutingItem([previous], []) !== fingerprintRoutingItem([next], [])
    ) changedNodeIds.add(nodeId);
  }
  for (const nodeId of nextNodesById.keys()) {
    if (previousNodesById.has(nodeId)) continue;
    changedNodeIds.add(nodeId);
    topologyChanged = true;
    hasNodeAddition = true;
  }

  for (const [edgeId, previous] of previousEdgesById) {
    const next = nextEdgesById.get(edgeId);
    if (!next) {
      changedEdgeIds.add(edgeId);
      topologyChanged = true;
      hasEdgeRemoval = true;
      continue;
    }
    if (!edgeTopologyMatches(previous, next)) topologyChanged = true;
    if (
      !edgeTopologyMatches(previous, next)
      || fingerprintRoutingItem([], [previous]) !== fingerprintRoutingItem([], [next])
    ) changedEdgeIds.add(edgeId);
  }
  for (const edgeId of nextEdgesById.keys()) {
    if (previousEdgesById.has(edgeId)) continue;
    changedEdgeIds.add(edgeId);
    topologyChanged = true;
    hasEdgeAddition = true;
  }

  let reason = reasonHint;
  if (hasNodeAddition) reason = 'node-add';
  else if (hasNodeRemoval) reason = 'node-remove';
  else if (hasEdgeAddition) reason = 'edge-add';
  else if (hasEdgeRemoval) reason = 'edge-remove';

  return {
    reason,
    changedNodeIds: [...changedNodeIds].sort(),
    changedEdgeIds: [...changedEdgeIds].sort(),
    topologyChanged,
    geometryChanged: changedNodeIds.size > 0 || changedEdgeIds.size > 0,
  };
};

const rectanglesOverlap = (
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
): boolean => (
  first.x <= second.x + second.width
  && first.x + first.width >= second.x
  && first.y <= second.y + second.height
  && first.y + first.height >= second.y
);

const createSweptNodeRectangles = (
  changedNodeIds: readonly string[],
  previousNodes: readonly Node[],
  nextNodes: readonly Node[],
): Array<{ x: number; y: number; width: number; height: number }> => {
  const previousById = new Map(previousNodes.map(node => [node.id, node] as const));
  const nextById = new Map(nextNodes.map(node => [node.id, node] as const));
  const rectangles: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (const nodeId of changedNodeIds) {
    const previousNode = previousById.get(nodeId);
    const nextNode = nextById.get(nodeId);
    const previousRect = previousNode ? getDisplayNodeRect(previousNode) : null;
    const nextRect = nextNode ? getDisplayNodeRect(nextNode) : null;
    if (!previousRect && !nextRect) continue;
    const left = Math.min(previousRect?.x ?? nextRect?.x ?? 0, nextRect?.x ?? previousRect?.x ?? 0);
    const top = Math.min(previousRect?.y ?? nextRect?.y ?? 0, nextRect?.y ?? previousRect?.y ?? 0);
    const right = Math.max(
      (previousRect?.x ?? 0) + (previousRect?.width ?? 0),
      (nextRect?.x ?? 0) + (nextRect?.width ?? 0),
    );
    const bottom = Math.max(
      (previousRect?.y ?? 0) + (previousRect?.height ?? 0),
      (nextRect?.y ?? 0) + (nextRect?.height ?? 0),
    );
    rectangles.push({
      x: left - 20,
      y: top - 20,
      width: Math.max(0, right - left + 40),
      height: Math.max(0, bottom - top + 40),
    });
  }
  return rectangles;
};

const edgePathIntersectsRectangles = (
  edge: Edge,
  rectangles: readonly { x: number; y: number; width: number; height: number }[],
): boolean => {
  const path = getDisplayComputedPath(edge);
  for (let index = 1; index < path.length; index += 1) {
    const first = path[index - 1];
    const second = path[index];
    if (!first || !second) continue;
    const segmentRect = {
      x: Math.min(first.x, second.x),
      y: Math.min(first.y, second.y),
      width: Math.abs(second.x - first.x),
      height: Math.abs(second.y - first.y),
    };
    if (rectangles.some(rectangle => rectanglesOverlap(segmentRect, rectangle))) return true;
  }
  return false;
};

/**
 * Incident edges are the only initially mutable edges. Siblings and swept-area
 * paths are frozen context, so broad source/target groups cannot silently turn
 * a six-edge node move into a twelve-edge mutation.
 */
export const createBaseReactFlowRoutingAffectedClosure = ({
  changeSet,
  previousNodes,
  nextNodes,
  baselineEdges,
  nextEdges,
}: {
  changeSet: BaseReactFlowRoutingChangeSet;
  previousNodes: readonly Node[];
  nextNodes: readonly Node[];
  baselineEdges: readonly Edge[];
  nextEdges: readonly Edge[];
}): BaseReactFlowRoutingAffectedClosure => {
  const changedNodeIds = new Set(changeSet.changedNodeIds);
  const mutableEdgeIds = new Set(changeSet.changedEdgeIds);
  for (const edge of nextEdges) {
    if (changedNodeIds.has(edge.source) || changedNodeIds.has(edge.target)) {
      mutableEdgeIds.add(edge.id);
    }
  }

  const mutableEdges = nextEdges.filter(edge => mutableEdgeIds.has(edge.id));
  const mutableSources = new Set(mutableEdges.map(edge => edge.source));
  const mutableTargets = new Set(mutableEdges.map(edge => edge.target));
  const sweptRectangles = createSweptNodeRectangles(
    changeSet.changedNodeIds,
    previousNodes,
    nextNodes,
  );
  const contextEdgeIds = new Set<string>();
  for (const edge of baselineEdges) {
    if (mutableEdgeIds.has(edge.id)) continue;
    if (
      mutableSources.has(edge.source)
      || mutableTargets.has(edge.target)
      || edgePathIntersectsRectangles(edge, sweptRectangles)
    ) contextEdgeIds.add(edge.id);
  }

  return {
    mutableEdgeIds: [...mutableEdgeIds].sort(),
    contextEdgeIds: [...contextEdgeIds].sort(),
  };
};
