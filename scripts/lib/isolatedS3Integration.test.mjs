// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), ready: vi.fn() }));
vi.mock('node:child_process', () => ({ spawnSync: mocks.spawn }));
vi.mock('./s3ReadinessProbe.mjs', () => ({ probeS3Readiness: mocks.ready }));
vi.mock('node:timers/promises', () => ({ setTimeout: async () => undefined }));
import { prepareIsolatedS3Fixture, runIsolatedS3Integration } from './isolatedS3Integration.mjs';

const id = 'a'.repeat(64);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.ready.mockResolvedValue(true);
  mocks.spawn.mockImplementation((command, args) => ({ status: 0, stdout: command === 'docker'
    ? args[0] === 'run' ? id : args[0] === 'port' ? '127.0.0.1:9000' : '' : '' }));
});
describe('isolated S3 gate lifecycle', () => {
  it('pins source and compiler integrity while excluding repository content from the build context', () => {
    const root = new URL('../../integration/fixtures/minio/', import.meta.url);
    const recipe = readFileSync(new URL('Dockerfile', root), 'utf8');
    expect(recipe).toMatch(/^FROM golang:[^\s]+@sha256:[a-f0-9]{64} AS build/m);
    expect(recipe).toMatch(/^ADD --checksum=sha256:[a-f0-9]{64} https:\/\/codeload\.github\.com\/minio\/minio\/tar\.gz\/[a-f0-9]{40} \/tmp\/source\.tar\.gz$/m);
    expect(recipe).toContain('FROM scratch');
    expect(recipe).toContain('COPY --from=build /src/LICENSE /LICENSE');
    expect(readFileSync(new URL('.dockerignore', root), 'utf8').trim().split(/\r?\n/)).toEqual(['*', '!Dockerfile', '!.dockerignore']);
  });
  it.each(['service', 'browser'])('runs the %s gate and removes only its own container', async mode => {
    await runIsolatedS3Integration(mode);
    const child = mocks.spawn.mock.calls.find(([command]) => command === process.execPath);
    expect(child[1]).toContain(mode === 'service' ? 'integration/vitest.config.ts' : 'playwright.s3.config.ts');
    expect(child[2].timeout).toBe(mode === 'service' ? 120000 : 240000);
    const start = mocks.spawn.mock.calls.find(([command, args]) => command === 'docker' && args[0] === 'run');
    expect(start[1]).toContain('127.0.0.1::9000');
    expect(start[1]).not.toContain(start[2].env.MINIO_ROOT_PASSWORD);
    expect(mocks.spawn).toHaveBeenLastCalledWith('docker', ['rm', '--force', id], expect.any(Object));
  });
  it.each(['', null, undefined, 'production', {}, 'browser;delete'])('rejects invalid mode before external operations: %s', async mode => {
    await expect(runIsolatedS3Integration(mode)).rejects.toThrow('Invalid isolated S3 integration mode');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('rejects an external port mapping and still cleans up', async () => {
    mocks.spawn.mockReturnValueOnce({ status: 0, stdout: '' }).mockReturnValueOnce({ status: 0, stdout: id }).mockReturnValueOnce({ status: 0, stdout: '0.0.0.0:9000' });
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
    mocks.spawn.mockReturnValueOnce({ status: 0, stdout: '' }).mockReturnValueOnce({ status: 0, stdout: id }).mockReturnValueOnce({ status: 0, stdout: '127.0.0.1:9000' })
      .mockReturnValueOnce({ status: 1, error: new Error('private credentials') });
    await expect(runIsolatedS3Integration('service')).rejects.toThrow(/^Isolated S3 integration gate failed$/);
    expect(mocks.spawn).toHaveBeenLastCalledWith('docker', ['rm', '--force', id], expect.any(Object));
  });
  it('does not remove an invalid or unknown container identity', async () => {
    mocks.spawn.mockReturnValueOnce({ status: 0, stdout: '' }).mockReturnValueOnce({ status: 0, stdout: 'unrelated-container' });
    await expect(runIsolatedS3Integration('browser')).rejects.toThrow('container identity');
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
  });
  it('builds from the isolated fixture context before generating runtime credentials', () => {
    prepareIsolatedS3Fixture();
    const [command, args, options] = mocks.spawn.mock.calls[0];
    expect(command).toBe('docker');
    expect(args.slice(0, 3)).toEqual(['build', '--tag', 'vizly-s3-fixture:source-0d7408fc9969']);
    expect(args[3].replaceAll('\\', '/')).toMatch(/\/integration\/fixtures\/minio\/$/);
    expect(options.timeout).toBe(600000);
    expect(options.env).toBeUndefined();
    expect(options.shell).toBeUndefined();
  });
  it.each([{ status: 1 }, { status: null, error: new Error('private credential') },
    { status: 0, error: new Error('timeout private credential') }])('fails closed on fixture build failure without exposing output', async result => {
    mocks.spawn.mockReturnValueOnce({ ...result, stdout: 'private credential', stderr: 'private credential' });
    await expect(runIsolatedS3Integration('service')).rejects.toThrow(/^Isolated S3 source fixture build failed$/);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(mocks.ready).not.toHaveBeenCalled();
  });
});
