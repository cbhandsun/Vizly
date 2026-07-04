import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logDiagramLayoutFailure = (action: string, error: unknown): void => {
  safeLog.warn(`[DiagramLayout] ${action} failed:`, redactSensitiveLogValue(error));
};
