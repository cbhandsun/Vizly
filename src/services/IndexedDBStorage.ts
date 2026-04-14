import type { DiagramVersion } from './storage/types';

const DB_NAME = 'VizlyLocalDB';
const DB_VERSION = 1;
const STORE_NAME = 'diagram_versions';

export class LocalVersionDB {
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
            };

            request.onsuccess = (event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                resolve();
            };

            request.onerror = (event) => {
                console.error("IndexedDB initialization error:", event);
                reject((event.target as IDBOpenDBRequest).error);
            };
        });

        return this.initPromise;
    }

    async saveVersion(diagramId: string, snapshotData: any, message?: string): Promise<DiagramVersion> {
        await this.init();
        return new Promise((resolve, reject) => {
            const version: DiagramVersion = {
                id: crypto.randomUUID(),
                diagramId,
                snapshotData,
                createdAt: Date.now(),
                message: message || `版本快照`,
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
                results.sort((a, b) => b.createdAt - a.createdAt);
                
                // Omit snapshotData here for consistency with Supabase if we want, but local is fast enough
                resolve(results);
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
                if (result && result.diagramId === diagramId) {
                    resolve(result);
                } else {
                    resolve(null);
                }
            };
            request.onerror = (event) => reject((event.target as IDBRequest).error);
        });
    }
}

export const localVersionDB = new LocalVersionDB();
