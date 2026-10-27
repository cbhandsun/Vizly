/** A successful request is provisional until its containing transaction commits. */
export const runIndexedDBTransaction = <T>(
    database: IDBDatabase,
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => new Promise((resolve, reject) => {
    let transaction: IDBTransaction | undefined;
    try {
        transaction = database.transaction([storeName], mode);
        const activeTransaction = transaction;
        activeTransaction.oncomplete = () => {
            try {
                resolve(request.result);
            } catch (error) {
                reject(error);
            }
        };
        activeTransaction.onabort = () => reject(
            activeTransaction.error ?? new DOMException('IndexedDB transaction aborted.', 'AbortError'),
        );
        activeTransaction.onerror = () => reject(
            activeTransaction.error ?? new Error('IndexedDB transaction failed.'),
        );
        const request = operation(activeTransaction.objectStore(storeName));
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    } catch (error) {
        reject(error);
        // An operation may throw after opening a transaction. Do not commit partial work.
        try {
            transaction?.abort();
        } catch {
            // An already inactive transaction cannot be aborted; the original error is retained.
        }
    }
});

/** Queue all requests synchronously (or in IDB callbacks); never await inside operation. */
export const runIndexedDBAtomicWrite = <T>(
    database: IDBDatabase,
    storeNames: string[],
    operation: (transaction: IDBTransaction, setResult: (result: T) => void) => void,
): Promise<T> => new Promise((resolve, reject) => {
    let transaction: IDBTransaction | undefined;
    let result: T;
    let hasResult = false;
    try {
        transaction = database.transaction(storeNames, 'readwrite');
        const active = transaction;
        active.oncomplete = () => hasResult ? resolve(result) : reject(new Error('Missing atomic write result'));
        active.onabort = () => reject(active.error ?? new DOMException('IndexedDB transaction aborted.', 'AbortError'));
        active.onerror = () => reject(active.error ?? new Error('IndexedDB transaction failed.'));
        operation(active, value => { result = value; hasResult = true; });
    } catch (error) {
        reject(error);
        try { transaction?.abort(); } catch { /* Preserve the original error. */ }
    }
});
