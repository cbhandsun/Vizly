import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logDiagramControlBridgeFailure = (
  action: 'fitRefine' | 'fitFallback' | 'fullscreen' | 'top',
  error: unknown
): void => {
  safeLog.warn(`[DiagramControlBridge] ${action} failed:`, redactSensitiveLogValue(error));
};

export const logDiagramControlDispatchFailure = (
  action: 'top' | 'fit' | 'fullscreen' | 'toggleFlowDirection',
  error: unknown
): void => {
  safeLog.warn(`[diagramControl] Failed to dispatch "${action}" event:`, redactSensitiveLogValue(error));
};
