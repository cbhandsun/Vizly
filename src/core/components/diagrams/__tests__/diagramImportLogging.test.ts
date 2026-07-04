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

describe('diagramImportLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts json merge and autosave failures before logging', async () => {
    const {
      logAutoSaveAccessRefreshFailure,
      logAutoSaveBeforeUnloadSaveFailure,
      logAutoSaveGcEntryParseFailure,
      logAutoSaveGcFailure,
      logJsonEditorExistingDiagramMergeFailure,
      logAutoSaveLoadFailure,
    } = await import('../diagramImportLogging');

    logJsonEditorExistingDiagramMergeFailure(new Error('Authorization: Bearer json-merge-secret'));
    logAutoSaveLoadFailure(new Error('cookie=autosave-load-secret'));
    logAutoSaveGcEntryParseFailure('autosave:key', new Error('token=autosave-gc-entry-secret'));
    logAutoSaveGcFailure(new Error('api_key=autosave-gc-secret'));
    logAutoSaveBeforeUnloadSaveFailure('autosave:key', new Error('secret=autosave-beforeunload-secret'));
    logAutoSaveAccessRefreshFailure('autosave:key', new Error('Authorization: Bearer autosave-refresh-secret'));

    const warnPayload = JSON.stringify(safeLogState.warn.mock.calls);
    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    const warnMessages = safeLogState.warn.mock.calls.map(call => String(call[0]));

    expect(warnMessages).toContain('[JsonEditorModal] Failed to fetch existing diagram data for merge:');
    expect(errorPayload).toContain('[useAutoSave] Failed to load auto-saved data:');
    expect(warnMessages).toContain('[useAutoSave] Failed to parse auto-save entry "autosave:key" during GC:');
    expect(errorPayload).toContain('[useAutoSave] Auto-save GC failed:');
    expect(warnMessages).toContain('[useAutoSave] Failed to persist auto-save before unload for "autosave:key":');
    expect(warnMessages).toContain('[useAutoSave] Failed to refresh auto-save access time for "autosave:key":');
    expect(warnPayload).toContain('[redacted]');
    expect(errorPayload).toContain('[redacted]');
    expect(warnPayload).not.toContain('json-merge-secret');
    expect(errorPayload).not.toContain('autosave-load-secret');
    expect(warnPayload).not.toContain('autosave-gc-entry-secret');
    expect(errorPayload).not.toContain('autosave-gc-secret');
    expect(warnPayload).not.toContain('autosave-beforeunload-secret');
    expect(warnPayload).not.toContain('autosave-refresh-secret');
  });
});
