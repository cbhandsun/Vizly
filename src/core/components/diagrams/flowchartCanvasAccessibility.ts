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

/**
 * Adds bounded screen-reader labels without replacing labels supplied by a caller.
 * React Flow handles keyboard selection and movement when focusability is enabled.
 */
export const addFlowchartAccessibilityLabels = (
    nodes: readonly Node[],
    edges: readonly Edge[],
): AccessibleFlowchartElements => ({
    nodes: nodes.map(node => node.ariaLabel
        ? node
        : { ...node, ariaLabel: resolveNavigatorNodeLabel(node) }),
    edges: edges.map(edge => {
        if (edge.ariaLabel) return edge;
        const label = readEdgeLabel(edge);
        return {
            ...edge,
            ariaLabel: label || `${edge.source} → ${edge.target}`,
        };
    }),
});
