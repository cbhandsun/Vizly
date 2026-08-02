const SHARE_RECORD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHARE_VIEW_TITLE_MAX_LENGTH = 240;

export const SHARE_VIEW_LOAD_TIMEOUT_MS = 15_000;

export type ShareViewRequestResult<T> =
    | { status: 'success'; value: T }
    | { status: 'timeout' }
    | { status: 'unavailable' }
    | { status: 'cancelled' };

export const coerceShareViewTitle = (value: unknown, fallback: unknown): string => {
    const normalize = (candidate: unknown): string => {
        if (typeof candidate !== 'string') return '';
        return candidate
            // eslint-disable-next-line no-control-regex
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, SHARE_VIEW_TITLE_MAX_LENGTH);
    };

    return normalize(value) || normalize(fallback) || 'Shared Diagram';
};

export const createSharedDiagramLocalId = (shareRecordId: unknown): string | null => {
    if (typeof shareRecordId !== 'string') return null;
    const normalizedId = shareRecordId.trim();
    if (!SHARE_RECORD_ID_PATTERN.test(normalizedId)) return null;
    return `shared-record-${normalizedId.toLowerCase()}`;
};

export const runShareViewRequest = async <T>(
    load: (signal: AbortSignal) => Promise<T>,
    options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<ShareViewRequestResult<T>> => {
    const timeoutMs = options.timeoutMs ?? SHARE_VIEW_LOAD_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || options.signal?.aborted) {
        return { status: 'cancelled' };
    }

    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let removeExternalAbortListener: () => void = () => undefined;

    const cancellation = new Promise<ShareViewRequestResult<T>>((resolve) => {
        if (!options.signal) return;
        const handleAbort = () => {
            resolve({ status: 'cancelled' });
            controller.abort();
        };
        options.signal.addEventListener('abort', handleAbort, { once: true });
        removeExternalAbortListener = () => options.signal?.removeEventListener('abort', handleAbort);
    });

    const timeout = new Promise<ShareViewRequestResult<T>>((resolve) => {
        timeoutId = setTimeout(() => {
            resolve({ status: 'timeout' });
            controller.abort();
        }, timeoutMs);
    });

    const request = Promise.resolve()
        .then(() => load(controller.signal))
        .then<ShareViewRequestResult<T>, ShareViewRequestResult<T>>(
            (value) => ({ status: 'success', value }),
            () => controller.signal.aborted
                ? { status: 'cancelled' }
                : { status: 'unavailable' }
        );

    try {
        return await Promise.race([request, timeout, cancellation]);
    } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        removeExternalAbortListener();
    }
};
