import type { Node } from '@xyflow/react';

import type { SnapDelta } from '../../../hooks/useSmartGuides';
import { findNodeParentCandidate, getNodeAbsolutePosition } from './diagramNodeParenting';

const CONTAINER_PADDING = 24;

const finiteDimension = (value: unknown, fallback: number): number => (
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
);

const nodeSize = (node: Node): { width: number; height: number } => ({
    width: finiteDimension(node.measured?.width ?? node.width, 140),
    height: finiteDimension(node.measured?.height ?? node.height, 70),
});

const wouldCreateParentCycle = (
    childId: string,
    parentId: string,
    nodeById: ReadonlyMap<string, Node>,
): boolean => {
    const visited = new Set<string>();
    let currentId: string | undefined = parentId;

    while (currentId && !visited.has(currentId)) {
        if (currentId === childId) return true;
        visited.add(currentId);
        currentId = nodeById.get(currentId)?.parentId;
    }

    return false;
};

export const collectDraggedNodeIds = (
    primaryNode: Node,
    draggedNodes: readonly Node[],
): string[] => Array.from(new Set([
    primaryNode.id,
    ...draggedNodes.map(node => node.id),
]));

export interface DraggedNodeParentGroup {
    parentCandidate: Node;
    draggedNodeIds: string[];
}

export const resolveDraggedNodeParenting = (
    graphNodes: readonly Node[],
    draggedNodeIds: readonly string[],
): { containerGroups: DraggedNodeParentGroup[]; canvasNodeIds: string[] } => {
    const graphById = new Map(graphNodes.map(node => [node.id, node]));
    const groupsByParentId = new Map<string, DraggedNodeParentGroup>();
    const canvasNodeIds: string[] = [];

    for (const id of draggedNodeIds) {
        const source = graphById.get(id);
        if (!source) continue;
        const parentCandidate = findNodeParentCandidate(source, graphNodes);
        if (!parentCandidate) {
            canvasNodeIds.push(id);
            continue;
        }

        const existing = groupsByParentId.get(parentCandidate.id);
        if (existing) {
            existing.draggedNodeIds.push(id);
        } else {
            groupsByParentId.set(parentCandidate.id, {
                parentCandidate,
                draggedNodeIds: [id],
            });
        }
    }

    return {
        containerGroups: Array.from(groupsByParentId.values()),
        canvasNodeIds,
    };
};

interface ContainerDropInput {
    nodes: Node[];
    graphNodes: readonly Node[];
    draggedNodeIds: readonly string[];
    parentCandidate: Node;
    snapDelta: SnapDelta | null;
}

export const applyContainerDrop = ({
    nodes,
    graphNodes,
    draggedNodeIds,
    parentCandidate,
    snapDelta,
}: ContainerDropInput): Node[] => {
    const graphById = new Map(graphNodes.map(node => [node.id, node]));
    const draggedIds = new Set(draggedNodeIds);
    const parent = graphById.get(parentCandidate.id) ?? parentCandidate;
    const parentAbsolute = getNodeAbsolutePosition(parent, graphNodes);
    const relativePositions = new Map<string, { x: number; y: number }>();
    let neededWidth = finiteDimension(
        parent.style?.width ?? parent.measured?.width ?? parent.width,
        400,
    );
    let neededHeight = finiteDimension(
        parent.style?.height ?? parent.measured?.height ?? parent.height,
        300,
    );

    for (const id of draggedIds) {
        const source = graphById.get(id);
        if (!source || source.id === parent.id || source.type === 'swimlane') continue;
        if (wouldCreateParentCycle(source.id, parent.id, graphById)) continue;

        const absolute = getNodeAbsolutePosition(source, graphNodes);
        const position = {
            x: absolute.x - parentAbsolute.x + (snapDelta?.x ?? 0),
            y: absolute.y - parentAbsolute.y + (snapDelta?.y ?? 0),
        };
        const size = nodeSize(source);

        relativePositions.set(id, position);
        neededWidth = Math.max(neededWidth, position.x + size.width + CONTAINER_PADDING);
        neededHeight = Math.max(neededHeight, position.y + size.height + CONTAINER_PADDING);
    }

    let changed = false;
    const nextNodes = nodes.map((node): Node => {
        const position = relativePositions.get(node.id);
        if (position) {
            const domain = parent.data.domain || parent.data.domainClass;
            if (
                node.parentId === parent.id
                && node.extent === 'parent'
                && node.position.x === position.x
                && node.position.y === position.y
                && node.data.domain === domain
            ) {
                return node;
            }
            changed = true;
            return {
                ...node,
                parentId: parent.id,
                extent: 'parent',
                position,
                data: {
                    ...node.data,
                    domain,
                },
            };
        }

        if (node.id === parent.id) {
            const currentWidth = finiteDimension(
                node.style?.width ?? node.measured?.width ?? node.width,
                400,
            );
            const currentHeight = finiteDimension(
                node.style?.height ?? node.measured?.height ?? node.height,
                300,
            );
            if (neededWidth > currentWidth || neededHeight > currentHeight) {
                changed = true;
                return {
                    ...node,
                    style: {
                        ...node.style,
                        width: Math.max(currentWidth, neededWidth),
                        height: Math.max(currentHeight, neededHeight),
                    },
                };
            }
        }

        return node;
    });
    return changed ? nextNodes : nodes;
};

interface CanvasDropInput {
    nodes: readonly Node[];
    graphNodes: readonly Node[];
    draggedNodeIds: readonly string[];
    snapDelta: SnapDelta | null;
}

export const detachDraggedNodesFromParents = ({
    nodes,
    graphNodes,
    draggedNodeIds,
    snapDelta,
}: CanvasDropInput): Node[] => {
    const graphById = new Map(graphNodes.map(node => [node.id, node]));
    const draggedIds = new Set(draggedNodeIds);

    return nodes.map(node => {
        if (!draggedIds.has(node.id)) return node;
        const source = graphById.get(node.id) ?? node;
        if (!source.parentId) return node;

        const absolute = getNodeAbsolutePosition(source, graphNodes);
        const { parentId: _parentId, extent: _extent, ...rest } = node;
        return {
            ...rest,
            position: {
                x: absolute.x + (snapDelta?.x ?? 0),
                y: absolute.y + (snapDelta?.y ?? 0),
            },
        };
    });
};

export const applySnapDeltaToNodes = (
    nodes: readonly Node[],
    nodeIds: ReadonlySet<string>,
    snapDelta: SnapDelta,
): Node[] => nodes.map(node => (
    nodeIds.has(node.id)
        ? {
            ...node,
            position: {
                x: node.position.x + snapDelta.x,
                y: node.position.y + snapDelta.y,
            },
        }
        : node
));
