// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagramVersion, IStorageProvider } from '../storage/types';

const saveVersionMock = vi.fn();
const listVersionsMock = vi.fn();
const loadVersionMock = vi.fn();
const safeLogState = vi.hoisted(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
}));

vi.mock('@/core/utils/consoleCleanup', () => ({
    safeLog: safeLogState,
}));

vi.mock('../IndexedDBStorage', () => ({
    localVersionDB: {
        saveVersion: saveVersionMock,
        listVersions: listVersionsMock,
        loadVersion: loadVersionMock,
    },
}));

const loadUnifiedStorageModule = async () => {
    vi.resetModules();
    return import('../UnifiedStorageService');
};

const createProvider = (overrides: Partial<IStorageProvider> = {}): IStorageProvider => ({
    id: 'supabase',
    name: 'Supabase Cloud',
    isConfigured: () => true,
    listDiagrams: vi.fn(),
    loadDiagram: vi.fn(),
    saveDiagram: vi.fn(),
    deleteDiagram: vi.fn(),
    ...overrides,
});

describe('UnifiedStorageService', () => {
    beforeEach(() => {
        saveVersionMock.mockReset();
        listVersionsMock.mockReset();
        loadVersionMock.mockReset();
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        Object.values(safeLogState).forEach(mock => mock.mockReset());
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it('falls back to the local version db when the active provider saveVersion fails', async () => {
        const localVersion: DiagramVersion = {
            id: 'local-version-1',
            diagramId: 'diagram-1',
            snapshotData: { nodes: [], edges: [] },
            message: 'local fallback',
            createdAt: Date.parse('2026-06-24T00:00:00.000Z'),
            authorId: 'local-user',
        };
        saveVersionMock.mockResolvedValueOnce(localVersion);

        const { UnifiedStorageService } = await loadUnifiedStorageModule();
        const service = new UnifiedStorageService();
        (service as any).providers.supabase = createProvider({
            saveVersion: vi.fn().mockRejectedValueOnce(new Error('token=live-secret')),
        });
        service.setProvider('supabase');

        const result = await service.saveVersion('diagram-1', { nodes: [] }, 'save');

        expect(saveVersionMock).toHaveBeenCalledWith('diagram-1', { nodes: [] }, 'save');
        expect(result).toEqual(localVersion);
    });

    it('falls back to the local version db when listVersions/loadVersion fail remotely', async () => {
        const localVersions: DiagramVersion[] = [{
            id: 'local-version-2',
            diagramId: 'diagram-2',
            snapshotData: {
                nodes: [{ id: 'n1', position: { x: 0, y: 0 }, data: {} }],
                edges: [],
            },
            message: 'cached',
            createdAt: Date.parse('2026-06-24T00:00:00.000Z'),
            authorId: 'local-user',
        }];
        const localVersion = localVersions[0];
        listVersionsMock.mockResolvedValueOnce(localVersions);
        loadVersionMock.mockResolvedValueOnce(localVersion);

        const { UnifiedStorageService } = await loadUnifiedStorageModule();
        const service = new UnifiedStorageService();
        (service as any).providers.supabase = createProvider({
            listVersions: vi.fn().mockRejectedValueOnce(new Error('Authorization: Bearer sk-live-secret')),
            loadVersion: vi.fn().mockRejectedValueOnce(new Error('Authorization: Bearer sk-live-secret')),
        });
        service.setProvider('supabase');

        await expect(service.listVersions('diagram-2')).resolves.toEqual(localVersions);
        await expect(service.loadVersion('diagram-2', 'local-version-2')).resolves.toEqual(localVersion);
        expect(listVersionsMock).toHaveBeenCalledWith('diagram-2');
        expect(loadVersionMock).toHaveBeenCalledWith('diagram-2', 'local-version-2');
    });

    it('redacts storage preference bootstrap errors before logging them', async () => {
        const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
            if (key === 'DiagramView.StorageProvider') {
                throw new Error('Authorization: Bearer sk-live-secret');
            }
            return null;
        });

        const { UnifiedStorageService } = await loadUnifiedStorageModule();
        new UnifiedStorageService();

        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[UnifiedStorageService.loadProviderPreference] Failed to read "DiagramView.StorageProvider":',
            expect.anything()
        );
        expect(safeLogState.error).toHaveBeenCalledWith('Failed to load storage preference', expect.anything());
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('sk-live-secret');

        getItemSpy.mockRestore();
    });

    it('logs and keeps the selected provider when writing storage preference fails', async () => {
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string) => {
            if (key === 'DiagramView.StorageProvider') {
                throw new Error('token=provider-write-secret');
            }
        });

        const { UnifiedStorageService } = await loadUnifiedStorageModule();
        const service = new UnifiedStorageService();

        expect(() => service.setProvider('s3')).not.toThrow();
        expect(service.currentProviderId).toBe('s3');
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[UnifiedStorageService.setProvider] Failed to write "DiagramView.StorageProvider":',
            expect.anything()
        );
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('provider-write-secret');
        setItemSpy.mockRestore();
    });

    it('logs and falls back when S3 config bootstrap parsing fails', async () => {
        const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
            if (key === 'diagram_storage_config') {
                throw new Error('Authorization: Bearer s3-config-secret');
            }
            return null;
        });

        const { UnifiedStorageService } = await loadUnifiedStorageModule();
        const service = new UnifiedStorageService();
        const s3Provider = service.getProvider('s3');

        expect(s3Provider.isConfigured()).toBe(false);
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[UnifiedStorageService.isS3Configured] Failed to read "diagram_storage_config":',
            expect.anything()
        );
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('s3-config-secret');
        getItemSpy.mockRestore();
    });

    it('rejects oversized persisted S3 config JSON in provider bootstrap', async () => {
        localStorage.setItem('diagram_storage_config', `${'x'.repeat(3 * 1024 * 1024)}`);
        sessionStorage.setItem('diagram_storage_config_secret', 'stale-secret');

        const { UnifiedStorageService } = await loadUnifiedStorageModule();
        const service = new UnifiedStorageService();
        const s3Provider = service.getProvider('s3');

        expect(s3Provider.isConfigured()).toBe(false);
        expect(localStorage.getItem('diagram_storage_config')).toBeNull();
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBeNull();
        expect(safeLogState.warn).toHaveBeenCalledWith(
            '[UnifiedStorageService.isS3Configured] Failed to read "diagram_storage_config":',
            expect.anything()
        );
        expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('is too large.');
    });

    it('clears invalid persisted S3 config and secret when config is structurally invalid', async () => {
        localStorage.setItem('diagram_storage_config', JSON.stringify({
            endpoint: 'https://s3.amazonaws.com',
            accessKeyId: 'AKIA_TEST',
            bucket: '',
            region: 'us-east-1',
        }));
        sessionStorage.setItem('diagram_storage_config_secret', 'stale-secret');

        const { UnifiedStorageService } = await loadUnifiedStorageModule();
        const service = new UnifiedStorageService();
        const s3Provider = service.getProvider('s3');

        expect(s3Provider.isConfigured()).toBe(false);
        expect(localStorage.getItem('diagram_storage_config')).toBeNull();
        expect(sessionStorage.getItem('diagram_storage_config_secret')).toBeNull();
    });
});
