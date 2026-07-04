import { safeLog } from '../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../utils/logSecurity';

export const logThemeSelectorLoadFailure = (error: unknown): void => {
  safeLog.error('[EnhancedThemeSelector] Failed to load theme data:', redactSensitiveLogValue(error));
};

export const logThemeSwitcherPanelLoadFailure = (error: unknown): void => {
  safeLog.error('[ThemeSwitcherPanel] Failed to load theme data:', redactSensitiveLogValue(error));
};

export const logThemeSelectorChangeFailure = (error: unknown): void => {
  safeLog.error('[EnhancedThemeSelector] Failed to change theme:', redactSensitiveLogValue(error));
};

export const logThemeSelectorApplyPresetFailure = (error: unknown): void => {
  safeLog.error('[EnhancedThemeSelector] Failed to apply preset:', redactSensitiveLogValue(error));
};

export const logThemeSwitcherPanelApplyPresetFailure = (error: unknown): void => {
  safeLog.error('[ThemeSwitcherPanel] Failed to apply preset:', redactSensitiveLogValue(error));
};

export const logThemeSelectorMissingBaseTheme = (baseThemeId: string): void => {
  safeLog.error(`[EnhancedThemeSelector] Missing base theme: ${baseThemeId}`);
};

export const logThemeSelectorCreateCustomThemeFailure = (error: unknown): void => {
  safeLog.error('[EnhancedThemeSelector] Failed to create custom theme:', redactSensitiveLogValue(error));
};

export const logThemeSelectorDeleteCustomThemeFailure = (error: unknown): void => {
  safeLog.error('[EnhancedThemeSelector] Failed to delete custom theme:', redactSensitiveLogValue(error));
};

export const logThemeSelectorExportFailure = (error: unknown): void => {
  safeLog.error('[EnhancedThemeSelector] Failed to export themes:', redactSensitiveLogValue(error));
};

export const logThemeSelectorImportRejected = (reason: unknown): void => {
  safeLog.warn('[EnhancedThemeSelector] Failed to import themes:', redactSensitiveLogValue(reason));
};

export const logThemeSelectorImportFailure = (error: unknown): void => {
  safeLog.error('[EnhancedThemeSelector] Failed to import themes:', redactSensitiveLogValue(error));
};

export const logThemeManagerInitializationFailure = (error: unknown): void => {
  safeLog.error('[EnhancedThemeManager] Initialization failed:', redactSensitiveLogValue(error));
};

export const logThemeManagerLoadFailure = (themeId: string, error: unknown): void => {
  safeLog.warn(`[EnhancedThemeManager] Theme load failed: ${themeId}`, redactSensitiveLogValue(error));
};

export const logThemeManagerEmbeddedThemeLoadFailure = (error: unknown): void => {
  safeLog.warn(
    '[EnhancedThemeManager] Failed to load embedded theme from DataRegistry:',
    redactSensitiveLogValue(error)
  );
};

export const logThemeManagerListenerFailure = (error: unknown): void => {
  safeLog.error('[EnhancedThemeManager] Event listener failed:', redactSensitiveLogValue(error));
};

export const logThemeManagerFallbackToBuiltIn = (): void => {
  safeLog.warn('[EnhancedThemeManager] Falling back to built-in theme');
};

export const logThemeManagerFallbackFailure = (error: unknown): void => {
  safeLog.error('[EnhancedThemeManager] Fallback theme load failed:', redactSensitiveLogValue(error));
};

export const logThemeManagerCustomThemesLoadFailure = (error: unknown): void => {
  safeLog.warn('[EnhancedThemeManager] Failed to load custom themes:', redactSensitiveLogValue(error));
};

export const logThemeManagerCustomThemesSaveFailure = (error: unknown): void => {
  safeLog.warn('[EnhancedThemeManager] Failed to save custom themes:', redactSensitiveLogValue(error));
};

export const logThemeManagerPreloadFailure = (themeId: string, error: unknown): void => {
  safeLog.warn(`[EnhancedThemeManager] Failed to preload theme: ${themeId}`, redactSensitiveLogValue(error));
};

export const logUseCoreThemeSetFailure = (error: unknown): void => {
  safeLog.error('[useCoreTheme] Failed to set core theme:', redactSensitiveLogValue(error));
};
