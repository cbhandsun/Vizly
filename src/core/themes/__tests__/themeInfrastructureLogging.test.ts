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

describe('themeInfrastructureLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive values for theme infrastructure failures', async () => {
    const logging = await import('../themeInfrastructureLogging');

    logging.logThemePresetMissing('ghost-theme');
    logging.logThemePresetModuleFormatInvalid('broken-module');
    logging.logThemePresetDataInvalid('invalid-data');
    logging.logThemePresetLoadFailure('dark', new Error('Authorization: Bearer preset-load-secret'));
    logging.logThemePresetPreloadFailure('light', new Error('cookie=preload-secret'));
    logging.logThemePresetManagerInvalidSavedPreset('saved-1', new Error('api_key=invalid-preset-secret'));
    logging.logThemePresetManagerLoadFailure(new Error('password=load-presets-secret'));
    logging.logThemePresetManagerTemplateMissing('template-404');
    logging.logThemePresetManagerCannotUpdateBuiltIn();
    logging.logThemePresetManagerCannotDeleteBuiltIn();
    logging.logThemePresetManagerPresetMissing('preset-missing');
    logging.logThemeValidationMissingField('palette');
    logging.logThemeValidationMissingPaletteColor('primary');
    logging.logThemeManagerConfigMissingKey('defaultThemeId');
    logging.logThemeManagerConfigInvalidPreloadDelay();
    logging.logThemeManagerConfigInvalidMaxCacheSize();
    logging.logThemeManagerConfigValidationFallback();

    const errorPayload = safeLogState.error.mock.calls.flat().map(stringifyMockArg).join('\n');
    const warnPayload = safeLogState.warn.mock.calls.flat().map(stringifyMockArg).join('\n');

    expect(warnPayload).toContain('[ThemePresetLoader] Theme preset "ghost-theme" not found');
    expect(errorPayload).toContain('[ThemePresetLoader] Theme preset "broken-module" module format is invalid');
    expect(errorPayload).toContain('[ThemePresetLoader] Theme preset "invalid-data" data format is invalid');
    expect(errorPayload).toContain('[ThemePresetLoader] Failed to load theme preset "dark":');
    expect(warnPayload).toContain('[ThemePresetLoader] Failed to preload theme preset "light":');
    expect(warnPayload).toContain('[ThemePresetManager] Ignored invalid saved theme preset "saved-1":');
    expect(warnPayload).toContain('[ThemePresetManager] Failed to load theme presets:');
    expect(warnPayload).toContain('[ThemePresetManager] Template "template-404" not found');
    expect(warnPayload).toContain('[ThemePresetManager] Cannot update built-in preset');
    expect(warnPayload).toContain('[ThemePresetManager] Cannot delete built-in preset');
    expect(warnPayload).toContain('[ThemePresetManager] Preset "preset-missing" not found');
    expect(errorPayload).toContain('[ThemeUtils] Theme is missing required field: palette');
    expect(errorPayload).toContain('[ThemeUtils] Theme palette is missing required color: primary');
    expect(errorPayload).toContain('[ThemeManagerConfig] Missing required config key: defaultThemeId');
    expect(errorPayload).toContain('[ThemeManagerConfig] performance.preloadDelay must be non-negative');
    expect(errorPayload).toContain('[ThemeManagerConfig] performance.maxCacheSize must be positive');
    expect(warnPayload).toContain('[ThemeManagerConfig] Validation failed; falling back to default config');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).toContain('[redacted]');
    expect(errorPayload).not.toContain('preset-load-secret');
    expect(warnPayload).not.toContain('preload-secret');
    expect(warnPayload).not.toContain('invalid-preset-secret');
    expect(warnPayload).not.toContain('load-presets-secret');
  });
});
