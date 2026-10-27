import type { DiagramVersion, VersionStorageState } from './storage/types';
import {
    coerceDiagramVersion,
    coerceVersionMessage,
    coerceVersionSnapshotData,
    isSafeVersionId,
} from './versionSnapshotSecurity';
import { safeLog } from '@vizly/core/logging';
import { redactSensitiveLogValue } from '@vizly/core/logging';
import { runIndexedDBAtomicWrite, runIndexedDBTransaction } from './indexedDBTransaction';
import { createVersionOutboxTask, hashVersionPayload, MAX_VERSION_OUTBOX_TASKS, VERSION_OUTBOX_STORE, type VersionOutboxTask } from './versionOutbox';

const DB_NAME = 'VizlyLocalDB';
const DB_VERSION = 3;
const STORE_NAME = 'diagram_versions';
const DIAGRAMS_STORE = 'local_diagrams';

export class LocalDB {
    private db: IDBDatabase | null = null;
    private initPromise: Promise<void> | null = null;

    private async init(): Promise<void> {
        if (this.db) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('diagramId', 'diagramId', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
                if (!db.objectStoreNames.contains(DIAGRAMS_STORE)) {
                    db.createObjectStore(DIAGRAMS_STORE, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(VERSION_OUTBOX_STORE)) {
                    const outbox = db.createObjectStore(VERSION_OUTBOX_STORE, { keyPath: 'operationId' });
                    outbox.createIndex('ownerId', 'ownerId', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                this.db.onversionchange = () => {
                    this.db?.close();
                    this.db = null;
                };
                resolve();
            };

            request.onerror = (event) => {
                const error = (event.target as IDBOpenDBRequest).error;
                safeLog.error('IndexedDB initialization error:', redactSensitiveLogValue(error ?? event));
                reject(error);
            };
        });

        try {
            await this.initPromise;
        } finally {
            this.initPromise = null;
        }
    }

    private createVersion(diagramId: string, snapshotData: unknown, message?: string, storage?: VersionStorageState): DiagramVersion {
        if (!isSafeVersionId(diagramId)) {
            throw new Error('Invalid diagram id for version history.');
        }
        const safeSnapshotData = coerceVersionSnapshotData(snapshotData);
        return {
            id: crypto.randomUUID(),
            diagramId: diagramId.trim(),
            snapshotData: safeSnapshotData,
            createdAt: Date.now(),
            message: coerceVersionMessage(message),
            authorId: storage?.ownerId ?? 'local',
            ...(storage ? { storage: { ...storage } } : {}),
        };
    }

    async saveVersion(diagramId: string, snapshotData: unknown, message?: string, storage?: VersionStorageState): Promise<DiagramVersion> {
        const version = this.createVersion(diagramId, snapshotData, message, storage);
        await this.init();
        await runIndexedDBTransaction(this.db!, STORE_NAME, 'readwrite', store => store.add(version));
        return version;
    }

    async saveVersionWithOutbox(diagramId: string, snapshotData: unknown, message: string | undefined, storage: VersionStorageState): Promise<{ version: DiagramVersion; queued: boolean }> {
        const version = this.createVersion(diagramId, snapshotData, message, storage);
        const task = await createVersionOutboxTask(version);
        await this.init();
        return runIndexedDBAtomicWrite(this.db!, [STORE_NAME, VERSION_OUTBOX_STORE], (transaction, setResult) => {
            const versions = transaction.objectStore(STORE_NAME);
            const outbox = transaction.objectStore(VERSION_OUTBOX_STORE);
            const count = outbox.count();
            count.onsuccess = () => {
                // Capacity limits never evict unsynchronized snapshots or existing tasks.
                const queued = count.result < MAX_VERSION_OUTBOX_TASKS;
                version.storage = { ...version.storage!, automaticSync: queued ? 'queued' : 'capacity', syncAttempts: 0 };
                versions.add(version);
                if (queued) outbox.add(task);
                setResult({ version, queued });
            };
        });
    }

    async listVersionOutbox(ownerId: string): Promise<VersionOutboxTask[]> {
        if (!isSafeVersionId(ownerId)) return [];
        await this.init();
        return runIndexedDBTransaction(this.db!, VERSION_OUTBOX_STORE, 'readonly',
            store => store.index('ownerId').getAll(ownerId, MAX_VERSION_OUTBOX_TASKS));
    }

    async updateVersionOutboxFailure(expected: VersionOutboxTask, next: VersionOutboxTask): Promise<void> {
        await this.init();
        await runIndexedDBAtomicWrite<void>(this.db!, [STORE_NAME, VERSION_OUTBOX_STORE], (transaction, setResult) => {
            const outbox = transaction.objectStore(VERSION_OUTBOX_STORE);
            const versions = transaction.objectStore(STORE_NAME);
            const read = outbox.get(expected.operationId);
            read.onsuccess = () => {
                const current = read.result as VersionOutboxTask | undefined;
                // A success or a newer retry from another tab wins over this stale failure.
                if (!current || current.attempts !== expected.attempts || current.status !== expected.status
                    || current.nextAttemptAt !== expected.nextAttemptAt) { setResult(undefined); return; }
                if (current.ownerId !== expected.ownerId || current.payloadHash !== expected.payloadHash
                    || current.diagramId !== expected.diagramId || current.versionId !== expected.versionId) {
                    transaction.abort(); return;
                }
                const local = versions.get(current.versionId);
                local.onsuccess = () => {
                    const version = coerceDiagramVersion(local.result);
                    if (!version?.storage || version.storage.ownerId !== current.ownerId
                        || version.storage.provider !== current.provider || version.diagramId !== current.diagramId) {
                        transaction.abort(); return;
                    }
                    outbox.put({ ...current, attempts: next.attempts, nextAttemptAt: next.nextAttemptAt,
                        status: next.status, failure: next.failure });
                    versions.put({ ...version, storage: { ...version.storage, failure: next.failure,
                        automaticSync: next.status === 'blocked' ? 'blocked' : 'retrying', syncAttempts: next.attempts,
                        nextSyncAttemptAt: next.status === 'pending' ? next.nextAttemptAt : undefined } });
                    setResult(undefined);
                };
            };
        });
    }

    async completeVersionOutbox(task: VersionOutboxTask, remote: DiagramVersion): Promise<void> {
        const expected = { ...task };
        if (remote.id !== expected.operationId || remote.diagramId !== expected.diagramId
            || remote.authorId !== expected.ownerId || await hashVersionPayload(remote) !== expected.payloadHash)
            throw new Error('Version outbox receipt mismatch');
        await this.init();
        await runIndexedDBAtomicWrite<void>(this.db!, [STORE_NAME, VERSION_OUTBOX_STORE], (transaction, setResult) => {
            const outbox = transaction.objectStore(VERSION_OUTBOX_STORE);
            const versions = transaction.objectStore(STORE_NAME);
            const queued = outbox.get(expected.operationId);
            queued.onsuccess = () => {
                const current = queued.result as VersionOutboxTask | undefined;
                // Another tab may already have confirmed this same operation.
                if (!current) { setResult(undefined); return; }
                if (current.ownerId !== expected.ownerId || current.provider !== expected.provider
                    || current.versionId !== expected.versionId || current.diagramId !== expected.diagramId
                    || current.payloadHash !== expected.payloadHash) { transaction.abort(); return; }
                const saved = versions.get(expected.versionId);
                saved.onsuccess = () => {
                    const version = coerceDiagramVersion(saved.result);
                    if (!version?.storage || version.diagramId !== expected.diagramId
                        || version.storage.ownerId !== expected.ownerId || version.storage.provider !== expected.provider
                        || !version.storage.localCreated) { transaction.abort(); return; }
                    versions.put({ ...version, storage: { ...version.storage, syncStatus: 'synced',
                        remoteVersionId: expected.operationId, failure: undefined, automaticSync: undefined,
                        syncAttempts: undefined, nextSyncAttemptAt: undefined } });
                    outbox.delete(expected.operationId);
                    setResult(undefined);
                };
            };
        });
    }

    async listVersions(diagramId: string): Promise<DiagramVersion[]> {
        await this.init();
        const results: unknown[] = await runIndexedDBTransaction(
            this.db!, STORE_NAME, 'readonly', store => store.index('diagramId').getAll(diagramId),
        );
        const safeResults = results
            .map(result => result && typeof result === 'object'
                ? coerceDiagramVersion({ ...result, snapshotData: null }) : null)
            .filter((version): version is DiagramVersion => version !== null);
        safeResults.sort((a, b) => b.createdAt - a.createdAt);
        return safeResults;
    }

    async loadVersion(diagramId: string, versionId: string): Promise<DiagramVersion | null> {
        await this.init();
        const result: unknown = await runIndexedDBTransaction(
            this.db!, STORE_NAME, 'readonly', store => store.get(versionId),
        );
        const safeResult = result ? coerceDiagramVersion(result) : null;
        return safeResult && safeResult.diagramId === diagramId.trim() ? safeResult : null;
    }

    async updateVersionStorage(diagramId: string, versionId: string, storage: VersionStorageState): Promise<void> {
        await this.init();
        await runIndexedDBTransaction(this.db!, STORE_NAME, 'readwrite', store => {
            const request = store.get(versionId);
            request.onsuccess = () => {
                const version = coerceDiagramVersion(request.result);
                if (version?.diagramId !== diagramId || !version.storage
                    || version.storage.ownerId !== storage.ownerId || version.storage.provider !== storage.provider) {
                    request.transaction?.abort();
                    return;
                }
                store.put({ ...version, storage });
            };
            return request;
        });
    }

    // --- Diagram Storage Methods ---
    async saveDiagram(diagram: unknown): Promise<void> {
        await this.init();
        await runIndexedDBTransaction(this.db!, DIAGRAMS_STORE, 'readwrite', store => store.put(diagram));
    }

    async loadDiagram(id: string): Promise<unknown | null> {
        await this.init();
        return (await runIndexedDBTransaction(this.db!, DIAGRAMS_STORE, 'readonly', store => store.get(id))) ?? null;
    }

    async listDiagrams(): Promise<unknown[]> {
        await this.init();
        return await runIndexedDBTransaction(this.db!, DIAGRAMS_STORE, 'readonly', store => store.getAll());
    }

    async deleteDiagram(id: string): Promise<void> {
        await this.init();
        await runIndexedDBTransaction(this.db!, DIAGRAMS_STORE, 'readwrite', store => store.delete(id));
    }
}

export const localDB = new LocalDB();
export const localVersionDB = localDB;
