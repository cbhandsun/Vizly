import type { Edge, Node } from '@xyflow/react';

import { resolveNavigatorNodeLabel } from './navigatorNodePresentation';

const MAX_EDGE_LABEL_LENGTH = 256;

const readEdgeLabel = (edge: Edge): string => {
    const data = edge.data;
    const dataLabel = data && typeof data === 'object' && !Array.isArray(data)
        ? data.label
        : undefined;
    const candidate = typeof dataLabel === 'string'
        ? dataLabel
        : typeof edge.label === 'string'
            ? edge.label
            : '';

    return candidate.trim().replace(/\s+/g, ' ').slice(0, MAX_EDGE_LABEL_LENGTH);
};

export interface AccessibleFlowchartElements {
    nodes: Node[];
    edges: Edge[];
}

export interface FlowchartAccessibilityProjectionCache {
    nodes: WeakMap<Node, Node>;
    edges: WeakMap<Edge, Edge>;
}

export const createFlowchartAccessibilityProjectionCache = (
): FlowchartAccessibilityProjectionCache => ({
    nodes: new WeakMap<Node, Node>(),
    edges: new WeakMap<Edge, Edge>(),
});

export const addFlowchartNodeAccessibilityLabels = (
    nodes: readonly Node[],
    cache?: FlowchartAccessibilityProjectionCache['nodes'],
): Node[] => nodes.map(node => {
    if (node.ariaLabel) return node;
    const ariaLabel = resolveNavigatorNodeLabel(node);
    const cached = cache?.get(node);
    if (cached?.ariaLabel === ariaLabel) return cached;
    const projected = { ...node, ariaLabel };
    cache?.set(node, projected);
    return projected;
});

export const addFlowchartEdgeAccessibilityLabels = (
    edges: readonly Edge[],
    cache?: FlowchartAccessibilityProjectionCache['edges'],
): Edge[] => edges.map(edge => {
    if (edge.ariaLabel) return edge;
    const label = readEdgeLabel(edge);
    const ariaLabel = label || `${edge.source} → ${edge.target}`;
    const cached = cache?.get(edge);
    if (cached?.ariaLabel === ariaLabel) return cached;
    const projected = { ...edge, ariaLabel };
    cache?.set(edge, projected);
    return projected;
});

/**
 * Adds bounded screen-reader labels without replacing labels supplied by a caller.
 * React Flow handles keyboard selection and movement when focusability is enabled.
 */
export const addFlowchartAccessibilityLabels = (
    nodes: readonly Node[],
    edges: readonly Edge[],
    cache?: FlowchartAccessibilityProjectionCache,
): AccessibleFlowchartElements => ({
    nodes: addFlowchartNodeAccessibilityLabels(nodes, cache?.nodes),
    edges: addFlowchartEdgeAccessibilityLabels(edges, cache?.edges),
});
