import type { Edge, EdgeSelectionChange, Node, NodeSelectionChange } from '@xyflow/react';

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

export const buildShiftEdgeMultiSelectionChanges = (
    edges: readonly Edge[],
    clickedEdgeId: string,
): EdgeSelectionChange[] => {
    if (!clickedEdgeId || clickedEdgeId.length > MAX_NODE_ID_LENGTH) return [];
    const clickedEdge = edges.find(edge => edge.id === clickedEdgeId);
    if (!clickedEdge) return [];

    const changes: EdgeSelectionChange[] = [];
    const seenIds = new Set<string>();
    for (const edge of edges) {
        if (!edge.id || edge.id.length > MAX_NODE_ID_LENGTH || seenIds.has(edge.id)) continue;
        seenIds.add(edge.id);
        changes.push({
            id: edge.id,
            type: 'select',
            selected: edge.id === clickedEdgeId
                ? !clickedEdge.selected
                : edge.selected === true,
        });
    }
    return changes;
};
