// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateAuthSessionOwner } from '../../context/authSessionBoundary';
const fixture = vi.hoisted(() => ({ list: vi.fn(), load: vi.fn(), upload: vi.fn(), complete: vi.fn(), fail: vi.fn() }));
vi.mock('../../services/IndexedDBStorage', () => ({ localVersionDB: {
    listVersionOutbox: fixture.list, loadVersion: fixture.load, completeVersionOutbox: fixture.complete, updateVersionOutboxFailure: fixture.fail,
} }));
vi.mock('../../services/UnifiedStorageService', () => ({
    unifiedStorage: { currentProviderId: 'supabase', isConfigured: () => true,
        getProvider: () => ({ saveVersionIdempotent: fixture.upload }) },
    classifyVersionSaveFailure: () => 'network',
}));
import { installVersionOutbox } from '../configureVersionOutbox';
const task = { ownerId: 'owner', provider: 'supabase', diagramId: 'diagram', versionId: 'version', operationId: 'version',
    status: 'pending', payloadHash: 'hash', attempts: 0, nextAttemptAt: 0 };
const version = { id: 'version', diagramId: 'diagram', message: 'retained', snapshotData: { nodes: [], edges: [] },
    storage: { ownerId: 'owner', provider: 'supabase', localCreated: true } };
let stop = () => {};
afterEach(() => { stop(); updateAuthSessionOwner(null); vi.useRealTimers(); vi.clearAllMocks(); });
describe('automatic version sync rollback', () => {
    it('does not read, send or mutate queued data while disabled, then resumes the retained task', async () => {
        vi.useFakeTimers(); updateAuthSessionOwner('owner');
        fixture.list.mockResolvedValue([task]); fixture.load.mockResolvedValue(version); fixture.upload.mockResolvedValue(version);
        stop = installVersionOutbox(false);
        window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('version-outbox-enqueued'));
        await vi.advanceTimersByTimeAsync(0);
        expect(fixture.list).not.toHaveBeenCalled(); expect(fixture.upload).not.toHaveBeenCalled();
        expect(fixture.complete).not.toHaveBeenCalled(); expect(fixture.fail).not.toHaveBeenCalled();
        stop(); stop = installVersionOutbox(true); await vi.advanceTimersByTimeAsync(0);
        expect(fixture.upload).toHaveBeenCalledWith('diagram', version.snapshotData, 'retained', expect.objectContaining({ ownerId: 'owner', operationId: 'version' }));
        expect(fixture.complete).toHaveBeenCalledWith(task, version);
        stop(); fixture.upload.mockClear();
        window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('version-outbox-enqueued'));
        await vi.advanceTimersByTimeAsync(0); expect(fixture.upload).not.toHaveBeenCalled();
    });
});
