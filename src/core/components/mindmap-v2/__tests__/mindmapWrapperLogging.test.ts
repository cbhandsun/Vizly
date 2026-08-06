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

describe('mindmapWrapperLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive values for wrapper failures', async () => {
    const logging = await import('../mindmapWrapperLogging');

    logging.logMindmapWrapperSaveFailure(new Error('Authorization: Bearer save-secret'));
    logging.logMindmapWrapperHistoryRecordFailure({ token: 'history-secret' });
    logging.logMindmapWrapperClipboardPayloadBlocked(new Error('cookie=clipboard-secret'));
    logging.logMindmapWrapperSafePasteFailure(new Error('api_key=paste-secret'));
    logging.logMindmapWrapperSafeShortcutFailure(new Error('password=shortcut-secret'));
    logging.logMindmapWrapperAiBridgeFailure('importData', new Error('secret=import-secret'));
    logging.logMindmapWrapperAiBridgeFailure('addNode', new Error('credential=add-node-secret'));
    logging.logMindmapWrapperAiBridgeFailure('deleteNodes', new Error('token=delete-secret'));
    logging.logMindmapWrapperDragImportRejected({ reason: 'Authorization: Bearer drag-reject-secret' });
    logging.logMindmapWrapperDragImportFailure(new Error('cookie=drag-secret'));
    logging.logMindmapWrapperHyperlinkOpenFailure(new Error('api_key=link-secret'));
    logging.logMindmapWrapperCollapsedBadgeFailure(new Error('password=badge-secret'));
    logging.logMindmapWrapperShapeSyncFailure(new Error('token=shape-sync-secret'));
    logging.logMindmapWrapperCopyTopicFailure(new Error('cookie=copy-topic-secret'));
    logging.logMindmapWrapperNotePreviewFailure(new Error('secret=note-preview-secret'));
    logging.logMindmapWrapperInitialViewportFailure(new Error('token=viewport-secret'));

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);

    expect(warnPayload).toContain('[MindElixirWrapper] saveData failed:');
    expect(errorPayload).toContain('[MindElixirWrapper] history record failed:');
    expect(warnPayload).toContain('[MindElixirWrapper] blocked unsafe clipboard payload:');
    expect(warnPayload).toContain('[MindElixirWrapper] safe paste failed:');
    expect(warnPayload).toContain('[MindElixirWrapper] safe shortcut failed:');
    expect(errorPayload).toContain('[MindElixirWrapper] AI bridge importData failed:');
    expect(errorPayload).toContain('[MindElixirWrapper] AI bridge addNode failed:');
    expect(errorPayload).toContain('[MindElixirWrapper] AI bridge deleteNodes failed:');
    expect(warnPayload).toContain('[MindElixirWrapper] drag import rejected:');
    expect(errorPayload).toContain('[MindElixirWrapper] drag import failed:');
    expect(warnPayload).toContain('[MindElixirWrapper] hyperlink open failed:');
    expect(warnPayload).toContain('[MindElixirWrapper] collapsed badge update failed:');
    expect(warnPayload).toContain('[MindElixirWrapper] shape sync failed:');
    expect(warnPayload).toContain('[MindElixirWrapper] copy topic shortcut failed:');
    expect(warnPayload).toContain('[MindElixirWrapper] note preview failed:');
    expect(warnPayload).toContain('[MindElixirWrapper] initial viewport fit failed:');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('save-secret');
    expect(errorPayload).not.toContain('history-secret');
    expect(warnPayload).not.toContain('clipboard-secret');
    expect(warnPayload).not.toContain('paste-secret');
    expect(warnPayload).not.toContain('shortcut-secret');
    expect(errorPayload).not.toContain('import-secret');
    expect(errorPayload).not.toContain('add-node-secret');
    expect(errorPayload).not.toContain('delete-secret');
    expect(warnPayload).not.toContain('drag-reject-secret');
    expect(errorPayload).not.toContain('drag-secret');
    expect(warnPayload).not.toContain('link-secret');
    expect(warnPayload).not.toContain('badge-secret');
    expect(warnPayload).not.toContain('shape-sync-secret');
    expect(warnPayload).not.toContain('copy-topic-secret');
    expect(warnPayload).not.toContain('note-preview-secret');
    expect(warnPayload).not.toContain('viewport-secret');
  });
});
