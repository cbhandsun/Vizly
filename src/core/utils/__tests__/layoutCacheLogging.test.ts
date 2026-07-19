// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('layoutCacheLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts cache key creation failures', async () => {
    const logging = await import('../layoutCacheLogging');

    logging.logLayoutCacheKeyCreationFailure('createKey', new Error('Authorization: Bearer cache-key-secret'));
    logging.logLayoutCacheKeyCreationFailure('createStructureKey', new Error('cookie=structure-key-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));

    expect(warnMessages).toContain('[LayoutCacheManager] createKey failed:');
    expect(warnMessages).toContain('[LayoutCacheManager] createStructureKey failed:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('cache-key-secret');
    expect(warnPayload).not.toContain('structure-key-secret');
  });
});
