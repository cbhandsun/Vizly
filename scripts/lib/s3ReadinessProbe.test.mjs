// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { probeS3Readiness } from './s3ReadinessProbe.mjs';

describe('standalone S3 readiness probe', () => {
  it('accepts only a successful response and cancels its body', async () => {
    const cancel = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(async () => ({ ok: true, body: { cancel } }));
    expect(await probeS3Readiness('http://127.0.0.1:9000', { fetchImpl })).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:9000/minio/health/ready', expect.objectContaining({ redirect: 'error' }));
  });

  it('rejects HTTP failures and unavailable services without exposing errors', async () => {
    expect(await probeS3Readiness('http://127.0.0.1:9000', { fetchImpl: async () => ({ ok: false }) })).toBe(false);
    expect(await probeS3Readiness('http://127.0.0.1:9000', { fetchImpl: async () => { throw new Error('private provider content'); } })).toBe(false);
  });

  it('bounds stalled fetch and body cancellation and aborts the request', async () => {
    let signal;
    expect(await probeS3Readiness('http://127.0.0.1:9000', { timeoutMs: 20, fetchImpl: async (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    } })).toBe(false);
    expect(signal.aborted).toBe(true);
    expect(await probeS3Readiness('http://127.0.0.1:9000', { timeoutMs: 20, fetchImpl: async () => ({ ok: true, body: { cancel: () => new Promise(() => {}) } }) })).toBe(false);
  });

  it('keeps a standalone Node process alive until a stalled fetch reaches its deadline', () => {
    const moduleUrl = new URL('./s3ReadinessProbe.mjs', import.meta.url).href;
    const script = `import { probeS3Readiness } from ${JSON.stringify(moduleUrl)}; const result = await probeS3Readiness('http://127.0.0.1:9000', { timeoutMs: 25, fetchImpl: () => new Promise(() => {}) }); process.stdout.write(String(result));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('false');
    expect(result.stderr).not.toContain('unsettled top-level await');
  });

  it('rejects empty, malformed, external and invalid timeout inputs before networking', async () => {
    for (const endpoint of ['', null, 'https://127.0.0.1:9000', 'http://example.com:9000', 'http://127.0.0.1:9000/path', 'http://127.0.0.1:0', 'http://127.0.0.1:65536', `http://127.0.0.1:${'9'.repeat(1000)}`]) {
      await expect(probeS3Readiness(endpoint)).rejects.toThrow('Invalid isolated S3 endpoint');
    }
    for (const timeoutMs of [0, -1, 1001, Infinity, '1000']) {
      await expect(probeS3Readiness('http://127.0.0.1:9000', { timeoutMs })).rejects.toThrow('Invalid isolated S3 readiness options');
    }
  });
});
