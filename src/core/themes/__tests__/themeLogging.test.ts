import { afterEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../../utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

describe('themeLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive values in theme selector and manager failures', async () => {
    const logging = await import('../themeLogging');

    logging.logThemeSelectorLoadFailure(new Error('Authorization: Bearer selector-load-secret'));
    logging.logThemeSwitcherPanelLoadFailure(new Error('Authorization: Bearer switcher-load-secret'));
    logging.logThemeSelectorChangeFailure({ token: 'selector-change-secret' });
    logging.logThemeSelectorApplyPresetFailure(new Error('cookie=selector-preset-secret'));
    logging.logThemeSwitcherPanelApplyPresetFailure(new Error('cookie=switcher-preset-secret'));
    logging.logThemeSelectorMissingBaseTheme('missing-base-theme');
    logging.logThemeSelectorCreateCustomThemeFailure(new Error('api_key=selector-create-secret'));
    logging.logThemeSelectorDeleteCustomThemeFailure(new Error('password=selector-delete-secret'));
    logging.logThemeSelectorExportFailure(new Error('secret=selector-export-secret'));
    logging.logThemeSelectorImportRejected({ reason: 'token=selector-import-reject-secret' });
    logging.logThemeSelectorImportFailure(new Error('credential=selector-import-secret'));

    logging.logThemeManagerInitializationFailure(new Error('Authorization: Bearer manager-init-secret'));
    logging.logThemeManagerLoadFailure('dark', new Error('token=manager-load-secret'));
    logging.logThemeManagerEmbeddedThemeLoadFailure(new Error('cookie=manager-embedded-secret'));
    logging.logThemeManagerListenerFailure(new Error('api_key=manager-listener-secret'));
    logging.logThemeManagerFallbackToBuiltIn();
    logging.logThemeManagerFallbackFailure(new Error('secret=manager-fallback-secret'));
    logging.logThemeManagerCustomThemesLoadFailure(new Error('token=manager-custom-load-secret'));
    logging.logThemeManagerCustomThemesSaveFailure(new Error('password=manager-custom-save-secret'));
    logging.logThemeManagerPreloadFailure('light', new Error('credential=manager-preload-secret'));
    logging.logUseCoreThemeSetFailure(new Error('Authorization: Bearer use-core-theme-secret'));

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);

    expect(errorPayload).toContain('[EnhancedThemeSelector] Failed to load theme data:');
    expect(errorPayload).toContain('[ThemeSwitcherPanel] Failed to load theme data:');
    expect(errorPayload).toContain('[EnhancedThemeSelector] Failed to change theme:');
    expect(errorPayload).toContain('[EnhancedThemeSelector] Failed to apply preset:');
    expect(errorPayload).toContain('[ThemeSwitcherPanel] Failed to apply preset:');
    expect(errorPayload).toContain('[EnhancedThemeSelector] Missing base theme: missing-base-theme');
    expect(errorPayload).toContain('[EnhancedThemeSelector] Failed to create custom theme:');
    expect(errorPayload).toContain('[EnhancedThemeSelector] Failed to delete custom theme:');
    expect(errorPayload).toContain('[EnhancedThemeSelector] Failed to export themes:');
    expect(errorPayload).toContain('[EnhancedThemeSelector] Failed to import themes:');
    expect(errorPayload).toContain('[EnhancedThemeManager] Initialization failed:');
    expect(errorPayload).toContain('[EnhancedThemeManager] Event listener failed:');
    expect(errorPayload).toContain('[EnhancedThemeManager] Fallback theme load failed:');
    expect(errorPayload).toContain('[useCoreTheme] Failed to set core theme:');
    expect(warnPayload).toContain('[EnhancedThemeSelector] Failed to import themes:');
    expect(warnPayload).toContain('[EnhancedThemeManager] Theme load failed: dark');
    expect(warnPayload).toContain('[EnhancedThemeManager] Failed to load embedded theme from DataRegistry:');
    expect(warnPayload).toContain('[EnhancedThemeManager] Falling back to built-in theme');
    expect(warnPayload).toContain('[EnhancedThemeManager] Failed to load custom themes:');
    expect(warnPayload).toContain('[EnhancedThemeManager] Failed to save custom themes:');
    expect(warnPayload).toContain('[EnhancedThemeManager] Failed to preload theme: light');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).toContain('[redacted]');
    expect(errorPayload).not.toContain('selector-load-secret');
    expect(errorPayload).not.toContain('switcher-load-secret');
    expect(errorPayload).not.toContain('selector-change-secret');
    expect(errorPayload).not.toContain('selector-preset-secret');
    expect(errorPayload).not.toContain('switcher-preset-secret');
    expect(errorPayload).not.toContain('selector-create-secret');
    expect(errorPayload).not.toContain('selector-delete-secret');
    expect(errorPayload).not.toContain('selector-export-secret');
    expect(errorPayload).not.toContain('selector-import-secret');
    expect(errorPayload).not.toContain('manager-init-secret');
    expect(errorPayload).not.toContain('manager-listener-secret');
    expect(errorPayload).not.toContain('manager-fallback-secret');
    expect(warnPayload).not.toContain('selector-import-reject-secret');
    expect(warnPayload).not.toContain('manager-load-secret');
    expect(warnPayload).not.toContain('manager-embedded-secret');
    expect(warnPayload).not.toContain('manager-custom-load-secret');
    expect(warnPayload).not.toContain('manager-custom-save-secret');
    expect(warnPayload).not.toContain('manager-preload-secret');
    expect(errorPayload).not.toContain('use-core-theme-secret');
  });
});
