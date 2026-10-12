import { sanitizeInlineHtml } from '@vizly/core/security';
import { escapeMarkdownInlineText, escapeMarkdownTableCell, escapeMermaidLabel } from '@vizly/core/export';

const MAX_NODES = 1000;
const MAX_EDGES = 2000;
const MAX_TEXT = 65536;
const record = (value: unknown): Record<string, unknown> | null =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown> : null;
const text = (value: unknown): string => typeof value === 'string' ? value.slice(0, MAX_TEXT) : '';

const plainText = (value: unknown): string => {
    const safeHtml = sanitizeInlineHtml(text(value).replace(/<br\s*\/?\s*>/gi, '\n'));
    const document = new DOMParser().parseFromString(safeHtml, 'text/html');
    return (document.body.textContent ?? '').replace(/\r\n?/g, '\n').trim();
};

const escapeHtmlText = (value: string): string => value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tableCell = (value: string): string => escapeMarkdownTableCell(escapeHtmlText(value));
const mermaidLabel = (value: string): string => escapeMermaidLabel(escapeHtmlText(value));

export const buildMarkdownDiagramExport = (value: unknown, title: string, exportedAt: Date): string => {
    const diagram = record(value);
    if (!diagram || !Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
        throw new Error('Invalid diagram for Markdown export');
    }
    const nodes = diagram.nodes.slice(0, MAX_NODES).flatMap((value: unknown) => {
        const node = record(value);
        if (!node || typeof node.id !== 'string' || !node.id.trim()) return [];
        const data = record(node.data);
        const description = plainText(node.description) || plainText(data?.description);
        const label = description.split('\n').find(line => line.trim())
            || plainText(node.label) || plainText(data?.label) || text(node.id);
        return [{
            id: text(node.id), label, description,
            domain: plainText(node.domainClass) || plainText(data?.domainClass)
                || plainText(node.domain) || plainText(node.type) || 'N/A',
        }];
    });
    const byId = new Map(nodes.map((node, index) => [node.id, { ...node, mermaidId: `n${index}` }]));
    const edges = diagram.edges.flatMap((value: unknown) => {
        const edge = record(value);
        if (!edge || typeof edge.source !== 'string' || typeof edge.target !== 'string') return [];
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        return source && target ? [{ source, target, label: plainText(edge.label) }] : [];
    }).slice(0, MAX_EDGES);
    const inventory = nodes.map(node =>
        `| ${tableCell(node.id)} | ${tableCell(node.label)} | ${tableCell(node.domain)} | ${tableCell(node.description)} |`,
    ).join('\n');
    const flows = edges.map(({ source, target, label }) =>
        `- ${tableCell(source.id)} --> ${tableCell(target.id)}${label ? `: ${tableCell(label)}` : ''}`,
    ).join('\n');
    const mermaidNodes = [...byId.values()].map(node =>
        `  ${node.mermaidId}["${mermaidLabel(node.label)}"]`,
    );
    const mermaidEdges = edges.map(({ source, target, label }) => label
        ? `  ${source.mermaidId} -->|"${mermaidLabel(label)}"| ${target.mermaidId}`
        : `  ${source.mermaidId} --> ${target.mermaidId}`);
    return `# Architecture Blueprint: ${escapeMarkdownInlineText(escapeHtmlText(plainText(title) || 'Untitled'))}

## 1. Overview
Exported from Vizly.

## 2. Component Inventory
| ID | Label | Layer (Domain) | Description |
|---|---|---|---|
${inventory}

## 3. Interaction Flows
${flows}

## 4. Logical Visual (Mermaid)
\`\`\`mermaid
graph TD
${[...mermaidNodes, ...mermaidEdges].join('\n')}
\`\`\`

---
*Exported from Vizly - ${exportedAt.toISOString()}*
`;
};
