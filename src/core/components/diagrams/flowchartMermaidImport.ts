import type { Edge, Node } from '@xyflow/react';

import { fromMermaid } from '@/core/utils/mermaidConverter';

export const FLOWCHART_MERMAID_LAYOUT_HINT_DELAY_MS = 500;

export type FlowchartMermaidImportPlan = {
    nodes: Node[];
    edges: Edge[];
    layoutHintDelayMs: number;
};

export const buildFlowchartMermaidImportPlan = (
    content: string,
    parseMermaid: (code: string) => { nodes: Node[]; edges: Edge[] } = fromMermaid
): FlowchartMermaidImportPlan => {
    const { nodes, edges } = parseMermaid(content);

    return {
        nodes,
        edges,
        layoutHintDelayMs: FLOWCHART_MERMAID_LAYOUT_HINT_DELAY_MS,
    };
};
