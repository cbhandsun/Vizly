// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireDistributedRoomLease, type DistributedRoomLease, type DistributedRoomLeaseStore } from './distributedRoomLease.js';
import { createOperationTelemetry } from './operationTelemetry.js';
import { configureServerTelemetry } from './serverTelemetry.js';
const telemetryCleanup: Array<() => void> = [];
const monitor = () => {
  const telemetry = createOperationTelemetry({ releaseId: 'a'.repeat(40), transport: async () => {} });
  telemetryCleanup.push(configureServerTelemetry(telemetry)); return telemetry;
};
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const generation = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const handles: DistributedRoomLease[] = [];
afterEach(async () => { try { for (const handle of handles.splice(0)) await handle.close(); } finally { for (const stop of telemetryCleanup.splice(0)) stop(); vi.useRealTimers(); } });
const fixture = () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T00:00:00Z'));
  const store: DistributedRoomLeaseStore = {
    claim: vi.fn(async () => ({ generation, expiresAt: '2026-10-09T00:00:30Z' })),
    renew: vi.fn(async () => true), release: vi.fn(async () => true),
  };
  return store;
};
const acquire = async (store: DistributedRoomLeaseStore, kind: 'edit' | 'recovery' = 'edit') => {
  const handle = await acquireDistributedRoomLease(store, id, kind, () => Date.now());
  handles.push(handle); return handle;
};
describe('distributed room lease lifecycle', () => {
  it('pins the admitted generation, renews and releases exactly once', async () => {
    const store = fixture(); const handle = await acquire(store);
    expect(handle.generation).toBe(generation); handle.assertActive();
    await vi.advanceTimersByTimeAsync(8000);
    expect(store.renew).toHaveBeenCalledWith(id, handle.leaseId, generation);
    await Promise.all([handle.close(), handle.close()]);
    expect(store.release).toHaveBeenCalledTimes(1);
    expect(handle.signal.aborted).toBe(true); expect(() => handle.assertActive()).toThrow();
    await vi.advanceTimersByTimeAsync(60_000); expect(store.renew).toHaveBeenCalledTimes(1);
  });
  it.each([false, 'failure'])('invalidates the room on rejected or failed renewal: %s', async failure => {
    const store = fixture();
    store.renew = failure === false ? vi.fn(async () => false) : vi.fn(async () => { throw new Error('Synthetic unavailable'); });
    const handle = await acquire(store);
    await vi.advanceTimersByTimeAsync(8000);
    expect(handle.signal.aborted).toBe(true); expect(() => handle.assertActive()).toThrow();
    await vi.advanceTimersByTimeAsync(60_000); expect(store.renew).toHaveBeenCalledTimes(1);
  });
  it('expires while a heartbeat hangs and cannot be revived by its late success', async () => {
    const store = fixture(); let finish: (value: boolean) => void = () => { throw new Error('Missing test resolver'); };
    store.renew = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const handle = await acquire(store); await vi.advanceTimersByTimeAsync(20_000);
    expect(handle.signal.aborted).toBe(true);
    finish(true); await vi.advanceTimersByTimeAsync(0);
    expect(() => handle.assertActive()).toThrow();
    await vi.advanceTimersByTimeAsync(30_000); expect(store.renew).toHaveBeenCalledTimes(1);
  });
  it('checks elapsed time even when timers have not run after a process pause', async () => {
    const store = fixture(); const handle = await acquire(store);
    vi.setSystemTime(new Date('2026-10-09T00:00:21Z'));
    expect(() => handle.assertActive()).toThrow(); expect(handle.signal.aborted).toBe(true);
  });
  it('releases a delayed admission before exposing an expired handle', async () => {
    const store = fixture();
    store.claim = vi.fn(async () => { vi.setSystemTime(new Date('2026-10-09T00:00:21Z')); return { generation, expiresAt: '2026-10-09T00:00:30Z' }; });
    await expect(acquire(store)).rejects.toThrow('admission expired'); expect(store.release).toHaveBeenCalledTimes(1);
  });
  it('fails admission safely for busy rooms and invalid identity', async () => {
    const store = fixture(); store.claim = vi.fn(async () => null);
    await expect(acquire(store, 'recovery')).rejects.toThrow('unavailable');
    await expect(acquireDistributedRoomLease(store, '../room', 'edit')).rejects.toThrow('identity');
    expect(store.claim).toHaveBeenCalledTimes(1); expect(store.release).not.toHaveBeenCalled();
  });
  it('reports release failures instead of silently claiming successful cleanup', async () => {
    const store = fixture(); store.release = vi.fn(async () => { throw new Error('Synthetic release failure'); });
    const handle = await acquire(store);
    await expect(handle.close()).rejects.toThrow('release failure');
    expect(handle.signal.aborted).toBe(true); expect(store.release).toHaveBeenCalledTimes(1);
    handles.splice(handles.indexOf(handle), 1);
  });
});

describe('lease diagnostics at the actual renewal boundary', () => {
  it.each([false, 'throw', 'invalid'] as const)('records rejected renewal without room or error payload: %s', async result => {
    const store = fixture(); const telemetry = monitor();
    store.renew = async () => {
      if (result === 'throw') throw Error('CANARY-CREDENTIAL');
      return (result === false ? false : 'CANARY-PAYLOAD') as boolean;
    };
    const handle = await acquire(store); await vi.advanceTimersByTimeAsync(8000);
    const batch = telemetry.snapshot();
    expect(batch.metrics.lease).toEqual({ started: 1, success: 0, failure: 1, cancelled: 0 });
    expect(batch.events[0]).toMatchObject({ operation: 'lease', outcome: 'failure',
      code: result === false ? 'conflict' : result === 'throw' ? 'unavailable' : 'invalid' });
    expect(JSON.stringify(batch)).not.toMatch(/CANARY|aaaaaaaa-aaaa|bbbbbbbb-bbbb/);
    expect(handle.signal.aborted).toBe(true);
  });
  it('finishes hanging renewal at expiry once and ignores late success', async () => {
    const store = fixture(); const telemetry = monitor(); let resolve!: (value: boolean) => void;
    store.renew = () => new Promise<boolean>(done => { resolve = done; });
    await acquire(store); await vi.advanceTimersByTimeAsync(20_000);
    expect(telemetry.snapshot().metrics.lease).toEqual({ started: 1, success: 0, failure: 1, cancelled: 0 });
    expect(telemetry.snapshot().events[0]).toMatchObject({ code: 'timeout' });
    resolve(true); await vi.advanceTimersByTimeAsync(0);
    expect(telemetry.snapshot().metrics.lease.failure).toBe(1);
  });
  it('normal close cancels an in-flight renewal without generating an alert', async () => {
    const store = fixture(); const telemetry = monitor(); let reject!: (reason: Error) => void;
    store.renew = () => new Promise<boolean>((_, fail) => { reject = fail; });
    const handle = await acquire(store); await vi.advanceTimersByTimeAsync(8000); await handle.close();
    reject(Error('late failure')); await vi.advanceTimersByTimeAsync(0);
    expect(telemetry.snapshot().metrics.lease).toEqual({ started: 1, success: 0, failure: 0, cancelled: 1 });
  });
  it('reports a successful renewal and no extra event for normal release', async () => {
    const store = fixture(); const telemetry = monitor(); const handle = await acquire(store);
    await vi.advanceTimersByTimeAsync(8000); await handle.close();
    expect(telemetry.snapshot().metrics.lease).toEqual({ started: 1, success: 1, failure: 0, cancelled: 0 });
  });
});
