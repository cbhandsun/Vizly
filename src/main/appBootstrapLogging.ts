import { safeLog } from '@vizly/core/logging';
import { redactSensitiveLogValue } from '@vizly/core/logging';

export const logDataRegistryBootstrapFailure = (error: unknown): void => {
  safeLog.error('[main] Data registry initialization failed:', redactSensitiveLogValue(error));
};
