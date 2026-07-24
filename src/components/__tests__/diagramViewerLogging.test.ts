// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('@/core/utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

describe('diagramViewerLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive values before logging viewer failures', async () => {
    const logging = await import('../diagramViewerLogging');

    logging.logDiagramViewerMermaidImportFailure(new Error('Authorization: Bearer mermaid-secret'));
    logging.logDiagramViewerStandardDataLayoutFallbackFailure({ token: 'layout-secret' });
    logging.logDiagramViewerFullscreenExitFailure(new Error('cookie=fullscreen-secret'));
    logging.logDiagramViewerEdgeModeInitializationFailure(new Error('api_key=edge-mode-secret'));
    logging.logDiagramViewerAutosaveClearFailure(new Error('password=autosave-clear-secret'));
    logging.logDiagramViewerAiJsonImportFailure('preview', 'diagram-1', new Error('token=preview-secret'));
    logging.logDiagramViewerAiJsonImportFailure('apply', 'diagram-2', new Error('token=apply-secret'));
    logging.logDiagramViewerBridgeCleanupFailure('diagram-1', 'diagram-2', new Error('cookie=bridge-cleanup-secret'));
    logging.logDiagramViewerDocTypeDetectionFailure('diagram-3', new Error('Authorization: Bearer doc-type-secret'));
    logging.logDiagramViewerSwitchConfirmationFailure(new Error('api_key=confirm-secret'));
    logging.logDiagramViewerCommandPaletteStateFailure(new Error('token=command-state-secret'));
    logging.logDiagramViewerOpenNewTabFailure('diagram-4', new Error('cookie=open-tab-secret'));
    logging.logDiagramViewerSaveAsFailure('supabase', new Error('password=save-as-secret'));
    logging.logDiagramViewerDirectSaveFailure('s3', new Error('secret=direct-save-secret'));
    logging.logDiagramViewerRemoteLoadFailure('supabase', 'diagram-5', new Error('credential=remote-load-secret'));

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const errorMessages = safeLogState.error.mock.calls.map(call => String(call[0]));
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));

    expect(errorPayload).toContain('[DiagramViewer] Mermaid import failed:');
    expect(warnMessages).toContain('[DiagramViewer] Standard data layout fallback execution failed:');
    expect(errorPayload).toContain('[DiagramViewer] Failed to exit fullscreen on Escape:');
    expect(errorPayload).toContain('[DiagramViewer] Failed to initialize edge mode from layered config:');
    expect(errorMessages).toContain('[DiagramViewer] Save-as to supabase failed:');
    expect(errorMessages).toContain('[DiagramViewer] Direct save to s3 failed:');
    expect(errorMessages).toContain('[DiagramViewer] Failed to load remote diagram "diagram-5" from supabase:');
    expect(warnMessages).toContain('[DiagramViewer] Failed to clear autosave data:');
    expect(warnMessages).toContain('[DiagramViewer] AI JSON preview import failed for diagram "diagram-1":');
    expect(warnMessages).toContain('[DiagramViewer] AI JSON apply import failed for diagram "diagram-2":');
    expect(warnMessages).toContain('[DiagramViewer] Failed to clean up bridge for diagram "diagram-1" before switching to "diagram-2":');
    expect(warnMessages).toContain('[DiagramViewer] Failed to detect document type for diagram "diagram-3":');
    expect(warnMessages).toContain('[DiagramViewer] Switch confirmation failed, continuing without prompt:');
    expect(warnMessages).toContain('[DiagramViewer] Failed to load command palette recent state:');
    expect(warnMessages).toContain('[DiagramViewer] Failed to construct full URL for new tab of diagram "diagram-4", using fallback URL:');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).toContain('[redacted]');
    expect(errorPayload).not.toContain('mermaid-secret');
    expect(warnPayload).not.toContain('layout-secret');
    expect(errorPayload).not.toContain('fullscreen-secret');
    expect(errorPayload).not.toContain('edge-mode-secret');
    expect(errorPayload).not.toContain('save-as-secret');
    expect(errorPayload).not.toContain('direct-save-secret');
    expect(errorPayload).not.toContain('remote-load-secret');
    expect(warnPayload).not.toContain('autosave-clear-secret');
    expect(warnPayload).not.toContain('preview-secret');
    expect(warnPayload).not.toContain('apply-secret');
    expect(warnPayload).not.toContain('bridge-cleanup-secret');
    expect(warnPayload).not.toContain('doc-type-secret');
    expect(warnPayload).not.toContain('confirm-secret');
    expect(warnPayload).not.toContain('command-state-secret');
    expect(warnPayload).not.toContain('open-tab-secret');
  });
});
