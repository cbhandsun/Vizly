import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logMindMapFloatingActionFailure = (
  action: 'selectPosition' | 'findSelectedTopic' | 'findSelectedNode' | 'addChild' | 'applySuggestion' | 'duplicateNode' | 'setBranchColor' | 'setShapeClass' | 'clearNote' | 'saveNote' | 'saveBoundary' | 'removeBoundary',
  error: unknown
): void => {
  safeLog.warn(`[MindMapFloatingBar] ${action} failed:`, redactSensitiveLogValue(error));
};
