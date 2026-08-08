import type { Edge, Node } from '@xyflow/react';

export interface ClipboardData {
    nodes: Node[];
    edges: Edge[];
}

export interface ClipboardCoerceOptions {
    maxNodes?: number;
    maxEdges?: number;
    maxIdLength?: number;
    maxCoordinateAbs?: number;
}

export const buildFlowchartClipboardData = (
    selectedNodes: Node[],
    allEdges: Edge[],
    allNodes: Node[] = selectedNodes,
): ClipboardData => {
    const selectedNodeIds = new Set(selectedNodes.map(node => node.id));
    const allNodesById = new Map(allNodes.map(node => [node.id, node]));
    const copiedNodeIds = new Set(selectedNodeIds);

    const hasSelectedAncestor = (node: Node): boolean => {
        const visited = new Set<string>([node.id]);
        let parentId = node.parentId;
        while (parentId && !visited.has(parentId)) {
            if (selectedNodeIds.has(parentId)) return true;
            visited.add(parentId);
            parentId = allNodesById.get(parentId)?.parentId;
        }
        return false;
    };

    for (const node of allNodes) {
        if (hasSelectedAncestor(node)) copiedNodeIds.add(node.id);
    }

    const hasExpandedSelection = copiedNodeIds.size > selectedNodeIds.size;
    const nodesToCopy = hasExpandedSelection
        ? [
            ...allNodes.filter(node => copiedNodeIds.has(node.id)),
            ...selectedNodes.filter(node => !allNodesById.has(node.id)),
        ]
        : selectedNodes;
    const edges = allEdges.filter(edge => (
        copiedNodeIds.has(edge.source) && copiedNodeIds.has(edge.target)
    ));

    const resolveAbsolutePosition = (node: Node, visited = new Set<string>()): Node['position'] => {
        if (!node.parentId || visited.has(node.id)) return { ...node.position };

        const parent = allNodesById.get(node.parentId);
        if (!parent) return { ...node.position };

        const nextVisited = new Set(visited).add(node.id);
        const parentPosition = resolveAbsolutePosition(parent, nextVisited);
        return {
            x: parentPosition.x + node.position.x,
            y: parentPosition.y + node.position.y,
        };
    };

    const requiresDetachedCopy = nodesToCopy.some(node => (
        node.parentId !== undefined && !copiedNodeIds.has(node.parentId)
    ));
    const nodes = requiresDetachedCopy ? nodesToCopy.map(node => {
        if (!node.parentId || copiedNodeIds.has(node.parentId)) return node;

        const detachedNode: Node = {
            ...node,
            position: resolveAbsolutePosition(node),
        };
        delete detachedNode.parentId;
        delete detachedNode.extent;
        delete detachedNode.expandParent;
        Reflect.deleteProperty(detachedNode, 'parentNode');
        return detachedNode;
    }) : nodesToCopy;

    return { nodes, edges };
};

const DEFAULT_MAX_NODES = 1000;
const DEFAULT_MAX_EDGES = 2000;
const DEFAULT_MAX_ID_LENGTH = 256;
const DEFAULT_MAX_COORDINATE_ABS = 1_000_000;
const DEFAULT_MAX_OBJECT_DEPTH = 8;
const DEFAULT_MAX_OBJECT_KEYS = 200;
const DEFAULT_MAX_ARRAY_ITEMS = 1000;
const DEFAULT_MAX_STRING_LENGTH = 20_000;
const BLOCKED_JSON_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
export const FLOWCHART_CLIPBOARD_TEXT_MAX_BYTES = 2 * 1024 * 1024;

export const isFlowchartClipboardTextWithinBounds = (text: string): boolean => (
    text.length <= FLOWCHART_CLIPBOARD_TEXT_MAX_BYTES
);

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const isSafeId = (value: unknown, maxIdLength: number): value is string =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= maxIdLength;

const isSafeCoordinate = (value: unknown, maxCoordinateAbs: number): value is number =>
    isFiniteNumber(value) && Math.abs(value) <= maxCoordinateAbs;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    );

const sanitizeJsonValue = (value: unknown, depth = 0): unknown => {
    if (value == null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') return value.slice(0, DEFAULT_MAX_STRING_LENGTH);

    if (Array.isArray(value)) {
        if (depth >= DEFAULT_MAX_OBJECT_DEPTH) return [];
        return value
            .slice(0, DEFAULT_MAX_ARRAY_ITEMS)
            .map(item => sanitizeJsonValue(item, depth + 1))
            .filter(item => item !== undefined);
    }

    if (!isPlainRecord(value)) return undefined;
    if (depth >= DEFAULT_MAX_OBJECT_DEPTH) return {};

    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value).slice(0, DEFAULT_MAX_OBJECT_KEYS)) {
        if (!key || BLOCKED_JSON_KEYS.has(key)) continue;
        const safeValue = sanitizeJsonValue(nestedValue, depth + 1);
        if (safeValue !== undefined) sanitized[key] = safeValue;
    }

    return sanitized;
};

const sanitizeRecord = (value: unknown): Record<string, unknown> | null => {
    const sanitized = sanitizeJsonValue(value);
    return isPlainRecord(sanitized) ? sanitized : null;
};

const coerceNode = (value: unknown, opts: Required<ClipboardCoerceOptions>): Node | null => {
    const record = sanitizeRecord(value);
    if (!record) return null;

    const position = record.position as Record<string, unknown> | undefined;
    if (!isSafeId(record.id, opts.maxIdLength)) return null;
    if (!position || !isSafeCoordinate(position.x, opts.maxCoordinateAbs) || !isSafeCoordinate(position.y, opts.maxCoordinateAbs)) return null;

    return {
        ...record,
        id: record.id.trim(),
        position: { x: position.x, y: position.y },
        data: sanitizeRecord(record.data) ?? {},
    } as Node;
};

const coerceEdge = (value: unknown, nodeIds: Set<string>, opts: Required<ClipboardCoerceOptions>): Edge | null => {
    const record = sanitizeRecord(value);
    if (!record) return null;

    if (!isSafeId(record.id, opts.maxIdLength)) return null;
    if (!isSafeId(record.source, opts.maxIdLength) || !isSafeId(record.target, opts.maxIdLength)) return null;
    const source = record.source.trim();
    const target = record.target.trim();
    if (!nodeIds.has(source) || !nodeIds.has(target)) return null;

    return {
        ...record,
        id: record.id.trim(),
        source,
        target,
        data: sanitizeRecord(record.data) ?? undefined,
    } as Edge;
};

export const coerceClipboardData = (value: unknown, options: ClipboardCoerceOptions = {}): ClipboardData | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const opts: Required<ClipboardCoerceOptions> = {
        maxNodes: options.maxNodes ?? DEFAULT_MAX_NODES,
        maxEdges: options.maxEdges ?? DEFAULT_MAX_EDGES,
        maxIdLength: options.maxIdLength ?? DEFAULT_MAX_ID_LENGTH,
        maxCoordinateAbs: options.maxCoordinateAbs ?? DEFAULT_MAX_COORDINATE_ABS,
    };
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.nodes)) return null;
    if (record.nodes.length > opts.maxNodes) return null;
    if (Array.isArray(record.edges) && record.edges.length > opts.maxEdges) return null;

    const seenNodeIds = new Set<string>();
    const nodes = record.nodes.reduce<Node[]>((acc, rawNode) => {
        const node = coerceNode(rawNode, opts);
        if (!node || seenNodeIds.has(node.id)) return acc;
        seenNodeIds.add(node.id);
        acc.push(node);
        return acc;
    }, []);
    if (nodes.length === 0) return null;

    const nodeIds = new Set(nodes.map(node => node.id));
    const edges = Array.isArray(record.edges)
        ? record.edges.reduce<Edge[]>((acc, rawEdge) => {
            const edge = coerceEdge(rawEdge, nodeIds, opts);
            if (edge) acc.push(edge);
            return acc;
        }, [])
        : [];

    return { nodes, edges };
};

export const parseClipboardJson = (text: string): ClipboardData | null => {
    if (!text.trim() || !isFlowchartClipboardTextWithinBounds(text)) return null;
    try {
        return coerceClipboardData(JSON.parse(text));
    } catch {
        return null;
    }
};
