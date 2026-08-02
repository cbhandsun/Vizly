import type { StorageProviderType } from '@/services/UnifiedStorageService';

export type CloudStorageManagerTab = 'mine' | 'shared';

export interface CloudStorageManagerScope {
    providerId: StorageProviderType;
    tab: CloudStorageManagerTab;
    revision: number;
}

export const createCloudStorageManagerScope = (
    providerId: StorageProviderType,
    tab: CloudStorageManagerTab = 'mine',
): CloudStorageManagerScope => ({ providerId, tab, revision: 0 });

export const transitionCloudStorageManagerScope = (
    current: CloudStorageManagerScope,
    next: Pick<CloudStorageManagerScope, 'providerId' | 'tab'>,
): CloudStorageManagerScope => {
    if (current.providerId === next.providerId && current.tab === next.tab) {
        return current;
    }

    return {
        ...next,
        revision: current.revision + 1,
    };
};

export const invalidateCloudStorageManagerScope = (
    current: CloudStorageManagerScope,
): CloudStorageManagerScope => ({
    ...current,
    revision: current.revision + 1,
});

export const isCloudStorageManagerScopeCurrent = (
    requestScope: CloudStorageManagerScope,
    currentScope: CloudStorageManagerScope,
): boolean => requestScope.providerId === currentScope.providerId
    && requestScope.tab === currentScope.tab
    && requestScope.revision === currentScope.revision;

export const resolveCloudStorageItemProvider = (
    tab: CloudStorageManagerTab,
    selectedProvider: StorageProviderType,
): StorageProviderType => tab === 'shared' ? 'supabase' : selectedProvider;

interface SearchableCloudStorageItem {
    id: string;
    title?: string | null;
}

interface OwnableCloudStorageItem {
    userId?: string | null;
}

export const matchesCloudStorageSearch = (
    item: SearchableCloudStorageItem,
    searchTerm: string,
): boolean => (item.title || item.id).toLocaleLowerCase().includes(searchTerm.trim().toLocaleLowerCase());

export const isOwnedCloudStorageItem = (
    item: OwnableCloudStorageItem,
    userId: string | undefined,
): boolean => !item.userId || item.userId === userId;
