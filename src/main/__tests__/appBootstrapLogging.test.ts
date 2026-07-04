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

describe('appBootstrapLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive values for app bootstrap failures', async () => {
    const { logDataRegistryBootstrapFailure } = await import('../appBootstrapLogging');

    logDataRegistryBootstrapFailure(new Error('Authorization: Bearer bootstrap-secret'));

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    expect(errorPayload).toContain('[main] Data registry initialization failed:');
    expect(errorPayload).toContain('[redacted]');
    expect(errorPayload).not.toContain('bootstrap-secret');
  });
});
