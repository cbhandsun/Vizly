import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logLayoutOptimizerNodeWidthFallback = (error: unknown): void => {
  safeLog.warn('[LayoutOptimizer] Node width calculation failed, using fallback:', redactSensitiveLogValue(error));
};

export const logLayoutOptimizerNodeHeightFallback = (error: unknown): void => {
  safeLog.warn('[LayoutOptimizer] Node height calculation failed, using default:', redactSensitiveLogValue(error));
};
