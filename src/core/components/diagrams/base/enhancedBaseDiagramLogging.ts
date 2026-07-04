import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logEnhancedBaseDiagramConfigLoadFailure = (error: unknown): void => {
  safeLog.warn('[EnhancedBaseDiagram] Failed to load enhanced config, using defaults:', redactSensitiveLogValue(error));
};

export const logEnhancedBaseDiagramThemeLoadFailure = (error: unknown): void => {
  safeLog.warn('[EnhancedBaseDiagram] Failed to load theme, using fallback:', redactSensitiveLogValue(error));
};

export const logEnhancedBaseDiagramPerformanceMetrics = (metrics: unknown): void => {
  safeLog.debug('[EnhancedBaseDiagram] Performance metrics:', metrics);
};

export const logEnhancedBaseDiagramInvalidConfig = (config: unknown, error: unknown): void => {
  safeLog.warn(
    '[EnhancedBaseDiagram] Invalid diagram configuration detected:',
    redactSensitiveLogValue({ config, error })
  );
};
