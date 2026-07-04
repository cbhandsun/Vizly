import { safeLog } from '../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../utils/logSecurity';

export const logDiagramExportEventDispatchFailure = (
  source: 'useDiagramControls' | 'useOptimizedDiagramControls',
  eventName: string,
  error: unknown
): void => {
  safeLog.warn(
    `[${source}] Failed to dispatch export event "${eventName}":`,
    redactSensitiveLogValue(error)
  );
};

export const logDiagramExportProgressCallbackFailure = (error: unknown): void => {
  safeLog.warn(
    '[exportUtils] Failed to report GIF export progress:',
    redactSensitiveLogValue(error)
  );
};
