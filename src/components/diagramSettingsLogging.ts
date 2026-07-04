import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logDiagramSettingsLayoutSyncFailure = (action: string, error: unknown): void => {
  safeLog.warn(`[DiagramSettingsPanel] ${action} failed:`, redactSensitiveLogValue(error));
};
