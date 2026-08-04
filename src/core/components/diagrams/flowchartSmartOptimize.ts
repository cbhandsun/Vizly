import type { Edge, Node } from '@xyflow/react';

import type { OptimizationResult } from '@/core/services/DiagramIntelligenceService';
import { isNodeMutationLocked } from './nodeLockPolicy';

export type FlowchartSmartOptimizeOutcome =
    | { status: 'empty'; result: null }
    | { status: 'unchanged' | 'applied'; result: OptimizationResult };

const cloneNodeForOptimization = (node: Node): Node => ({
    ...node,
    position: { ...node.position },
});

const cloneEdgeForOptimization = (edge: Edge): Edge => ({ ...edge });

const nodePositionChanged = (before: Node, after: Node | undefined): boolean => (
    !after
    || before.position.x !== after.position.x
    || before.position.y !== after.position.y
);

export const runFlowchartSmartOptimize = async ({
    nodes,
    edges,
    takeSnapshot,
    optimize,
}: {
    nodes: Node[];
    edges: Edge[];
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    optimize: (nodes: Node[], edges: Edge[]) => Promise<OptimizationResult>;
}): Promise<FlowchartSmartOptimizeOutcome> => {
    if (nodes.length === 0) return { status: 'empty', result: null };

    const lockedNodes = nodes.filter(isNodeMutationLocked);
    const editableNodes = nodes.filter(node => !isNodeMutationLocked(node));
    if (editableNodes.length === 0) {
        return {
            status: 'unchanged',
            result: {
                nodes,
                edges,
                stats: { rectifiedOverlaps: 0, alignedNodes: 0 },
            },
        };
    }

    // Place protected nodes first so overlap resolution moves editable peers,
    // then run on clones so a failed optimizer cannot mutate live canvas state.
    const optimizationNodes = [...lockedNodes, ...editableNodes].map(cloneNodeForOptimization);
    const optimizationEdges = edges.map(cloneEdgeForOptimization);
    const optimized = await optimize(optimizationNodes, optimizationEdges);
    const optimizedById = new Map(optimized.nodes.map(node => [node.id, node]));
    const result: OptimizationResult = {
        ...optimized,
        nodes: nodes.map(node => (
            isNodeMutationLocked(node)
                ? cloneNodeForOptimization(node)
                : (optimizedById.get(node.id) ?? cloneNodeForOptimization(node))
        )),
    };

    const changed = nodes.some((node, index) => nodePositionChanged(node, result.nodes[index]));
    if (!changed) return { status: 'unchanged', result };

    takeSnapshot(nodes, edges);
    return { status: 'applied', result };
};
