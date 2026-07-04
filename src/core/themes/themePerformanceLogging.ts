import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logThemeOptimizationStrategyFailure = (strategyId: string, error: unknown): void => {
  safeLog.warn(`[ThemePerformanceOptimizer] Optimization strategy "${strategyId}" failed:`, redactSensitiveLogValue(error));
};
