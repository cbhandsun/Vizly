import { safeLog } from './consoleCleanup';
import { redactSensitiveLogValue } from './logSecurity';

export const logLayoutCacheKeyCreationFailure = (
  source: 'createKey' | 'createStructureKey',
  error: unknown
): void => {
  safeLog.warn(
    `[LayoutCacheManager] ${source} failed:`,
    redactSensitiveLogValue(error)
  );
};
