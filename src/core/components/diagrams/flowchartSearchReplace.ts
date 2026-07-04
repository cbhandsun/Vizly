import type { Node } from '@xyflow/react';

export const replaceFlowchartNodeLabel = (
    nodes: Node[],
    nodeId: string,
    newLabel: string
): Node[] => nodes.map((node) => {
    if (node.id !== nodeId) {
        return node;
    }

    return {
        ...node,
        data: {
            ...node.data,
            label: newLabel,
        },
    };
});

export const replaceFlowchartNodeLabels = (
    nodes: Node[],
    nodeIds: string[],
    newLabel: string
): Node[] => {
    const idSet = new Set(nodeIds);

    return nodes.map((node) => {
        if (!idSet.has(node.id)) {
            return node;
        }

        return {
            ...node,
            data: {
                ...node.data,
                label: newLabel,
            },
        };
    });
};
