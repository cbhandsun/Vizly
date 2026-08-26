import type { Edge, Node } from '@xyflow/react';

import { withDisplayAbsolutePositions } from './baseReactFlowAbsolutePositions';
import {
  getDisplayComputedPath,
  getDisplayNodeRect,
  withDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';

const RIGID_MOVE_EPSILON = 0.01;
const MAX_RIGID_MOVE_DISTANCE = 1_000_000;
const MAX_RIGID_PATH_POINTS = 512;

const nearlyEqual = (first: number, second: number): boolean => (
  Math.abs(first - second) <= RIGID_MOVE_EPSILON
);

const resolveAbsoluteNodes = (nodes: Node[]): Map<string, Node> => {
  const sourceById = new Map(nodes.map(node => [node.id, node] as const));
  return new Map(
    withDisplayAbsolutePositions(nodes, sourceById)
      .map(node => [node.id, node] as const),
  );
};

const readUnchangedNodeTranslation = ({
  nodeId,
  baselineNodesById,
  nextNodesById,
}: {
  nodeId: string;
  baselineNodesById: ReadonlyMap<string, Node>;
  nextNodesById: ReadonlyMap<string, Node>;
}): { x: number; y: number } | null => {
  const baselineNode = baselineNodesById.get(nodeId);
  const nextNode = nextNodesById.get(nodeId);
  if (!baselineNode || !nextNode) return null;
  const baselineRect = getDisplayNodeRect(baselineNode);
  const nextRect = getDisplayNodeRect(nextNode);
  if (
    !baselineRect
    || !nextRect
    || !nearlyEqual(baselineRect.width, nextRect.width)
    || !nearlyEqual(baselineRect.height, nextRect.height)
  ) return null;
  const x = nextRect.x - baselineRect.x;
  const y = nextRect.y - baselineRect.y;
  if (
    !Number.isFinite(x)
    || !Number.isFinite(y)
    || Math.abs(x) > MAX_RIGID_MOVE_DISTANCE
    || Math.abs(y) > MAX_RIGID_MOVE_DISTANCE
  ) return null;
  return { x, y };
};

export type BaseReactFlowRigidMoveSeed = Readonly<{
  edges: Edge[];
  rigidEdgeIds: string[];
}>;

/**
 * Translates committed paths whose two terminals moved by the same finite
 * delta. This preserves a hard-clean internal corridor when an entire
 * compound subtree moves; boundary edges remain available for reconnect.
 * The caller must already have proved that edge topology is unchanged.
 */
export const createBaseReactFlowRigidMoveSeed = ({
  baselineEdges,
  baselineNodes,
  nextNodes,
  changedNodeIds,
  mutableEdgeIds,
}: {
  baselineEdges: Edge[];
  baselineNodes: Node[];
  nextNodes: Node[];
  changedNodeIds: readonly string[];
  mutableEdgeIds: readonly string[];
}): BaseReactFlowRigidMoveSeed => {
  const changedIds = new Set(changedNodeIds);
  const mutableIds = new Set(mutableEdgeIds);
  const baselineNodesById = resolveAbsoluteNodes(baselineNodes);
  const nextNodesById = resolveAbsoluteNodes(nextNodes);
  const rigidEdgeIds: string[] = [];
  let changed = false;
  const edges = baselineEdges.map((edge) => {
    if (
      !mutableIds.has(edge.id)
      || !changedIds.has(edge.source)
      || !changedIds.has(edge.target)
    ) return edge;
    const sourceDelta = readUnchangedNodeTranslation({
      nodeId: edge.source,
      baselineNodesById,
      nextNodesById,
    });
    const targetDelta = readUnchangedNodeTranslation({
      nodeId: edge.target,
      baselineNodesById,
      nextNodesById,
    });
    if (
      !sourceDelta
      || !targetDelta
      || !nearlyEqual(sourceDelta.x, targetDelta.x)
      || !nearlyEqual(sourceDelta.y, targetDelta.y)
      || (nearlyEqual(sourceDelta.x, 0) && nearlyEqual(sourceDelta.y, 0))
    ) return edge;
    const path = getDisplayComputedPath(edge);
    if (path.length < 2 || path.length > MAX_RIGID_PATH_POINTS) return edge;
    const translatedPath = path.map(point => ({
      x: point.x + sourceDelta.x,
      y: point.y + sourceDelta.y,
    }));
    if (!translatedPath.every(point => (
      Number.isFinite(point.x) && Number.isFinite(point.y)
    ))) return edge;
    changed = true;
    rigidEdgeIds.push(edge.id);
    return withDisplayComputedPath(edge, translatedPath);
  });
  return {
    edges: changed ? edges : baselineEdges,
    rigidEdgeIds,
  };
};
