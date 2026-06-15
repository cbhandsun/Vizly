export const DIAGRAM_SELECTED_STORAGE_KEY = 'diagramMenu.selectedDiagramId';
export const DIAGRAM_RECENT_STORAGE_KEY = 'diagramMenu.recent';
export const DIAGRAM_FAVORITES_STORAGE_KEY = 'diagramMenu.favorites';

const MAX_DIAGRAM_ID_LENGTH = 180;
const MAX_RECENT_DIAGRAMS = 12;
const MAX_FAVORITE_DIAGRAMS = 80;

export const isSafeDiagramId = (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    const id = value.trim();
    return id.length > 0 && id.length <= MAX_DIAGRAM_ID_LENGTH && /^[\w:./-]+$/u.test(id);
};

const parseJson = (value: string | null): unknown => {
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

export const coerceDiagramIdList = (value: unknown, maxEntries: number): string[] => {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const result: string[] = [];

    for (const rawId of value) {
        if (!isSafeDiagramId(rawId)) continue;
        const id = rawId.trim();
        if (seen.has(id)) continue;
        seen.add(id);
        result.push(id);
        if (result.length >= maxEntries) break;
    }

    return result;
};

export const readSelectedDiagramId = (fallback: string): string => {
    try {
        const saved = localStorage.getItem(DIAGRAM_SELECTED_STORAGE_KEY);
        return isSafeDiagramId(saved) ? saved.trim() : fallback;
    } catch {
        return fallback;
    }
};

export const writeSelectedDiagramId = (id: string): string | null => {
    if (!isSafeDiagramId(id)) return null;
    const normalizedId = id.trim();
    try {
        localStorage.setItem(DIAGRAM_SELECTED_STORAGE_KEY, normalizedId);
    } catch {
        void 0;
    }
    return normalizedId;
};

export const readRecentDiagramIds = (): string[] => {
    try {
        return coerceDiagramIdList(parseJson(localStorage.getItem(DIAGRAM_RECENT_STORAGE_KEY)), MAX_RECENT_DIAGRAMS);
    } catch {
        return [];
    }
};

export const writeRecentDiagramIds = (ids: unknown): string[] => {
    const normalized = coerceDiagramIdList(ids, MAX_RECENT_DIAGRAMS);
    try {
        localStorage.setItem(DIAGRAM_RECENT_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
        void 0;
    }
    return normalized;
};

export const addRecentDiagramId = (id: string, previous: readonly string[] = readRecentDiagramIds()): string[] => {
    if (!isSafeDiagramId(id)) return coerceDiagramIdList(previous, MAX_RECENT_DIAGRAMS);
    const normalizedId = id.trim();
    return writeRecentDiagramIds([normalizedId, ...previous.filter(item => item !== normalizedId)]);
};

export const readFavoriteDiagramIds = (): string[] => {
    try {
        return coerceDiagramIdList(parseJson(localStorage.getItem(DIAGRAM_FAVORITES_STORAGE_KEY)), MAX_FAVORITE_DIAGRAMS);
    } catch {
        return [];
    }
};

export const writeFavoriteDiagramIds = (ids: unknown): string[] => {
    const normalized = coerceDiagramIdList(ids, MAX_FAVORITE_DIAGRAMS);
    try {
        localStorage.setItem(DIAGRAM_FAVORITES_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
        void 0;
    }
    return normalized;
};

export const toggleFavoriteDiagramId = (id: string, previous: readonly string[] = readFavoriteDiagramIds()): string[] => {
    if (!isSafeDiagramId(id)) return coerceDiagramIdList(previous, MAX_FAVORITE_DIAGRAMS);
    const normalizedId = id.trim();
    const next = previous.includes(normalizedId)
        ? previous.filter(item => item !== normalizedId)
        : [normalizedId, ...previous];
    return writeFavoriteDiagramIds(next);
};
