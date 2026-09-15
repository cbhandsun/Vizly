import type { Edge, Node } from '@xyflow/react';

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const edgeIdentityValue = (value: unknown): string => (
    typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
);

const restoredCanvasEdgeIdentity = (edge: Edge): string => {
    const data = isRecord(edge.data) ? edge.data : {};
    return [
        edge.source,
        edge.target,
        edgeIdentityValue(edge.sourceHandle),
        edgeIdentityValue(edge.targetHandle),
        edgeIdentityValue(edge.type),
        edgeIdentityValue(edge.label),
        edgeIdentityValue(data.relationKey),
        edgeIdentityValue(data.relationType),
        edgeIdentityValue(data.kind),
    ].join('\u001f');
};

export const sanitizeCanvasEdgesForNodes = (
    nodes: readonly Node[],
    edges: readonly Edge[],
): Edge[] => {
    const nodeIds = new Set(nodes.map(node => node.id));
    const edgeIds = new Set<string>();
    const identities = new Set<string>();
    const sanitized: Edge[] = [];
    for (const edge of edges) {
        if (
            !edge.id
            || edgeIds.has(edge.id)
            || !nodeIds.has(edge.source)
            || !nodeIds.has(edge.target)
        ) {
            continue;
        }
        const identity = restoredCanvasEdgeIdentity(edge);
        if (identities.has(identity)) continue;
        edgeIds.add(edge.id);
        identities.add(identity);
        sanitized.push(edge);
    }
    return sanitized;
};
