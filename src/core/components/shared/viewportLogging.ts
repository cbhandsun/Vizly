import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logViewportStoreFailure = (action: string, error: unknown): void => {
  safeLog.warn(`[viewportStore] ${action} failed:`, redactSensitiveLogValue(error));
};
