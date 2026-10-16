import type { DiagramVersion } from './storage/types';
import {
    coerceDiagramVersion,
    coerceVersionMessage,
    coerceVersionSnapshotData,
    isSafeVersionId,
} from './versionSnapshotSecurity';
import { safeLog } from '@vizly/core/logging';
import { redactSensitiveLogValue } from '@vizly/core/logging';
import { runIndexedDBTransaction } from './indexedDBTransaction';

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

    async saveVersion(diagramId: string, snapshotData: unknown, message?: string): Promise<DiagramVersion> {
        if (!isSafeVersionId(diagramId)) {
            throw new Error('Invalid diagram id for version history.');
        }
        const safeSnapshotData = coerceVersionSnapshotData(snapshotData);
        await this.init();
        const version: DiagramVersion = {
            id: crypto.randomUUID(),
            diagramId: diagramId.trim(),
            snapshotData: safeSnapshotData,
            createdAt: Date.now(),
            message: coerceVersionMessage(message),
            authorId: 'local',
        };
        await runIndexedDBTransaction(this.db!, STORE_NAME, 'readwrite', store => store.add(version));
        return version;
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
