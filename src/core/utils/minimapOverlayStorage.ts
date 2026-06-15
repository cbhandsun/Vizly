import { safeJsonParse } from './jsonUtils';

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

export const readMinimapMinimized = (): boolean => {
    try {
        return localStorage.getItem(MINIMAP_MINIMIZED_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
};

export const writeMinimapMinimized = (value: boolean): void => {
    try {
        localStorage.setItem(MINIMAP_MINIMIZED_STORAGE_KEY, String(value));
    } catch {
        void 0;
    }
};

export const readMinimapSize = (fallback: MinimapSize): MinimapSize => {
    try {
        const saved = localStorage.getItem(MINIMAP_SIZE_STORAGE_KEY);
        return isMinimapSize(saved) ? saved : fallback;
    } catch {
        return fallback;
    }
};

export const writeMinimapSize = (value: MinimapSize): void => {
    try {
        localStorage.setItem(MINIMAP_SIZE_STORAGE_KEY, value);
    } catch {
        void 0;
    }
};

export const readMinimapOffset = (fallback: MinimapOffset = DEFAULT_OFFSET): MinimapOffset => {
    try {
        const parsed = safeJsonParse<unknown>(localStorage.getItem(MINIMAP_OFFSET_STORAGE_KEY), null);
        return coerceMinimapOffset(parsed, fallback);
    } catch {
        return { ...fallback };
    }
};

export const writeMinimapOffset = (value: MinimapOffset): MinimapOffset => {
    const normalized = coerceMinimapOffset(value);
    try {
        localStorage.setItem(MINIMAP_OFFSET_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
        void 0;
    }
    return normalized;
};
