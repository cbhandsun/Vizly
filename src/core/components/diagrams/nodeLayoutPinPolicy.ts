import type { Node } from '@xyflow/react';

export type LayoutPinnableNode = Pick<Node, 'data'>;

export const isNodeLayoutPinned = (node: LayoutPinnableNode): boolean => (
    node.data?.fixed === true
);

export const areAllNodesLayoutPinned = (nodes: readonly LayoutPinnableNode[]): boolean => (
    nodes.length > 0 && nodes.every(isNodeLayoutPinned)
);

export const applyNodeLayoutPinnedState = (
    nodes: Node[],
    targetIds: ReadonlySet<string>,
    fixed: boolean,
): { nodes: Node[]; changed: boolean } => {
    let changed = false;
    const nextNodes = nodes.map(node => {
        if (!targetIds.has(node.id)) return node;
        if (node.data?.fixed === fixed) return node;

        changed = true;
        return {
            ...node,
            data: { ...node.data, fixed },
        };
    });

    return { nodes: changed ? nextNodes : nodes, changed };
};
