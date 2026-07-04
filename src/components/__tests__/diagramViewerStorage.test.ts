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

describe('diagramViewerStorage', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach((mock) => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('logs a redacted warning when clearing the previous autosave key fails', async () => {
    const { clearPreviousDiagramAutoSave } = await import('../diagramViewerStorage');
    const storage = {
      removeItem: vi.fn(() => {
        throw new Error('Authorization: Bearer clear-secret');
      }),
    };

    clearPreviousDiagramAutoSave(storage, 'diagram-a', 'diagram-b');

    expect(storage.removeItem).toHaveBeenCalledWith('flowchart-autosave-v2-diagram-a');
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[DiagramViewer.clearPreviousDiagramAutoSave] Failed to write "flowchart-autosave-v2-diagram-a":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('clear-secret');
  });

  it('logs a redacted warning when persisting a fresh seed fails', async () => {
    const { persistDiagramFreshSeed } = await import('../diagramViewerStorage');
    const storage = {
      setItem: vi.fn(() => {
        throw new Error('api_key=seed-write-secret');
      }),
    };

    persistDiagramFreshSeed(storage, 'diagram-c', {
      diagramId: 'diagram-c',
      nodes: [],
      edges: [],
      version: '1.0',
      isFreshSeed: true,
    });

    expect(storage.setItem).toHaveBeenCalledWith(
      'flowchart-autosave-v2-diagram-c',
      expect.any(String)
    );
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[DiagramViewer.persistDiagramFreshSeed] Failed to write "flowchart-autosave-v2-diagram-c":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('seed-write-secret');
  });

  it('attempts to clear both blank-template keys even if one removal fails', async () => {
    const { clearBlankTemplateLocalState } = await import('../diagramViewerStorage');
    const storage = {
      removeItem: vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('token=autosave-clear-secret');
        })
        .mockImplementationOnce(() => undefined),
    };

    clearBlankTemplateLocalState(storage, 'blank-diagram');

    expect(storage.removeItem).toHaveBeenNthCalledWith(1, 'flowchart-autosave-v2-blank-diagram');
    expect(storage.removeItem).toHaveBeenNthCalledWith(2, 'GenericStandardDiagram.customPresets.blank-diagram');
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[DiagramViewer.clearBlankTemplateLocalState] Failed to write "flowchart-autosave-v2-blank-diagram":',
      expect.anything()
    );
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('autosave-clear-secret');
  });
});
