import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logMindMapBatchActionFailure = (
  action: 'reshapeNode' | 'expandNode' | 'removeNodes',
  error: unknown
): void => {
  safeLog.warn(`[MindMapBatchBar] ${action} failed:`, redactSensitiveLogValue(error));
};
