import type { Edge, Node } from '@xyflow/react';

import { downloadFile } from '../../../utils/downloadUtils';

const plainTextLabel = (value: unknown): string => String(value ?? 'Untitled')
    .replace(/<[^>]+>/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 500) || 'Untitled';

export const exportMindMapToMarkdown = (nodes: Node[], edges: Edge[]): string => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const childrenMap = new Map<string, string[]>();
    for (const edge of edges) {
        if (edge.type === 'relationshipEdge') continue;
        const children = childrenMap.get(edge.source) ?? [];
        children.push(edge.target);
        childrenMap.set(edge.source, children);
    }
    const root = nodes.find((node) => (
        node.type === 'mindmap'
        && (node.data?.depth === 0 || node.data?.depth === undefined)
    ));
    if (!root) return '';

    const lines: string[] = [];
    const visited = new Set<string>();
    const visit = (nodeId: string, depth: number): void => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        const node = nodeMap.get(nodeId);
        if (!node) return;
        const label = plainTextLabel(node.data?.label);
        lines.push(depth === 0 ? `# ${label}` : `${'  '.repeat(depth - 1)}- ${label}`);
        const children = [...(childrenMap.get(nodeId) ?? [])].sort((left, right) => (
            (nodeMap.get(left)?.position?.y ?? 0) - (nodeMap.get(right)?.position?.y ?? 0)
        ));
        children.forEach((childId) => visit(childId, depth + 1));
    };
    visit(root.id, 0);
    return lines.join('\n');
};

export const downloadMindMapMarkdown = (nodes: Node[], edges: Edge[]): boolean => {
    const markdown = exportMindMapToMarkdown(nodes, edges);
    if (!markdown) return false;
    const rootLabel = nodes.find((node) => (
        node.type === 'mindmap' && node.data?.depth === 0
    ))?.data?.label;
    const filename = plainTextLabel(rootLabel ?? 'mindmap')
        .replace(/[^a-zA-Z0-9一-龥]/g, '_')
        .slice(0, 40) || 'mindmap';
    downloadFile(markdown, `${filename}.md`, 'text/markdown');
    return true;
};
