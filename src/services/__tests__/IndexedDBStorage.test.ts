import { afterEach, describe, expect, it, vi } from 'vitest';

const loadIndexedDbModule = async () => {
    vi.resetModules();
    return import('../IndexedDBStorage');
};

describe('LocalDB', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('redacts IndexedDB bootstrap errors before logging them', async () => {
        const request: Record<string, unknown> = {};
        const openMock = vi.fn(() => {
            queueMicrotask(() => {
                request.error = new Error('Authorization: Bearer sk-live-secret');
                (request.onerror as ((event: { target: typeof request }) => void) | undefined)?.({ target: request });
            });
            return request as unknown as IDBOpenDBRequest;
        });
        vi.stubGlobal('indexedDB', { open: openMock });
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const { LocalDB } = await loadIndexedDbModule();
        const db = new LocalDB();

        await expect(db.listDiagrams()).rejects.toThrow('Authorization: Bearer sk-live-secret');
        expect(consoleErrorSpy).toHaveBeenCalledWith('IndexedDB initialization error:', expect.anything());
        expect(JSON.stringify(consoleErrorSpy.mock.calls[0]?.[1])).toContain('[redacted]');
        expect(JSON.stringify(consoleErrorSpy.mock.calls[0]?.[1])).not.toContain('sk-live-secret');

        consoleErrorSpy.mockRestore();
    });
});
