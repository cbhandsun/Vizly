import { captureAuthSession, getAuthSessionOwner } from '../context/authSessionBoundary';
import { coerceVersionSnapshotData } from './versionSnapshotSecurity';
import type { IdempotentVersionWrite } from './storage/types';
import { failedVersionOutboxTask, hashVersionPayload } from './versionOutbox';
import type { IStorageProvider, DiagramMetadata, SavedDiagram, DiagramVersion, VersionStorageState, VersionSaveFailure } from './storage/types';
import { localVersionDB } from './IndexedDBStorage';
import { coerceS3StorageConfig } from './storageSecurity';
import { safeLog } from '@vizly/core/logging';
import { redactSensitiveLogValue } from '@vizly/core/logging';
import { logUiStorageReadFailure, logUiStorageWriteFailure } from '@vizly/core/logging';
import { safeJsonParseWithLimit } from '@vizly/core/input';

export type StorageProviderType = 'supabase' | 's3';

const STORAGE_PROVIDER_KEY = 'DiagramView.StorageProvider';
const S3_CONFIG_KEY = 'diagram_storage_config';
const S3_SECRET_SESSION_KEY = `${S3_CONFIG_KEY}_secret`;
const MAX_S3_STORAGE_CONFIG_JSON_CHARS = 2 * 1024 * 1024;

export const classifyVersionSaveFailure = (error: unknown): VersionSaveFailure => {
    const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    const status = Number(value.status ?? value.statusCode ?? (value.$metadata as Record<string, unknown> | undefined)?.httpStatusCode);
    const code = String(value.code ?? value.name ?? '');
    const message = String(value.message ?? '');
    if (status === 401 || /authenticated user|JWT expired/i.test(message) || code === 'PGRST301') return 'authentication';
    if (status === 403 || code === '42501' || code === 'AccessDenied') return 'permission';
    const invalidVersionData = /^(?:Invalid (?:version operation|outbox snapshot)|Version operation (?:payload mismatch|conflicts with remote content))$/.test(message);
    if (status === 400 || code.startsWith('22') || code.startsWith('23') || invalidVersionData
        || /UUID format|required.*saved Cloud Diagram/i.test(message)) return 'data';
    if (/config|credential|endpoint/i.test(message)) return 'configuration';
    if (status >= 500 || status === 408 || status === 429 || /fetch|network|offline|timeout/i.test(message)) return 'network';
    return 'unknown';
};

const stableSnapshotJSON = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

const mergeVersionLists = (
    remoteVersions: DiagramVersion[],
    localVersions: DiagramVersion[],
): DiagramVersion[] => {
    const versionsById = new Map<string, DiagramVersion>();
    localVersions.forEach(version => versionsById.set(version.id, version));
    remoteVersions.forEach(version => {
        if (!versionsById.has(version.id)) versionsById.set(version.id, version);
    });
    return Array.from(versionsById.values()).sort((a, b) => b.createdAt - a.createdAt);
};

const isSupabaseConfigured = () => {
    return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
};

const clearPersistedS3Config = () => {
    try {
        localStorage.removeItem(S3_CONFIG_KEY);
    } catch (error) {
        logUiStorageWriteFailure('UnifiedStorageService.clearS3Config', S3_CONFIG_KEY, error);
    }

    try {
        sessionStorage.removeItem(S3_SECRET_SESSION_KEY);
    } catch (error) {
        logUiStorageWriteFailure('UnifiedStorageService.clearS3Config', S3_SECRET_SESSION_KEY, error);
    }
};

const isS3Configured = () => {
    try {
        const raw = localStorage.getItem(S3_CONFIG_KEY);
        if (!raw) return false;
        const parsed = safeJsonParseWithLimit<unknown>(raw, null, {
            maxLength: MAX_S3_STORAGE_CONFIG_JSON_CHARS,
            onFailure: (error) => {
                logUiStorageReadFailure('UnifiedStorageService.isS3Configured', S3_CONFIG_KEY, error);
            },
            buildOversizeError: () => new Error('S3 storage config JSON is too large.'),
        });
        if (!parsed) {
            clearPersistedS3Config();
            return false;
        }
        const config = coerceS3StorageConfig(
            parsed,
            sessionStorage.getItem(S3_SECRET_SESSION_KEY) || ''
        );
        if (!config) {
            clearPersistedS3Config();
            return false;
        }
        return true;
    } catch (error) {
        logUiStorageReadFailure('UnifiedStorageService.isS3Configured', S3_CONFIG_KEY, error);
        clearPersistedS3Config();
        return false;
    }
};

class LazyStorageProvider implements IStorageProvider {
    private providerPromise: Promise<IStorageProvider> | null = null;

    constructor(
        public readonly id: StorageProviderType,
        public readonly name: string,
        private readonly isReady: () => boolean,
        private readonly loadProvider: () => Promise<IStorageProvider>
    ) {}

    isConfigured(): boolean {
        return this.isReady();
    }

    private async provider(): Promise<IStorageProvider> {
        this.providerPromise ??= this.loadProvider();
        return this.providerPromise;
    }

    async listDiagrams(): Promise<DiagramMetadata[]> {
        return (await this.provider()).listDiagrams();
    }

    async loadDiagram(id: string): Promise<SavedDiagram> {
        return (await this.provider()).loadDiagram(id);
    }

    async saveDiagram(diagram: SavedDiagram): Promise<SavedDiagram> {
        return (await this.provider()).saveDiagram(diagram);
    }

    async deleteDiagram(id: string): Promise<void> {
        return (await this.provider()).deleteDiagram(id);
    }

    async saveVersion(diagramId: string, data: unknown, message?: string): Promise<DiagramVersion> {
        const session = captureAuthSession(getAuthSessionOwner());
        const provider = await this.provider();
        if (!session.isCurrent()) throw new Error('Session changed');
        if (!provider.saveVersion) {
            throw new Error(`${this.name} does not support version history.`);
        }
        return provider.saveVersion(diagramId, data, message);
    }

    async listVersions(diagramId: string): Promise<DiagramVersion[]> {
        const provider = await this.provider();
        return provider.listVersions ? provider.listVersions(diagramId) : [];
    }

    async saveVersionIdempotent(diagramId: string, data: unknown, message: string | undefined, operation: IdempotentVersionWrite): Promise<DiagramVersion> {
        const session = captureAuthSession(operation.ownerId);
        const provider = await this.provider();
        if (!session.isCurrent() || operation.signal?.aborted) throw new Error('Storage session changed');
        if (!provider.saveVersionIdempotent) throw new Error('Storage configuration does not support idempotent versions');
        return provider.saveVersionIdempotent(diagramId, data, message, operation);
    }

    async loadVersion(diagramId: string, versionId: string): Promise<DiagramVersion | null> {
        const provider = await this.provider();
        return provider.loadVersion ? provider.loadVersion(diagramId, versionId) : null;
    }
}

export class UnifiedStorageService implements IStorageProvider {
    name = 'Unified Storage';
    id: StorageProviderType = 'supabase';

    getProvider(id: StorageProviderType): IStorageProvider {
        return this.providers[id];
    }

    // We proxy "id" getter to return the actual provider's id or just use a separate method
    get currentProviderId(): StorageProviderType {
        return this._currentProviderId;
    }

    private _currentProviderId: StorageProviderType = 'supabase';
    private providers: Record<StorageProviderType, IStorageProvider>;

    constructor() {
        this.providers = {
            supabase: new LazyStorageProvider(
                'supabase',
                'Supabase Cloud',
                isSupabaseConfigured,
                async () => (await import('./SupabaseStorage')).supabaseStorage
            ),
            s3: new LazyStorageProvider(
                's3',
                'S3 Compatible Storage',
                isS3Configured,
                async () => (await import('./StorageService')).s3Storage
            )
        };
        this.loadProviderPreference();
    }

    private loadProviderPreference() {
        try {
            const stored = localStorage.getItem(STORAGE_PROVIDER_KEY);
            if (stored === 's3' || stored === 'supabase') {
                this._currentProviderId = stored;
            }
        } catch (e) {
            logUiStorageReadFailure('UnifiedStorageService.loadProviderPreference', STORAGE_PROVIDER_KEY, e);
            safeLog.error('Failed to load storage preference', redactSensitiveLogValue(e));
        }
    }

    setProvider(id: StorageProviderType) {
        this._currentProviderId = id;
        try {
            localStorage.setItem(STORAGE_PROVIDER_KEY, id);
        } catch (error) {
            logUiStorageWriteFailure('UnifiedStorageService.setProvider', STORAGE_PROVIDER_KEY, error);
        }
        // Force reload or event trigger might be needed for UI to refresh list
        window.dispatchEvent(new Event('storage-provider-changed'));
    }

    get activeProvider(): IStorageProvider {
        return this.providers[this._currentProviderId];
    }

    // === Proxy Methods ===

    isConfigured(): boolean {
        return this.activeProvider.isConfigured();
    }

    async listDiagrams(): Promise<DiagramMetadata[]> {
        return this.activeProvider.listDiagrams();
    }

    async loadDiagram(id: string): Promise<SavedDiagram> {
        return this.activeProvider.loadDiagram(id);
    }

    async saveDiagram(diagram: SavedDiagram): Promise<SavedDiagram> {
        return this.activeProvider.saveDiagram(diagram);
    }

    async deleteDiagram(id: string): Promise<void> {
        return this.activeProvider.deleteDiagram(id);
    }

    // Local snapshots are scoped at creation, never adopted by the next account.
    private versionContext() {
        const ownerId = getAuthSessionOwner();
        const providerId = this.currentProviderId;
        const provider = this.activeProvider;
        const session = captureAuthSession(ownerId);
        const assertCurrent = () => {
            if (!session.isCurrent() || providerId !== this.currentProviderId) throw new Error('Storage session changed');
        };
        const state = (location: 'local' | 'cloud', failure?: VersionSaveFailure): VersionStorageState => ({
            location, syncStatus: location === 'cloud' ? 'synced' : 'pending',
            ownerId, provider: providerId, localCreated: location === 'local', ...(failure ? { failure } : {}),
        });
        const visible = (version: DiagramVersion) => !version.storage
            || (version.storage.ownerId === ownerId && version.storage.provider === providerId);
        const local = (version: DiagramVersion): DiagramVersion => version.storage ? version : ({
            ...version, storage: { ...state('local'), syncStatus: 'legacy', ownerId: null, localCreated: false },
        });
        return { ownerId, provider, assertCurrent, state, visible, local };
    }

    async saveVersion(diagramId: string, data: unknown, message?: string): Promise<DiagramVersion> {
        const context = this.versionContext();
        const snapshot = coerceVersionSnapshotData(data);
        if (context.ownerId && this.currentProviderId === 'supabase') {
            context.assertCurrent();
            const { version, queued } = await localVersionDB.saveVersionWithOutbox(diagramId, snapshot, message,
                context.state('local', context.provider.isConfigured() ? undefined : 'configuration'));
            context.assertCurrent();
            if (queued) window.dispatchEvent(new Event('version-outbox-enqueued'));
            return version;
        }
        let failure: VersionSaveFailure = 'configuration';
        if (context.provider.isConfigured() && context.provider.saveVersion) {
            try {
                const saved = await context.provider.saveVersion(diagramId, snapshot, message);
                context.assertCurrent();
                return { ...saved, storage: context.state('cloud') };
            } catch (error) {
                context.assertCurrent();
                failure = classifyVersionSaveFailure(error);
                safeLog.warn('Version saved locally after provider failure', { failure });
            }
        }
        context.assertCurrent();
        const saved = await localVersionDB.saveVersion(diagramId, snapshot, message, context.state('local', failure));
        context.assertCurrent();
        return saved;
    }

    async listVersions(diagramId: string): Promise<DiagramVersion[]> {
        const context = this.versionContext();
        let remote: DiagramVersion[] = [];
        if (context.provider.isConfigured()) {
            try { remote = await context.provider.listVersions?.(diagramId) ?? []; }
            catch { /* Local snapshots remain available while remote reads fail. */ }
        }
        context.assertCurrent();
        let local: DiagramVersion[];
        try { local = (await localVersionDB.listVersions(diagramId)).filter(context.visible).map(context.local); }
        catch (error) { if (!remote.length) throw error; local = []; }
        context.assertCurrent();
        // Collapse only verified local receipts; an unconfirmed snapshot stays
        // authoritative even when the remote primary key already exists.
        const remoteIds = new Set(remote.map(version => version.id));
        return mergeVersionLists(remote.map(version => ({ ...version, storage: context.state('cloud') })),
            local.filter(version => version.storage?.syncStatus !== 'synced' || !version.storage.remoteVersionId || !remoteIds.has(version.storage.remoteVersionId)));
    }

    async loadVersion(diagramId: string, versionId: string): Promise<DiagramVersion | null> {
        const context = this.versionContext();
        let local: DiagramVersion | null = null;
        try { local = await localVersionDB.loadVersion(diagramId, versionId); }
        catch { /* A broken local cache must not prevent reading a remote version. */ }
        context.assertCurrent();
        if (local) return context.visible(local) ? context.local(local) : null;
        if (!context.provider.isConfigured()) return null;
        try {
            const version = await context.provider.loadVersion?.(diagramId, versionId);
            context.assertCurrent();
            return version ? { ...version, storage: context.state('cloud') } : null;
        } catch { context.assertCurrent(); return null; }
    }

    private readonly retries = new Set<string>();

    async retryVersion(diagramId: string, versionId: string): Promise<DiagramVersion> {
        if (this.retries.has(versionId)) throw new Error('Version retry already in progress');
        this.retries.add(versionId);
        const context = this.versionContext();
        try {
            const local = await localVersionDB.loadVersion(diagramId, versionId);
            context.assertCurrent();
            if (!local?.storage || !context.visible(local) || !local.storage.localCreated
                || local.storage.syncStatus === 'legacy' || !local.snapshotData) throw new Error('Local version ownership is unknown');
            if (local.storage.syncStatus === 'synced') return local;
            if (!context.provider.isConfigured() || !context.provider.saveVersion || !context.provider.loadVersion)
                throw new Error('Storage configuration is required');
            const remote = local.storage.remoteVersionId
                ? { id: local.storage.remoteVersionId }
                : context.ownerId && this.currentProviderId === 'supabase' && context.provider.saveVersionIdempotent
                    ? await context.provider.saveVersionIdempotent(diagramId, local.snapshotData, local.message, {
                        operationId: local.id, ownerId: context.ownerId, payloadHash: await hashVersionPayload(local),
                    })
                    : await context.provider.saveVersion(diagramId, local.snapshotData, local.message);
            // Retain the receipt even if the account changed after the request was sent.
            const pending = { ...local.storage, remoteVersionId: remote.id };
            await localVersionDB.updateVersionStorage(diagramId, versionId, pending);
            context.assertCurrent();
            const confirmed = await context.provider.loadVersion(diagramId, remote.id);
            context.assertCurrent();
            if (!confirmed || confirmed.id !== remote.id || confirmed.diagramId !== diagramId || stableSnapshotJSON(confirmed.snapshotData) !== stableSnapshotJSON(local.snapshotData))
                throw new Error('Remote version verification failed');
            const storage: VersionStorageState = { ...pending, syncStatus: 'synced', failure: undefined,
                automaticSync: undefined, syncAttempts: undefined, nextSyncAttemptAt: undefined };
            const queued = context.ownerId && this.currentProviderId === 'supabase'
                ? (await localVersionDB.listVersionOutbox(context.ownerId)).find(task => task.versionId === versionId) : undefined;
            context.assertCurrent();
            if (queued) await localVersionDB.completeVersionOutbox(queued, confirmed);
            else await localVersionDB.updateVersionStorage(diagramId, versionId, storage);
            context.assertCurrent();
            return { ...local, storage };
        } catch (error) {
            context.assertCurrent();
            const local = await localVersionDB.loadVersion(diagramId, versionId);
            if (local?.storage && context.visible(local) && local.storage.syncStatus === 'pending')
                await localVersionDB.updateVersionStorage(diagramId, versionId, { ...local.storage, failure: classifyVersionSaveFailure(error) });
            if (context.ownerId && this.currentProviderId === 'supabase') {
                const queued = (await localVersionDB.listVersionOutbox(context.ownerId)).find(task => task.versionId === versionId);
                context.assertCurrent();
                if (queued) await localVersionDB.updateVersionOutboxFailure(queued,
                    failedVersionOutboxTask(queued, classifyVersionSaveFailure(error), Date.now()));
            }
            throw error;
        } finally { this.retries.delete(versionId); }
    }
}

export const unifiedStorage = new UnifiedStorageService();
