import { describe, expect, it } from 'vitest';
import {
    createCloudStorageManagerScope,
    invalidateCloudStorageManagerScope,
    isCloudStorageManagerListAvailable,
    isCloudStorageManagerScopeCurrent,
    isOwnedCloudStorageItem,
    matchesCloudStorageSearch,
    resolveCloudStorageItemProvider,
    transitionCloudStorageManagerScope,
} from '../cloudStorageManagerScope';

describe('cloudStorageManagerScope', () => {
    it('invalidates requests when the provider or tab changes', () => {
        const initial = createCloudStorageManagerScope('s3');
        const providerChanged = transitionCloudStorageManagerScope(initial, {
            providerId: 'supabase',
            tab: 'mine',
        });
        const tabChanged = transitionCloudStorageManagerScope(providerChanged, {
            providerId: 'supabase',
            tab: 'shared',
        });

        expect(providerChanged.revision).toBe(1);
        expect(tabChanged.revision).toBe(2);
        expect(isCloudStorageManagerScopeCurrent(initial, providerChanged)).toBe(false);
        expect(isCloudStorageManagerScopeCurrent(providerChanged, tabChanged)).toBe(false);
    });

    it('keeps an unchanged scope stable and supports explicit invalidation', () => {
        const initial = createCloudStorageManagerScope('s3', 'shared');
        const unchanged = transitionCloudStorageManagerScope(initial, {
            providerId: 's3',
            tab: 'shared',
        });
        const invalidated = invalidateCloudStorageManagerScope(unchanged);

        expect(unchanged).toBe(initial);
        expect(isCloudStorageManagerScopeCurrent(initial, unchanged)).toBe(true);
        expect(isCloudStorageManagerScopeCurrent(initial, invalidated)).toBe(false);
    });

    it('always resolves shared diagrams through Supabase', () => {
        expect(resolveCloudStorageItemProvider('shared', 's3')).toBe('supabase');
        expect(resolveCloudStorageItemProvider('mine', 's3')).toBe('s3');
        expect(resolveCloudStorageItemProvider('mine', 'supabase')).toBe('supabase');
    });

    it.each([
        { tab: 'mine' as const, providerId: 's3' as const, providerConfigured: true, hasUser: false, expected: true },
        { tab: 'mine' as const, providerId: 's3' as const, providerConfigured: false, hasUser: true, expected: false },
        { tab: 'mine' as const, providerId: 'supabase' as const, providerConfigured: true, hasUser: false, expected: false },
        { tab: 'mine' as const, providerId: 'supabase' as const, providerConfigured: true, hasUser: true, expected: true },
        { tab: 'shared' as const, providerId: 's3' as const, providerConfigured: true, hasUser: false, expected: false },
        { tab: 'shared' as const, providerId: 's3' as const, providerConfigured: false, hasUser: true, expected: true },
    ])('exposes list controls only when the active storage view can load data', (input) => {
        const { expected, ...availability } = input;
        expect(isCloudStorageManagerListAvailable(availability)).toBe(expected);
    });

    it('matches trimmed case-insensitive search against title or id', () => {
        expect(matchesCloudStorageSearch({ id: 'diagram-1', title: 'Quarterly Plan' }, ' PLAN ')).toBe(true);
        expect(matchesCloudStorageSearch({ id: 'diagram-1', title: 'Quarterly Plan' }, 'DIAGRAM-1')).toBe(true);
        expect(matchesCloudStorageSearch({ id: 'Fallback-ID', title: '' }, 'fallback')).toBe(true);
        expect(matchesCloudStorageSearch({ id: 'diagram-1', title: 'Quarterly Plan' }, 'missing')).toBe(false);
    });

    it('allows deletion only for unowned legacy items or the current owner', () => {
        expect(isOwnedCloudStorageItem({}, undefined)).toBe(true);
        expect(isOwnedCloudStorageItem({ userId: 'user-1' }, 'user-1')).toBe(true);
        expect(isOwnedCloudStorageItem({ userId: 'user-2' }, 'user-1')).toBe(false);
    });
});
