import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const logDiagramViewerMermaidImportFailure = (error: unknown): void => {
  safeLog.error('[DiagramViewer] Mermaid import failed:', redactSensitiveLogValue(error));
};

export const logDiagramViewerStandardDataLayoutFallbackFailure = (error: unknown): void => {
  safeLog.warn('[DiagramViewer] Standard data layout fallback execution failed:', redactSensitiveLogValue(error));
};

export const logDiagramViewerFullscreenExitFailure = (error: unknown): void => {
  safeLog.error('[DiagramViewer] Failed to exit fullscreen on Escape:', redactSensitiveLogValue(error));
};

export const logDiagramViewerEdgeModeInitializationFailure = (error: unknown): void => {
  safeLog.error('[DiagramViewer] Failed to initialize edge mode from layered config:', redactSensitiveLogValue(error));
};

export const logDiagramViewerAutosaveClearFailure = (error: unknown): void => {
  safeLog.warn('[DiagramViewer] Failed to clear autosave data:', redactSensitiveLogValue(error));
};

export const logDiagramViewerAiJsonImportFailure = (
  phase: 'preview' | 'apply',
  diagramId: string,
  error: unknown
): void => {
  safeLog.warn(
    `[DiagramViewer] AI JSON ${phase} import failed for diagram "${diagramId}":`,
    redactSensitiveLogValue(error)
  );
};

export const logDiagramViewerBridgeCleanupFailure = (diagramId: string, nextDiagramId: string, error: unknown): void => {
  safeLog.warn(
    `[DiagramViewer] Failed to clean up bridge for diagram "${diagramId}" before switching to "${nextDiagramId}":`,
    redactSensitiveLogValue(error)
  );
};

export const logDiagramViewerDocTypeDetectionFailure = (diagramId: string, error: unknown): void => {
  safeLog.warn(
    `[DiagramViewer] Failed to detect document type for diagram "${diagramId}":`,
    redactSensitiveLogValue(error)
  );
};

export const logDiagramViewerRenameFailure = (diagramId: string, error: unknown): void => {
  safeLog.warn(
    `[DiagramViewer] Failed to rename diagram "${diagramId}":`,
    redactSensitiveLogValue(error)
  );
};

export const logDiagramViewerSwitchConfirmationFailure = (error: unknown): void => {
  safeLog.warn('[DiagramViewer] Switch confirmation failed, continuing without prompt:', redactSensitiveLogValue(error));
};

export const logDiagramViewerCommandPaletteStateFailure = (error: unknown): void => {
  safeLog.warn('[DiagramViewer] Failed to load command palette recent state:', redactSensitiveLogValue(error));
};

export const logDiagramViewerOpenNewTabFailure = (_diagramId: string, error: unknown): void => {
  safeLog.warn(
    '[DiagramViewer] Failed to open diagram in a new tab:',
    redactSensitiveLogValue(error)
  );
};

export const logDiagramViewerSaveAsFailure = (target: string, error: unknown): void => {
  safeLog.error(`[DiagramViewer] Save-as to ${target} failed:`, redactSensitiveLogValue(error));
};

export const logDiagramViewerDirectSaveFailure = (provider: string, error: unknown): void => {
  safeLog.error(`[DiagramViewer] Direct save to ${provider} failed:`, redactSensitiveLogValue(error));
};

export const logDiagramViewerRemoteLoadFailure = (source: string, diagramId: string, error: unknown): void => {
  safeLog.error(
    `[DiagramViewer] Failed to load remote diagram "${diagramId}" from ${source}:`,
    redactSensitiveLogValue(error)
  );
};
