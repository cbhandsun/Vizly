import type { FlowDataBridgeEntry } from '@/core/utils/flowDataBridge';

export const MERMAID_IMPORT_MAX_NODES = 5_000;
export const MERMAID_IMPORT_MAX_EDGES = 10_000;

type MermaidImportBridge = Pick<FlowDataBridgeEntry, 'connectNodes'> & {
    addNode: NonNullable<FlowDataBridgeEntry['addNode']>;
};

interface ImportMermaidGraphOptions {
    bridge: MermaidImportBridge;
    nodes: unknown;
    edges: unknown;
}

type MermaidNodePayload = {
    id: string;
    label?: string;
    type?: string;
    shape?: string;
    parentId?: string;
    position?: { x: number; y: number };
};

type MermaidEdgePayload = {
    source: string;
    target: string;
    label?: string;
};

const SAFE_ID = /^[A-Za-z0-9_.:-]+$/;
const BLOCKED_IDS = new Set(['__proto__', 'prototype', 'constructor']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const boundedText = (value: unknown, maxLength: number): string | undefined => (
    typeof value === 'string' && value.length <= maxLength ? value : undefined
);

const parseId = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const id = value.trim();
    if (!id || id.length > 200 || !SAFE_ID.test(id) || BLOCKED_IDS.has(id)) return null;
    return id;
};

const parsePosition = (value: unknown): { x: number; y: number } | undefined => {
    if (!isRecord(value)) return undefined;
    const { x, y } = value;
    if (typeof x !== 'number' || typeof y !== 'number') return undefined;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    if (Math.abs(x) > 1_000_000 || Math.abs(y) > 1_000_000) return undefined;
    return { x, y };
};

const parseNode = (value: unknown): MermaidNodePayload | null => {
    if (!isRecord(value) || !isRecord(value.data)) return null;
    const id = parseId(value.id);
    if (!id) return null;

    const label = boundedText(value.data.label, 1_000);
    const type = boundedText(value.data.type, 100);
    const shape = boundedText(value.data.shape, 100);
    const parentId = value.parentId === undefined ? undefined : parseId(value.parentId);
    const position = parsePosition(value.position);
    if (value.data.label !== undefined && label === undefined) return null;
    if (value.data.type !== undefined && type === undefined) return null;
    if (value.data.shape !== undefined && shape === undefined) return null;
    if (value.parentId !== undefined && !parentId) return null;

    return {
        id,
        ...(label !== undefined ? { label } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(shape !== undefined ? { shape } : {}),
        ...(parentId ? { parentId } : {}),
        ...(position ? { position } : {}),
    };
};

const parseEdge = (value: unknown): MermaidEdgePayload | null => {
    if (!isRecord(value)) return null;
    const source = parseId(value.source);
    const target = parseId(value.target);
    const label = boundedText(value.label, 1_000);
    if (!source || !target) return null;
    if (value.label !== undefined && label === undefined) return null;
    return { source, target, ...(label !== undefined ? { label } : {}) };
};

const parseCollection = <T>(
    value: unknown,
    maxItems: number,
    parseItem: (item: unknown) => T | null,
    label: string,
): T[] => {
    if (!Array.isArray(value) || value.length > maxItems) {
        throw new Error(`Invalid Mermaid ${label} collection`);
    }

    const parsed = value.map(parseItem);
    if (parsed.some((item) => item === null)) {
        throw new Error(`Invalid Mermaid ${label} payload`);
    }
    return parsed as T[];
};

export const importMermaidGraphToBridge = async ({
    bridge,
    nodes,
    edges,
}: ImportMermaidGraphOptions): Promise<void> => {
    const safeNodes = parseCollection(nodes, MERMAID_IMPORT_MAX_NODES, parseNode, 'node');
    const safeEdges = parseCollection(edges, MERMAID_IMPORT_MAX_EDGES, parseEdge, 'edge');

    for (const node of safeNodes) {
        await bridge.addNode(node);
    }
    for (const edge of safeEdges) {
        await bridge.connectNodes?.(edge);
    }
};
