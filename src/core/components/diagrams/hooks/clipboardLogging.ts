import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logClipboardWriteFailure = (error: unknown): void => {
  safeLog.warn('[useClipboard] local clipboard persistence failed:', redactSensitiveLogValue(error));
};

export const logClipboardSystemWriteFailure = (error: unknown): void => {
  safeLog.warn('[useClipboard] system clipboard write failed:', redactSensitiveLogValue(error));
};

export const logClipboardReadFailure = (error: unknown): void => {
  safeLog.warn('[useClipboard] system clipboard read failed:', redactSensitiveLogValue(error));
};

export const logClipboardStorageReadFailure = (error: unknown): void => {
  safeLog.warn('[useClipboard] local clipboard read failed:', redactSensitiveLogValue(error));
};
