import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logMindmapWrapperSaveFailure = (error: unknown): void => {
  safeLog.warn('[MindElixirWrapper] saveData failed:', redactSensitiveLogValue(error));
};

export const logMindmapWrapperHistoryRecordFailure = (error: unknown): void => {
  safeLog.error('[MindElixirWrapper] history record failed:', redactSensitiveLogValue(error));
};

export const logMindmapWrapperClipboardPayloadBlocked = (error: unknown): void => {
  safeLog.warn('[MindElixirWrapper] blocked unsafe clipboard payload:', redactSensitiveLogValue(error));
};

export const logMindmapWrapperSafePasteFailure = (error: unknown): void => {
  safeLog.warn('[MindElixirWrapper] safe paste failed:', redactSensitiveLogValue(error));
};

export const logMindmapWrapperSafeShortcutFailure = (error: unknown): void => {
  safeLog.warn('[MindElixirWrapper] safe shortcut failed:', redactSensitiveLogValue(error));
};

export const logMindmapWrapperAiBridgeFailure = (action: string, error: unknown): void => {
  safeLog.error(`[MindElixirWrapper] AI bridge ${action} failed:`, redactSensitiveLogValue(error));
};

export const logMindmapWrapperDragImportRejected = (reason: unknown): void => {
  safeLog.warn('[MindElixirWrapper] drag import rejected:', redactSensitiveLogValue(reason));
};

export const logMindmapWrapperDragImportFailure = (error: unknown): void => {
  safeLog.error('[MindElixirWrapper] drag import failed:', redactSensitiveLogValue(error));
};

export const logMindmapWrapperHyperlinkOpenFailure = (error: unknown): void => {
  safeLog.warn('[MindElixirWrapper] hyperlink open failed:', redactSensitiveLogValue(error));
};

export const logMindmapWrapperCollapsedBadgeFailure = (error: unknown): void => {
  safeLog.warn('[MindElixirWrapper] collapsed badge update failed:', redactSensitiveLogValue(error));
};

export const logMindmapWrapperShapeSyncFailure = (error: unknown): void => {
  safeLog.warn('[MindElixirWrapper] shape sync failed:', redactSensitiveLogValue(error));
};

export const logMindmapWrapperCopyTopicFailure = (error: unknown): void => {
  safeLog.warn('[MindElixirWrapper] copy topic shortcut failed:', redactSensitiveLogValue(error));
};

export const logMindmapWrapperNotePreviewFailure = (error: unknown): void => {
  safeLog.warn('[MindElixirWrapper] note preview failed:', redactSensitiveLogValue(error));
};
