import type { Node } from '@xyflow/react';

/**
 * Tracks only explicit collapse state. Node additions, deletions, selection,
 * measurement, and reordering must not trigger a whole-diagram layout.
 */
export const computeFlowchartCollapsedStateHash = (nodes: Node[]): string => (
    nodes
        .filter(node => typeof node.data?.collapsed === 'boolean')
        .map(node => `${node.id}:${node.data?.collapsed ? '1' : '0'}`)
        .sort()
        .join(';')
);
