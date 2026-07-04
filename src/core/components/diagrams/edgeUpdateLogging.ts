import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logEdgeUpdateContextFailure = (action: string, error: unknown): void => {
  safeLog.warn(`[EdgeUpdateContext] ${action} failed:`, redactSensitiveLogValue(error));
};
