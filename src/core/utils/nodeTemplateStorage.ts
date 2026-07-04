import type { NodeTemplate } from '../components/diagrams/hooks/useNodeTemplates';
import { logUiStorageReadFailure, logUiStorageWriteFailure } from './uiStorageLogging';

export const NODE_TEMPLATES_STORAGE_KEY = 'diagram-node-templates';

const MAX_TEMPLATES = 100;
const MAX_TEMPLATE_NODES = 80;
const MAX_TEMPLATE_EDGES = 160;
const MAX_ID_LENGTH = 120;
const MAX_TEXT_LENGTH = 160;
const MAX_NODE_TYPE_LENGTH = 80;
const MAX_COORDINATE_ABS = 1_000_000;
const MAX_OBJECT_KEYS = 80;
const MAX_ARRAY_ITEMS = 80;
const MAX_DEPTH = 5;
const MAX_TEMPLATE_SCAN = MAX_TEMPLATES * 2;
const MAX_NODE_TEMPLATE_STORAGE_JSON_LENGTH = 2 * 1024 * 1024;
const SAFE_ID = /^[\w:./-]+$/u;
const SAFE_NODE_TYPE = /^[A-Za-z][\w:-]*$/u;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeText = (value: unknown, fallback: string, maxLength = MAX_TEXT_LENGTH): string => {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim().slice(0, maxLength);
    return trimmed || fallback;
};

const normalizeId = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_ID_LENGTH || !SAFE_ID.test(trimmed)) return null;
    return trimmed;
};

const normalizeNodeType = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_NODE_TYPE_LENGTH || !SAFE_NODE_TYPE.test(trimmed)) return null;
    return trimmed;
};

const normalizeCoordinate = (value: unknown): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE_ABS) return null;
    return value;
};

const sanitizeJsonValue = (value: unknown, depth = 0): unknown => {
    if (value == null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') return value.slice(0, 1_000);

    if (Array.isArray(value)) {
        if (depth >= MAX_DEPTH) return [];
        return value
            .slice(0, MAX_ARRAY_ITEMS)
            .map(item => sanitizeJsonValue(item, depth + 1))
            .filter(item => item !== undefined);
    }

    if (isRecord(value)) {
        if (depth >= MAX_DEPTH) return {};

        const sanitized: Record<string, unknown> = {};
        for (const [key, nestedValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
            if (!key || key.length > MAX_TEXT_LENGTH || BLOCKED_KEYS.has(key)) continue;
            const sanitizedValue = sanitizeJsonValue(nestedValue, depth + 1);
            if (sanitizedValue !== undefined) sanitized[key] = sanitizedValue;
        }
        return sanitized;
    }

    return undefined;
};

const sanitizeRecord = (value: unknown): Record<string, unknown> => {
    const sanitized = sanitizeJsonValue(value);
    return isRecord(sanitized) ? sanitized : {};
};

const coerceTemplateNode = (value: unknown) => {
    if (!isRecord(value)) return null;

    const type = normalizeNodeType(value.type) ?? 'flowchart';
    const relativeX = normalizeCoordinate(value.relativeX);
    const relativeY = normalizeCoordinate(value.relativeY);
    if (relativeX === null || relativeY === null) return null;

    return {
        type,
        data: sanitizeRecord(value.data),
        style: isRecord(value.style) ? sanitizeRecord(value.style) : undefined,
        relativeX,
        relativeY,
    };
};

const coerceTemplateEdge = (value: unknown, nodeCount: number) => {
    if (!isRecord(value)) return null;

    const sourceIndex = typeof value.sourceIndex === 'number' && Number.isInteger(value.sourceIndex) ? value.sourceIndex : -1;
    const targetIndex = typeof value.targetIndex === 'number' && Number.isInteger(value.targetIndex) ? value.targetIndex : -1;
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex >= nodeCount || targetIndex >= nodeCount) return null;

    const type = normalizeNodeType(value.type);
    return {
        sourceIndex,
        targetIndex,
        ...(typeof value.label === 'string' ? { label: value.label.slice(0, MAX_TEXT_LENGTH) } : {}),
        ...(type ? { type } : {}),
        ...(isRecord(value.data) ? { data: sanitizeRecord(value.data) } : {}),
    };
};

export const coerceNodeTemplate = (value: unknown): NodeTemplate | null => {
    if (!isRecord(value)) return null;

    const id = normalizeId(value.id);
    if (!id) return null;

    const nodeType = normalizeNodeType(value.nodeType) ?? 'flowchart';
    const createdAt = typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) && value.createdAt >= 0
        ? value.createdAt
        : Date.now();

    const groupNodes = Array.isArray(value.nodes)
        ? value.nodes.slice(0, MAX_TEMPLATE_NODES).map(coerceTemplateNode).filter(Boolean)
        : [];
    const groupEdges = Array.isArray(value.edges)
        ? value.edges.slice(0, MAX_TEMPLATE_EDGES).map(edge => coerceTemplateEdge(edge, groupNodes.length)).filter(Boolean)
        : [];
    const isGroup = value.isGroup === true && groupNodes.length > 0;

    return {
        id,
        name: normalizeText(value.name, id),
        category: normalizeText(value.category, '我的模板'),
        nodeType,
        data: sanitizeRecord(value.data),
        style: isRecord(value.style) ? sanitizeRecord(value.style) : undefined,
        createdAt,
        ...(isGroup ? { nodes: groupNodes as NonNullable<NodeTemplate['nodes']>, edges: groupEdges as NonNullable<NodeTemplate['edges']>, isGroup: true } : {}),
    };
};

export const coerceNodeTemplates = (value: unknown): NodeTemplate[] => {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set<string>();
    const templates: NodeTemplate[] = [];

    for (const rawTemplate of source.slice(0, MAX_TEMPLATE_SCAN)) {
        if (templates.length >= MAX_TEMPLATES) break;

        const template = coerceNodeTemplate(rawTemplate);
        if (!template || seen.has(template.id)) continue;
        seen.add(template.id);
        templates.push(template);
    }

    return templates;
};

const parseStoredNodeTemplates = (raw: string | null): unknown => {
    if (!raw) return [];
    if (raw.length > MAX_NODE_TEMPLATE_STORAGE_JSON_LENGTH) {
        logUiStorageReadFailure('nodeTemplateStorage', NODE_TEMPLATES_STORAGE_KEY, new Error('Node template storage JSON is too large.'));
        return [];
    }

    try {
        return JSON.parse(raw) as unknown;
    } catch (error) {
        logUiStorageReadFailure('nodeTemplateStorage', NODE_TEMPLATES_STORAGE_KEY, error);
        return [];
    }
};

export const readNodeTemplates = (): NodeTemplate[] => {
    try {
        return coerceNodeTemplates(parseStoredNodeTemplates(localStorage.getItem(NODE_TEMPLATES_STORAGE_KEY)));
    } catch (error) {
        logUiStorageReadFailure('nodeTemplateStorage', NODE_TEMPLATES_STORAGE_KEY, error);
        return [];
    }
};

export const writeNodeTemplates = (templates: NodeTemplate[]): NodeTemplate[] => {
    const normalized = coerceNodeTemplates(templates);
    try {
        localStorage.setItem(NODE_TEMPLATES_STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
        logUiStorageWriteFailure('nodeTemplateStorage', NODE_TEMPLATES_STORAGE_KEY, error);
    }
    return normalized;
};
