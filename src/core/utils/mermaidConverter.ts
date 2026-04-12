import { Node, Edge, MarkerType } from '@xyflow/react';

/**
 * mermaidConverter — 双向转换 React Flow ↔ Mermaid flowchart 语法
 *
 * toMermaid:   nodes + edges → Mermaid 字符串
 * fromMermaid: Mermaid 字符串 → { nodes, edges }
 */

// ─── 导出：React Flow → Mermaid ──────────────────────────

const SHAPE_TO_MERMAID: Record<string, [string, string]> = {
    // [openBracket, closeBracket]
    'rectangle': ['[', ']'],
    'pill': ['([', '])'],
    'diamond': ['{', '}'],
    'circle': ['((', '))'],
    'ellipse': ['([', '])'],
    'hexagon': ['{{', '}}'],
    'parallelogram': ['[/', '/]'],
    'database': ['[(', ')]'],
    'trapezoid': ['[/', '\\]'],
    'note': ['>', ']'],
    'cloud': [')', ')'],      // Mermaid doesn't have cloud; use stadium
};

function sanitizeId(id: string): string {
    // Mermaid IDs: alphanumeric + underscores
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeLabel(label: string): string {
    // Mermaid uses " to quote labels with special chars
    return `"${label.replace(/"/g, '#quot;')}"`;
}

function getNodeShape(node: Node): [string, string] {
    const shape = (node.data as any)?.shape as string | undefined;
    return SHAPE_TO_MERMAID[shape || 'rectangle'] || ['[', ']'];
}

function getEdgeStyle(edge: Edge): string {
    const isDashed = edge.style?.strokeDasharray;
    const hasArrow = edge.markerEnd != null;
    const hasStartArrow = edge.markerStart != null;

    if (hasStartArrow && hasArrow) return isDashed ? '<-.->' : '<-->';
    if (hasArrow) return isDashed ? '-.->' : '-->';
    if (isDashed) return '-.-';
    return '---';
}

export function toMermaid(
    nodes: Node[],
    edges: Edge[],
    options: { direction?: 'TB' | 'LR' | 'TD' | 'BT' | 'RL' } = {}
): string {
    const direction = options.direction ?? 'TD';
    const lines: string[] = [];

    lines.push(`flowchart ${direction}`);

    // Container groups (TitleGroup/SubGroup → subgraph)
    const containerTypes = new Set(['titleGroup', 'subGroup', 'swimlane', 'group']);
    const containers = nodes.filter(n => containerTypes.has(n.type || ''));
    const normalNodes = nodes.filter(n => !containerTypes.has(n.type || ''));

    // Map parentId → children
    const childrenByParent = new Map<string, Node[]>();
    normalNodes.forEach(n => {
        const parentId = (n as any).parentId;
        if (parentId) {
            const list = childrenByParent.get(parentId) || [];
            list.push(n);
            childrenByParent.set(parentId, list);
        }
    });

    // Render top-level nodes (no parent)
    const topLevelNodes = normalNodes.filter(n => !(n as any).parentId);

    // Render subgraphs (containers)
    containers.forEach(c => {
        const label = (c.data as any)?.label || (c.data as any)?.description || c.id;
        const mermaidId = sanitizeId(c.id);
        lines.push(`    subgraph ${mermaidId}[${escapeLabel(label)}]`);

        const children = childrenByParent.get(c.id) || [];
        children.forEach(child => {
            lines.push(`        ${renderNode(child)}`);
        });

        lines.push('    end');
    });

    // Render top-level nodes
    topLevelNodes.forEach(n => {
        lines.push(`    ${renderNode(n)}`);
    });

    // Render edges
    edges.forEach(e => {
        const srcId = sanitizeId(e.source);
        const tgtId = sanitizeId(e.target);
        const arrow = getEdgeStyle(e);
        const label = (e.data as any)?.label || e.label;
        if (label) {
            lines.push(`    ${srcId} ${arrow}|${escapeLabel(String(label))}| ${tgtId}`);
        } else {
            lines.push(`    ${srcId} ${arrow} ${tgtId}`);
        }
    });

    return lines.join('\n');
}

function renderNode(node: Node): string {
    const id = sanitizeId(node.id);
    const label = (node.data as any)?.label || node.id;
    const [open, close] = getNodeShape(node);
    return `${id}${open}${escapeLabel(label)}${close}`;
}

// ─── 导入：Mermaid → React Flow ──────────────────────────

interface ParsedGraph {
    nodes: Node[];
    edges: Edge[];
}

const BRACKET_TO_SHAPE: [RegExp, string][] = [
    [/^\(\((.+)\)\)$/, 'circle'],
    [/^\(\[(.+)\]\)$/, 'pill'],
    [/^\{(.+)\}$/, 'diamond'],
    [/^\{\{(.+)\}\}$/, 'hexagon'],
    [/^\[\/(.+)\/\]$/, 'parallelogram'],
    [/^\[\((.+)\)\]$/, 'database'],
    [/^>(.+)\]$/, 'note'],
    [/^\[(.+)\]$/, 'rectangle'],
];

function parseNodeDef(text: string): { id: string; label: string; shape: string } | null {
    // Match: id[label], id{label}, id((label)), etc.
    const idMatch = text.match(/^([a-zA-Z0-9_]+)([\[\(\{<>].*)/);
    if (!idMatch) return null;

    const id = idMatch[1];
    const bracketPart = idMatch[2];

    for (const [regex, shape] of BRACKET_TO_SHAPE) {
        const m = bracketPart.match(regex);
        if (m) {
            const rawLabel = m[1].replace(/^"|"$/g, '').replace(/#quot;/g, '"');
            return { id, label: rawLabel, shape };
        }
    }

    return { id, label: bracketPart, shape: 'rectangle' };
}

function parseEdgeLine(line: string): { source: string; target: string; label?: string; style: Partial<Edge> } | null {
    // Patterns: A --> B, A -->|label| B, A -.-> B, A <--> B
    const edgePatterns = [
        /^([a-zA-Z0-9_]+)\s*<-->\s*\|"?([^|"]+)"?\|\s*([a-zA-Z0-9_]+)$/,  // bidirectional with label
        /^([a-zA-Z0-9_]+)\s*<-->\s*([a-zA-Z0-9_]+)$/,                    // bidirectional
        /^([a-zA-Z0-9_]+)\s*-->\s*\|"?([^|"]+)"?\|\s*([a-zA-Z0-9_]+)$/,  // arrow with label
        /^([a-zA-Z0-9_]+)\s*-\.->\s*\|"?([^|"]+)"?\|\s*([a-zA-Z0-9_]+)$/, // dashed arrow with label
        /^([a-zA-Z0-9_]+)\s*-->\s*([a-zA-Z0-9_]+)$/,                     // arrow
        /^([a-zA-Z0-9_]+)\s*-\.->\s*([a-zA-Z0-9_]+)$/,                   // dashed arrow
        /^([a-zA-Z0-9_]+)\s*---\s*([a-zA-Z0-9_]+)$/,                     // line
        /^([a-zA-Z0-9_]+)\s*-\.-\s*([a-zA-Z0-9_]+)$/,                    // dashed line
    ];

    for (let i = 0; i < edgePatterns.length; i++) {
        const m = line.match(edgePatterns[i]);
        if (!m) continue;

        const hasLabel = m.length === 4;
        const source = hasLabel ? m[1] : m[1];
        const target = hasLabel ? m[3] : m[2];
        const label = hasLabel ? m[2]?.replace(/^"|"$/g, '') : undefined;

        const isDashed = i >= 3 && i <= 5 || i === 7;
        const isBidirectional = i <= 1;
        const hasArrow = i <= 5;  // patterns 0-5 have arrows

        const edgeStyle: Partial<Edge> = {};
        if (isDashed) {
            edgeStyle.style = { strokeDasharray: '5 5' };
        }
        if (hasArrow) {
            (edgeStyle as any).markerEnd = { type: MarkerType.ArrowClosed };
        }
        if (isBidirectional) {
            (edgeStyle as any).markerStart = { type: MarkerType.ArrowClosed };
        }

        return { source, target, label, style: edgeStyle };
    }

    return null;
}

export function fromMermaid(code: string): ParsedGraph {
    const lines = code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));

    // Remove the header (flowchart TD, graph LR, etc.)
    const headerIdx = lines.findIndex(l => /^(flowchart|graph)\s+(TB|TD|LR|RL|BT)/i.test(l));
    const bodyLines = headerIdx >= 0 ? lines.slice(headerIdx + 1) : lines;

    const nodeMap = new Map<string, { label: string; shape: string; parentId?: string }>();
    const edges: Edge[] = [];
    let currentSubgraph: string | null = null;

    // Stack for nested subgraphs
    const subgraphStack: string[] = [];

    bodyLines.forEach(line => {
        // subgraph start
        const subMatch = line.match(/^subgraph\s+([a-zA-Z0-9_]+)(?:\[(.+)\])?/);
        if (subMatch) {
            const sgId = subMatch[1];
            const sgLabel = subMatch[2]?.replace(/^"|"$/g, '') || sgId;
            nodeMap.set(sgId, { label: sgLabel, shape: 'group', parentId: currentSubgraph || undefined });
            subgraphStack.push(sgId);
            currentSubgraph = sgId;
            return;
        }

        // subgraph end
        if (line === 'end') {
            subgraphStack.pop();
            currentSubgraph = subgraphStack.length > 0 ? subgraphStack[subgraphStack.length - 1] : null;
            return;
        }

        // Try edge first (must before node since edge lines also contain node refs)
        const edge = parseEdgeLine(line);
        if (edge) {
            // Auto-register nodes from edge if not yet seen
            if (!nodeMap.has(edge.source)) {
                nodeMap.set(edge.source, { label: edge.source, shape: 'rectangle', parentId: currentSubgraph || undefined });
            }
            if (!nodeMap.has(edge.target)) {
                nodeMap.set(edge.target, { label: edge.target, shape: 'rectangle', parentId: currentSubgraph || undefined });
            }
            edges.push({
                id: `e-${edge.source}-${edge.target}`,
                source: edge.source,
                target: edge.target,
                label: edge.label,
                data: { label: edge.label },
                type: 'smart-step',
                ...edge.style,
            } as Edge);
            return;
        }

        // Try node definition
        const nodeDef = parseNodeDef(line);
        if (nodeDef) {
            nodeMap.set(nodeDef.id, { label: nodeDef.label, shape: nodeDef.shape, parentId: currentSubgraph || undefined });
            return;
        }
    });

    // Convert to React Flow nodes with auto-layout positions
    const nodes: Node[] = [];
    let x = 0, y = 0;
    const col = 0;
    const ROW_H = 100, COL_W = 200;
    let idx = 0;

    nodeMap.forEach((val, id) => {
        const isContainer = val.shape === 'group';
        if (isContainer) {
            nodes.push({
                id,
                type: 'titleGroup',
                position: { x: idx * COL_W, y: 0 },
                data: { label: val.label, description: val.label, themeColor: '#4A90E2', titleBarHeight: 40, baseZIndex: 1 },
                style: { width: 400, height: 300 },
            } as Node);
        } else {
            nodes.push({
                id,
                type: 'flowchartNode',
                position: { x: (idx % 4) * COL_W, y: Math.floor(idx / 4) * ROW_H },
                data: { label: val.label, shape: val.shape },
                ...(val.parentId ? { parentId: val.parentId } : {}),
            } as Node);
        }
        idx++;
    });

    return { nodes, edges };
}
