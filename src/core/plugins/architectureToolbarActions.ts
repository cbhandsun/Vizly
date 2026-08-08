import type { Edge, Node } from '@xyflow/react';

export type ArchitectureRelationshipPlan =
    | { status: 'selection-required'; selectedCount: number }
    | { status: 'duplicate'; sourceId: string; targetId: string }
    | { status: 'ready'; sourceId: string; targetId: string };

export interface ArchitectureRelationshipPlanOptions {
    nodes: Node[];
    edges: Edge[];
}

/** Resolves the toolbar action without mutating diagram state. */
export const buildArchitectureRelationshipPlan = ({
    nodes,
    edges,
}: ArchitectureRelationshipPlanOptions): ArchitectureRelationshipPlan => {
    const selectedNodes = nodes.filter(node => node.selected === true);
    if (selectedNodes.length !== 2) {
        return { status: 'selection-required', selectedCount: selectedNodes.length };
    }

    const [sourceNode, targetNode] = selectedNodes;
    const duplicate = edges.some(edge => (
        edge.source === sourceNode.id && edge.target === targetNode.id
    ));
    if (duplicate) {
        return {
            status: 'duplicate',
            sourceId: sourceNode.id,
            targetId: targetNode.id,
        };
    }

    return {
        status: 'ready',
        sourceId: sourceNode.id,
        targetId: targetNode.id,
    };
};

export const createArchitectureRelationshipEdge = ({
    id,
    sourceId,
    targetId,
    label,
}: {
    id: string;
    sourceId: string;
    targetId: string;
    label: string;
}): Edge => ({
    id,
    source: sourceId,
    target: targetId,
    type: 'archEdge',
    selected: true,
    data: { semantic: 'dependency', label },
});
