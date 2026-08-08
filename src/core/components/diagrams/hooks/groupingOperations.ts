import type { Edge, Node } from '@xyflow/react';

export interface CreateGroupingPlanOptions {
    nodes: Node[];
    selectedNodes: Node[];
    groupId: string;
    defaultGroupLabel?: string;
    defaultGroupDescription?: string;
    padding?: number;
}

export interface GroupingPlan {
    groupNode: Node;
    nodes: Node[];
}

export interface CreateUngroupingPlanOptions {
    nodes: Node[];
    groupIds: ReadonlySet<string>;
}

const CONTAINER_NODE_TYPES = new Set(['titleGroup', 'subGroup', 'swimlane']);

const readNodeWidth = (node: Node): number => node.measured?.width ?? node.width ?? 100;
const readNodeHeight = (node: Node): number => node.measured?.height ?? node.height ?? 100;

/**
 * Grouping replaces the current node selection with a container selection.
 * React Flow keeps edge selection independently, so clear it explicitly to
 * avoid a stale selected-edge count after grouping or ungrouping.
 */
export const deselectEdgesForGrouping = (edges: Edge[]): Edge[] => (
    edges.some(edge => edge.selected)
        ? edges.map(edge => edge.selected ? { ...edge, selected: false } : edge)
        : edges
);

const insertGroupBeforeChildren = (
    nodes: Node[],
    groupNode: Node,
): Node[] => {
    if (!groupNode.parentId) return [groupNode, ...nodes];

    const parentIndex = nodes.findIndex(node => node.id === groupNode.parentId);
    if (parentIndex < 0) return [groupNode, ...nodes];

    return [
        ...nodes.slice(0, parentIndex + 1),
        groupNode,
        ...nodes.slice(parentIndex + 1),
    ];
};

/**
 * Creates a React Flow-compatible grouping transaction.
 *
 * React Flow requires every parent node to precede its children in the nodes
 * array. Keeping the new container before the reparented nodes prevents the
 * controlled canvas from emitting corrective changes that remove the group.
 */
export const createGroupingPlan = ({
    nodes,
    selectedNodes,
    groupId,
    defaultGroupLabel,
    defaultGroupDescription,
    padding = 40,
}: CreateGroupingPlanOptions): GroupingPlan | null => {
    if (selectedNodes.length < 2 || !groupId) return null;

    const firstParent = selectedNodes[0].parentId;
    if (!selectedNodes.every(node => node.parentId === firstParent)) return null;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    selectedNodes.forEach((node) => {
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + readNodeWidth(node));
        maxY = Math.max(maxY, node.position.y + readNodeHeight(node));
    });

    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;

    const parentNode = firstParent
        ? nodes.find(node => node.id === firstParent)
        : undefined;
    const groupType = parentNode && CONTAINER_NODE_TYPES.has(parentNode.type ?? '')
        ? 'subGroup'
        : 'titleGroup';
    const groupPosition = {
        x: minX - padding,
        y: minY - padding,
    };
    const groupNode: Node = {
        id: groupId,
        type: groupType,
        position: groupPosition,
        ...(firstParent ? { parentId: firstParent } : {}),
        data: {
            label: defaultGroupLabel ?? 'New Group',
            description: defaultGroupDescription ?? 'Grouped Selection',
            domainClass: 'core',
            themeColor: '#3F51B5',
        },
        style: {
            width: maxX - minX + padding * 2,
            height: maxY - minY + padding * 2,
        },
        selected: true,
        zIndex: 0,
    };
    const selectedIds = new Set(selectedNodes.map(node => node.id));
    const reparentedNodes = nodes.map((node) => {
        if (!selectedIds.has(node.id)) return node;
        return {
            ...node,
            parentId: groupId,
            extent: 'parent' as const,
            position: {
                x: node.position.x - groupPosition.x,
                y: node.position.y - groupPosition.y,
            },
            selected: false,
        };
    });

    return {
        groupNode,
        nodes: insertGroupBeforeChildren(reparentedNodes, groupNode),
    };
};

/**
 * Removes one or more containers without leaving descendants attached to a
 * container that is removed by the same transaction. Positions are promoted
 * through every removed ancestor so the rendered canvas location is stable.
 */
export const createUngroupingPlan = ({
    nodes,
    groupIds,
}: CreateUngroupingPlanOptions): Node[] | null => {
    const groupsById = new Map(
        nodes
            .filter(node => groupIds.has(node.id) && CONTAINER_NODE_TYPES.has(node.type ?? ''))
            .map(node => [node.id, node]),
    );
    if (groupsById.size === 0) return null;

    return nodes.flatMap(node => {
        if (groupsById.has(node.id)) return [];
        if (!node.parentId || !groupsById.has(node.parentId)) return [node];

        let x = node.position.x;
        let y = node.position.y;
        let nextParentId: string | undefined = node.parentId;
        const visited = new Set<string>();

        while (nextParentId && groupsById.has(nextParentId)) {
            if (visited.has(nextParentId)) {
                nextParentId = undefined;
                break;
            }
            visited.add(nextParentId);

            const parentGroup = groupsById.get(nextParentId);
            if (!parentGroup) {
                nextParentId = undefined;
                break;
            }
            x += parentGroup.position.x;
            y += parentGroup.position.y;
            nextParentId = parentGroup.parentId;
        }

        const promotedNode: Node = {
            ...node,
            position: { x, y },
        };
        delete promotedNode.parentId;
        delete promotedNode.extent;
        delete promotedNode.expandParent;
        Reflect.deleteProperty(promotedNode, 'parentNode');

        if (nextParentId) {
            promotedNode.parentId = nextParentId;
            promotedNode.extent = 'parent';
        }

        return [promotedNode];
    });
};
