import {
    coerceToStandardDiagramDataWithReport,
    MAX_STANDARD_DIAGRAM_GROUPS,
} from './coerceDiagram';

const MAX_REMOTE_DIAGRAM_JSON_CHARS = 5 * 1024 * 1024;
const MAX_REMOTE_NODES = 5_000;
const MAX_REMOTE_EDGES = 10_000;
const MAX_REMOTE_OBJECT_KEYS = 200;
const MAX_REMOTE_ARRAY_ITEMS = 10_000;
const MAX_REMOTE_DEPTH = 10;
const MAX_REMOTE_STRING_CHARS = 20_000;
const BLOCKED_JSON_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
);

const sanitizeRemoteJson = (value: unknown, depth = 0): unknown => {
    if (value == null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') return value.slice(0, MAX_REMOTE_STRING_CHARS);

    if (Array.isArray(value)) {
        if (depth >= MAX_REMOTE_DEPTH) return [];
        return value
            .slice(0, MAX_REMOTE_ARRAY_ITEMS)
            .map((item) => sanitizeRemoteJson(item, depth + 1))
            .filter((item) => item !== undefined);
    }

    if (isRecord(value)) {
        if (depth >= MAX_REMOTE_DEPTH) return {};
        const sanitizedRecord: Record<string, unknown> = {};
        for (const [key, nestedValue] of Object.entries(value).slice(0, MAX_REMOTE_OBJECT_KEYS)) {
            if (!key || BLOCKED_JSON_KEYS.has(key)) continue;
            const sanitized = sanitizeRemoteJson(nestedValue, depth + 1);
            if (sanitized !== undefined) sanitizedRecord[key] = sanitized;
        }
        return sanitizedRecord;
    }

    return undefined;
};

export const parseRemoteDiagramJson = (rawJson: string, fallback: { id: string; title: string }) => {
    if (rawJson.length > MAX_REMOTE_DIAGRAM_JSON_CHARS) {
        throw new Error('Remote diagram JSON is too large');
    }

    return coerceRemoteDiagramContent(JSON.parse(rawJson), fallback);
};

export const parseRemoteDiagramContent = (
    content: unknown,
    fallback: { id: string; title: string }
) => {
    if (typeof content === 'string') {
        return parseRemoteDiagramJson(content, fallback);
    }

    return coerceRemoteDiagramContent(content, fallback);
};

export const coerceRemoteDiagramContent = (content: unknown, fallback: { id: string; title: string }) => {
    if (!isRecord(content)) {
        throw new Error('Remote diagram JSON must be an object');
    }

    if (Array.isArray(content.nodes) && content.nodes.length > MAX_REMOTE_NODES) {
        throw new Error('Remote diagram contains too many nodes');
    }
    if (Array.isArray(content.edges) && content.edges.length > MAX_REMOTE_EDGES) {
        throw new Error('Remote diagram contains too many edges');
    }
    if (Array.isArray(content.groups) && content.groups.length > MAX_STANDARD_DIAGRAM_GROUPS) {
        throw new Error('Remote diagram contains too many groups');
    }

    const sanitized = sanitizeRemoteJson(content);
    const report = coerceToStandardDiagramDataWithReport(sanitized, fallback);
    const errors = report.issues.filter((issue) => issue.level === 'error');
    if (errors.length > 0) {
        throw new Error(`Remote diagram is invalid: ${errors.map((issue) => issue.message).join('; ')}`);
    }

    return report.diagram;
};
