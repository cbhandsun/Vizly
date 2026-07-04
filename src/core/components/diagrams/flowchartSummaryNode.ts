import type { Node } from '@xyflow/react';

const DEFAULT_SUMMARY_OFFSET_X = 300;

const defaultCreateSummaryNodeId = (): string => (
    `node_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
);

export const getFlowchartSummaryAnchor = (
    nodes: Node[],
    sourceIds: string[]
): { x: number; y: number } => {
    let totalX = 0;
    let totalY = 0;
    let count = 0;

    sourceIds.forEach((id) => {
        const node = nodes.find((item) => item.id === id);
        if (!node) {
            return;
        }

        totalX += node.position.x;
        totalY += node.position.y;
        count += 1;
    });

    if (count === 0) {
        return { x: 0, y: 0 };
    }

    return {
        x: totalX / count,
        y: totalY / count,
    };
};

export const createFlowchartSummaryNode = ({
    nodes,
    sourceIds,
    label,
    createNodeId = defaultCreateSummaryNodeId,
}: {
    nodes: Node[];
    sourceIds: string[];
    label: string;
    createNodeId?: () => string;
}): Node => {
    const anchor = getFlowchartSummaryAnchor(nodes, sourceIds);

    return {
        id: createNodeId(),
        type: 'mindmap',
        position: {
            x: anchor.x + DEFAULT_SUMMARY_OFFSET_X,
            y: anchor.y,
        },
        data: {
            label,
            isSummary: true,
            summaryTargets: sourceIds,
            direction: 'L',
        },
    };
};

export const selectOnlyFlowchartSummaryNode = (
    nodes: Node[],
    summaryNodeId: string
): Node[] => (
    nodes.map((node) => ({
        ...node,
        selected: node.id === summaryNodeId,
    }))
);
