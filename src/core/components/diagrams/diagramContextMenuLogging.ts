import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logDiagramContextMenuFailure = (action: string, error: unknown): void => {
  safeLog.warn(`[DiagramContextMenu] ${action} failed:`, redactSensitiveLogValue(error));
};
