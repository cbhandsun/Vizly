import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logDesignerSystemSyncImportDataFailure = (error: unknown): void => {
  safeLog.error('[DesignerSystemSync] importData failed:', redactSensitiveLogValue(error));
};

export const logDesignerSystemSyncAutoSaveFailure = (error: unknown): void => {
  safeLog.error('[DesignerSystemSync] Auto-save failed:', redactSensitiveLogValue(error));
};

export const logDesignerSystemSyncPresetLoadFailure = (error: unknown): void => {
  safeLog.error('[DesignerSystemSync] load standard preset failed:', redactSensitiveLogValue(error));
};

export const logDesignerSystemSyncStaleAutosaveDetected = (expectedId: unknown, actualId: unknown): void => {
  safeLog.warn(
    '[DesignerSystemSync] Stale autosave detected. Clearing mismatched payload:',
    redactSensitiveLogValue({ expectedId, actualId })
  );
};

export const logDesignerSystemSyncAutosaveRecalculationFailure = (error: unknown): void => {
  safeLog.error('[DesignerSystemSync] autosave size recalculation failed:', redactSensitiveLogValue(error));
};

export const logDesignerSystemSyncStandardDataToCanvasFailure = (source: string, error: unknown): void => {
  safeLog.error(
    `[DesignerSystemSync] standardDataToCanvas failed (${source}):`,
    redactSensitiveLogValue(error)
  );
};

export const logDesignerSystemSyncDesignerUtilsImportFailure = (error: unknown): void => {
  safeLog.error('[DesignerSystemSync] Import designerUtils failed:', redactSensitiveLogValue(error));
};

export const logDesignerSystemSyncDataRegistryImportFailure = (error: unknown): void => {
  safeLog.error('[DesignerSystemSync] import DataRegistry failed:', redactSensitiveLogValue(error));
};

export const logDesignerSystemSyncFreshSeedClearFailure = (storageKey: string, error: unknown): void => {
  safeLog.warn(
    `[DesignerSystemSync] Failed to clear fresh-seed flag for "${storageKey}":`,
    redactSensitiveLogValue(error)
  );
};

export const logDesignerSystemSyncDataRegistryWriteFailure = (diagramId: string, error: unknown): void => {
  safeLog.warn(
    `[DesignerSystemSync] Failed to register imported diagram "${diagramId}" in DataRegistry:`,
    redactSensitiveLogValue(error)
  );
};
