import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logShareDialogLoadFailure = (
  target: 'shares' | 'collaborators',
  error: unknown
): void => {
  safeLog.warn(`[ShareDialog] Failed to load ${target}:`, redactSensitiveLogValue(error));
};

export const logShareDialogMutationFailure = (
  action: 'revokeShare' | 'removeCollaborator',
  error: unknown
): void => {
  safeLog.warn(`[ShareDialog] ${action} failed:`, redactSensitiveLogValue(error));
};
