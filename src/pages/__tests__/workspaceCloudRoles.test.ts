import { afterEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ shared: vi.fn(), cloud: vi.fn(), active: vi.fn() }));
vi.mock('../../data/DataRegistry', () => ({ dataRegistry: {
    initialize: vi.fn(), getDataService: () => ({ queryDiagrams: () => ({ data: [] }) }),
} }));
vi.mock('../../services/UnifiedStorageService', () => ({ unifiedStorage: {
    getProvider: () => ({ isConfigured: () => true, listDiagrams: fixture.cloud }), listDiagrams: fixture.active,
} }));
vi.mock('../../services/ShareService', () => ({ shareService: { listSharedWithMe: fixture.shared } }));

import { filterAndSortItems, isSharedWorkspaceItem, loadWorkspaceItems } from '../diagramManagementPage.helpers';

afterEach(() => vi.clearAllMocks());

describe('cloud workspace collaborator roles', () => {
    it('loads the selected S3 provider without a Supabase session or active-provider fallback', async () => {
        fixture.cloud.mockResolvedValue([{ id: 'nested/audit.json', title: 'S3 audit', updatedAt: new Date(0) }]);
        const items = await loadWorkspaceItems('cloud', 's3', null);
        expect(items).toHaveLength(1);
        expect(items[0].source).toBe('s3');
        expect(fixture.active).not.toHaveBeenCalled();
        expect(fixture.shared).not.toHaveBeenCalled();
    });
    it.each(['owner', '', 'invalid', '__proto__'])('does not classify %j as a collaborator', role => {
        expect(isSharedWorkspaceItem({ role })).toBe(false);
    });
    it.each(['viewer', 'editor'] as const)('keeps a %s invitation in Shared and preserves opening permissions', async role => {
        fixture.cloud.mockResolvedValue([]);
        fixture.shared.mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111', title: 'Audit shared',
            updatedAt: new Date('2026-10-09T00:00:00Z'), role }]);
        const items = await loadWorkspaceItems('shared', 'supabase', { id: 'recipient' });
        expect(items).toHaveLength(1);
        expect(items[0].role).toBe(role);
        expect(isSharedWorkspaceItem(items[0])).toBe(true);
        expect(filterAndSortItems(items, 'shared', '', 'updated')).toHaveLength(1);
    });
    it('keeps an empty sharing inventory empty', async () => {
        fixture.cloud.mockResolvedValue([]);
        fixture.shared.mockResolvedValue([]);
        await expect(loadWorkspaceItems('shared', 'supabase', { id: 'recipient' })).resolves.toEqual([]);
    });
    it('skips querying Supabase cloud storage when unauthenticated', async () => {
        await expect(loadWorkspaceItems('recent', 'supabase', null)).resolves.toEqual([]);
        expect(fixture.cloud).not.toHaveBeenCalled();
        expect(fixture.shared).not.toHaveBeenCalled();
    });
});
