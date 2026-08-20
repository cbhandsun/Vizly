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

describe('mindmapPanelLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive values for outline, property, notes, boundary, and presentation failures', async () => {
    const logging = await import('../mindmapPanelLogging');

    logging.logMindmapOutlineUpdateFailure(new Error('Authorization: Bearer outline-update-secret'));
    logging.logMindmapOutlineExportFailure(new Error('cookie=outline-export-secret'));
    logging.logMindmapOutlineInvalidDrop();
    logging.logMindmapOutlineEditFailure(new Error('api_key=outline-edit-secret'));
    logging.logMindmapOutlineAddFailure(new Error('password=outline-add-secret'));
    logging.logMindmapOutlineDeleteFailure(new Error('secret=outline-delete-secret'));
    logging.logMindmapOutlineRefreshFailure(new Error('token=outline-refresh-secret'));
    logging.logMindmapOutlineSelectFailure(new Error('cookie=outline-select-secret'));
    logging.logMindmapPropertyReshapeFailure(new Error('credential=reshape-secret'));
    logging.logMindmapPropertySetTopicFailure(new Error('token=set-topic-secret'));
    logging.logMindmapPropertyAiAddChildFailure(new Error('Authorization: Bearer ai-add-secret'));
    logging.logMindmapPropertyAiRequestFailure('expand', new Error('token=ai-expand-secret'));
    logging.logMindmapPropertyAiRequestFailure('summarize', new Error('cookie=ai-summary-secret'));
    logging.logMindmapPropertyImageUploadRejected({ reason: 'cookie=image-upload-secret' });
    logging.logMindmapPropertyQuickActionFailure('addChild', new Error('token=quick-add-child-secret'));
    logging.logMindmapPropertyQuickActionFailure('addSibling', new Error('token=quick-add-sibling-secret'));
    logging.logMindmapPropertyQuickActionFailure('removeNode', new Error('token=quick-remove-secret'));
    logging.logMindmapPropertyQuickActionFailure('beginEdit', new Error('token=quick-edit-secret'));
    logging.logMindmapSpeakerNotesSaveFailure(new Error('api_key=speaker-secret'));
    logging.logMindmapBoundariesWalkFailure(new Error('password=boundary-secret'));
    logging.logMindmapPresentationNavigateFailure(new Error('secret=presentation-secret'));
    logging.logMindmapPresentationFullscreenFailure('enter', new Error('token=present-enter-secret'));
    logging.logMindmapPresentationFullscreenFailure('exit', new Error('token=present-exit-secret'));
    logging.logMindmapYjsInitialSyncParseFailure(new Error('Authorization: Bearer yjs-initial-secret'));
    logging.logMindmapYjsLocalSerializeFailure(new Error('cookie=yjs-local-secret'));
    logging.logMindmapYjsRemoteSyncParseFailure(new Error('api_key=yjs-remote-secret'));
    logging.logMindmapYjsCleanupFailure(new Error('token=yjs-cleanup-secret'));
    logging.logMindmapTemplateInsertFailure(new Error('password=template-insert-secret'));
    logging.logMindmapTemplateReplaceFailure(new Error('token=template-replace-secret'));
    logging.logMindmapKanbanRefreshFailure(new Error('token=kanban-refresh-secret'));
    logging.logMindmapHistoryRestoreFailure(new Error('secret=history-restore-secret'));
    logging.logMindmapEmptyGuideCheckFailure(new Error('password=empty-guide-secret'));

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);

    expect(errorPayload).toContain('[MindMapOutlinePanel] updateTreeAndSave failed:');
    expect(errorPayload).toContain('[MindMapOutlinePanel] export failed:');
    expect(warnPayload).toContain('[MindMapOutlinePanel] Cannot drop node into its own descendant.');
    expect(errorPayload).toContain('[MindMapOutlinePanel] edit failed:');
    expect(errorPayload).toContain('[MindMapOutlinePanel] add child failed:');
    expect(errorPayload).toContain('[MindMapOutlinePanel] delete failed:');
    expect(warnPayload).toContain('[MindMapOutlinePanel] refresh failed:');
    expect(warnPayload).toContain('[MindMapOutlinePanel] select failed:');
    expect(warnPayload).toContain('[MindMapPropertyPanel] reshapeNode failed:');
    expect(warnPayload).toContain('[MindMapPropertyPanel] setNodeTopic failed:');
    expect(warnPayload).toContain('[MindMapPropertyPanel] AI addChild failed:');
    expect(warnPayload).toContain('[MindMapPropertyPanel] AI expand failed:');
    expect(warnPayload).toContain('[MindMapPropertyPanel] AI summarize failed:');
    expect(warnPayload).toContain('[MindMapPropertyPanel] image upload rejected:');
    expect(warnPayload).toContain('[MindMapPropertyPanel] addChild failed:');
    expect(warnPayload).toContain('[MindMapPropertyPanel] addSibling failed:');
    expect(warnPayload).toContain('[MindMapPropertyPanel] removeNode failed:');
    expect(warnPayload).toContain('[MindMapPropertyPanel] beginEdit failed:');
    expect(errorPayload).toContain('[MindMapSpeakerNotes] save failed:');
    expect(errorPayload).toContain('[MindMapBoundaries] walk failed:');
    expect(warnPayload).toContain('[MindMapPresentationMode] navigate failed:');
    expect(warnPayload).toContain('[MindMapPresentationMode] fullscreen enter failed:');
    expect(warnPayload).toContain('[MindMapPresentationMode] fullscreen exit failed:');
    expect(errorPayload).toContain('[MindMapYjsIntegration] Initial sync parse error:');
    expect(errorPayload).toContain('[MindMapYjsIntegration] Failed to serialize local operation:');
    expect(errorPayload).toContain('[MindMapYjsIntegration] Remote sync parse error:');
    expect(warnPayload).toContain('[MindMapYjsIntegration] Cleanup listener removal failed:');
    expect(errorPayload).toContain('[MindMapTemplates] insert failed:');
    expect(errorPayload).toContain('[MindMapTemplates] replacement failed:');
    expect(errorPayload).toContain('[MindMapTaskKanban] refresh failed:');
    expect(errorPayload).toContain('[MindMapHistoryPanel] restore failed:');
    expect(warnPayload).toContain('[MindMapEmptyGuide] empty-state check failed:');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).toContain('[redacted]');
    expect(errorPayload).not.toContain('outline-update-secret');
    expect(errorPayload).not.toContain('outline-export-secret');
    expect(errorPayload).not.toContain('outline-edit-secret');
    expect(errorPayload).not.toContain('outline-add-secret');
    expect(errorPayload).not.toContain('outline-delete-secret');
    expect(warnPayload).not.toContain('outline-refresh-secret');
    expect(warnPayload).not.toContain('outline-select-secret');
    expect(warnPayload).not.toContain('reshape-secret');
    expect(warnPayload).not.toContain('set-topic-secret');
    expect(warnPayload).not.toContain('ai-add-secret');
    expect(warnPayload).not.toContain('ai-expand-secret');
    expect(warnPayload).not.toContain('ai-summary-secret');
    expect(warnPayload).not.toContain('image-upload-secret');
    expect(warnPayload).not.toContain('quick-add-child-secret');
    expect(warnPayload).not.toContain('quick-add-sibling-secret');
    expect(warnPayload).not.toContain('quick-remove-secret');
    expect(warnPayload).not.toContain('quick-edit-secret');
    expect(errorPayload).not.toContain('speaker-secret');
    expect(errorPayload).not.toContain('boundary-secret');
    expect(warnPayload).not.toContain('presentation-secret');
    expect(warnPayload).not.toContain('present-enter-secret');
    expect(warnPayload).not.toContain('present-exit-secret');
    expect(errorPayload).not.toContain('yjs-initial-secret');
    expect(errorPayload).not.toContain('yjs-local-secret');
    expect(errorPayload).not.toContain('yjs-remote-secret');
    expect(warnPayload).not.toContain('yjs-cleanup-secret');
    expect(errorPayload).not.toContain('template-insert-secret');
    expect(errorPayload).not.toContain('template-replace-secret');
    expect(errorPayload).not.toContain('kanban-refresh-secret');
    expect(errorPayload).not.toContain('history-restore-secret');
    expect(warnPayload).not.toContain('empty-guide-secret');
  });
});
