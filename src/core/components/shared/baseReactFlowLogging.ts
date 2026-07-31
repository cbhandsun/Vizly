import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logBaseReactFlowFitWidthTopFailure = (error: unknown): void => {
  safeLog.error('[BaseReactFlow] performFitWidthTop failed:', redactSensitiveLogValue(error));
};

export const logBaseReactFlowConfigReadFailure = (key: string, error: unknown): void => {
  safeLog.warn(`[BaseReactFlow] Failed to read config "${key}":`, redactSensitiveLogValue(error));
};

export const logBaseReactFlowEventBindingFailure = (action: string, error: unknown): void => {
  safeLog.warn(`[BaseReactFlow] ${action} failed:`, redactSensitiveLogValue(error));
};

export const logBaseReactFlowQualityFallback = (reason: string): void => {
  safeLog.debug('[BaseReactFlow] Display routing kept the stable fallback:', reason);
};

export const logBaseReactFlowOverlayFlagReadFailure = (key: string, error: unknown): void => {
  safeLog.warn(`[BaseReactFlow] Failed to read overlay flag "${key}":`, redactSensitiveLogValue(error));
};
