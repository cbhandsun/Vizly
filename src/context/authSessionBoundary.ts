// Synchronous boundary: invalidate work before React renders the next account.
let owner: string | null | undefined;
let generation = 0;
let sessionId: string | undefined;
let controller = new AbortController();
const listeners = new Set<() => void>();

export const invalidateAuthSessionWork = (): void => {
    generation += 1;
    controller.abort(new DOMException('Session changed', 'AbortError'));
    controller = new AbortController();
    listeners.forEach(listener => listener());
};

export const updateAuthSessionOwner = (nextOwner: string | null, nextSessionId?: string): void => {
    if ((owner === nextOwner && sessionId === nextSessionId) || (owner === undefined && nextOwner === null)) {
        owner = nextOwner;
        return;
    }
    owner = nextOwner;
    sessionId = nextSessionId;
    invalidateAuthSessionWork();
};

export const onAuthSessionInvalidated = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

export const getAuthSessionRevision = (): number => generation;

export const captureAuthSession = (userId?: string | null) => {
    const captured = generation;
    const signal = controller.signal;
    const isCurrent = () => captured === generation && !signal.aborted
        && (owner === undefined || owner === (userId ?? null));
    return { signal, isCurrent };
};

// This unverified claim only invalidates local work; never use it for authorization.
export const getAuthSessionBoundaryId = (accessToken: string | undefined): string | undefined => {
    if (!accessToken || accessToken.length > 32_768) return undefined;
    try {
        const payload = accessToken.split('.')[1];
        if (!payload) return undefined;
        const value: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        if (!value || typeof value !== 'object' || !('session_id' in value)) return undefined;
        return typeof value.session_id === 'string' && value.session_id.length <= 160 ? value.session_id : undefined;
    } catch { return undefined; }
};

export const getAuthSessionOwner = (): string | null => owner ?? null;
