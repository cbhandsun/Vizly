import { IStorageProvider, DiagramMetadata, SavedDiagram, DiagramVersion } from './storage/types';
import { supabaseStorage } from './SupabaseStorage';
import { s3Storage } from './StorageService';
import { localVersionDB } from './IndexedDBStorage';

export type StorageProviderType = 'supabase' | 's3';

const STORAGE_PROVIDER_KEY = 'DiagramView.StorageProvider';

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
            supabase: supabaseStorage,
            s3: s3Storage
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
