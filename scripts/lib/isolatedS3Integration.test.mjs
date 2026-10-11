// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), ready: vi.fn() }));
vi.mock('node:child_process', () => ({ spawnSync: mocks.spawn }));
vi.mock('./s3ReadinessProbe.mjs', () => ({ probeS3Readiness: mocks.ready }));
vi.mock('node:timers/promises', () => ({ setTimeout: async () => undefined }));
import { runIsolatedS3Integration } from './isolatedS3Integration.mjs';

const id = 'a'.repeat(64);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.ready.mockResolvedValue(true);
  mocks.spawn.mockImplementation((command, args) => ({ status: 0, stdout: command === 'docker'
    ? args[0] === 'run' ? id : args[0] === 'port' ? '127.0.0.1:9000' : '' : '' }));
});
describe('isolated S3 gate lifecycle', () => {
  it.each(['service', 'browser'])('runs the %s gate and removes only its own container', async mode => {
    await runIsolatedS3Integration(mode);
    const child = mocks.spawn.mock.calls.find(([command]) => command === process.execPath);
    expect(child[1]).toContain(mode === 'service' ? 'integration/vitest.config.ts' : 'playwright.s3.config.ts');
    expect(child[2].timeout).toBe(mode === 'service' ? 120000 : 240000);
    const start = mocks.spawn.mock.calls[0];
    expect(start[1]).toContain('127.0.0.1::9000');
    expect(start[1]).not.toContain(start[2].env.MINIO_ROOT_PASSWORD);
    expect(mocks.spawn).toHaveBeenLastCalledWith('docker', ['rm', '--force', id], expect.any(Object));
  });
  it.each(['', null, undefined, 'production', {}, 'browser;delete'])('rejects invalid mode before external operations: %s', async mode => {
    await expect(runIsolatedS3Integration(mode)).rejects.toThrow('Invalid isolated S3 integration mode');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('rejects an external port mapping and still cleans up', async () => {
    mocks.spawn.mockReturnValueOnce({ status: 0, stdout: id }).mockReturnValueOnce({ status: 0, stdout: '0.0.0.0:9000' });
    await expect(runIsolatedS3Integration('service')).rejects.toThrow('port mapping is invalid');
    expect(mocks.ready).not.toHaveBeenCalled();
    expect(mocks.spawn).toHaveBeenLastCalledWith('docker', ['rm', '--force', id], expect.any(Object));
  });
  it('bounds readiness failure and cleans up without running tests', async () => {
    mocks.ready.mockResolvedValue(false);
    await expect(runIsolatedS3Integration('browser')).rejects.toThrow('did not become ready');
    expect(mocks.ready).toHaveBeenCalledTimes(30);
    expect(mocks.spawn.mock.calls.some(([command]) => command === process.execPath)).toBe(false);
    expect(mocks.spawn).toHaveBeenLastCalledWith('docker', ['rm', '--force', id], expect.any(Object));
  });
  it('reports child failure without exposing raw errors and cleans up', async () => {
    mocks.spawn.mockReturnValueOnce({ status: 0, stdout: id }).mockReturnValueOnce({ status: 0, stdout: '127.0.0.1:9000' })
      .mockReturnValueOnce({ status: 1, error: new Error('private credentials') });
    await expect(runIsolatedS3Integration('service')).rejects.toThrow(/^Isolated S3 integration gate failed$/);
    expect(mocks.spawn).toHaveBeenLastCalledWith('docker', ['rm', '--force', id], expect.any(Object));
  });
  it('does not remove an invalid or unknown container identity', async () => {
    mocks.spawn.mockReturnValueOnce({ status: 0, stdout: 'unrelated-container' });
    await expect(runIsolatedS3Integration('browser')).rejects.toThrow('container identity');
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });
});
