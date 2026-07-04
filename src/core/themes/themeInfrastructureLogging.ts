import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logThemePresetMissing = (themeId: string): void => {
  safeLog.warn(`[ThemePresetLoader] Theme preset "${themeId}" not found`);
};

export const logThemePresetModuleFormatInvalid = (themeId: string): void => {
  safeLog.error(`[ThemePresetLoader] Theme preset "${themeId}" module format is invalid`);
};

export const logThemePresetDataInvalid = (themeId: string): void => {
  safeLog.error(`[ThemePresetLoader] Theme preset "${themeId}" data format is invalid`);
};

export const logThemePresetLoadFailure = (themeId: string, error: unknown): void => {
  safeLog.error(`[ThemePresetLoader] Failed to load theme preset "${themeId}":`, redactSensitiveLogValue(error));
};

export const logThemePresetPreloadFailure = (themeId: string, error: unknown): void => {
  safeLog.warn(`[ThemePresetLoader] Failed to preload theme preset "${themeId}":`, redactSensitiveLogValue(error));
};

export const logThemePresetManagerInvalidSavedPreset = (id: string, error: unknown): void => {
  safeLog.warn(`[ThemePresetManager] Ignored invalid saved theme preset "${id}":`, redactSensitiveLogValue(error));
};

export const logThemePresetManagerLoadFailure = (error: unknown): void => {
  safeLog.warn('[ThemePresetManager] Failed to load theme presets:', redactSensitiveLogValue(error));
};

export const logThemePresetManagerTemplateMissing = (templateId: string): void => {
  safeLog.warn(`[ThemePresetManager] Template "${templateId}" not found`);
};

export const logThemePresetManagerCannotUpdateBuiltIn = (): void => {
  safeLog.warn('[ThemePresetManager] Cannot update built-in preset');
};

export const logThemePresetManagerCannotDeleteBuiltIn = (): void => {
  safeLog.warn('[ThemePresetManager] Cannot delete built-in preset');
};

export const logThemePresetManagerPresetMissing = (id: string): void => {
  safeLog.warn(`[ThemePresetManager] Preset "${id}" not found`);
};

export const logThemeValidationMissingField = (field: string): void => {
  safeLog.error(`[ThemeUtils] Theme is missing required field: ${field}`);
};

export const logThemeValidationMissingPaletteColor = (color: string): void => {
  safeLog.error(`[ThemeUtils] Theme palette is missing required color: ${color}`);
};

export const logThemeManagerConfigMissingKey = (key: string): void => {
  safeLog.error(`[ThemeManagerConfig] Missing required config key: ${key}`);
};

export const logThemeManagerConfigInvalidPreloadDelay = (): void => {
  safeLog.error('[ThemeManagerConfig] performance.preloadDelay must be non-negative');
};

export const logThemeManagerConfigInvalidMaxCacheSize = (): void => {
  safeLog.error('[ThemeManagerConfig] performance.maxCacheSize must be positive');
};

export const logThemeManagerConfigValidationFallback = (): void => {
  safeLog.warn('[ThemeManagerConfig] Validation failed; falling back to default config');
};
