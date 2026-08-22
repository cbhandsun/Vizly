import type { StandardDiagramData } from '../models/DiagramModels';
import { coerceToStandardDiagramData } from './coerceDiagram';
import { logUiStorageReadFailure, logUiStorageWriteFailure } from './uiStorageLogging';

export const CUSTOM_PRESETS_STORAGE_KEY = 'diagram-custom-presets';

export const CUSTOM_PRESETS_LIMIT = 100;
const MAX_PRESET_SCAN = CUSTOM_PRESETS_LIMIT * 2;
export const CUSTOM_PRESET_NAME_MAX_LENGTH = 120;
const MAX_STRING_LENGTH = 4_000;
const MAX_OBJECT_KEYS = 120;
const MAX_ARRAY_ITEMS = 2_000;
const MAX_DEPTH = 8;
const MAX_CUSTOM_PRESETS_JSON_LENGTH = 2 * 1024 * 1024;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

export const normalizeCustomPresetName = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value
        .split('')
        .filter(char => {
            const code = char.charCodeAt(0);
            return code > 31 && code !== 127;
        })
        .join('')
        .trim()
        .slice(0, CUSTOM_PRESET_NAME_MAX_LENGTH);
    return normalized || null;
};

export const normalizeCustomPresetLookupKey = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const key = value.startsWith('custom:') ? value.slice('custom:'.length) : value;
    return normalizeCustomPresetName(key);
};

const sanitizeJsonValue = (value: unknown, depth = 0): unknown => {
    if (value == null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);

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
            if (!key || key.length > CUSTOM_PRESET_NAME_MAX_LENGTH || BLOCKED_KEYS.has(key)) continue;
            const sanitizedValue = sanitizeJsonValue(nestedValue, depth + 1);
            if (sanitizedValue !== undefined) sanitized[key] = sanitizedValue;
        }
        return sanitized;
    }

    return undefined;
};

export const coerceCustomPreset = (value: unknown, fallback: { id: string; title: string }): StandardDiagramData | null => {
    if (!isRecord(value)) return null;

    const sanitized = sanitizeJsonValue(value);
    if (!isRecord(sanitized)) return null;

    const diagram = coerceToStandardDiagramData(sanitized, fallback);
    if (!Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) return null;

    return {
        ...diagram,
        id: normalizeCustomPresetName(diagram.id) ?? fallback.id,
        name: normalizeCustomPresetName(diagram.name) ?? fallback.title,
        metadata: {
            ...(isRecord(diagram.metadata) ? diagram.metadata : {}),
            title: normalizeCustomPresetName(diagram.metadata?.title) ?? normalizeCustomPresetName(diagram.name) ?? fallback.title,
        },
    };
};

export const coerceCustomPresetMap = (value: unknown): Record<string, StandardDiagramData> => {
    if (!isRecord(value)) return {};

    const result: Record<string, StandardDiagramData> = {};
    let count = 0;
    for (const [rawName, rawPreset] of Object.entries(value).slice(0, MAX_PRESET_SCAN)) {
        if (count >= CUSTOM_PRESETS_LIMIT) break;
        if (BLOCKED_KEYS.has(rawName)) continue;

        const name = normalizeCustomPresetName(rawName);
        if (!name || result[name]) continue;

        const preset = coerceCustomPreset(rawPreset, { id: name, title: name });
        if (!preset) continue;

        result[name] = preset;
        count += 1;
    }

    return result;
};

const parseStoredCustomPresets = (raw: string | null): unknown => {
    if (!raw) return {};
    if (raw.length > MAX_CUSTOM_PRESETS_JSON_LENGTH) {
        logUiStorageReadFailure('customPresetStorage', CUSTOM_PRESETS_STORAGE_KEY, new Error('Custom presets JSON is too large.'));
        return {};
    }

    try {
        return JSON.parse(raw) as unknown;
    } catch (error) {
        logUiStorageReadFailure('customPresetStorage', CUSTOM_PRESETS_STORAGE_KEY, error);
        return {};
    }
};

export const readCustomPresetMap = (storage: Pick<Storage, 'getItem'> = localStorage): Record<string, StandardDiagramData> => {
    try {
        return coerceCustomPresetMap(parseStoredCustomPresets(storage.getItem(CUSTOM_PRESETS_STORAGE_KEY)));
    } catch (error) {
        logUiStorageReadFailure('customPresetStorage', CUSTOM_PRESETS_STORAGE_KEY, error);
        return {};
    }
};

export const writeCustomPresetMap = (
    presets: Record<string, StandardDiagramData>,
    storage: Pick<Storage, 'setItem'> = localStorage,
): Record<string, StandardDiagramData> => {
    const normalized = coerceCustomPresetMap(presets);
    try {
        storage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
        logUiStorageWriteFailure('customPresetStorage', CUSTOM_PRESETS_STORAGE_KEY, error);
    }
    return normalized;
};

export type CustomPresetSaveError = 'invalid' | 'capacity' | 'readFailed' | 'writeFailed';

export type CustomPresetSaveResult =
    | { ok: true; preset: StandardDiagramData }
    | { ok: false; error: CustomPresetSaveError };

type CustomPresetStorage = Pick<Storage, 'getItem' | 'setItem'>;

const readCustomPresetMapForWrite = (
    storage: Pick<Storage, 'getItem'>,
): { ok: true; presets: Record<string, StandardDiagramData> } | { ok: false } => {
    let raw: string | null;
    try {
        raw = storage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
    } catch (error) {
        logUiStorageReadFailure('customPresetStorage', CUSTOM_PRESETS_STORAGE_KEY, error);
        return { ok: false };
    }

    if (!raw) return { ok: true, presets: {} };
    if (raw.length > MAX_CUSTOM_PRESETS_JSON_LENGTH) {
        logUiStorageReadFailure('customPresetStorage', CUSTOM_PRESETS_STORAGE_KEY, new Error('Custom presets JSON is too large.'));
        return { ok: false };
    }

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!isRecord(parsed)) {
            logUiStorageReadFailure('customPresetStorage', CUSTOM_PRESETS_STORAGE_KEY, new Error('Custom presets JSON must be an object.'));
            return { ok: false };
        }
        return { ok: true, presets: coerceCustomPresetMap(parsed) };
    } catch (error) {
        logUiStorageReadFailure('customPresetStorage', CUSTOM_PRESETS_STORAGE_KEY, error);
        return { ok: false };
    }
};

export const saveCustomPreset = (
    name: string,
    preset: unknown,
    storage: CustomPresetStorage = localStorage,
): CustomPresetSaveResult => {
    const normalizedName = normalizeCustomPresetName(name);
    if (!normalizedName) return { ok: false, error: 'invalid' };

    const normalizedPreset = coerceCustomPreset(preset, { id: normalizedName, title: normalizedName });
    if (!normalizedPreset) return { ok: false, error: 'invalid' };

    const stored = readCustomPresetMapForWrite(storage);
    if (!stored.ok) return { ok: false, error: 'readFailed' };
    if (!Object.hasOwn(stored.presets, normalizedName)
        && Object.keys(stored.presets).length >= CUSTOM_PRESETS_LIMIT) {
        return { ok: false, error: 'capacity' };
    }

    const nextPresets = coerceCustomPresetMap({
        ...stored.presets,
        [normalizedName]: normalizedPreset,
    });
    const persistedPreset = nextPresets[normalizedName];
    if (!persistedPreset) return { ok: false, error: 'capacity' };

    try {
        storage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(nextPresets));
    } catch (error) {
        logUiStorageWriteFailure('customPresetStorage', CUSTOM_PRESETS_STORAGE_KEY, error);
        return { ok: false, error: 'writeFailed' };
    }

    return { ok: true, preset: persistedPreset };
};

export const addCustomPreset = (
    name: string,
    preset: unknown,
    storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): StandardDiagramData | null => {
    const result = saveCustomPreset(name, preset, storage);
    return result.ok ? result.preset : null;
};

export const getCustomPreset = (
    leafKey: string,
    storage: Pick<Storage, 'getItem'> = localStorage,
): StandardDiagramData | null => {
    const name = normalizeCustomPresetLookupKey(leafKey);
    if (!name) return null;
    return readCustomPresetMap(storage)[name] ?? null;
};
