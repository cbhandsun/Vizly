import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logDataRegistryBootstrapFailure = (error: unknown): void => {
  safeLog.error('[main] Data registry initialization failed:', redactSensitiveLogValue(error));
};
