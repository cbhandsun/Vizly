import type { Edge, Node } from '@xyflow/react';

import type { OptimizationResult } from '@/core/services/DiagramIntelligenceService';

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
}): Promise<OptimizationResult> => {
    takeSnapshot(nodes, edges);
    return optimize(nodes, edges);
};
