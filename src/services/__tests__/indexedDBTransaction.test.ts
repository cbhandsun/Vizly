// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { runIndexedDBTransaction } from '../indexedDBTransaction';

const harness = <T>(result: T) => {
    const request = { result, error: null, onerror: null } as unknown as IDBRequest<T>;
    const store = {} as IDBObjectStore;
    const transaction = {
        error: null,
        objectStore: vi.fn(() => store),
        abort: vi.fn(),
        oncomplete: null,
        onerror: null,
        onabort: null,
    } as unknown as IDBTransaction;
    const database = { transaction: vi.fn(() => transaction) } as unknown as IDBDatabase;
    const fire = (event: 'complete' | 'abort' | 'error') => transaction[`on${event}`]?.call(transaction, new Event(event));
    return { request, transaction, database, store, fire };
};

describe('IndexedDB transaction completion', () => {
    it.each([undefined, null, [], { id: 'diagram-1' }])('returns the request result only after commit: %j', async result => {
        const h = harness(result);
        const settled = vi.fn();
        const pending = runIndexedDBTransaction(h.database, 'diagrams', 'readwrite', () => h.request);
        void pending.then(settled);
        await Promise.resolve();
        expect(settled).not.toHaveBeenCalled();
        h.fire('complete');
        await expect(pending).resolves.toEqual(result);
    });

    it('rejects abort even when the request result is available', async () => {
        const h = harness('written-but-not-committed');
        const pending = runIndexedDBTransaction(h.database, 'diagrams', 'readwrite', () => h.request);
        h.fire('abort');
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        h.fire('complete');
    });

    it('preserves quota errors and request failures', async () => {
        const h = harness(undefined);
        const error = new DOMException('Quota exhausted', 'QuotaExceededError');
        Object.defineProperty(h.transaction, 'error', { value: error });
        const pending = runIndexedDBTransaction(h.database, 'diagrams', 'readwrite', () => h.request);
        h.fire('error');
        await expect(pending).rejects.toBe(error);
        const second = harness(undefined);
        Object.defineProperty(second.request, 'error', { value: error });
        const requestPending = runIndexedDBTransaction(second.database, 'diagrams', 'readonly', () => second.request);
        second.request.onerror?.call(second.request, new Event('error'));
        await expect(requestPending).rejects.toBe(error);
    });

    it('aborts partial work and preserves synchronous serialization errors', async () => {
        const h = harness(undefined);
        const error = new DOMException('Cannot clone value', 'DataCloneError');
        await expect(runIndexedDBTransaction(h.database, 'diagrams', 'readwrite', () => { throw error; })).rejects.toBe(error);
        expect(h.transaction.abort).toHaveBeenCalledOnce();
    });

    it('rejects unavailable stores and errors reading a committed result', async () => {
        const h = harness(undefined);
        vi.mocked(h.database.transaction).mockImplementationOnce(() => { throw new Error('Missing store'); });
        await expect(runIndexedDBTransaction(h.database, 'diagrams', 'readonly', () => h.request)).rejects.toThrow('Missing store');
        Object.defineProperty(h.request, 'result', { get: () => { throw new Error('Invalid result'); } });
        const pending = runIndexedDBTransaction(h.database, 'diagrams', 'readonly', () => h.request);
        h.fire('complete');
        await expect(pending).rejects.toThrow('Invalid result');
    });
});
