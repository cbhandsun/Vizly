// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readBoundedBody } from '../functions/_shared/boundedBody';

const stream = (chunks: Uint8Array[]) => new ReadableStream<Uint8Array>({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); },
});

describe('bounded UTF-8 body', () => {
    it('handles empty bodies and preserves multibyte characters split across chunks', async () => {
        expect(await readBoundedBody(null, 8)).toBe('');
        const encoded = new TextEncoder().encode('图😀');
        expect(await readBoundedBody(stream([encoded.slice(0, 2), encoded.slice(2, 5), encoded.slice(5)]), 7)).toBe('图😀');
    });
    it('enforces bytes without trusting Content-Length and cancels unread data', async () => {
        const cancel = vi.fn();
        const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('图😀')); }, cancel });
        await expect(readBoundedBody(body, 6)).rejects.toMatchObject({ name: 'BodyLimitError' });
        expect(cancel).toHaveBeenCalledOnce();
        expect(body.locked).toBe(false);
    });
    it('rejects invalid limits and malformed UTF-8', async () => {
        await expect(readBoundedBody(null, 0)).rejects.toThrow('Invalid body byte limit');
        await expect(readBoundedBody(stream([new Uint8Array([0xff])]), 1)).rejects.toThrow();
    });
    it('cancels a stalled read and rejects the original abort reason', async () => {
        const controller = new AbortController();
        const cancel = vi.fn();
        const body = new ReadableStream<Uint8Array>({ start() {}, cancel });
        const pending = readBoundedBody(body, 100, controller.signal);
        controller.abort(new DOMException('Read timed out', 'TimeoutError'));
        await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
        expect(cancel).toHaveBeenCalledOnce();
        expect(body.locked).toBe(false);
    });
    it.each([false, true])('cancels an unread body when already aborted, preserving the reason even if cleanup fails: %s', async fails => {
        const controller = new AbortController();
        const reason = new DOMException('Synthetic cancellation', 'AbortError');
        controller.abort(reason);
        const cancel = vi.fn(() => fails ? Promise.reject(new Error('Synthetic cleanup failure')) : Promise.resolve());
        const body = new ReadableStream<Uint8Array>({ start() {}, cancel });
        await expect(readBoundedBody(body, 100, controller.signal)).rejects.toBe(reason);
        expect(cancel).toHaveBeenCalledOnce();
        expect(body.locked).toBe(false);
    });
    it('preserves an existing abort for a missing body', async () => {
        const controller = new AbortController();
        const reason = new DOMException('Synthetic cancellation', 'AbortError');
        controller.abort(reason);
        await expect(readBoundedBody(null, 100, controller.signal)).rejects.toBe(reason);
    });
    it('propagates network failure instead of treating it as an empty body', async () => {
        const failure = new Error('Read failed');
        const body = new ReadableStream<Uint8Array>({ start(c) { c.error(failure); } });
        await expect(readBoundedBody(body, 10)).rejects.toBe(failure);
    });
});
