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

describe('commandPaletteStorageLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts storage failures', async () => {
    const { logCommandPaletteStorageFailure } = await import('../commandPaletteStorageLogging');

    logCommandPaletteStorageFailure('readCommandUsage', new Error('Authorization: Bearer usage-secret'));
    logCommandPaletteStorageFailure('bumpRecentCommandId', new Error('cookie=recent-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));
    expect(warnMessages).toContain('[commandPaletteStorage.readCommandUsage] Failed to read "commandPalette.usage":');
    expect(warnMessages).toContain('[commandPaletteStorage.bumpRecentCommandId] Failed to write "commandPalette.recent":');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('usage-secret');
    expect(warnPayload).not.toContain('recent-secret');
  });
});
