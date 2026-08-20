import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logMindmapToolbarAutoArrangeFailure = (error: unknown): void => {
  safeLog.warn('[MindMapToolbar] auto arrange failed:', redactSensitiveLogValue(error));
};

export const logMindmapToolbarAddRootChildFailure = (error: unknown): void => {
  safeLog.warn('[MindMapToolbar] addRootChild failed:', redactSensitiveLogValue(error));
};

export const logMindmapToolbarExportFailure = (format: string, error: unknown): void => {
  safeLog.error(`[MindMapToolbar] ${format} export failed:`, redactSensitiveLogValue(error));
};

export const logMindmapToolbarFocusModeFailure = (error: unknown): void => {
  safeLog.warn('[MindMapToolbar] focusMode failed:', redactSensitiveLogValue(error));
};

export const logMindmapToolbarSummaryFailure = (error: unknown): void => {
  safeLog.warn('[MindMapToolbar] summary creation failed:', redactSensitiveLogValue(error));
};

export const logMindmapToolbarArrowFailure = (error: unknown): void => {
  safeLog.warn('[MindMapToolbar] arrow creation failed:', redactSensitiveLogValue(error));
};

export const logMindmapToolbarImportRejected = (format: string, reason: unknown): void => {
  safeLog.warn(`[MindMapToolbar] ${format} import rejected:`, redactSensitiveLogValue(reason));
};

export const logMindmapToolbarImportFailure = (format: string, error: unknown): void => {
  safeLog.error(`[MindMapToolbar] ${format} import failed:`, redactSensitiveLogValue(error));
};

export const logMindmapToolbarStatsUpdateFailure = (error: unknown): void => {
  safeLog.warn('[MindMapToolbar] stats update failed:', redactSensitiveLogValue(error));
};

export const logMindmapToolbarZoomFailure = (error: unknown): void => {
  safeLog.warn('[MindMapToolbar] zoom failed:', redactSensitiveLogValue(error));
};

export const logMindmapToolbarFitFailure = (error: unknown): void => {
  safeLog.warn('[MindMapToolbar] fit viewport failed:', redactSensitiveLogValue(error));
};

export const logMindmapToolbarHistoryFailure = (
  action: 'redo' | 'undo',
  error: unknown,
): void => {
  safeLog.warn(`[MindMapToolbar] ${action} failed:`, redactSensitiveLogValue(error));
};

export const logMindmapToolbarTreeExpansionFailure = (
  action: 'collapseAll' | 'expandAll',
  error: unknown,
): void => {
  safeLog.warn(`[MindMapToolbar] ${action} failed:`, redactSensitiveLogValue(error));
};
