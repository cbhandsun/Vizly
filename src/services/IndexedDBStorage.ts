import type { DiagramVersion } from './storage/types';
import {
    coerceDiagramVersion,
    coerceVersionMessage,
    coerceVersionSnapshotData,
    isSafeVersionId,
} from './versionSnapshotSecurity';
import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

const DB_NAME = 'VizlyLocalDB';
const DB_VERSION = 2;
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
            };

            request.onsuccess = (event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                resolve();
            };

            request.onerror = (event) => {
                const error = (event.target as IDBOpenDBRequest).error;
                safeLog.error('IndexedDB initialization error:', redactSensitiveLogValue(error ?? event));
                reject(error);
            };
        });

        return this.initPromise;
    }

    async saveVersion(diagramId: string, snapshotData: any, message?: string): Promise<DiagramVersion> {
        if (!isSafeVersionId(diagramId)) {
            throw new Error('Invalid diagram id for version history.');
        }
        const safeSnapshotData = coerceVersionSnapshotData(snapshotData);
        await this.init();
        return new Promise((resolve, reject) => {
            const version: DiagramVersion = {
                id: crypto.randomUUID(),
                diagramId: diagramId.trim(),
                snapshotData: safeSnapshotData,
                createdAt: Date.now(),
                message: coerceVersionMessage(message),
                authorId: 'local'
            };

            const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(version);

            request.onsuccess = () => resolve(version);
            request.onerror = (event) => reject((event.target as IDBRequest).error);
        });
    }

    async listVersions(diagramId: string): Promise<DiagramVersion[]> {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('diagramId');
            const request = index.getAll(diagramId);

            request.onsuccess = (event) => {
                const results = (event.target as IDBRequest).result as DiagramVersion[];
                // Sort descending (newest first)
                const safeResults = results
                    .map(result => coerceDiagramVersion({ ...result, snapshotData: null }))
                    .filter(Boolean) as DiagramVersion[];
                safeResults.sort((a, b) => b.createdAt - a.createdAt);
                
                // Omit snapshotData here for consistency with Supabase if we want, but local is fast enough
                resolve(safeResults);
            };
            request.onerror = (event) => reject((event.target as IDBRequest).error);
        });
    }

    async loadVersion(diagramId: string, versionId: string): Promise<DiagramVersion | null> {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(versionId);

            request.onsuccess = (event) => {
                const result = (event.target as IDBRequest).result as DiagramVersion;
                const safeResult = result ? coerceDiagramVersion(result) : null;
                if (safeResult && safeResult.diagramId === diagramId.trim()) {
                    resolve(safeResult);
                } else {
                    resolve(null);
                }
            };
            request.onerror = (event) => reject((event.target as IDBRequest).error);
        });
    }

    // --- Diagram Storage Methods ---
    async saveDiagram(diagram: any): Promise<void> {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([DIAGRAMS_STORE], 'readwrite');
            const store = transaction.objectStore(DIAGRAMS_STORE);
            const request = store.put(diagram);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject((event.target as IDBRequest).error);
        });
    }

    async loadDiagram(id: string): Promise<any | null> {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([DIAGRAMS_STORE], 'readonly');
            const store = transaction.objectStore(DIAGRAMS_STORE);
            const request = store.get(id);
            request.onsuccess = (event) => resolve((event.target as IDBRequest).result || null);
            request.onerror = (event) => reject((event.target as IDBRequest).error);
        });
    }

    async listDiagrams(): Promise<any[]> {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([DIAGRAMS_STORE], 'readonly');
            const store = transaction.objectStore(DIAGRAMS_STORE);
            const request = store.getAll();
            request.onsuccess = (event) => resolve((event.target as IDBRequest).result || []);
            request.onerror = (event) => reject((event.target as IDBRequest).error);
        });
    }

    async deleteDiagram(id: string): Promise<void> {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([DIAGRAMS_STORE], 'readwrite');
            const store = transaction.objectStore(DIAGRAMS_STORE);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject((event.target as IDBRequest).error);
        });
    }
}

export const localDB = new LocalDB();
export const localVersionDB = localDB;
