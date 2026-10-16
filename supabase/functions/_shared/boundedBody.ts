export class BodyLimitError extends Error {
    constructor() {
        super('Body exceeds the byte limit.');
        this.name = 'BodyLimitError';
    }
}

/** Bound allocation while reading, including chunked bodies with no Content-Length. */
export const readBoundedBody = async (
    body: ReadableStream<Uint8Array> | null,
    maxBytes: number,
    signal?: AbortSignal,
): Promise<string> => {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('Invalid body byte limit.');
    if (!body) { signal?.throwIfAborted(); return ''; }
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const parts: string[] = [];
    let bytes = 0;
    let aborted = false;
    const cancel = () => {
        aborted = true;
        // Only release resources here; the original abort/failure is propagated below.
        void reader.cancel().catch(() => undefined);
    };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
        while (true) {
            signal?.throwIfAborted();
            const chunk = await reader.read();
            signal?.throwIfAborted();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > maxBytes) throw new BodyLimitError();
            parts.push(decoder.decode(chunk.value, { stream: true }));
        }
        parts.push(decoder.decode());
        return parts.join('');
    } catch (error) {
        if (!aborted) await reader.cancel().catch(() => undefined);
        throw error;
    } finally {
        signal?.removeEventListener('abort', cancel);
        reader.releaseLock();
    }
};
