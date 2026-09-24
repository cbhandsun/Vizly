import { safeLog } from '@vizly/core/logging';
import { redactSensitiveLogValue } from '@vizly/core/logging';

export const logShareDialogLoadFailure = (
  target: 'shares' | 'collaborators',
  error: unknown
): void => {
  safeLog.warn(`[ShareDialog] Failed to load ${target}:`, redactSensitiveLogValue(error));
};

export const logShareDialogMutationFailure = (
  action: 'createShareLink' | 'addCollaborator' | 'revokeShare' | 'removeCollaborator',
  error: unknown
): void => {
  safeLog.warn(`[ShareDialog] ${action} failed:`, redactSensitiveLogValue(error));
};

export const logShareDialogClipboardFailure = (error: unknown): void => {
  safeLog.warn('[ShareDialog] Clipboard write failed:', redactSensitiveLogValue(error));
};
