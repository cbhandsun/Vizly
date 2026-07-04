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

describe('basePluginLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive coercion failures before logging plugin fallback', async () => {
    const { logBasePluginStandardDataCoercionFailure } = await import('../basePluginLogging');

    logBasePluginStandardDataCoercionFailure('flowchart', new Error('Authorization: Bearer plugin-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    expect(warnPayload).toContain('[flowchart] Standard data coercion failed, falling back to raw:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('plugin-secret');
  });
});
