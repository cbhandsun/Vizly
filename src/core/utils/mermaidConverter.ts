import { Node, Edge, MarkerType } from '@xyflow/react';
import { escapeMermaidLabel, toMermaidNodeId, toSafeMermaidColor } from './exportTextSecurity';

/**
 * mermaidConverter — 双向转换 React Flow ↔ Mermaid flowchart 语法
 *
 * toMermaid:   nodes + edges → Mermaid 字符串
 * fromMermaid: Mermaid 字符串 → { nodes, edges }
 */

// ─── 导出：React Flow → Mermaid ──────────────────────────

const SHAPE_TO_MERMAID: Record<string, [string, string]> = {
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
    'cloud': [')', '('], // Mermaid 并没有真正的云朵，用弧括号模拟或使用 note
    'stadium': ['([', '])'],
    'subroutine': ['[[', ']]'],
    'cylindrical': ['[(', ')]'],
};

export const MERMAID_EXPORT_MAX_NODES = 1_000;
export const MERMAID_EXPORT_MAX_EDGES = 2_000;

const asRecord = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};

function getNodeShape(node: Node): [string, string] {
    const rawShape = asRecord(node.data).shape;
    const shape = typeof rawShape === 'string' ? rawShape : undefined;
    if (node.type === 'iconNode') return ['((', '))']; // 图标节点渲染为圆形
    return SHAPE_TO_MERMAID[shape || 'rectangle'] || ['[', ']'];
}

function getEdgeStyleMarker(edge: Edge): string {
    const isDashed = edge.style?.strokeDasharray;
    const hasArrow = edge.markerEnd != null || edge.type === 'smart-step' || !edge.type; 
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
    const lines: string[] = [`flowchart ${direction}`];
    const safeNodes = nodes.slice(0, MERMAID_EXPORT_MAX_NODES);
    const nodeIds = new Set(safeNodes.map(node => node.id));
    const safeEdges = edges
        .filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
        .slice(0, MERMAID_EXPORT_MAX_EDGES);

    // Map children by parentId
    const childrenByParent = new Map<string, Node[]>();
    safeNodes.forEach(n => {
        const pId = n.parentId;
        if (pId) {
            const list = childrenByParent.get(pId) || [];
            list.push(n);
            childrenByParent.set(pId, list);
        }
    });

    const containerTypes = new Set(['titleGroup', 'subGroup', 'swimlane', 'group']);
    
    // Recursive renderer
    const renderNodeOrGroup = (node: Node, indent = 4): string[] => {
        const spaces = ' '.repeat(indent);
        const subLines: string[] = [];
        const data = asRecord(node.data);
        const theme = asRecord(data.theme);
        
        if (containerTypes.has(node.type || '')) {
            const mId = toMermaidNodeId(node.id);
            const label = data.description || data.label || node.id;
            subLines.push(`${spaces}subgraph ${mId}["${escapeMermaidLabel(String(label))}"]`);
            
            const children = childrenByParent.get(node.id) || [];
            children.forEach(child => {
                subLines.push(...renderNodeOrGroup(child, indent + 4));
            });
            
            subLines.push(`${spaces}end`);

            // Apply style if available
            const color = toSafeMermaidColor(data.themeColor || theme.main);
            if (color) {
                subLines.push(`${spaces}style ${mId} fill:${color}15,stroke:${color},stroke-width:2px`);
            }
        } else {
            const mId = toMermaidNodeId(node.id);
            let label = data.description || data.label || node.id;
            
            // 特殊处理 IconNode
            if (node.type === 'iconNode') {
                const icon = data.icon || 'icon';
                label = `Icon: ${icon} | ${label}`;
            }

            const [open, close] = getNodeShape(node);
            subLines.push(`${spaces}${mId}${open}"${escapeMermaidLabel(String(label))}"${close}`);
            
            // Node style
            const color = toSafeMermaidColor(theme.main || data.color);
            const textColor = toSafeMermaidColor(theme.text);
            if (color) {
                subLines.push(`${spaces}style ${mId} fill:${color},stroke:${color},color:${textColor || '#fff'}`);
            }
        }
        return subLines;
    };

    // Render top-level nodes (no parentId)
    const topLevelNodes = safeNodes.filter(n => !n.parentId);
    topLevelNodes.forEach(n => {
        lines.push(...renderNodeOrGroup(n));
    });

    // Render edges
    safeEdges.forEach((e, idx) => {
        const srcId = toMermaidNodeId(e.source);
        const tgtId = toMermaidNodeId(e.target);
        const arrow = getEdgeStyleMarker(e);
        const label = asRecord(e.data).label || e.label;
        
        const edgeLine = label 
            ? `    ${srcId} ${arrow}|"${escapeMermaidLabel(String(label))}"| ${tgtId}`
            : `    ${srcId} ${arrow} ${tgtId}`;
        lines.push(edgeLine);

        // Edge style (colors)
        const stroke = toSafeMermaidColor(e.style?.stroke);
        if (stroke) {
            lines.push(`    linkStyle ${idx} stroke:${stroke},stroke-width:2px`);
        }
    });

    return lines.join('\n');
}

// ─── 导入：Mermaid → React Flow ──────────────────────────

interface ParsedGraph {
    nodes: Node[];
    edges: Edge[];
}

export const MERMAID_CONVERTER_MAX_CHARS = 2 * 1024 * 1024;
export const MERMAID_CONVERTER_MAX_LINES = 5_000;
export const MERMAID_CONVERTER_MAX_LINE_CHARS = 10_000;
export const MERMAID_CONVERTER_MAX_NODES = 1_000;
export const MERMAID_CONVERTER_MAX_EDGES = 2_000;
export const MERMAID_CONVERTER_MAX_ID_CHARS = 256;
export const MERMAID_CONVERTER_MAX_LABEL_CHARS = 1_000;

const truncateText = (value: string, maxChars: number): string => value.slice(0, maxChars);

const sanitizeMermaidId = (value: string): string =>
    truncateText(String(value || '').trim(), MERMAID_CONVERTER_MAX_ID_CHARS);

const sanitizeMermaidLabel = (value: string): string =>
    truncateText(String(value || '').trim(), MERMAID_CONVERTER_MAX_LABEL_CHARS);

const prepareMermaidImport = (code: string): string[] => {
    if (typeof code !== 'string') {
        throw new Error('Mermaid input must be text.');
    }
    if (code.length > MERMAID_CONVERTER_MAX_CHARS) {
        throw new Error('Mermaid input is too large.');
    }

    return code
        .split('\n')
        .slice(0, MERMAID_CONVERTER_MAX_LINES)
        .map(line => line.trim().slice(0, MERMAID_CONVERTER_MAX_LINE_CHARS))
        .filter(line => line && !line.startsWith('%%'));
};

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
    const idMatch = text.match(/^([a-zA-Z0-9_]+)([[({<>].*)/);
    if (!idMatch) return null;

    const id = sanitizeMermaidId(idMatch[1]);
    const bracketPart = idMatch[2];

    for (const [regex, shape] of BRACKET_TO_SHAPE) {
        const m = bracketPart.match(regex);
        if (m) {
            const rawLabel = sanitizeMermaidLabel(m[1].replace(/^"|"$/g, '').replace(/#quot;/g, '"'));
            return { id, label: rawLabel, shape };
        }
    }

    return { id, label: sanitizeMermaidLabel(bracketPart), shape: 'rectangle' };
}

interface ParsedNodeInfo {
    id: string;
    label: string;
    shape: string;
}

interface ParsedEdgeLine {
    source: string;
    target: string;
    label?: string;
    style: Partial<Edge>;
    _sourceNode?: ParsedNodeInfo;
    _targetNode?: ParsedNodeInfo;
}

function parseEdgeLine(line: string): ParsedEdgeLine | null {
    // 基础边缘定义：A[label] -->|edgeLabel| B[label]
    // 匹配流程：
    // 1. 查找箭头操作符
    const arrowMatch = line.match(/\s*(<--|-->|<-->|---|-.->|-\.->|--o|o--|x--|--x)\s*/);
    if (!arrowMatch) return null;

    const operator = arrowMatch[1];
    const operatorIdx = arrowMatch.index!;
    const leftPart = line.slice(0, operatorIdx).trim();
    const rightPartFull = line.slice(operatorIdx + arrowMatch[0].length).trim();

    // 检查右侧部分是否有边缘标签：|label| Target
    let edgeLabel: string | undefined;
    let targetPart = rightPartFull;
    const labelMatch = rightPartFull.match(/^\|"?([^|"]+)"?\|\s*(.*)$/);
    if (labelMatch) {
        edgeLabel = sanitizeMermaidLabel(labelMatch[1].replace(/#quot;/g, '"'));
        targetPart = labelMatch[2].trim();
    }

    // 从左右部分提取 Node ID 和信息
    const sourceInfo = parseNodeDef(leftPart) || { id: sanitizeMermaidId(leftPart.match(/^([a-zA-Z0-9_]+)/)?.[1] || leftPart), label: "", shape: "rectangle" };
    const targetInfo = parseNodeDef(targetPart) || { id: sanitizeMermaidId(targetPart.match(/^([a-zA-Z0-9_]+)/)?.[1] || targetPart), label: "", shape: "rectangle" };

    const source = sourceInfo.id;
    const target = targetInfo.id;

    if (!source || !target) return null;

    const isDashed = operator.includes('-.');
    const isBidirectional = operator === '<-->' || operator === '<-.->';
    const hasArrow = operator.includes('>') || operator.includes('x') || operator.includes('o');

    const edgeStyle: Partial<Edge> = {};
    if (isDashed) edgeStyle.style = { strokeDasharray: '5 5' };
    if (hasArrow || operator === '-->') {
        edgeStyle.markerEnd = { type: MarkerType.ArrowClosed };
    }
    if (isBidirectional) {
        edgeStyle.markerStart = { type: MarkerType.ArrowClosed };
    }

    return { 
        source, 
        target, 
        label: edgeLabel, 
        style: edgeStyle,
        // 附加提取到的节点信息，供 fromMermaid 使用
        _sourceNode: sourceInfo.label ? sourceInfo : undefined,
        _targetNode: targetInfo.label ? targetInfo : undefined
    };
}

export function fromMermaid(code: string): ParsedGraph {
    const lines = prepareMermaidImport(code);

    const headerIdx = lines.findIndex(l => /^(flowchart|graph)\s+(TB|TD|LR|RL|BT)/i.test(l));
    const bodyLines = headerIdx >= 0 ? lines.slice(headerIdx + 1) : lines;

    const nodeMap = new Map<string, {
        label: string;
        shape: string;
        parentId?: string;
        styles?: Record<string, string>;
    }>();
    const edges: Edge[] = [];
    const subgraphStack: string[] = [];
    let currentSubgraph: string | null = null;

    bodyLines.forEach(line => {
        if (nodeMap.size >= MERMAID_CONVERTER_MAX_NODES && edges.length >= MERMAID_CONVERTER_MAX_EDGES) return;
        // subgraph start
        const subMatch = line.match(/^subgraph\s+([a-zA-Z0-9_]+)(?:\[(.+)\])?/);
        if (subMatch) {
            const sgId = sanitizeMermaidId(subMatch[1]);
            const sgLabel = sanitizeMermaidLabel(subMatch[2]?.replace(/^"|"$/g, '') || sgId);
            if (nodeMap.size < MERMAID_CONVERTER_MAX_NODES) {
                nodeMap.set(sgId, { label: sgLabel, shape: 'group', parentId: currentSubgraph || undefined });
            }
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

        // style/linkStyle
        const styleMatch = line.match(/^style\s+([a-zA-Z0-9_]+)\s+(.+)$/);
        if (styleMatch) {
            const id = styleMatch[1];
            const stylePairs = styleMatch[2].split(',');
            const styles: Record<string, string> = {};
            stylePairs.forEach(p => {
                const [k, v] = p.split(':');
                if (k && v) styles[k.trim()] = v.trim();
            });
            const existing = nodeMap.get(id);
            if (existing) {
                existing.styles = styles;
            } else if (nodeMap.size < MERMAID_CONVERTER_MAX_NODES) {
                nodeMap.set(id, { label: id, shape: 'rectangle', styles, parentId: currentSubgraph || undefined });
            }
            return;
        }

        // Edge
        const edge = parseEdgeLine(line);
        if (edge) {
            // Auto-register nodes from edge if not yet seen or if more info provided
            const registerNode = (id: string, info?: ParsedNodeInfo) => {
                if (!id) return;
                const existing = nodeMap.get(id);
                if (info && info.label) {
                    if (existing || nodeMap.size < MERMAID_CONVERTER_MAX_NODES) {
                        nodeMap.set(id, { ...info, parentId: currentSubgraph || undefined });
                    }
                } else if (!existing && nodeMap.size < MERMAID_CONVERTER_MAX_NODES) {
                    nodeMap.set(id, { label: id, shape: 'rectangle', parentId: currentSubgraph || undefined });
                }
            };
            
            registerNode(edge.source, edge._sourceNode);
            registerNode(edge.target, edge._targetNode);

            if (edges.length < MERMAID_CONVERTER_MAX_EDGES && nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
                edges.push({
                    id: `e-${edge.source}-${edge.target}-${edges.length}`,
                    source: edge.source,
                    target: edge.target,
                    label: edge.label,
                    data: { label: edge.label },
                    type: 'smart-step',
                    ...edge.style,
                } as Edge);
            }
            return;
        }

        // Node
        const nodeDef = parseNodeDef(line);
        if (nodeDef && nodeMap.size < MERMAID_CONVERTER_MAX_NODES) {
            nodeMap.set(nodeDef.id, { ...nodeDef, parentId: currentSubgraph || undefined });
            return;
        }
    });

    // Convert to React Flow nodes
    const nodes: Node[] = [];
    let idx = 0;
    const ROW_H = 120, COL_W = 240;

    nodeMap.forEach((val, id) => {
        const isContainer = val.shape === 'group';
        const themeColor = val.styles?.stroke || (val.styles?.fill?.startsWith('#') ? val.styles.fill : undefined);
        const nodeColor = val.styles?.fill;
        const textColor = val.styles?.color;

        if (isContainer) {
            nodes.push({
                id,
                type: 'titleGroup',
                // 基于 idx 稍微打散初始位置，避免堆叠
                position: { x: (idx % 3) * COL_W * 2, y: Math.floor(idx / 3) * ROW_H * 3 },
                data: { 
                    label: val.label, 
                    description: val.label, 
                    themeColor: themeColor || '#4A90E2', 
                    titleBarHeight: 40, 
                    baseZIndex: 1 
                },
                style: { width: 400, height: 300 },
                ...(val.parentId ? { parentId: val.parentId } : {}),
            } as Node);
        } else {
            // 检查是否包含 Icon 标记
            const isIcon = val.label.startsWith('Icon:');
            let label = val.label;
            let icon = '';
            if (isIcon) {
                const parts = val.label.replace('Icon:', '').split('|');
                icon = parts[0].trim();
                label = parts.length > 1 ? parts[1].trim() : icon;
            }

            nodes.push({
                id,
                type: isIcon ? 'iconNode' : 'flowchartNode',
                position: { x: (idx % 4) * COL_W, y: Math.floor(idx / 4) * ROW_H },
                data: { 
                    label: label, 
                    description: label, 
                    shape: val.shape,
                    icon: isIcon ? icon : undefined,
                    theme: nodeColor ? { main: nodeColor, border: themeColor || nodeColor, text: textColor || '#fff' } : undefined
                },
                ...(val.parentId ? { parentId: val.parentId } : {}),
            } as Node);
        }
        idx++;
    });

    return { nodes, edges };
}
