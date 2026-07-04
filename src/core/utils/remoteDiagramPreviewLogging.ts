import { safeLog } from './consoleCleanup';
import { redactSensitiveLogValue } from './logSecurity';

export const logRemoteDiagramPreviewInvalidationFailure = (storageId: string, error: unknown): void => {
  safeLog.warn(
    `[remoteDiagramPreview] Failed to dispatch invalidation event for "${storageId}":`,
    redactSensitiveLogValue(error)
  );
};

export const logRemoteDiagramPreviewFetchFailure = (storageId: string, error: unknown): void => {
  safeLog.warn(
    `[remoteDiagramPreview] Failed to fetch preview for "${storageId}":`,
    redactSensitiveLogValue(error)
  );
};
