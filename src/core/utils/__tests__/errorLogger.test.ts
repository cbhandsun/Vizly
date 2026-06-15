import { afterEach, describe, expect, it, vi } from 'vitest';

describe('errorLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
  });

  it('redacts sensitive values before persisting and exporting local error logs', async () => {
    vi.stubGlobal('process', { env: { NODE_ENV: 'production' } });
    window.history.replaceState({}, '', '/diagram?token=live-token&requestId=req-1');

    const { errorLogger } = await import('../errorLogger');
    errorLogger.clear();

    const error = new Error('request failed with api_key=sk-live-secret-value');
    error.stack = 'Error: failed\nAuthorization: Bearer live-bearer-token';

    const id = errorLogger.log(error, {
      level: 'error',
      source: 'test',
      componentStack: 'Component token=component-secret',
    });

    expect(id).toMatch(/^error_/);

    const logs = errorLogger.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toContain('api_key=[redacted]');
    expect(logs[0].stack).toContain('Authorization: [redacted]');
    expect(logs[0].componentStack).toContain('token=[redacted]');
    expect(logs[0].url).toContain('token=[redacted]');
    expect(logs[0].url).toContain('requestId=req-1');

    const persisted = localStorage.getItem('app_error_logs') ?? '';
    const exported = errorLogger.export();
    expect(persisted).not.toContain('sk-live-secret-value');
    expect(persisted).not.toContain('live-bearer-token');
    expect(persisted).not.toContain('component-secret');
    expect(exported).not.toContain('live-token');
    expect(exported).not.toContain('live-bearer-token');
  });

  it('keeps benign error filtering before persisting logs', async () => {
    vi.stubGlobal('process', { env: { NODE_ENV: 'production' } });

    const { errorLogger } = await import('../errorLogger');
    errorLogger.clear();

    expect(errorLogger.log(new Error('AbortError'))).toBe('ignored');
    expect(errorLogger.getLogs()).toHaveLength(0);
    expect(localStorage.getItem('app_error_logs')).toBeNull();
  });

  it('coerces polluted persisted logs before using the singleton state', async () => {
    vi.stubGlobal('process', { env: { NODE_ENV: 'production' } });
    localStorage.setItem('app_error_logs', JSON.stringify([
      null,
      { id: '', message: 'missing id', timestamp: 1, userAgent: '', url: '', level: 'error' },
      {
        id: 'safe-id',
        timestamp: -10,
        message: `token=stored-secret ${'x'.repeat(5000)}`,
        stack: `Authorization: Bearer stored-bearer ${'y'.repeat(5000)}`,
        userAgent: 'agent',
        url: 'https://user:pass@example.test/?api_key=stored-key&requestId=req-1',
        level: 'not-a-level',
        source: 'storage',
      },
    ]));

    const { errorLogger } = await import('../errorLogger');

    const logs = errorLogger.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe('safe-id');
    expect(logs[0].level).toBe('error');
    expect(logs[0].message).toContain('token=[redacted]');
    expect(logs[0].message.length).toBeLessThanOrEqual(4000);
    expect(logs[0].stack).toContain('Authorization: [redacted]');
    expect(logs[0].url).toContain('api_key=[redacted]');
    expect(logs[0].url).toContain('requestId=req-1');
    expect(logs[0].url).not.toContain('stored-key');
    expect(logs[0].url).not.toContain('user:pass');
  });

  it('falls back to empty logs when persisted data is not an array', async () => {
    vi.stubGlobal('process', { env: { NODE_ENV: 'production' } });
    localStorage.setItem('app_error_logs', JSON.stringify({ push: 'not-an-array' }));

    const { errorLogger } = await import('../errorLogger');

    expect(errorLogger.getLogs()).toEqual([]);
    expect(() => errorLogger.log('still works')).not.toThrow();
    expect(errorLogger.getLogs()).toHaveLength(1);
  });

  it('skips oversized persisted error log payloads before parsing', async () => {
    vi.stubGlobal('process', { env: { NODE_ENV: 'production' } });
    localStorage.setItem('app_error_logs', 'x'.repeat(2 * 1024 * 1024 + 1));

    const { errorLogger } = await import('../errorLogger');

    expect(errorLogger.getLogs()).toEqual([]);
    expect(() => errorLogger.log('still works')).not.toThrow();
    expect(errorLogger.getLogs()).toHaveLength(1);
  });
});
