import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logVersionHistoryLoadFailure = (error: unknown): void => {
  safeLog.error('[useVersionHistory] Failed to load versions:', redactSensitiveLogValue(error));
};

export const logVersionHistorySaveFailure = (error: unknown): void => {
  safeLog.error('[useVersionHistory] Failed to save version:', redactSensitiveLogValue(error));
};

export const logVersionHistoryPayloadLoadFailure = (error: unknown): void => {
  safeLog.error('[useVersionHistory] Failed to load version payload:', redactSensitiveLogValue(error));
};

export const logVersionHistoryRestoreFailure = (error: unknown): void => {
  safeLog.error('[useVersionHistory] Failed to restore version:', redactSensitiveLogValue(error));
};

export const logCloudSaveFailure = (source: string, error: unknown): void => {
  safeLog.error(`[${source}] Cloud save failed:`, redactSensitiveLogValue(error));
};

export const logCloudSaveEnsureFailure = (diagramId: string, error: unknown): void => {
  safeLog.warn(`[useCloudSave] Failed to ensure cloud save for diagram "${diagramId}":`, redactSensitiveLogValue(error));
};

export const logDiagramStorageTemplateFetchFailure = (error: unknown): void => {
  safeLog.error('[useDiagramStorage] Error fetching system templates:', redactSensitiveLogValue(error));
};

export const logDiagramStorageTemplateFetchException = (error: unknown): void => {
  safeLog.error('[useDiagramStorage] Exception fetching system templates:', redactSensitiveLogValue(error));
};

export const logDiagramStorageCloudListFailure = (provider: 's3' | 'supabase', error: unknown): void => {
  safeLog.error(`[useDiagramStorage] Failed to list diagrams from ${provider}:`, redactSensitiveLogValue(error));
};

export const logCloudStorageManagerSharedLoadFailure = (error: unknown): void => {
  safeLog.error('[CloudStorageManagerModal] Failed to load shared diagrams:', redactSensitiveLogValue(error));
};

export const logCloudStorageManagerListFailure = (error: unknown): void => {
  safeLog.error('[CloudStorageManagerModal] Failed to list diagrams:', redactSensitiveLogValue(error));
};

export const logCloudStorageManagerOpenFailure = (error: unknown): void => {
  safeLog.error('[CloudStorageManagerModal] Failed to open cloud diagram:', redactSensitiveLogValue(error));
};

export const logCloudStorageManagerDeleteFailure = (error: unknown): void => {
  safeLog.error('[CloudStorageManagerModal] Failed to delete cloud diagram:', redactSensitiveLogValue(error));
};

export const logCloudStorageManagerBatchDeleteFailure = (diagramId: string, error: unknown): void => {
  safeLog.warn(`[CloudStorageManagerModal] Failed to delete cloud diagram "${diagramId}" during batch delete:`, redactSensitiveLogValue(error));
};
