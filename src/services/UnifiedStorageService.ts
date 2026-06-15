import type { IStorageProvider, DiagramMetadata, SavedDiagram, DiagramVersion } from './storage/types';
import { localVersionDB } from './IndexedDBStorage';
import { coerceS3StorageConfig } from './storageSecurity';

export type StorageProviderType = 'supabase' | 's3';

const STORAGE_PROVIDER_KEY = 'DiagramView.StorageProvider';
const S3_CONFIG_KEY = 'diagram_storage_config';
const S3_SECRET_SESSION_KEY = `${S3_CONFIG_KEY}_secret`;

const isSupabaseConfigured = () => {
    return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
};

const isS3Configured = () => {
    try {
        const raw = localStorage.getItem(S3_CONFIG_KEY);
        if (!raw) return false;
        const config = coerceS3StorageConfig(
            JSON.parse(raw),
            sessionStorage.getItem(S3_SECRET_SESSION_KEY) || ''
        );
        return Boolean(config);
    } catch {
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

    async saveVersion(diagramId: string, data: any, message?: string): Promise<DiagramVersion> {
        const provider = await this.provider();
        if (!provider.saveVersion) {
            throw new Error(`${this.name} does not support version history.`);
        }
        return provider.saveVersion(diagramId, data, message);
    }

    async listVersions(diagramId: string): Promise<DiagramVersion[]> {
        const provider = await this.provider();
        return provider.listVersions ? provider.listVersions(diagramId) : [];
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
            console.error('Failed to load storage preference', e);
        }
    }

    setProvider(id: StorageProviderType) {
        this._currentProviderId = id;
        localStorage.setItem(STORAGE_PROVIDER_KEY, id);
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

    // === Versioning Methods with Local Fallback ===
    async saveVersion(diagramId: string, data: any, message?: string): Promise<DiagramVersion> {
        try {
            if (this.activeProvider.saveVersion) {
                return await this.activeProvider.saveVersion(diagramId, data, message);
            }
        } catch (e) {
            console.warn("Active provider saveVersion failed, falling back to local db", e);
        }
        // Fallback or missing provider support
        return localVersionDB.saveVersion(diagramId, data, message);
    }

    async listVersions(diagramId: string): Promise<DiagramVersion[]> {
        try {
            if (this.activeProvider.listVersions) {
                return await this.activeProvider.listVersions(diagramId);
            }
        } catch (e) {
            console.warn("Active provider listVersions failed, falling back to local db", e);
        }
        return localVersionDB.listVersions(diagramId);
    }

    async loadVersion(diagramId: string, versionId: string): Promise<DiagramVersion | null> {
        try {
            // Priority try local since we might have cached it, but actually cloud is source of truth if we use cloud.
            // Wait, if it failed previously it might only be in local. Let's try active provider first.
            if (this.activeProvider.loadVersion) {
                const ver = await this.activeProvider.loadVersion(diagramId, versionId);
                if (ver) return ver;
            }
        } catch (e) {
            console.warn("Active provider loadVersion failed, falling back to local db", e);
        }
        // Fallback to local
        return localVersionDB.loadVersion(diagramId, versionId);
    }
}

export const unifiedStorage = new UnifiedStorageService();
