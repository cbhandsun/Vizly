import { safeLog } from './consoleCleanup';
import { redactSensitiveLogValue } from './logSecurity';

export const logFlowchartCacheClearFailure = (
  storageType: 'localStorage' | 'sessionStorage',
  key: string,
  error: unknown
): void => {
  safeLog.warn(
    `[clearFlowchartCache] Failed to clear ${storageType} key "${key}":`,
    redactSensitiveLogValue(error)
  );
};
