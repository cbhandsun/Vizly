import { safeLog } from '@vizly/core/logging';
import { redactSensitiveLogValue } from '@vizly/core/logging';

export const logLanguageSwitcherConfigManagerInitFailure = (error: unknown): void => {
  safeLog.warn('[LanguageSwitcher] Failed to initialize config manager:', redactSensitiveLogValue(error));
};

export const logLanguageSwitcherConfigSyncFailure = (error: unknown): void => {
  safeLog.warn('[LanguageSwitcher] Failed to sync language to config:', redactSensitiveLogValue(error));
};

export const logConfigurationPanelConfigLoadFailure = (key: string, error: unknown): void => {
  safeLog.warn(`[ConfigurationPanel] Failed to load config "${key}":`, redactSensitiveLogValue(error));
};

export const logConfigurationPanelSaveFailure = (error: unknown): void => {
  safeLog.error('[ConfigurationPanel] Failed to save config:', redactSensitiveLogValue(error));
};
