import { afterEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('@/core/utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

describe('clipboardLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts clipboard failures', async () => {
    const logging = await import('../clipboardLogging');

    logging.logClipboardWriteFailure(new Error('Authorization: Bearer copy-secret'));
    logging.logClipboardSystemWriteFailure(new Error('cookie=system-copy-secret'));
    logging.logClipboardReadFailure(new Error('api_key=read-secret'));
    logging.logClipboardStorageReadFailure(new Error('token=storage-read-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    expect(warnPayload).toContain('[useClipboard] local clipboard persistence failed:');
    expect(warnPayload).toContain('[useClipboard] system clipboard write failed:');
    expect(warnPayload).toContain('[useClipboard] system clipboard read failed:');
    expect(warnPayload).toContain('[useClipboard] local clipboard read failed:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('copy-secret');
    expect(warnPayload).not.toContain('system-copy-secret');
    expect(warnPayload).not.toContain('read-secret');
    expect(warnPayload).not.toContain('storage-read-secret');
  });
});
