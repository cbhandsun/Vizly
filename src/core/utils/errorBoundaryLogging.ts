import type { ErrorInfo } from 'react';
import { safeLog } from './consoleCleanup';
import { redactSensitiveLogValue } from './logSecurity';

export const logAppBoundaryError = (error: unknown, errorDetails: unknown): void => {
  safeLog.error('应用程序错误:', redactSensitiveLogValue(error));
  safeLog.error('错误详情:', redactSensitiveLogValue(errorDetails));
};

export const logUiBoundaryError = (error: Error, errorInfo: ErrorInfo): void => {
  safeLog.error('Uncaught error:', redactSensitiveLogValue({ error, errorInfo }));
};

export const logPluginBoundaryError = (
  pluginId: string,
  uiArea: string | undefined,
  error: Error,
  errorInfo: ErrorInfo
): void => {
  safeLog.error(
    `[PluginErrorBoundary] Error in plugin "${pluginId}" UI area "${uiArea || 'unknown'}":`,
    redactSensitiveLogValue({ error, errorInfo })
  );
};
