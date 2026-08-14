import type { Edge, Node } from '@xyflow/react';
import jsonpatch from 'fast-json-patch';

import { shouldPreservePageCopyNodeId } from './pageCanvasMetadata';

const { deepClone } = jsonpatch;

export interface DuplicatedPageCanvas {
    nodes: Node[];
    edges: Edge[];
}

/**
 * Clones one page into an isolated React Flow graph.
 *
 * Page copies must not share node IDs or nested data references with their
 * source page because both pages can be edited and persisted independently.
 */
export const duplicatePageCanvas = (
    nodes: readonly Node[],
    edges: readonly Edge[],
    batchId: string,
): DuplicatedPageCanvas => {
    const cloned = deepClone({ nodes, edges }) as DuplicatedPageCanvas;
    const nodeIds = new Map<string, string>();

    cloned.nodes.forEach((node, index) => {
        nodeIds.set(
            node.id,
            shouldPreservePageCopyNodeId(node.data)
                ? node.id
                : `node-page-copy-${batchId}-${index}`,
        );
    });

    const duplicatedNodes = cloned.nodes.map(node => {
        const duplicatedParentId = node.parentId ? nodeIds.get(node.parentId) : undefined;
        const duplicatedNode: Node = {
            ...node,
            id: nodeIds.get(node.id) ?? `node-page-copy-${batchId}-missing`,
            position: { ...node.position },
            selected: false,
            data: { ...node.data },
        };

        Reflect.deleteProperty(duplicatedNode, 'parentNode');
        if (duplicatedParentId) {
            duplicatedNode.parentId = duplicatedParentId;
        } else {
            delete duplicatedNode.parentId;
            delete duplicatedNode.extent;
            delete duplicatedNode.expandParent;
        }
        return duplicatedNode;
    });

    const duplicatedEdges = cloned.edges.map((edge, index) => {
        const source = nodeIds.get(edge.source);
        const target = nodeIds.get(edge.target);
        if (!source || !target) {
            throw new Error(`Cannot duplicate edge ${edge.id}: endpoint is missing from the page`);
        }

        return {
            ...edge,
            id: `edge-page-copy-${batchId}-${index}`,
            source,
            target,
            selected: false,
            data: edge.data ? { ...edge.data } : undefined,
        };
    });

    return { nodes: duplicatedNodes, edges: duplicatedEdges };
};
