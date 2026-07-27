import type { Node, XYPosition } from '@xyflow/react';

const CONTAINER_NODE_TYPES = new Set(['titleGroup', 'subGroup', 'swimlane']);
const MINDMAP_HIT_PADDING = 80;

const finiteCoordinate = (value: number): number => (
    Number.isFinite(value) ? value : 0
);

const positionOf = (node: Node): XYPosition => ({
    x: finiteCoordinate(node.position.x),
    y: finiteCoordinate(node.position.y),
});

export const getNodeAbsolutePosition = (
    node: Node,
    nodes: readonly Node[],
): XYPosition => {
    const nodeById = new Map(nodes.map((candidate) => [candidate.id, candidate]));
    const absolute = positionOf(node);
    const visited = new Set<string>([node.id]);
    let parentId = node.parentId;

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = nodeById.get(parentId);
        if (!parent) break;

        const parentPosition = positionOf(parent);
        absolute.x += parentPosition.x;
        absolute.y += parentPosition.y;
        parentId = parent.parentId;
    }

    return absolute;
};

const isDescendantOf = (
    candidate: Node,
    ancestorId: string,
    nodeById: ReadonlyMap<string, Node>,
): boolean => {
    const visited = new Set<string>([candidate.id]);
    let parentId = candidate.parentId;

    while (parentId && !visited.has(parentId)) {
        if (parentId === ancestorId) return true;
        visited.add(parentId);
        parentId = nodeById.get(parentId)?.parentId;
    }

    return false;
};

const nodeSize = (node: Node): { width: number; height: number } => ({
    width: Math.max(0, finiteCoordinate(node.measured?.width ?? node.width ?? 0)),
    height: Math.max(0, finiteCoordinate(node.measured?.height ?? node.height ?? 0)),
});

const containsPoint = (
    candidate: Node,
    point: XYPosition,
    nodes: readonly Node[],
    padding = 0,
): boolean => {
    const absolute = getNodeAbsolutePosition(candidate, nodes);
    const { width, height } = nodeSize(candidate);

    return point.x >= absolute.x - padding
        && point.x <= absolute.x + width + padding
        && point.y >= absolute.y - padding
        && point.y <= absolute.y + height + padding;
};

const parentDepth = (
    node: Node,
    nodeById: ReadonlyMap<string, Node>,
): number => {
    const visited = new Set<string>([node.id]);
    let depth = 0;
    let parentId = node.parentId;

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = nodeById.get(parentId);
        if (!parent) break;
        depth += 1;
        parentId = parent.parentId;
    }

    return depth;
};

export const findNodeParentCandidate = (
    draggedNode: Node,
    nodes: readonly Node[],
): Node | null => {
    const nodeById = new Map(nodes.map((candidate) => [candidate.id, candidate]));
    const draggedAbsolute = getNodeAbsolutePosition(draggedNode, nodes);
    const draggedSize = nodeSize(draggedNode);
    const center = {
        x: draggedAbsolute.x + draggedSize.width / 2,
        y: draggedAbsolute.y + draggedSize.height / 2,
    };

    const candidates = nodes.filter((candidate) => {
        if (candidate.id === draggedNode.id) return false;
        if (isDescendantOf(candidate, draggedNode.id, nodeById)) return false;

        if (draggedNode.type === 'mindmap' && candidate.type === 'mindmap') {
            return containsPoint(candidate, center, nodes, MINDMAP_HIT_PADDING);
        }

        if (draggedNode.type === 'swimlane') return false;
        if (!candidate.type || !CONTAINER_NODE_TYPES.has(candidate.type)) return false;
        return containsPoint(candidate, center, nodes);
    });

    candidates.sort((left, right) => (
        parentDepth(right, nodeById) - parentDepth(left, nodeById)
    ));

    return candidates[0] ?? null;
};

export const findNodeParentPreviewCandidate = (
    draggedNode: Node,
    nodes: readonly Node[],
): Node | null => {
    const candidate = findNodeParentCandidate(draggedNode, nodes);
    return candidate?.id === draggedNode.parentId ? null : candidate;
};

export const mergeDraggedNodesIntoGraph = (
    graphNodes: readonly Node[],
    primaryDraggedNode: Node,
    draggedNodes: readonly Node[],
): Node[] => {
    const draggedById = new Map(
        draggedNodes.map((draggedNode) => [draggedNode.id, draggedNode]),
    );
    draggedById.set(primaryDraggedNode.id, primaryDraggedNode);

    const merged = graphNodes.map((graphNode) => (
        draggedById.get(graphNode.id) ?? graphNode
    ));
    const graphIds = new Set(graphNodes.map((graphNode) => graphNode.id));

    draggedById.forEach((draggedNode, id) => {
        if (!graphIds.has(id)) merged.push(draggedNode);
    });

    return merged;
};
