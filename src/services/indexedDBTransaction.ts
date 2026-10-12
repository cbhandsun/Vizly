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
