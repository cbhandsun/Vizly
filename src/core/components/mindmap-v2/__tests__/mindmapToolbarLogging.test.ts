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

describe('mindmapToolbarLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts sensitive values for toolbar failures and import rejections', async () => {
    const logging = await import('../mindmapToolbarLogging');

    logging.logMindmapToolbarAutoArrangeFailure(new Error('Authorization: Bearer arrange-secret'));
    logging.logMindmapToolbarAddRootChildFailure({ token: 'root-child-secret' });
    logging.logMindmapToolbarExportFailure('SVG', new Error('cookie=svg-secret'));
    logging.logMindmapToolbarExportFailure('PNG', new Error('api_key=png-secret'));
    logging.logMindmapToolbarFocusModeFailure(new Error('password=focus-secret'));
    logging.logMindmapToolbarSummaryFailure(new Error('secret=summary-secret'));
    logging.logMindmapToolbarArrowFailure(new Error('credential=arrow-secret'));
    logging.logMindmapToolbarImportRejected('JSON', { reason: 'token=json-reject-secret' });
    logging.logMindmapToolbarImportFailure('Markdown', new Error('Authorization: Bearer markdown-secret'));
    logging.logMindmapToolbarImportRejected('OPML', { reason: 'cookie=opml-reject-secret' });
    logging.logMindmapToolbarImportFailure('OPML', new Error('api_key=opml-secret'));
    logging.logMindmapToolbarStatsUpdateFailure(new Error('password=stats-secret'));
    logging.logMindmapToolbarHistoryFailure('undo', new Error('token=undo-secret'));
    logging.logMindmapToolbarHistoryFailure('redo', new Error('cookie=redo-secret'));
    logging.logMindmapToolbarTreeExpansionFailure('collapseAll', new Error('token=collapse-secret'));
    logging.logMindmapToolbarTreeExpansionFailure('expandAll', new Error('cookie=expand-secret'));

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);

    expect(warnPayload).toContain('[MindMapToolbar] auto arrange failed:');
    expect(warnPayload).toContain('[MindMapToolbar] addRootChild failed:');
    expect(errorPayload).toContain('[MindMapToolbar] SVG export failed:');
    expect(errorPayload).toContain('[MindMapToolbar] PNG export failed:');
    expect(warnPayload).toContain('[MindMapToolbar] focusMode failed:');
    expect(warnPayload).toContain('[MindMapToolbar] summary creation failed:');
    expect(warnPayload).toContain('[MindMapToolbar] arrow creation failed:');
    expect(warnPayload).toContain('[MindMapToolbar] JSON import rejected:');
    expect(errorPayload).toContain('[MindMapToolbar] Markdown import failed:');
    expect(warnPayload).toContain('[MindMapToolbar] OPML import rejected:');
    expect(errorPayload).toContain('[MindMapToolbar] OPML import failed:');
    expect(warnPayload).toContain('[MindMapToolbar] stats update failed:');
    expect(warnPayload).toContain('[MindMapToolbar] undo failed:');
    expect(warnPayload).toContain('[MindMapToolbar] redo failed:');
    expect(warnPayload).toContain('[MindMapToolbar] collapseAll failed:');
    expect(warnPayload).toContain('[MindMapToolbar] expandAll failed:');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('arrange-secret');
    expect(warnPayload).not.toContain('root-child-secret');
    expect(errorPayload).not.toContain('svg-secret');
    expect(errorPayload).not.toContain('png-secret');
    expect(warnPayload).not.toContain('focus-secret');
    expect(warnPayload).not.toContain('summary-secret');
    expect(warnPayload).not.toContain('arrow-secret');
    expect(warnPayload).not.toContain('json-reject-secret');
    expect(errorPayload).not.toContain('markdown-secret');
    expect(warnPayload).not.toContain('opml-reject-secret');
    expect(errorPayload).not.toContain('opml-secret');
    expect(warnPayload).not.toContain('stats-secret');
    expect(warnPayload).not.toContain('undo-secret');
    expect(warnPayload).not.toContain('redo-secret');
    expect(warnPayload).not.toContain('collapse-secret');
    expect(warnPayload).not.toContain('expand-secret');
  });
});
