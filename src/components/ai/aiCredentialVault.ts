import { captureAuthSession } from '@/context/authSessionBoundary';

const DATABASE = 'VizlyAICredentials';
interface ProviderSecret { id: string; baseUrl: string; apiKey: string; rememberKey?: boolean }
interface SealedSecret { id: string; owner: string; providerId: string; baseUrl: string; iv: Uint8Array; ciphertext: ArrayBuffer }
const ownerKey = (owner?: string | null) => owner || '__anonymous__';
const recordId = (owner: string, providerId: string) => JSON.stringify([owner, providerId]);
const additionalData = (owner: string, provider: Pick<ProviderSecret, 'id' | 'baseUrl'>) =>
    new TextEncoder().encode(JSON.stringify([owner, provider.id, provider.baseUrl]));

const openVault = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    if (!globalThis.crypto?.subtle || !globalThis.indexedDB) { reject(new Error('aiConfig.vault.unavailable')); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
        request.result.createObjectStore('keys', { keyPath: 'id' });
        request.result.createObjectStore('credentials', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('aiConfig.vault.unavailable'));
    request.onblocked = () => reject(new Error('aiConfig.vault.unavailable'));
});

const read = async <T>(store: string, key?: IDBValidKey): Promise<T> => {
    const db = await openVault();
    try {
        return await new Promise<T>((resolve, reject) => {
            const request = key === undefined ? db.transaction(store).objectStore(store).getAll()
                : db.transaction(store).objectStore(store).get(key);
            request.onsuccess = () => resolve(request.result as T);
            request.onerror = () => reject(new Error('aiConfig.vault.unavailable'));
        });
    } finally { db.close(); }
};

const write = async (store: string, mutate: (store: IDBObjectStore) => void) => {
    const db = await openVault();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(new Error('aiConfig.vault.saveFailed'));
            tx.onerror = () => reject(new Error('aiConfig.vault.saveFailed'));
            mutate(tx.objectStore(store));
        });
    } finally { db.close(); }
};

// Serialize key creation, replacement, and deletion across concurrent panels.
let writes: Promise<void> = Promise.resolve();
const serialize = (operation: () => Promise<void>) => {
    const pending = writes.then(operation);
    writes = pending.catch(() => undefined);
    return pending;
};

export const saveRememberedAIKeys = (userId: string | null | undefined, providers: ProviderSecret[]): Promise<void> => {
    const session = captureAuthSession(userId);
    const owner = ownerKey(userId);
    const captured = providers.map(provider => ({ ...provider }));
    return serialize(async () => {
        const assertCurrent = () => {
            if (!session.isCurrent()) throw new DOMException('Session changed', 'AbortError');
        };
        assertCurrent();
        const desired = captured.filter(provider => provider.rememberKey && provider.apiKey.trim());
        // Session-only saves must work when browser persistence is unavailable.
        if (!desired.length && !globalThis.indexedDB) return;
        const stored = await read<SealedSecret[]>('credentials');
        const stale = stored.filter(row => row.owner === owner && !desired.some(provider => row.id === recordId(owner, provider.id)));
        let key = (await read<{ id: string; key: CryptoKey } | undefined>('keys', owner))?.key;
        if (desired.length && !key) {
            const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
            assertCurrent();
            await write('keys', store => {
                const request = store.get(owner);
                request.onsuccess = () => {
                    if (!session.isCurrent()) { store.transaction.abort(); return; }
                    // A second tab may have created the owner's key meanwhile.
                    key = request.result?.key ?? candidate;
                    if (!request.result) store.put({ id: owner, key });
                };
            });
        }
        const sealed: SealedSecret[] = [];
        for (const provider of desired) {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(owner, provider) },
                key!, new TextEncoder().encode(provider.apiKey));
            sealed.push({ id: recordId(owner, provider.id), owner, providerId: provider.id, baseUrl: provider.baseUrl, iv, ciphertext });
        }
        assertCurrent();
        await write('credentials', store => {
            stale.forEach(row => store.delete(row.id));
            sealed.forEach(row => store.put(row));
        });
    });
};

export const loadRememberedAIKeys = async (userId: string | null | undefined, providers: ProviderSecret[]): Promise<Map<string, string>> => {
    const session = captureAuthSession(userId);
    const owner = ownerKey(userId);
    const result = new Map<string, string>();
    if (!providers.some(provider => provider.rememberKey && !provider.apiKey)) return result;
    await writes;
    const key = (await read<{ key: CryptoKey } | undefined>('keys', owner))?.key;
    if (!key || !session.isCurrent()) return result;
    for (const provider of providers) {
        if (!provider.rememberKey || provider.apiKey) continue;
        const row = await read<SealedSecret | undefined>('credentials', recordId(owner, provider.id));
        if (!row || row.owner !== owner || row.baseUrl !== provider.baseUrl) continue;
        try {
            const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(row.iv),
                additionalData: additionalData(owner, provider) }, key, row.ciphertext);
            if (!session.isCurrent()) return new Map();
            result.set(provider.id, new TextDecoder().decode(bytes));
        } catch { /* Invalid or unavailable ciphertext never becomes a usable credential. */ }
    }
    return session.isCurrent() ? result : new Map();
};

export const forgetRememberedAIKey = (userId: string | null | undefined, providerId: string): Promise<void> => {
    const session = captureAuthSession(userId);
    const id = recordId(ownerKey(userId), providerId);
    return serialize(async () => {
        if (!session.isCurrent()) return;
        await write('credentials', store => { store.delete(id); });
    });
};
