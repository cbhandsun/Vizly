import type { Edge, Node } from '@xyflow/react';

import { toMermaid } from '@/core/utils/mermaidConverter';

export const createFlowchartMermaidFilename = (
    now: number = Date.now()
): string => `flowchart-${now}.mmd`;

export const buildFlowchartMermaidExport = async ({
    nodes,
    edges,
    now = Date.now(),
    stringifyMermaid = toMermaid,
}: {
    nodes: Node[];
    edges: Edge[];
    now?: number;
    stringifyMermaid?: (nodes: Node[], edges: Edge[]) => string;
}): Promise<{
    content: string;
    filename: string;
    mimeType: 'text/markdown';
}> => {
    const content = await stringifyMermaid(nodes, edges);

    return {
        content,
        filename: createFlowchartMermaidFilename(now),
        mimeType: 'text/markdown',
    };
};
