import type { Node, NodeSelectionChange } from '@xyflow/react';

const MAX_NODE_ID_LENGTH = 1_024;

export const buildShiftMultiSelectionChanges = (
    nodes: readonly Node[],
    clickedNodeId: string,
): NodeSelectionChange[] => {
    if (!clickedNodeId || clickedNodeId.length > MAX_NODE_ID_LENGTH) return [];
    const clickedNode = nodes.find(node => node.id === clickedNodeId);
    if (!clickedNode) return [];

    const changes: NodeSelectionChange[] = [];
    const seenIds = new Set<string>();
    for (const node of nodes) {
        if (!node.id || node.id.length > MAX_NODE_ID_LENGTH || seenIds.has(node.id)) continue;
        seenIds.add(node.id);
        changes.push({
            id: node.id,
            type: 'select',
            selected: node.id === clickedNodeId
                ? !clickedNode.selected
                : node.selected === true,
        });
    }
    return changes;
};
