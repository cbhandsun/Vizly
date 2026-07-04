import { logUiStorageReadFailure, logUiStorageWriteFailure } from './uiStorageLogging';

export type MinimapSize = 'small' | 'medium' | 'large';

export interface MinimapOffset {
    left: number;
    bottom: number;
}

export const MINIMAP_MINIMIZED_STORAGE_KEY = 'designer.minimap.minimized';
export const MINIMAP_SIZE_STORAGE_KEY = 'designer.minimap.size';
export const MINIMAP_OFFSET_STORAGE_KEY = 'designer.minimap.offset';

const DEFAULT_OFFSET: MinimapOffset = { bottom: 76, left: 24 };
const MAX_OFFSET = 1_000_000;
const MAX_MINIMAP_OFFSET_JSON_LENGTH = 2 * 1024 * 1024;

export const isMinimapSize = (value: unknown): value is MinimapSize =>
    value === 'small' || value === 'medium' || value === 'large';

const coerceOffsetNumber = (value: unknown): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_OFFSET) {
        return null;
    }
    return Math.round(value);
};

export const coerceMinimapOffset = (value: unknown, fallback: MinimapOffset = DEFAULT_OFFSET): MinimapOffset => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...fallback };

    const record = value as Record<string, unknown>;
    const left = coerceOffsetNumber(record.left);
    const bottom = coerceOffsetNumber(record.bottom);
    if (left === null || bottom === null) return { ...fallback };

    return { left, bottom };
};

const parseStoredOffset = (raw: string | null): unknown => {
    if (!raw) return null;
    if (raw.length > MAX_MINIMAP_OFFSET_JSON_LENGTH) {
        logUiStorageReadFailure('minimapOverlayStorage', MINIMAP_OFFSET_STORAGE_KEY, new Error('Minimap offset storage JSON is too large.'));
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch (error) {
        logUiStorageReadFailure('minimapOverlayStorage', MINIMAP_OFFSET_STORAGE_KEY, error);
        return null;
    }
};

export const readMinimapMinimized = (): boolean => {
    try {
        return localStorage.getItem(MINIMAP_MINIMIZED_STORAGE_KEY) === 'true';
    } catch (error) {
        logUiStorageReadFailure('minimapOverlayStorage', MINIMAP_MINIMIZED_STORAGE_KEY, error);
        return false;
    }
};

export const writeMinimapMinimized = (value: boolean): void => {
    try {
        localStorage.setItem(MINIMAP_MINIMIZED_STORAGE_KEY, String(value));
    } catch (error) {
        logUiStorageWriteFailure('minimapOverlayStorage', MINIMAP_MINIMIZED_STORAGE_KEY, error);
    }
};

export const readMinimapSize = (fallback: MinimapSize): MinimapSize => {
    try {
        const saved = localStorage.getItem(MINIMAP_SIZE_STORAGE_KEY);
        return isMinimapSize(saved) ? saved : fallback;
    } catch (error) {
        logUiStorageReadFailure('minimapOverlayStorage', MINIMAP_SIZE_STORAGE_KEY, error);
        return fallback;
    }
};

export const writeMinimapSize = (value: MinimapSize): void => {
    try {
        localStorage.setItem(MINIMAP_SIZE_STORAGE_KEY, value);
    } catch (error) {
        logUiStorageWriteFailure('minimapOverlayStorage', MINIMAP_SIZE_STORAGE_KEY, error);
    }
};

export const readMinimapOffset = (fallback: MinimapOffset = DEFAULT_OFFSET): MinimapOffset => {
    try {
        const parsed = parseStoredOffset(localStorage.getItem(MINIMAP_OFFSET_STORAGE_KEY));
        return coerceMinimapOffset(parsed, fallback);
    } catch (error) {
        logUiStorageReadFailure('minimapOverlayStorage', MINIMAP_OFFSET_STORAGE_KEY, error);
        return { ...fallback };
    }
};

export const writeMinimapOffset = (value: MinimapOffset): MinimapOffset => {
    const normalized = coerceMinimapOffset(value);
    try {
        localStorage.setItem(MINIMAP_OFFSET_STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
        logUiStorageWriteFailure('minimapOverlayStorage', MINIMAP_OFFSET_STORAGE_KEY, error);
    }
    return normalized;
};
