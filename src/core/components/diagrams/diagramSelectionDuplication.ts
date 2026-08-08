import type { Edge, Node } from '@xyflow/react';

export interface DiagramSelectionDuplicateOptions {
    nodes: readonly Node[];
    edges: readonly Edge[];
    targetIds: ReadonlySet<string>;
    batchId: string;
    offset?: number;
    getDuplicateLabel: (node: Node) => string;
}

export interface DiagramSelectionDuplicateResult {
    nodes: Node[];
    edges: Edge[];
}

const DEFAULT_DUPLICATE_OFFSET = 50;

export const buildDiagramSelectionDuplicate = ({
    nodes,
    edges,
    targetIds,
    batchId,
    offset = DEFAULT_DUPLICATE_OFFSET,
    getDuplicateLabel,
}: DiagramSelectionDuplicateOptions): DiagramSelectionDuplicateResult => {
    const sourceNodes = nodes.filter(node => targetIds.has(node.id));
    if (sourceNodes.length === 0) return { nodes: [], edges: [] };

    const idMap = new Map<string, string>();
    sourceNodes.forEach((node, index) => {
        idMap.set(node.id, `node-copy-${batchId}-${index}`);
    });

    const getDuplicateId = (sourceId: string): string => {
        const duplicateId = idMap.get(sourceId);
        if (!duplicateId) {
            throw new Error(`Missing duplicate mapping for node: ${sourceId}`);
        }
        return duplicateId;
    };

    const duplicatedNodes = sourceNodes.map(node => {
        const duplicatedParentId = node.parentId ? idMap.get(node.parentId) : undefined;
        const staysInsideDuplicatedParent = duplicatedParentId !== undefined;

        return {
            ...node,
            id: getDuplicateId(node.id),
            parentId: duplicatedParentId ?? node.parentId,
            position: staysInsideDuplicatedParent
                ? { ...node.position }
                : { x: node.position.x + offset, y: node.position.y + offset },
            selected: true,
            data: {
                ...node.data,
                label: getDuplicateLabel(node),
            },
        };
    });

    const duplicatedEdges = edges
        .filter(edge => targetIds.has(edge.source) && targetIds.has(edge.target))
        .map((edge, index) => ({
            ...edge,
            id: `edge-copy-${batchId}-${index}`,
            source: getDuplicateId(edge.source),
            target: getDuplicateId(edge.target),
            selected: true,
            data: edge.data ? { ...edge.data } : undefined,
        }));

    return { nodes: duplicatedNodes, edges: duplicatedEdges };
};
