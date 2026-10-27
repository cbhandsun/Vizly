// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagramVersion, IStorageProvider, VersionStorageState } from '../storage/types';
import { coerceDiagramVersion } from '../versionSnapshotSecurity';
import { updateAuthSessionOwner } from '../../context/authSessionBoundary';
const rows = vi.hoisted(() => new Map<string, DiagramVersion>());
vi.mock('../IndexedDBStorage', () => ({ localVersionDB: {
    saveVersion: vi.fn(async (diagramId: string, snapshotData: DiagramVersion['snapshotData'], message: string, storage: VersionStorageState) => {
        const row = { id: `local-${rows.size}`, diagramId, snapshotData, message, storage, createdAt: 1 };
        rows.set(row.id, row); return row;
    }),
    saveVersionWithOutbox: vi.fn(async (diagramId: string, snapshotData: DiagramVersion['snapshotData'], message: string, storage: VersionStorageState) => {
        const version = { id: `local-${rows.size}`, diagramId, snapshotData, message, storage, createdAt: 1 };
        rows.set(version.id, version); return { version, queued: true };
    }),
    listVersionOutbox: vi.fn(async () => []),
    listVersions: vi.fn(async (id: string) => [...rows.values()].filter(row => row.diagramId === id)),
    loadVersion: vi.fn(async (diagram: string, id: string) => rows.get(id)?.diagramId === diagram ? rows.get(id) : null),
    updateVersionStorage: vi.fn(async (_diagram: string, id: string, storage: VersionStorageState) => {
        rows.set(id, { ...rows.get(id)!, storage });
    }),
} }));
import { UnifiedStorageService, classifyVersionSaveFailure } from '../UnifiedStorageService';
const snapshot = { nodes: [{ id: 'n1', position: { x: 0, y: 0 }, data: {} }], edges: [] };
const remote = { id: 'remote-1', diagramId: 'diagram', snapshotData: snapshot, createdAt: 2 };
const setup = () => {
    const service = new UnifiedStorageService();
    service.setProvider('supabase');
    const provider: IStorageProvider = {
        id: 'supabase', name: 'fixture', isConfigured: () => true,
        listDiagrams: vi.fn(), loadDiagram: vi.fn(), saveDiagram: vi.fn(), deleteDiagram: vi.fn(),
        saveVersion: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
        listVersions: vi.fn().mockResolvedValue([]), loadVersion: vi.fn().mockResolvedValue(remote),
    };
    provider.saveVersionIdempotent = provider.saveVersion;
    Object.assign(service.getProvider('supabase'), provider);
    return { service, provider };
};
beforeEach(() => { rows.clear(); localStorage.clear(); updateAuthSessionOwner('user-a', crypto.randomUUID()); });
describe('version save outcomes and ownership', () => {
    it('retains offline status across service reloads and excludes another account and provider', async () => {
        const { service, provider } = setup();
        const saved = await service.saveVersion('diagram', snapshot, 'offline');
        expect(saved.storage).toMatchObject({ ownerId: 'user-a', provider: 'supabase', location: 'local', syncStatus: 'pending' });
        const reloaded = setup().service;
        expect(await reloaded.listVersions('diagram')).toHaveLength(1);
        updateAuthSessionOwner('user-b');
        expect(await reloaded.listVersions('diagram')).toEqual([]);
        expect(await reloaded.loadVersion('diagram', saved.id)).toBeNull();
        await expect(reloaded.retryVersion('diagram', saved.id)).rejects.toThrow('ownership');
        expect(provider.saveVersion).not.toHaveBeenCalled();
        updateAuthSessionOwner('user-a');
        reloaded.setProvider('s3');
        expect(await reloaded.listVersions('diagram')).toEqual([]);
    });
    it('keeps legacy ownership unknown and forbids retry without altering historical records', async () => {
        rows.set('legacy', { ...remote, id: 'legacy' });
        const { service, provider } = setup();
        expect((await service.listVersions('diagram'))[0].storage).toMatchObject({ syncStatus: 'legacy', ownerId: null });
        await expect(service.retryVersion('diagram', 'legacy')).rejects.toThrow('ownership');
        expect(rows.get('legacy')?.storage).toBeUndefined();
        expect(provider.saveVersion).not.toHaveBeenCalled();
    });
    it('confirms a manual retry by remote readback and suppresses the duplicate timeline receipt', async () => {
        const { service, provider } = setup();
        const saved = await service.saveVersion('diagram', snapshot);
        const canonical = rows.get(saved.id)!.snapshotData;
        vi.mocked(provider.saveVersion!).mockResolvedValue({ ...remote, snapshotData: canonical });
        vi.mocked(provider.loadVersion!).mockResolvedValue({ ...remote, snapshotData: canonical });
        const retried = await service.retryVersion('diagram', saved.id);
        expect(retried.storage).toMatchObject({ syncStatus: 'synced', remoteVersionId: remote.id });
        expect(provider.loadVersion).toHaveBeenCalledWith('diagram', remote.id);
        await service.retryVersion('diagram', saved.id);
        expect(provider.saveVersion).toHaveBeenCalledTimes(1);
        vi.mocked(provider.listVersions!).mockResolvedValue([remote]);
        expect(await service.listVersions('diagram')).toHaveLength(1);
    });
    it('retains remote receipt when readback fails and retries verification without another insert', async () => {
        const { service, provider } = setup();
        const saved = await service.saveVersion('diagram', snapshot);
        vi.mocked(provider.saveVersion!).mockResolvedValue(remote);
        vi.mocked(provider.loadVersion!).mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await expect(service.retryVersion('diagram', saved.id)).rejects.toThrow('fetch');
        expect(rows.get(saved.id)?.storage).toMatchObject({ syncStatus: 'pending', remoteVersionId: remote.id });
        vi.mocked(provider.loadVersion!).mockResolvedValue({ ...remote, snapshotData: rows.get(saved.id)!.snapshotData });
        await service.retryVersion('diagram', saved.id);
        expect(provider.saveVersion).toHaveBeenCalledTimes(1);
    });
    it('compares remote JSON independently of database object key order and serializes retries', async () => {
        const { service, provider } = setup();
        const saved = await service.saveVersion('diagram', snapshot);
        let finish!: (value: DiagramVersion) => void;
        vi.mocked(provider.saveVersion!).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const pending = service.retryVersion('diagram', saved.id);
        await vi.waitFor(() => expect(provider.saveVersion).toHaveBeenCalledTimes(1));
        await expect(service.retryVersion('diagram', saved.id)).rejects.toThrow('already in progress');
        const canonical = rows.get(saved.id)!.snapshotData!;
        vi.mocked(provider.loadVersion!).mockResolvedValue({ ...remote, snapshotData: { edges: canonical.edges, nodes: canonical.nodes } });
        finish(remote);
        expect((await pending).storage?.syncStatus).toBe('synced');
    });
    it('does not mark synced when the remote snapshot differs', async () => {
        const { service, provider } = setup();
        const saved = await service.saveVersion('diagram', snapshot);
        vi.mocked(provider.saveVersion!).mockResolvedValue(remote);
        vi.mocked(provider.loadVersion!).mockResolvedValue({ ...remote, snapshotData: { nodes: [], edges: [] } });
        await expect(service.retryVersion('diagram', saved.id)).rejects.toThrow('verification failed');
        expect(rows.get(saved.id)?.storage?.syncStatus).toBe('pending');
    });
    it('retains an old-account remote receipt without publishing into the new session', async () => {
        const { service, provider } = setup();
        const saved = await service.saveVersion('diagram', snapshot);
        let finish!: (value: DiagramVersion) => void;
        vi.mocked(provider.saveVersion!).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const pending = service.retryVersion('diagram', saved.id);
        await vi.waitFor(() => expect(provider.saveVersion).toHaveBeenCalledTimes(1));
        updateAuthSessionOwner('user-b'); finish(remote);
        await expect(pending).rejects.toThrow('session changed');
        expect(rows.get(saved.id)?.storage).toMatchObject({ ownerId: 'user-a', syncStatus: 'pending', remoteVersionId: remote.id });
        expect(provider.loadVersion).not.toHaveBeenCalled();
        expect(await service.listVersions('diagram')).toEqual([]);
    });
    it('rejects malformed ownership metadata instead of treating it as a legacy record', () => {
        expect(coerceDiagramVersion({ ...remote, storage: { ownerId: 42 } })).toBeNull();
    });
    it('does not loop on permission denial', async () => {
        const { service, provider } = setup();
        vi.mocked(provider.saveVersion!).mockRejectedValue({ code: '42501' });
        const saved = await service.saveVersion('diagram', snapshot);
        expect(saved.storage?.failure).toBeUndefined();
        await expect(service.retryVersion('diagram', saved.id)).rejects.toEqual({ code: '42501' });
        expect(provider.saveVersion).toHaveBeenCalledTimes(1);
    });
    it('preserves the original local owner when the session changes during persistence', async () => {
        const { service, provider } = setup();
        const pending = service.saveVersion('diagram', snapshot);
        updateAuthSessionOwner('user-b');
        await expect(pending).rejects.toThrow('session changed');
        expect(rows.size).toBe(1);
        expect([...rows.values()][0].storage?.ownerId).toBe('user-a');
        expect(await service.listVersions('diagram')).toEqual([]);
        expect(provider.saveVersion).not.toHaveBeenCalled();
    });
    it.each([
        [{ status: 401 }, 'authentication'], [{ code: '42501' }, 'permission'],
        [{ statusCode: 403 }, 'permission'], [{ code: '22P02' }, 'data'],
        [new Error('Storage configuration required'), 'configuration'],
        [new TypeError('Failed to fetch'), 'network'], [{ status: 503 }, 'network'],
        [new Error('opaque'), 'unknown'],
    ])('classifies %j as %s without exposing server text', (error, expected) => {
        expect(classifyVersionSaveFailure(error)).toBe(expected);
    });
});
