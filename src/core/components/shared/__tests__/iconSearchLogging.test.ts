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

describe('iconSearchLogging', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('redacts icon search failures before logging', async () => {
    const {
      logSharedIconExplorerSearchFailure,
      logDiagramIconExplorerFetchFailure,
      logIconLibraryPanelSearchFailure,
    } = await import('../iconSearchLogging');

    logSharedIconExplorerSearchFailure(new Error('Authorization: Bearer icon-shared-secret'));
    logDiagramIconExplorerFetchFailure(new Error('cookie=icon-diagram-secret'));
    logIconLibraryPanelSearchFailure(new Error('token=icon-library-secret'));

    const errorPayload = JSON.stringify(safeLogState.error.mock.calls);
    expect(errorPayload).toContain('[IconExplorer] Failed to search icons:');
    expect(errorPayload).toContain('[DiagramIconExplorer] Failed to fetch icons:');
    expect(errorPayload).toContain('[IconLibraryPanel] Icon search failed:');
    expect(errorPayload).toContain('[redacted]');
    expect(errorPayload).not.toContain('icon-shared-secret');
    expect(errorPayload).not.toContain('icon-diagram-secret');
    expect(errorPayload).not.toContain('icon-library-secret');
  });
});
