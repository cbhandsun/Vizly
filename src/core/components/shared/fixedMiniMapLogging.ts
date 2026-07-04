import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logFixedMiniMapFailure = (action: string, error: unknown): void => {
  safeLog.warn(`[FixedMiniMap] ${action} failed:`, redactSensitiveLogValue(error));
};
