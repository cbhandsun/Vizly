import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logMindmapOutlineUpdateFailure = (error: unknown): void => {
  safeLog.error('[MindMapOutlinePanel] updateTreeAndSave failed:', redactSensitiveLogValue(error));
};

export const logMindmapOutlineExportFailure = (error: unknown): void => {
  safeLog.error('[MindMapOutlinePanel] export failed:', redactSensitiveLogValue(error));
};

export const logMindmapOutlineInvalidDrop = (): void => {
  safeLog.warn('[MindMapOutlinePanel] Cannot drop node into its own descendant.');
};

export const logMindmapOutlineEditFailure = (error: unknown): void => {
  safeLog.error('[MindMapOutlinePanel] edit failed:', redactSensitiveLogValue(error));
};

export const logMindmapOutlineAddFailure = (error: unknown): void => {
  safeLog.error('[MindMapOutlinePanel] add child failed:', redactSensitiveLogValue(error));
};

export const logMindmapOutlineDeleteFailure = (error: unknown): void => {
  safeLog.error('[MindMapOutlinePanel] delete failed:', redactSensitiveLogValue(error));
};

export const logMindmapOutlineRefreshFailure = (error: unknown): void => {
  safeLog.warn('[MindMapOutlinePanel] refresh failed:', redactSensitiveLogValue(error));
};

export const logMindmapOutlineSelectFailure = (error: unknown): void => {
  safeLog.warn('[MindMapOutlinePanel] select failed:', redactSensitiveLogValue(error));
};

export const logMindmapPropertyReshapeFailure = (error: unknown): void => {
  safeLog.warn('[MindMapPropertyPanel] reshapeNode failed:', redactSensitiveLogValue(error));
};

export const logMindmapPropertySetTopicFailure = (error: unknown): void => {
  safeLog.warn('[MindMapPropertyPanel] setNodeTopic failed:', redactSensitiveLogValue(error));
};

export const logMindmapPropertyAiAddChildFailure = (error: unknown): void => {
  safeLog.warn('[MindMapPropertyPanel] AI addChild failed:', redactSensitiveLogValue(error));
};

export const logMindmapPropertyImageUploadRejected = (reason: unknown): void => {
  safeLog.warn('[MindMapPropertyPanel] image upload rejected:', redactSensitiveLogValue(reason));
};

export const logMindmapPropertyQuickActionFailure = (
  action: 'addChild' | 'addSibling' | 'removeNode' | 'beginEdit',
  error: unknown
): void => {
  safeLog.warn(`[MindMapPropertyPanel] ${action} failed:`, redactSensitiveLogValue(error));
};

export const logMindmapSpeakerNotesSaveFailure = (error: unknown): void => {
  safeLog.error('[MindMapSpeakerNotes] save failed:', redactSensitiveLogValue(error));
};

export const logMindmapBoundariesWalkFailure = (error: unknown): void => {
  safeLog.error('[MindMapBoundaries] walk failed:', redactSensitiveLogValue(error));
};

export const logMindmapPresentationNavigateFailure = (error: unknown): void => {
  safeLog.warn('[MindMapPresentationMode] navigate failed:', redactSensitiveLogValue(error));
};

export const logMindmapPresentationFullscreenFailure = (
  action: 'enter' | 'exit',
  error: unknown
): void => {
  safeLog.warn(`[MindMapPresentationMode] fullscreen ${action} failed:`, redactSensitiveLogValue(error));
};

export const logMindmapYjsInitialSyncParseFailure = (error: unknown): void => {
  safeLog.error('[MindMapYjsIntegration] Initial sync parse error:', redactSensitiveLogValue(error));
};

export const logMindmapYjsLocalSerializeFailure = (error: unknown): void => {
  safeLog.error('[MindMapYjsIntegration] Failed to serialize local operation:', redactSensitiveLogValue(error));
};

export const logMindmapYjsRemoteSyncParseFailure = (error: unknown): void => {
  safeLog.error('[MindMapYjsIntegration] Remote sync parse error:', redactSensitiveLogValue(error));
};

export const logMindmapYjsCleanupFailure = (error: unknown): void => {
  safeLog.warn('[MindMapYjsIntegration] Cleanup listener removal failed:', redactSensitiveLogValue(error));
};

export const logMindmapTemplateInsertFailure = (error: unknown): void => {
  safeLog.error('[MindMapTemplates] insert failed:', redactSensitiveLogValue(error));
};

export const logMindmapKanbanRefreshFailure = (error: unknown): void => {
  safeLog.error('[MindMapTaskKanban] refresh failed:', redactSensitiveLogValue(error));
};

export const logMindmapHistoryRestoreFailure = (error: unknown): void => {
  safeLog.error('[MindMapHistoryPanel] restore failed:', redactSensitiveLogValue(error));
};

export const logMindmapEmptyGuideCheckFailure = (error: unknown): void => {
  safeLog.warn('[MindMapEmptyGuide] empty-state check failed:', redactSensitiveLogValue(error));
};
