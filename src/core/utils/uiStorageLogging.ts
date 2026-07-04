import { safeLog } from './consoleCleanup';
import { redactSensitiveLogValue } from './logSecurity';

export const logUiStorageReadFailure = (source: string, key: string, error: unknown): void => {
  safeLog.warn(
    `[${source}] Failed to read "${key}":`,
    redactSensitiveLogValue(error)
  );
};

export const logUiStorageWriteFailure = (source: string, key: string, error: unknown): void => {
  safeLog.warn(
    `[${source}] Failed to write "${key}":`,
    redactSensitiveLogValue(error)
  );
};
