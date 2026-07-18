const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const LOCAL_WS_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const toSafeSegment = (value: string, fallback: string): string => {
    const normalized = value
        .trim()
        .replace(/[^A-Za-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 128);

    return SAFE_ID_PATTERN.test(normalized) ? normalized : fallback;
};

export const normalizeCollaborationRoomName = (
    roomName: unknown,
    fallback = 'vizly-room-default'
): string => {
    if (typeof roomName !== 'string') return fallback;
    return toSafeSegment(roomName, fallback);
};

export const normalizeCollaborationDiagramId = (
    diagramId: unknown,
    fallback = 'domain-model'
): string => {
    if (typeof diagramId !== 'string') return fallback;
    return toSafeSegment(diagramId, fallback);
};

export const normalizeCollaborationToken = (token: unknown): string | undefined => {
    if (typeof token !== 'string') return undefined;
    const trimmed = token.trim();
    if (!trimmed || trimmed.length > 4096 || /[\r\n]/.test(trimmed)) return undefined;
    return trimmed;
};

export const normalizeCollaborationServerUrl = (serverUrl: unknown): string | null => {
    if (typeof serverUrl !== 'string') return null;
    const trimmed = serverUrl.trim();
    if (!trimmed || trimmed.startsWith('//')) return null;

    try {
        const parsed = new URL(trimmed);
        const secureRemote = parsed.protocol === 'wss:';
        const localDev = parsed.protocol === 'ws:' && LOCAL_WS_HOSTS.has(parsed.hostname);

        if (!secureRemote && !localDev) return null;
        if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;

        return parsed.toString();
    } catch {
        return null;
    }
};
