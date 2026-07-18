import type { Edge, Node } from '@xyflow/react';

export const MIND_MAP_PALETTE = [
    '#e85d4a',
    '#f0872a',
    '#c27af5',
    '#2dd4bf',
    '#3b82f6',
    '#f59e0b',
    '#10b981',
] as const;

export interface MindMapClipboard {
    nodes: Node[];
    edges: Edge[];
    rootId: string;
}

interface QuickAddInput {
    parentId: string;
    direction: string;
    depth: number;
    siblingCount: number;
    parentBranchColor?: string;
    idSeed: number;
}

export const createMindMapQuickAdd = ({
    parentId,
    direction,
    depth,
    siblingCount,
    parentBranchColor,
    idSeed,
}: QuickAddInput): { node: Node; edge: Edge } => {
    const safeDepth = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;
    const safeSiblingCount = Number.isFinite(siblingCount)
        ? Math.max(0, Math.floor(siblingCount))
        : 0;
    const branchColor = safeDepth === 0
        ? MIND_MAP_PALETTE[safeSiblingCount % MIND_MAP_PALETTE.length]
        : parentBranchColor;
    const safeIdSeed = Number.isFinite(idSeed) ? Math.max(0, Math.floor(idSeed)) : 0;
    const nodeId = `mindmap-node-${safeIdSeed}`;
    const node: Node = {
        id: nodeId,
        type: 'mindmap',
        position: { x: 0, y: 0 },
        data: {
            label: '',
            depth: safeDepth + 1,
            direction: direction || 'LR',
            branchColor,
            isNew: true,
        },
    };
    const edge: Edge = {
        id: `edge-${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: 'mindmapEdge',
        animated: false,
        style: {
            strokeWidth: Math.max(1.5, 4 - safeDepth * 0.8),
            stroke: branchColor || (safeDepth === 0 ? '#6366f1' : '#94a3b8'),
        },
        data: { kind: 'mindmap' },
        markerEnd: '' as never,
    };
    return { node, edge };
};

export const collectMindMapSubtree = (
    nodes: Node[],
    edges: Edge[],
    rootId: string,
): MindMapClipboard | null => {
    if (!nodes.some((node) => node.id === rootId && node.type === 'mindmap')) return null;
    const childrenMap = new Map<string, string[]>();
    for (const edge of edges) {
        if (edge.type === 'relationshipEdge') continue;
        const children = childrenMap.get(edge.source) ?? [];
        children.push(edge.target);
        childrenMap.set(edge.source, children);
    }
    const nodeIds = new Set<string>();
    const stack = [rootId];
    while (stack.length > 0) {
        const current = stack.pop()!;
        if (nodeIds.has(current)) continue;
        nodeIds.add(current);
        (childrenMap.get(current) ?? []).forEach((childId) => stack.push(childId));
    }
    return {
        nodes: nodes.filter((node) => nodeIds.has(node.id)),
        edges: edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
        rootId,
    };
};

export const createMindMapPastePayload = (
    clipboard: MindMapClipboard,
    targetId: string,
    idSeed: number,
): { nodes: Node[]; edges: Edge[] } | null => {
    if (!targetId || !clipboard.nodes.some((node) => node.id === clipboard.rootId)) return null;
    const seed = Number.isFinite(idSeed) ? Math.max(0, Math.floor(idSeed)) : 0;
    const idMap = new Map<string, string>();
    clipboard.nodes.forEach((node, index) => {
        idMap.set(node.id, `mindmap-paste-${seed}-${index}`);
    });
    const pastedRootId = idMap.get(clipboard.rootId);
    if (!pastedRootId) return null;
    const nodes = clipboard.nodes.map((node) => ({
        ...node,
        id: idMap.get(node.id)!,
        position: {
            x: (Number.isFinite(node.position.x) ? node.position.x : 0) + 40,
            y: (Number.isFinite(node.position.y) ? node.position.y : 0) + 40,
        },
        selected: node.id === clipboard.rootId,
        data: { ...node.data },
    }));
    const internalEdges = clipboard.edges.flatMap((edge) => {
        const source = idMap.get(edge.source);
        const target = idMap.get(edge.target);
        if (!source || !target) return [];
        return [{ ...edge, id: `edge-${source}-${target}`, source, target }];
    });
    const edges: Edge[] = [{
        id: `edge-${targetId}-${pastedRootId}`,
        source: targetId,
        target: pastedRootId,
        type: 'mindmapEdge',
        animated: false,
        markerEnd: '' as never,
        data: { kind: 'mindmap' },
    }, ...internalEdges];
    return { nodes, edges };
};
