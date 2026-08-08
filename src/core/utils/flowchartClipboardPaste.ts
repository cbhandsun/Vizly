import type { Edge, Node } from '@xyflow/react';

import type { ClipboardData } from './flowchartClipboard';

export interface ClipboardPasteCursor {
    signature: string;
    scope: string;
    sequence: number;
}

export interface FlowchartPasteBatchOptions {
    clipboardData: ClipboardData;
    batchId: string;
    offset: number;
}

export interface FlowchartPasteBatch {
    nodes: Node[];
    edges: Edge[];
}

export const MIN_FLOWCHART_PASTE_STEP = 32;
export const MAX_FLOWCHART_PASTE_STEP = 72;
export const MAX_FLOWCHART_PASTE_SEQUENCE = 100;

const normalizePasteDimension = (value: unknown): number | null => (
    typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.min(value, 10_000)
        : null
);

export const resolveFlowchartPasteOffset = (
    nodes: readonly Node[],
    sequence: number,
): number => {
    const dimensions = nodes.flatMap(node => [
        normalizePasteDimension(node.measured?.width),
        normalizePasteDimension(node.measured?.height),
        normalizePasteDimension(node.width),
        normalizePasteDimension(node.height),
        normalizePasteDimension(node.style?.width),
        normalizePasteDimension(node.style?.height),
    ]).filter((value): value is number => value !== null);
    const largestDimension = dimensions.length > 0 ? Math.max(...dimensions) : 0;
    const step = Math.min(
        MAX_FLOWCHART_PASTE_STEP,
        Math.max(MIN_FLOWCHART_PASTE_STEP, Math.round(largestDimension * 0.16)),
    );
    const normalizedSequence = Number.isFinite(sequence)
        ? Math.min(MAX_FLOWCHART_PASTE_SEQUENCE, Math.max(1, Math.trunc(sequence)))
        : 1;

    return step * normalizedSequence;
};

export const createClipboardTextSignature = (text: string): string => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `${text.length}:${(hash >>> 0).toString(16)}`;
};

export const advanceClipboardPasteCursor = (
    previous: ClipboardPasteCursor | null,
    signature: string,
    scope: string,
): ClipboardPasteCursor => ({
    signature,
    scope,
    sequence: previous?.signature === signature && previous.scope === scope
        ? previous.sequence + 1
        : 1,
});

export const buildFlowchartPasteBatch = ({
    clipboardData,
    batchId,
    offset,
}: FlowchartPasteBatchOptions): FlowchartPasteBatch => {
    const idMap = new Map<string, string>();
    clipboardData.nodes.forEach((node, index) => {
        idMap.set(node.id, `node-paste-${batchId}-${index}`);
    });

    const getPastedNodeId = (sourceId: string): string | null => idMap.get(sourceId) ?? null;

    const nodes = clipboardData.nodes.map(node => {
        const pastedId = getPastedNodeId(node.id);
        if (!pastedId) throw new Error(`Missing pasted node mapping for: ${node.id}`);

        const pastedParentId = node.parentId ? getPastedNodeId(node.parentId) : null;
        const remainsInsidePastedParent = pastedParentId !== null;

        const pastedNode: Node = {
            ...node,
            id: pastedId,
            parentId: pastedParentId ?? undefined,
            position: remainsInsidePastedParent
                ? { ...node.position }
                : { x: node.position.x + offset, y: node.position.y + offset },
            selected: true,
            data: { ...node.data },
        };

        Reflect.deleteProperty(pastedNode, 'parentNode');
        if (!remainsInsidePastedParent) {
            delete pastedNode.parentId;
            delete pastedNode.extent;
            delete pastedNode.expandParent;
        }

        return pastedNode;
    });

    const edges = clipboardData.edges.flatMap((edge, index) => {
        const source = getPastedNodeId(edge.source);
        const target = getPastedNodeId(edge.target);
        if (!source || !target) return [];

        return [{
            ...edge,
            id: `edge-paste-${batchId}-${index}`,
            source,
            target,
            selected: true,
            data: edge.data ? { ...edge.data } : undefined,
        }];
    });

    return { nodes, edges };
};
