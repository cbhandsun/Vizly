import { coerceClipboardData, type ClipboardData } from './flowchartClipboard';

export interface DragNodeTemplate {
    typeName: string;
    label: string;
    config: Record<string, unknown>;
    offsetX: number;
    offsetY: number;
}

const MAX_DRAG_TEMPLATE_JSON_CHARS = 64 * 1024;
const MAX_REVERSE_IMPORT_JSON_CHARS = 5 * 1024 * 1024;
const MAX_LABEL_CHARS = 160;
const MAX_NODE_TYPE_CHARS = 64;
const MAX_CONFIG_DEPTH = 5;
const MAX_OBJECT_KEYS = 80;
const MAX_ARRAY_ITEMS = 40;
const MAX_STRING_CHARS = 1_000;
const MAX_ABS_NUMBER = 1_000_000;
const MAX_ABS_OFFSET = 2_000;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const isSafeTypeName = (value: unknown): value is string =>
    typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_NODE_TYPE_CHARS
    && /^[A-Za-z][\w:-]*$/u.test(value);

const coerceFiniteNumber = (value: unknown, fallback: number, maxAbs = MAX_ABS_NUMBER): number => {
    const numberValue = typeof value === 'number' ? value : Number.NaN;
    return Number.isFinite(numberValue) && Math.abs(numberValue) <= maxAbs ? numberValue : fallback;
};

const sanitizeJsonValue = (value: unknown, depth = 0): unknown => {
    if (value == null || typeof value === 'boolean') return value;

    if (typeof value === 'number') {
        return Number.isFinite(value) && Math.abs(value) <= MAX_ABS_NUMBER ? value : undefined;
    }

    if (typeof value === 'string') {
        return value.slice(0, MAX_STRING_CHARS);
    }

    if (Array.isArray(value)) {
        if (depth >= MAX_CONFIG_DEPTH) return [];
        return value
            .slice(0, MAX_ARRAY_ITEMS)
            .map(item => sanitizeJsonValue(item, depth + 1))
            .filter(item => item !== undefined);
    }

    if (isRecord(value)) {
        if (depth >= MAX_CONFIG_DEPTH) return {};

        const sanitized: Record<string, unknown> = {};
        for (const [key, nestedValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
            if (!key || key.length > MAX_LABEL_CHARS || BLOCKED_KEYS.has(key)) continue;

            const sanitizedValue = sanitizeJsonValue(nestedValue, depth + 1);
            if (sanitizedValue !== undefined) {
                sanitized[key] = sanitizedValue;
            }
        }
        return sanitized;
    }

    return undefined;
};

const parseBoundedJson = (text: string, maxChars: number): unknown => {
    if (text.length === 0 || text.length > maxChars) return null;

    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

export const parseDragNodeTemplate = (text: string): DragNodeTemplate | null => {
    const parsed = parseBoundedJson(text, MAX_DRAG_TEMPLATE_JSON_CHARS);
    if (!isRecord(parsed) || !isSafeTypeName(parsed.typeName)) return null;

    const sanitizedConfig = sanitizeJsonValue(parsed.config);
    const config = isRecord(sanitizedConfig) ? sanitizedConfig : {};
    const label = typeof parsed.label === 'string'
        ? parsed.label.trim().slice(0, MAX_LABEL_CHARS)
        : parsed.typeName;

    return {
        typeName: parsed.typeName,
        label: label || parsed.typeName,
        config,
        offsetX: coerceFiniteNumber(parsed.offsetX, 0, MAX_ABS_OFFSET),
        offsetY: coerceFiniteNumber(parsed.offsetY, 0, MAX_ABS_OFFSET),
    };
};

export const parseReverseImportDiagramState = (text: string, encoded = false): ClipboardData | null => {
    if (text.length === 0 || text.length > MAX_REVERSE_IMPORT_JSON_CHARS) return null;

    let jsonText = text;
    if (encoded) {
        try {
            jsonText = decodeURIComponent(text);
        } catch {
            return null;
        }
    }

    const parsed = parseBoundedJson(jsonText, MAX_REVERSE_IMPORT_JSON_CHARS);
    return coerceClipboardData(parsed);
};
