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

describe('smartEdgeConfigLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sync failures', async () => {
    const { logSmartEdgeConfigSyncFailure } = await import('../smartEdgeConfigLogging');

    logSmartEdgeConfigSyncFailure('applyGlobal', new Error('Authorization: Bearer apply-secret'));
    logSmartEdgeConfigSyncFailure('updateAdvancedConfig', new Error('api_key=advanced-secret'));
    logSmartEdgeConfigSyncFailure('buildAdvancedPayload', new Error('cookie=payload-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    expect(warnPayload).toContain('[SmartEdgeConfigPanel] applyGlobal failed:');
    expect(warnPayload).toContain('[SmartEdgeConfigPanel] updateAdvancedConfig failed:');
    expect(warnPayload).toContain('[SmartEdgeConfigPanel] buildAdvancedPayload failed:');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('apply-secret');
    expect(warnPayload).not.toContain('advanced-secret');
    expect(warnPayload).not.toContain('payload-secret');
  });
});
