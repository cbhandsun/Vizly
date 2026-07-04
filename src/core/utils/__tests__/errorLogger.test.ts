import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../consoleCleanup', () => ({
  safeLog: safeLogState,
}));

describe('errorLogger', () => {
  beforeEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
  });

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

  it('redacts storage persistence failures before warning', async () => {
    vi.stubGlobal('process', { env: { NODE_ENV: 'production' } });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('token=sk-live-secret');
    });

    const { errorLogger } = await import('../errorLogger');
    errorLogger.log('persist me');

    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[ErrorLogger.persist] Failed to write "app_error_logs":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('sk-live-secret');
    setItemSpy.mockRestore();
  });

  it('falls back to empty logs when storage reads throw and logs a redacted warning', async () => {
    vi.stubGlobal('process', { env: { NODE_ENV: 'production' } });
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Authorization: Bearer storage-secret');
    });

    const { errorLogger } = await import('../errorLogger');

    expect(errorLogger.getLogs()).toEqual([]);
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[ErrorLogger.loadFromStorage] Failed to read "app_error_logs":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('storage-secret');

    getItemSpy.mockRestore();
  });

  it('clears in-memory logs even when storage removal throws and logs a redacted warning', async () => {
    vi.stubGlobal('process', { env: { NODE_ENV: 'production' } });

    const { errorLogger } = await import('../errorLogger');
    errorLogger.log('persist me first');

    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('token=remove-secret');
    });

    expect(() => errorLogger.clear()).not.toThrow();
    expect(errorLogger.getLogs()).toEqual([]);
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[ErrorLogger.clear] Failed to write "app_error_logs":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls.at(-1)?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls.at(-1)?.[1])).not.toContain('remove-secret');

    removeItemSpy.mockRestore();
  });
});
