import { logDiagramMenuStorageFailure } from './diagramMenuLogging';

export const DIAGRAM_MENU_COLLAPSED_GROUPS_KEY = 'diagramMenu.collapsedGroups';
export const DIAGRAM_MENU_SCROLL_TOP_KEY = 'diagramMenu.scrollTop';

const MAX_GROUP_KEY_LENGTH = 80;
const MAX_GROUP_COUNT = 100;
const MAX_SCROLL_TOP = 1_000_000;
const MAX_DIAGRAM_MENU_JSON_LENGTH = 2 * 1024 * 1024;
const SAFE_GROUP_KEY = /^[\w:./ -]+$/u;

export const coerceCollapsedGroups = (value: unknown): Record<string, boolean> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    const groups: Record<string, boolean> = {};
    for (const [key, rawValue] of Object.entries(value).slice(0, MAX_GROUP_COUNT)) {
        const normalizedKey = key.trim();
        if (
            !normalizedKey
            || normalizedKey.length > MAX_GROUP_KEY_LENGTH
            || !SAFE_GROUP_KEY.test(normalizedKey)
            || typeof rawValue !== 'boolean'
        ) {
            continue;
        }
        groups[normalizedKey] = rawValue;
    }
    return groups;
};

const parseStoredJson = <T>(raw: string | null, fallback: T, action: 'readCollapsedGroups'): T => {
    if (!raw) return fallback;
    if (raw.length > MAX_DIAGRAM_MENU_JSON_LENGTH) {
        logDiagramMenuStorageFailure(action, new Error('Diagram menu storage JSON is too large.'));
        return fallback;
    }
    try {
        return JSON.parse(raw) as T;
    } catch (error) {
        logDiagramMenuStorageFailure(action, error);
        return fallback;
    }
};

export const readCollapsedGroups = (fallback: Record<string, boolean> = {}): Record<string, boolean> => {
    try {
        const parsed = parseStoredJson<unknown>(
            localStorage.getItem(DIAGRAM_MENU_COLLAPSED_GROUPS_KEY),
            null,
            'readCollapsedGroups'
        );
        const groups = coerceCollapsedGroups(parsed);
        return Object.keys(groups).length > 0 ? groups : { ...fallback };
    } catch (error) {
        logDiagramMenuStorageFailure('readCollapsedGroups', error);
        return { ...fallback };
    }
};

export const writeCollapsedGroups = (groups: Record<string, boolean>): Record<string, boolean> => {
    const normalized = coerceCollapsedGroups(groups);
    try {
        localStorage.setItem(DIAGRAM_MENU_COLLAPSED_GROUPS_KEY, JSON.stringify(normalized));
    } catch (error) {
        logDiagramMenuStorageFailure('writeCollapsedGroups', error);
    }
    return normalized;
};

export const coerceMenuScrollTop = (value: unknown): number | null => {
    const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > MAX_SCROLL_TOP) return null;
    return Math.round(numeric);
};

export const readMenuScrollTop = (): number | null => {
    try {
        return coerceMenuScrollTop(localStorage.getItem(DIAGRAM_MENU_SCROLL_TOP_KEY));
    } catch (error) {
        logDiagramMenuStorageFailure('readMenuScrollTop', error);
        return null;
    }
};

export const writeMenuScrollTop = (scrollTop: number): number | null => {
    const normalized = coerceMenuScrollTop(scrollTop);
    if (normalized === null) return null;

    try {
        localStorage.setItem(DIAGRAM_MENU_SCROLL_TOP_KEY, String(normalized));
    } catch (error) {
        logDiagramMenuStorageFailure('writeMenuScrollTop', error);
    }
    return normalized;
};
