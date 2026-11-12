// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionOutboxRunner, type VersionOutboxRunnerDependencies } from '../versionOutboxRunner';
import { type VersionOutboxTask, MAX_VERSION_OUTBOX_ATTEMPTS } from '../versionOutbox';
import type { DiagramVersion } from '../storage/types';

const task: VersionOutboxTask = { operationId: 'id', versionId: 'id', diagramId: 'diagram', ownerId: 'a', provider: 'supabase', payloadHash: 'hash', attempts: 0, nextAttemptAt: 0, status: 'pending' };
const version: DiagramVersion = { id: 'id', diagramId: 'diagram', createdAt: 1, snapshotData: { nodes: [], edges: [] },
    storage: { ownerId: 'a', provider: 'supabase', localCreated: true, syncStatus: 'pending', location: 'local' } };
const runners: VersionOutboxRunner[] = [];
const setup = () => {
    let scope: { ownerId: string; key: string } | null = { ownerId: 'a', key: 'a:1' };
    let rows = [structuredClone(task)];
    const dependencies: VersionOutboxRunnerDependencies = {
        scope: () => scope, list: vi.fn(async () => rows.map(item => ({ ...item }))),
        load: vi.fn(async () => version), upload: vi.fn(async () => version),
        complete: vi.fn(async saved => { rows = rows.filter(item => item.operationId !== saved.operationId); }),
        fail: vi.fn(async (_old, next) => { rows = [next]; }), classify: vi.fn(() => 'network' as const), changed: vi.fn(),
    };
    const runner = new VersionOutboxRunner(dependencies); runners.push(runner);
    return { runner, dependencies, rows: () => rows, setRows: (next: VersionOutboxTask[]) => { rows = next; },
        scope: (next: typeof scope) => { scope = next; runner.invalidate(); } };
};
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000); });
afterEach(() => { runners.splice(0).forEach(runner => runner.stop()); vi.useRealTimers(); });

describe('persisted version outbox scheduling', () => {
    it('uploads and confirms once, skipping other owners and blocked tasks', async () => {
        const h = setup(); h.setRows([{ ...task, ownerId: 'b' }, { ...task, status: 'blocked' }, task]);
        h.runner.wake(); await vi.advanceTimersByTimeAsync(0);
        expect(h.dependencies.upload).toHaveBeenCalledTimes(1);
        expect(h.dependencies.complete).toHaveBeenCalledTimes(1);
        expect(h.dependencies.changed).toHaveBeenCalledTimes(1);
    });
    it('persists exponential backoff and stops after eight failed attempts', async () => {
        const h = setup(); vi.mocked(h.dependencies.upload).mockRejectedValue(new Error('network'));
        h.runner.wake(); await vi.advanceTimersByTimeAsync(0);
        expect(h.rows()[0]).toMatchObject({ attempts: 1, nextAttemptAt: 3_000, status: 'pending' });
        await vi.advanceTimersByTimeAsync(1_999); expect(h.dependencies.upload).toHaveBeenCalledTimes(1);
        await vi.runAllTimersAsync();
        expect(h.dependencies.upload).toHaveBeenCalledTimes(MAX_VERSION_OUTBOX_ATTEMPTS);
        expect(h.rows()[0]).toMatchObject({ status: 'blocked', attempts: 8 });
    });
    it('does not automatically retry permission errors', async () => {
        const h = setup(); vi.mocked(h.dependencies.upload).mockRejectedValue(new Error('denied'));
        vi.mocked(h.dependencies.classify).mockReturnValue('permission');
        h.runner.wake(); await vi.runAllTimersAsync();
        expect(h.dependencies.upload).toHaveBeenCalledTimes(1);
        expect(h.rows()[0]).toMatchObject({ status: 'blocked', failure: 'permission' });
    });
    it('cancels a hanging request on logout without consuming an attempt', async () => {
        const h = setup(); let signal: AbortSignal | undefined;
        vi.mocked(h.dependencies.upload).mockImplementation(async (_task, _version, input) => { signal = input; return new Promise(() => {}); });
        h.runner.wake(); await vi.advanceTimersByTimeAsync(0);
        h.scope(null); await vi.advanceTimersByTimeAsync(0);
        expect(signal?.aborted).toBe(true);
        expect(h.dependencies.fail).not.toHaveBeenCalled(); expect(h.dependencies.complete).not.toHaveBeenCalled();
        expect(h.rows()[0].attempts).toBe(0);
    });
    it('bounds a hanging transport and ignores its late completion', async () => {
        const h = setup(); let resolve!: (value: DiagramVersion) => void;
        vi.mocked(h.dependencies.upload).mockImplementation(() => new Promise(done => { resolve = done; }));
        h.runner.wake(); await vi.advanceTimersByTimeAsync(15_000);
        expect(h.dependencies.fail).toHaveBeenCalledTimes(1);
        resolve(version); await vi.advanceTimersByTimeAsync(0);
        expect(h.dependencies.complete).not.toHaveBeenCalled();
        expect(h.rows()[0].attempts).toBe(1);
    });
    it('does not overlap uploads when repeatedly woken and preserves work when stopped', async () => {
        const h = setup(); vi.mocked(h.dependencies.upload).mockImplementation(() => new Promise(() => {}));
        h.runner.wake(); await vi.advanceTimersByTimeAsync(0);
        for (let i = 0; i < 50; i++) h.runner.wake();
        await vi.advanceTimersByTimeAsync(0); expect(h.dependencies.upload).toHaveBeenCalledTimes(1);
        h.runner.stop(); await vi.runAllTimersAsync();
        expect(h.dependencies.fail).not.toHaveBeenCalled(); expect(h.rows()).toHaveLength(1);
    });
    it('honors a persisted retry deadline after restart', async () => {
        const h = setup(); h.setRows([{ ...task, attempts: 3, nextAttemptAt: 9_000 }]);
        h.runner.wake(); await vi.advanceTimersByTimeAsync(7_999); expect(h.dependencies.upload).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1); expect(h.dependencies.upload).toHaveBeenCalledTimes(1);
    });
    it('backs off local database failures instead of spinning or removing tasks', async () => {
        const h = setup(); vi.mocked(h.dependencies.list).mockRejectedValue(new Error('IDB unavailable'));
        h.runner.wake(); await vi.advanceTimersByTimeAsync(29_999); expect(h.dependencies.list).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1); expect(h.dependencies.list).toHaveBeenCalledTimes(2);
        expect(h.rows()).toHaveLength(1);
    });
});
