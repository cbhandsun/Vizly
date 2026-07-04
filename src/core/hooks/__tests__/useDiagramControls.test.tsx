import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const logDiagramExportEventDispatchFailure = vi.fn();
const exportActionSpy = vi.fn(async (ctx: { dispatchExportEvent: (name: 'diagramExportStart', detail: { diagramId: string; type: 'png' }) => void; diagramId: string }) => {
  ctx.dispatchExportEvent('diagramExportStart', { diagramId: ctx.diagramId, type: 'png' });
});

vi.mock('../diagramExportLogging', () => ({
  logDiagramExportEventDispatchFailure,
}));

vi.mock('../diagramExportActions', () => ({
  exportDiagramToPNG: exportActionSpy,
  exportDiagramToPDF: vi.fn(),
  exportDiagramToSVG: vi.fn(),
  exportDiagramToGIF: vi.fn(),
}));

vi.mock('../../components/shared/diagramControl', () => ({
  dispatchDiagramControl: vi.fn(),
}));

describe('useDiagramControls', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    logDiagramExportEventDispatchFailure.mockReset();
    exportActionSpy.mockClear();
  });

  it('logs export event dispatch failures without aborting the export action', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => {
      throw new Error('Authorization: Bearer dispatch-secret');
    });

    const { useDiagramControls } = await import('../useDiagramControls');
    const { result } = renderHook(() => useDiagramControls('diagram-1'));

    await act(async () => {
      await result.current.exportToPNG();
    });

    expect(dispatchSpy).toHaveBeenCalled();
    expect(logDiagramExportEventDispatchFailure).toHaveBeenCalledWith(
      'useDiagramControls',
      'diagramExportStart',
      expect.any(Error)
    );
    expect(exportActionSpy).toHaveBeenCalledTimes(1);
  });

  it('passes explicit React Flow snapshots to export actions', async () => {
    const { useDiagramControls } = await import('../useDiagramControls');
    const getReactFlowSnapshot = vi.fn(() => ({
      nodes: [{ id: 'n1' }],
      edges: [],
      viewport: { x: 1, y: 2, zoom: 1.5 },
    }));
    const { result } = renderHook(() => useDiagramControls('diagram-2', true, { getReactFlowSnapshot }));

    await act(async () => {
      await result.current.exportToPNG();
    });

    expect(exportActionSpy).toHaveBeenCalledWith(expect.objectContaining({
      diagramId: 'diagram-2',
      getReactFlowSnapshot,
    }));
  });
});
