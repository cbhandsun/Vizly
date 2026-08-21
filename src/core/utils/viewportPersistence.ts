import { safeJsonParseWithLimit } from './jsonUtils';

export interface PersistedDiagramViewport {
    x: number;
    y: number;
    zoom: number;
}

export const VIEWPORT_SESSION_STORAGE_PREFIX = 'vizly:viewport:v1:';

const MAX_VIEWPORT_SCOPE_LENGTH = 180;
const MAX_VIEWPORT_PAYLOAD_LENGTH = 256;
const MAX_ABSOLUTE_VIEWPORT_COORDINATE = 1_000_000_000;
const MAX_VIEWPORT_ZOOM = 8;

type ViewportStorageReader = Pick<Storage, 'getItem'>;
type ViewportStorageWriter = Pick<Storage, 'setItem'>;

export const isUsablePersistedDiagramViewport = (
    value: unknown,
): value is PersistedDiagramViewport => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.x === 'number'
        && Number.isFinite(candidate.x)
        && Math.abs(candidate.x) <= MAX_ABSOLUTE_VIEWPORT_COORDINATE
        && typeof candidate.y === 'number'
        && Number.isFinite(candidate.y)
        && Math.abs(candidate.y) <= MAX_ABSOLUTE_VIEWPORT_COORDINATE
        && typeof candidate.zoom === 'number'
        && Number.isFinite(candidate.zoom)
        && candidate.zoom > 0
        && candidate.zoom <= MAX_VIEWPORT_ZOOM;
};

export const buildViewportSessionStorageKey = (scope: unknown): string | null => {
    if (typeof scope !== 'string') return null;
    const normalizedScope = scope.trim();
    if (!normalizedScope || normalizedScope.length > MAX_VIEWPORT_SCOPE_LENGTH) return null;
    return `${VIEWPORT_SESSION_STORAGE_PREFIX}${encodeURIComponent(normalizedScope)}`;
};

export const parsePersistedDiagramViewport = (raw: unknown): PersistedDiagramViewport | null => {
    if (typeof raw !== 'string' || !raw || raw.length > MAX_VIEWPORT_PAYLOAD_LENGTH) return null;
    const parsed = safeJsonParseWithLimit<unknown>(raw, null, {
        maxLength: MAX_VIEWPORT_PAYLOAD_LENGTH,
    });
    return isUsablePersistedDiagramViewport(parsed) ? parsed : null;
};

export const readPersistedDiagramViewport = (
    storage: ViewportStorageReader,
    scope: unknown,
): PersistedDiagramViewport | null => {
    const key = buildViewportSessionStorageKey(scope);
    if (!key) return null;
    return parsePersistedDiagramViewport(storage.getItem(key));
};

export const writePersistedDiagramViewport = (
    storage: ViewportStorageWriter,
    scope: unknown,
    viewport: unknown,
): boolean => {
    const key = buildViewportSessionStorageKey(scope);
    if (!key || !isUsablePersistedDiagramViewport(viewport)) return false;
    storage.setItem(key, JSON.stringify(viewport));
    return true;
};
