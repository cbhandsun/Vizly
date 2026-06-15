import type { Edge, Node } from '@xyflow/react';
import { coerceClipboardData } from './flowchartClipboard';

export const AUTOSAVE_PREFIX = 'flowchart-autosave-v2-';
export const AUTOSAVE_GC_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_AUTOSAVE_JSON_CHARS = 2 * 1024 * 1024;
const MAX_DIAGRAM_ID_LENGTH = 180;
const MAX_AUX_DEPTH = 6;
const MAX_AUX_OBJECT_KEYS = 200;
const MAX_AUX_ARRAY_ITEMS = 1000;
const MAX_AUX_STRING_CHARS = 20_000;
const BLOCKED_AUX_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export interface AutoSavePayload {
    diagramId?: string;
    nodes: Node[];
    edges: Edge[];
    timestamp?: number;
    lastAccessedAt?: number;
    version: '1.0';
    isFreshSeed?: boolean;
    layout?: unknown;
    metadata?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    );

const coerceTimestamp = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

const coerceDiagramId = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= MAX_DIAGRAM_ID_LENGTH ? trimmed : undefined;
};

const sanitizeAuxValue = (value: unknown, depth = 0): unknown => {
    if (value == null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') return value.slice(0, MAX_AUX_STRING_CHARS);

    if (Array.isArray(value)) {
        if (depth >= MAX_AUX_DEPTH) return [];
        return value
            .slice(0, MAX_AUX_ARRAY_ITEMS)
            .map(item => sanitizeAuxValue(item, depth + 1))
            .filter(item => item !== undefined);
    }

    if (!isRecord(value)) return undefined;
    if (depth >= MAX_AUX_DEPTH) return {};

    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value).slice(0, MAX_AUX_OBJECT_KEYS)) {
        if (!key || BLOCKED_AUX_KEYS.has(key)) continue;
        const safeValue = sanitizeAuxValue(nestedValue, depth + 1);
        if (safeValue !== undefined) sanitized[key] = safeValue;
    }
    return sanitized;
};

export const coerceAutoSavePayload = (value: unknown): AutoSavePayload | null => {
    if (!isRecord(value)) return null;

    const nodesRaw = Array.isArray(value.nodes) ? value.nodes : [];
    const edgesRaw = Array.isArray(value.edges) ? value.edges : [];
    const clipboardData = nodesRaw.length === 0
        ? { nodes: [] as Node[], edges: [] as Edge[] }
        : coerceClipboardData({ nodes: nodesRaw, edges: edgesRaw });

    if (!clipboardData) return null;

    const timestamp = coerceTimestamp(value.timestamp);
    const lastAccessedAt = coerceTimestamp(value.lastAccessedAt);
    const diagramId = coerceDiagramId(value.diagramId);

    return {
        ...(diagramId ? { diagramId } : {}),
        nodes: clipboardData.nodes,
        edges: clipboardData.edges,
        ...(timestamp !== undefined ? { timestamp } : {}),
        ...(lastAccessedAt !== undefined ? { lastAccessedAt } : {}),
        version: '1.0',
        ...(value.isFreshSeed === true ? { isFreshSeed: true } : {}),
        ...(value.layout !== undefined ? { layout: sanitizeAuxValue(value.layout) } : {}),
        ...(value.metadata !== undefined ? { metadata: sanitizeAuxValue(value.metadata) } : {}),
    };
};

export const createAutoSavePayload = (params: {
    diagramId?: string;
    nodes: Node[];
    edges: Edge[];
    timestamp?: number;
    isFreshSeed?: boolean;
    layout?: unknown;
    metadata?: unknown;
}): AutoSavePayload | null => {
    const now = params.timestamp ?? Date.now();
    return coerceAutoSavePayload({
        diagramId: params.diagramId,
        nodes: params.nodes,
        edges: params.edges,
        timestamp: now,
        lastAccessedAt: now,
        version: '1.0',
        isFreshSeed: params.isFreshSeed,
        layout: params.layout,
        metadata: params.metadata,
    });
};

export const parseAutoSavePayload = (raw: string | null | undefined): AutoSavePayload | null => {
    if (!raw) return null;
    if (raw.length > MAX_AUTOSAVE_JSON_CHARS) return null;
    try {
        return coerceAutoSavePayload(JSON.parse(raw));
    } catch {
        return null;
    }
};

export const refreshAutoSaveAccess = (payload: AutoSavePayload, now = Date.now()): AutoSavePayload => ({
    ...payload,
    lastAccessedAt: now,
});

export const shouldCollectAutoSave = (payload: AutoSavePayload | null, now = Date.now()): boolean => {
    if (!payload) return true;
    const lastAccess = payload.lastAccessedAt ?? payload.timestamp ?? 0;
    return now - lastAccess > AUTOSAVE_GC_TTL_MS;
};
