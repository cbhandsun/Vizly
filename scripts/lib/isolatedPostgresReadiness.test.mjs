// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { waitForIsolatedPostgres } from './isolatedPostgresReadiness.mjs';

const container = 'vizly-rls-regression-123';
describe('isolated final Postgres server readiness', () => {
  it('probes TCP so the initialization socket cannot satisfy readiness', async () => {
    const probe = vi.fn().mockReturnValueOnce({ status: 2 }).mockReturnValueOnce({ status: 1 }).mockReturnValue({ status: 0 });
    const pause = vi.fn().mockResolvedValue(undefined);
    await waitForIsolatedPostgres({ container, probe, pause });
    expect(probe.mock.calls).toEqual(Array.from({ length: 3 }, () => [['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']]));
    expect(pause).toHaveBeenCalledTimes(2);
  });
  it('returns immediately for a ready final server', async () => {
    const pause = vi.fn();
    await waitForIsolatedPostgres({ container, probe: () => ({ status: 0 }), pause });
    expect(pause).not.toHaveBeenCalled();
  });
  it('fails after the original finite probe budget', async () => {
    const probe = vi.fn(() => ({ status: 2 }));
    const pause = vi.fn().mockResolvedValue(undefined);
    await expect(waitForIsolatedPostgres({ container, probe, pause })).rejects.toThrow('did not become ready');
    expect(probe).toHaveBeenCalledTimes(30);
    expect(pause).toHaveBeenCalledTimes(29);
  });
  it.each([null, {}, [], { status: null }, { status: 3 }, { status: -1 }, { status: 256 }, { status: 0, signal: 'SIGTERM' }, { status: 0, error: new Error('private process detail') }])('fails safely on invalid or abnormal results', async result => {
    await expect(waitForIsolatedPostgres({ container, probe: () => result })).rejects.toThrow('readiness probe failed');
  });
  it.each(['', '../container', 'other-123', 'vizly-rls-regression-123;echo secret', 'vizly-rls-regression-1234567890123'])('rejects invalid container identity', async value => {
    await expect(waitForIsolatedPostgres({ container: value, probe: () => ({ status: 0 }) })).rejects.toThrow('Invalid');
  });
  it('propagates a failed pause instead of hiding it', async () => {
    await expect(waitForIsolatedPostgres({ container, probe: () => ({ status: 1 }), pause: async () => { throw new Error('pause failed'); } })).rejects.toThrow('pause failed');
  });
});
