import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logJsonEditorExistingDiagramMergeFailure = (error: unknown): void => {
  safeLog.warn('[JsonEditorModal] Failed to fetch existing diagram data for merge:', redactSensitiveLogValue(error));
};

export const logAutoSaveLoadFailure = (error: unknown): void => {
  safeLog.error('[useAutoSave] Failed to load auto-saved data:', redactSensitiveLogValue(error));
};

export const logAutoSaveGcEntryParseFailure = (storageKey: string, error: unknown): void => {
  safeLog.warn(`[useAutoSave] Failed to parse auto-save entry "${storageKey}" during GC:`, redactSensitiveLogValue(error));
};

export const logAutoSaveGcFailure = (error: unknown): void => {
  safeLog.error('[useAutoSave] Auto-save GC failed:', redactSensitiveLogValue(error));
};

export const logAutoSaveBeforeUnloadSaveFailure = (storageKey: string, error: unknown): void => {
  safeLog.warn(`[useAutoSave] Failed to persist auto-save before unload for "${storageKey}":`, redactSensitiveLogValue(error));
};

export const logAutoSaveAccessRefreshFailure = (storageKey: string, error: unknown): void => {
  safeLog.warn(`[useAutoSave] Failed to refresh auto-save access time for "${storageKey}":`, redactSensitiveLogValue(error));
};
