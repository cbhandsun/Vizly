import { coerceClipboardData } from '@vizly/core/diagram-import';
import type { Edge, Node } from '@xyflow/react';

export type AIEditScope = 'generate' | 'selection' | 'diagram';
export interface AIEditContext {
    diagramId: string;
    scope: Exclude<AIEditScope, 'generate'>;
    nodeIds: string[];
    fingerprint: string;
}
export interface AICanvasGraph { nodes: Node[]; edges: Edge[] }
export type AIApplyStrategy = 'append' | 'replace' | 'edit';
export interface AIChange { kind: 'node' | 'edge'; action: 'add' | 'update' | 'remove'; id: string; before?: string; after?: string }
export interface AIChangePlan { beforeFingerprint: string; next: AICanvasGraph; changes: AIChange[] }

// Domain conversion can synthesize parent containers that were not proposed by
// the model. Selected edits retain existing parents through the scoped merge.
export const retainExplicitAIEditNodes = (graph: AICanvasGraph, nodeIds: readonly string[]): AICanvasGraph => {
    const explicit = new Set(nodeIds);
    return { ...graph, nodes: graph.nodes.filter(node => explicit.has(node.id)) };
};

const stableValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
        .filter(([, nested]) => nested !== undefined && typeof nested !== 'function')
        .sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, stableValue(nested)]));
    return value;
};
const durableItem = (item: Node | Edge) => Object.fromEntries(Object.entries(item)
    .filter(([key]) => !['selected', 'dragging', 'resizing', 'measured', 'width', 'height'].includes(key)));
const canonical = (value: unknown) => JSON.stringify(stableValue(value));
export const fingerprintAIGraph = (graph: AICanvasGraph): string => {
    const normalized = coerceClipboardData(graph) ?? { nodes: [], edges: [] };
    const text = canonical({ nodes: normalized.nodes.map(durableItem).sort((a, b) => String(a.id).localeCompare(String(b.id))),
        edges: normalized.edges.map(durableItem).sort((a, b) => String(a.id).localeCompare(String(b.id))) });
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return `${text.length}:${(hash >>> 0).toString(16)}`;
};

export const createAIEditContext = (graph: AICanvasGraph, diagramId: string, scope: AIEditScope): AIEditContext | undefined => {
    if (scope === 'generate') return undefined;
    const nodes = scope === 'selection' ? graph.nodes.filter(node => node.selected) : graph.nodes;
    if (!diagramId || !nodes.length) throw new Error('aiChat.edit.emptySelection');
    if (nodes.length > 500) throw new Error('aiChat.edit.tooLarge');
    return { diagramId, scope, nodeIds: nodes.map(node => node.id), fingerprint: fingerprintAIGraph(graph) };
};

export const buildAIEditPrompt = (graph: AICanvasGraph, context: AIEditContext): string => {
    const ids = new Set(context.nodeIds);
    const nodes = graph.nodes.filter(node => ids.has(node.id));
    const edges = graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target));
    const json = JSON.stringify({ nodes: nodes.map(node => ({ id: node.id, type: node.type,
        description: node.data.label ?? node.data.description ?? node.id, data: node.data })), edges });
    if (json.length > 96 * 1024) throw new Error('aiChat.edit.tooLarge');
    return `\n\n[EDIT SCOPE: ${context.scope}]\n${json}\n`
        + '只修改上述范围。返回一个完整 JSON 图表对象，包含修改后范围内的全部 nodes 和内部 edges；保留未修改节点和连线的 ID。'
        + '已有节点使用原 ID，新节点使用新 ID；只有明确要求删除时才省略已有节点。不得修改范围外节点或外部连线。'
        + '返回 ```json 代码块，不输出或执行 COMMAND 指令。变更由用户预览确认后应用。';
};

const label = (item: Node | Edge): string => {
    const value = 'source' in item ? item.label ?? `${item.source} → ${item.target}` : item.data.label ?? item.data.description;
    return typeof value === 'string' || typeof value === 'number' ? String(value) : item.id;
};
const diffItems = (before: (Node | Edge)[], after: (Node | Edge)[], kind: AIChange['kind']): AIChange[] => {
    const old = new Map(before.map(item => [item.id, item]));
    const next = new Map(after.map(item => [item.id, item]));
    return [
        ...before.filter(item => !next.has(item.id)).map(item => ({ kind, action: 'remove' as const, id: item.id, before: label(item) })),
        ...after.flatMap<AIChange>(item => {
            const previous = old.get(item.id);
            if (!previous) return [{ kind, action: 'add' as const, id: item.id, after: label(item) }];
            return canonical(durableItem(previous)) === canonical(durableItem(item)) ? []
                : [{ kind, action: 'update' as const, id: item.id, before: label(previous), after: label(item) }];
        }),
    ];
};

export const buildAIChangePlan = (before: AICanvasGraph, generated: AICanvasGraph, strategy: AIApplyStrategy, context?: AIEditContext): AIChangePlan => {
    const beforeFingerprint = fingerprintAIGraph(before);
    if (context && context.fingerprint !== beforeFingerprint) throw new Error('aiChat.edit.stale');
    let next: AICanvasGraph;
    if (strategy === 'edit') {
        if (!context) throw new Error('aiChat.edit.stale');
        const scope = new Set(context.nodeIds);
        const originals = new Map(before.nodes.map(node => [node.id, node]));
        const generatedIds = new Set(generated.nodes.map(node => node.id));
        for (const node of generated.nodes) {
            if (originals.has(node.id) && !scope.has(node.id)) throw new Error('aiChat.edit.outOfScope');
        }
        if (generated.edges.some(edge => !generatedIds.has(edge.source) || !generatedIds.has(edge.target))) {
            throw new Error('aiChat.edit.outOfScope');
        }
        const editedNodes = generated.nodes.map(node => {
            const original = originals.get(node.id);
            return original ? { ...original, data: { ...original.data, ...node.data } } : node;
        });
        const nodes = [...before.nodes.filter(node => !scope.has(node.id)), ...editedNodes];
        const nodeIds = new Set(nodes.map(node => node.id));
        if (nodes.some(node => node.parentId && !nodeIds.has(node.parentId))) throw new Error('aiChat.edit.outOfScope');
        const keptEdges = before.edges.filter(edge => !(scope.has(edge.source) && scope.has(edge.target))
            && nodeIds.has(edge.source) && nodeIds.has(edge.target));
        const keptIds = new Set(keptEdges.map(edge => edge.id));
        if (generated.edges.some(edge => keptIds.has(edge.id))) throw new Error('aiChat.edit.outOfScope');
        next = { nodes, edges: [...keptEdges, ...generated.edges] };
    } else if (strategy === 'replace') next = generated;
    else {
        const prefix = crypto.randomUUID();
        const ids = new Map(generated.nodes.map((node, index) => [node.id, `ai_${prefix}_${index}`]));
        const maxX = Math.max(0, ...before.nodes.map(node => node.position.x + (node.measured?.width ?? 200)));
        const minX = Math.min(0, ...generated.nodes.map(node => node.position.x));
        next = {
            nodes: [...before.nodes, ...generated.nodes.map(node => ({ ...node, id: ids.get(node.id)!,
                parentId: node.parentId ? ids.get(node.parentId) : undefined,
                position: node.parentId ? node.position : { x: node.position.x + maxX - minX + 120, y: node.position.y } }))],
            edges: [...before.edges, ...generated.edges.map(edge => ({ ...edge, id: `ai_${prefix}_${edge.id}`,
                source: ids.get(edge.source)!, target: ids.get(edge.target)! }))],
        };
    }
    if (new Set(next.nodes.map(node => node.id)).size !== next.nodes.length
        || new Set(next.edges.map(edge => edge.id)).size !== next.edges.length) throw new Error('aiChat.edit.invalid');
    const allIds = new Set(next.nodes.map(node => node.id));
    if (next.edges.some(edge => !allIds.has(edge.source) || !allIds.has(edge.target))) throw new Error('aiChat.edit.invalid');
    return { beforeFingerprint, next, changes: [...diffItems(before.nodes, next.nodes, 'node'), ...diffItems(before.edges, next.edges, 'edge')] };
};
