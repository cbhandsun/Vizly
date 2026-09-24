import { safeLog } from '@vizly/core/logging';
import { redactSensitiveLogValue } from '@vizly/core/logging';

export const logDiagramSettingsLayoutSyncFailure = (action: string, error: unknown): void => {
  safeLog.warn(`[DiagramSettingsPanel] ${action} failed:`, redactSensitiveLogValue(error));
};
