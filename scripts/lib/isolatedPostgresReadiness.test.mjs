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
    const error = await waitForIsolatedPostgres({ container, probe, pause }).catch(error => error);
    expect(error.message).toContain('did not become ready');
    expect(error.diagnostics).toEqual({ attempt: 30, elapsedMs: expect.any(Number), status: 2, signal: 'none', errorCode: 'none' });
    expect(error.message).toContain('attempt=30');
    expect(error.message).toContain('status=2');
    expect(probe).toHaveBeenCalledTimes(30);
    expect(pause).toHaveBeenCalledTimes(29);
  });
  it.each([null, {}, [], { status: null }, { status: 3 }, { status: -1 }, { status: 256 }, { status: 0, signal: 'SIGTERM' }, { status: 0, error: new Error('private process detail') }])('fails safely on invalid or abnormal results', async result => {
    await expect(waitForIsolatedPostgres({ container, probe: () => result })).rejects.toThrow('readiness probe failed');
  });
  it('includes safe timeout metadata and fails immediately without retrying the timeout', async () => {
    const timeout = { status: null, signal: 'SIGTERM', error: Object.assign(new Error('private process detail'), { code: 'ETIMEDOUT' }),
      stdout: 'private stdout', stderr: 'private stderr' };
    const probe = vi.fn().mockReturnValueOnce({ status: 2 }).mockReturnValueOnce(timeout).mockReturnValue({ status: 0 });
    const pause = vi.fn().mockResolvedValue(undefined);
    const error = await waitForIsolatedPostgres({ container, probe, pause }).catch(error => error);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledOnce();
    expect(error.diagnostics).toEqual({ attempt: 2, elapsedMs: expect.any(Number), status: null, signal: 'SIGTERM', errorCode: 'ETIMEDOUT' });
    expect(Number.isInteger(error.diagnostics.elapsedMs)).toBe(true);
    expect(error.diagnostics.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(error.message).toMatch(/attempt=2, elapsedMs=\d+, status=null, signal=SIGTERM, error\.code=ETIMEDOUT/);
    expect(error.message).not.toContain('private');
    expect(JSON.stringify(error)).not.toContain('private');
    expect(error.cause).toBeUndefined();
  });
  it('does not copy arbitrary strings or unsafe numbers into bounded diagnostics', async () => {
    const privateValue = `private-provider-detail-${'x'.repeat(2000)}`;
    for (const status of [privateValue, Infinity, Number.MAX_SAFE_INTEGER]) {
      const result = { status, signal: privateValue, error: { code: privateValue, message: privateValue }, stderr: privateValue };
      const error = await waitForIsolatedPostgres({ container, probe: () => result }).catch(error => error);
      expect(error.diagnostics).toMatchObject({ status: 'unknown', signal: 'unknown', errorCode: 'unknown' });
      expect(error.message.length).toBeLessThan(250);
      expect(error.message).not.toContain('private');
      expect(JSON.stringify(error)).not.toContain('private');
    }
  });
  it('does not expose an error-code getter failure', async () => {
    const result = { status: null, error: { get code() { throw new Error('private getter detail'); } } };
    const error = await waitForIsolatedPostgres({ container, probe: () => result }).catch(error => error);
    expect(error.message).toContain('readiness probe failed');
    expect(error.diagnostics.errorCode).toBe('unknown');
    expect(error.message).not.toContain('private');
  });
  it.each(['', '../container', 'other-123', 'vizly-rls-regression-123;echo secret', 'vizly-rls-regression-1234567890123'])('rejects invalid container identity', async value => {
    await expect(waitForIsolatedPostgres({ container: value, probe: () => ({ status: 0 }) })).rejects.toThrow('Invalid');
  });
  it('propagates a failed pause instead of hiding it', async () => {
    await expect(waitForIsolatedPostgres({ container, probe: () => ({ status: 1 }), pause: async () => { throw new Error('pause failed'); } })).rejects.toThrow('pause failed');
  });
});
