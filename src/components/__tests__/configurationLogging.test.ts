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

function stringifyMockArg(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

describe('configurationLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive values for config UI failures', async () => {
    const {
      logLanguageSwitcherConfigManagerInitFailure,
      logLanguageSwitcherConfigSyncFailure,
      logConfigurationPanelConfigLoadFailure,
      logConfigurationPanelSaveFailure,
    } = await import('../configurationLogging');

    logLanguageSwitcherConfigManagerInitFailure(new Error('Authorization: Bearer init-secret'));
    logLanguageSwitcherConfigSyncFailure(new Error('cookie=sync-secret'));
    logConfigurationPanelConfigLoadFailure('diagram.layout.strategy', { token: 'load-secret-token' });
    logConfigurationPanelSaveFailure(new Error('api_key=save-secret'));

    const warnPayload = safeLogState.warn.mock.calls.flat().map(stringifyMockArg).join('\n');
    const errorPayload = safeLogState.error.mock.calls.flat().map(stringifyMockArg).join('\n');

    expect(warnPayload).toContain('[LanguageSwitcher] Failed to initialize config manager:');
    expect(warnPayload).toContain('[LanguageSwitcher] Failed to sync language to config:');
    expect(warnPayload).toContain('[ConfigurationPanel] Failed to load config "diagram.layout.strategy":');
    expect(errorPayload).toContain('[ConfigurationPanel] Failed to save config:');
    expect(warnPayload).toContain('[redacted]');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('init-secret');
    expect(warnPayload).not.toContain('sync-secret');
    expect(warnPayload).not.toContain('load-secret-token');
    expect(errorPayload).not.toContain('save-secret');
  });
});
