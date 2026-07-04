import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logBasePluginStandardDataCoercionFailure = (pluginId: string, error: unknown): void => {
  safeLog.warn(`[${pluginId}] Standard data coercion failed, falling back to raw:`, redactSensitiveLogValue(error));
};
