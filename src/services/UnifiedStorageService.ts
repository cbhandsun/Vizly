import { IStorageProvider, DiagramMetadata, SavedDiagram } from './storage/types';
import { supabaseStorage } from './SupabaseStorage';
import { s3Storage } from './StorageService';

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
}

export const unifiedStorage = new UnifiedStorageService();
