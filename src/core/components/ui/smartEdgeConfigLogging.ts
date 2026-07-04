import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logSmartEdgeConfigSyncFailure = (action: string, error: unknown): void => {
  safeLog.warn(`[SmartEdgeConfigPanel] ${action} failed:`, redactSensitiveLogValue(error));
};
