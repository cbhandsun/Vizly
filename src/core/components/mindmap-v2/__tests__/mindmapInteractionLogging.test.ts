import { afterEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

const redactSensitiveLogValue = vi.hoisted(() => vi.fn((value: unknown) => value));

vi.mock('@/core/utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

vi.mock('@/core/utils/logSecurity', () => ({
  redactSensitiveLogValue,
}));

describe('mindmapInteractionLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    redactSensitiveLogValue.mockReset();
    redactSensitiveLogValue.mockImplementation((value: unknown) => value);
  });

  it('logs redacted context-menu and search interaction failures', async () => {
    const logging = await import('../mindmapInteractionLogging');

    logging.logMindmapContextMenuFailure('copyNode', new Error('token=context-copy-secret'));
    logging.logMindmapContextMenuFailure('createSummary', new Error('Authorization: Bearer summary-secret'));
    logging.logMindmapContextMenuFailure('setShapeClass', new Error('cookie=shape-secret'));
    logging.logMindmapSearchFailure('collectMatches', new Error('api_key=collect-secret'));
    logging.logMindmapSearchFailure('highlightMatch', new Error('password=highlight-secret'));
    logging.logMindmapSearchFailure('activateMatch', new Error('secret=activate-secret'));
    logging.logMindmapSearchFailure('replaceOne', new Error('token=replace-one-secret'));
    logging.logMindmapSearchFailure('replaceAll', new Error('token=replace-all-secret'));

    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));
    expect(warnMessages).toContain('[MindMapContextMenu] copyNode failed:');
    expect(warnMessages).toContain('[MindMapContextMenu] createSummary failed:');
    expect(warnMessages).toContain('[MindMapContextMenu] setShapeClass failed:');
    expect(warnMessages).toContain('[MindMapSearch] collectMatches failed:');
    expect(warnMessages).toContain('[MindMapSearch] highlightMatch failed:');
    expect(warnMessages).toContain('[MindMapSearch] activateMatch failed:');
    expect(warnMessages).toContain('[MindMapSearch] replaceOne failed:');
    expect(warnMessages).toContain('[MindMapSearch] replaceAll failed:');
    expect(redactSensitiveLogValue).toHaveBeenCalledTimes(8);
  });
});
