import type { Edge, Node } from '@xyflow/react';

import {
    createFlowchartSummaryNode,
    selectOnlyFlowchartSummaryNode,
} from './flowchartSummaryNode';

export const runFlowchartSummaryInsert = ({
    nodes,
    edges,
    sourceIds,
    label,
    takeSnapshot,
    appendNode,
    applySelection,
    scheduleSelection,
}: {
    nodes: Node[];
    edges: Edge[];
    sourceIds?: string[];
    label: string;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    appendNode: (node: Node) => void;
    applySelection: (summaryNodeId: string) => void;
    scheduleSelection: (callback: () => void) => void;
}): Node | null => {
    if (!sourceIds || sourceIds.length === 0) {
        return null;
    }

    takeSnapshot(nodes, edges);

    const summaryNode = createFlowchartSummaryNode({
        nodes,
        sourceIds,
        label,
    });

    appendNode(summaryNode);
    scheduleSelection(() => {
        applySelection(summaryNode.id);
    });

    return summaryNode;
};

export const applyFlowchartSummarySelection = (
    nodes: Node[],
    summaryNodeId: string
): Node[] => selectOnlyFlowchartSummaryNode(nodes, summaryNodeId);
