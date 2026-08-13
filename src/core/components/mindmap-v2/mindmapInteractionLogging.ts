import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logMindmapContextMenuFailure = (
  action: 'findTopicElement' | 'findNodeObject' | 'copyNode' | 'createSummary' | 'setShapeClass' | 'removeNode',
  error: unknown
): void => {
  safeLog.warn(`[MindMapContextMenu] ${action} failed:`, redactSensitiveLogValue(error));
};

export const logMindmapSearchFailure = (
  action: 'collectMatches' | 'highlightMatch' | 'activateMatch' | 'replaceOne' | 'replaceAll',
  error: unknown
): void => {
  safeLog.warn(`[MindMapSearch] ${action} failed:`, redactSensitiveLogValue(error));
};
