import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logDiagramGlobalThemeSyncFailure = (source: string, themeId: string, error: unknown): void => {
  safeLog.warn(`[${source}] Failed to sync global theme "${themeId}":`, redactSensitiveLogValue(error));
};
