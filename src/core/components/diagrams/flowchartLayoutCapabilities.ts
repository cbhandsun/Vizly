import type { Edge, Node } from '@xyflow/react';

import { isDirectedForestLayoutGraph } from './hooks/treeLayoutTopology';

const NON_LAYOUT_NODE_TYPES = new Set([
    'titleGroup',
    'subGroup',
    'domain',
    'group',
    'mindmap',
    'mindmap-boundary',
    'sticky-note',
]);

export type FlowchartCustomDomainLayoutCapability = Readonly<{
    available: boolean;
    reason: 'available' | 'empty' | 'complex-topology';
}>;

/**
 * Free domain-direction + node-arrangement composition is implemented by the
 * legacy vertical/horizontal engines. Those engines are authoritative only for
 * directed forests; joins, multiple parents, and feedback cycles are routed by
 * the domain-preserving layered presets instead.
 */
export const resolveFlowchartCustomDomainLayoutCapability = (
    nodes: readonly Node[],
    edges: readonly Edge[],
): FlowchartCustomDomainLayoutCapability => {
    const layoutNodes = nodes.filter(node => !NON_LAYOUT_NODE_TYPES.has(node.type ?? ''));
    if (layoutNodes.length === 0) return { available: false, reason: 'empty' };
    if (!isDirectedForestLayoutGraph(layoutNodes, edges)) {
        return { available: false, reason: 'complex-topology' };
    }
    return { available: true, reason: 'available' };
};
