import { act, renderHook } from '@testing-library/react';
import { MarkerType } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

const exportUtilsState = vi.hoisted(() => ({
  getTargetDiagramElement: vi.fn(() => ({ id: 'diagram-1' })),
  temporarilyHideElements: vi.fn(async (_selectors, cb: () => Promise<string>) => cb()),
  exportFullDiagramByAdjustingViewportToPngDataUrl: vi.fn().mockRejectedValue(
    new Error('Authorization: Bearer live-token')
  ),
  exportFullDiagramByAdjustingViewportToSvgDataUrl: vi.fn(),
  buildExportFileName: vi.fn(() => 'diagram.png'),
  triggerDownload: vi.fn(),
  _exportElementToPngDataUrl: vi.fn(),
  _exportElementToSvgDataUrl: vi.fn(),
}));

vi.mock('../../utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

vi.mock('../../components/shared/exportUtils', () => exportUtilsState);

vi.mock('../../components/shared/diagramControl', () => ({
  dispatchDiagramControl: vi.fn(),
}));

describe('useOptimizedDiagramControls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    Object.values(exportUtilsState).forEach(value => {
      if (typeof value === 'function' && 'mockReset' in value) {
        value.mockReset?.();
      }
    });
    exportUtilsState.getTargetDiagramElement.mockReturnValue({ id: 'diagram-1' });
    exportUtilsState.temporarilyHideElements.mockImplementation(async (_selectors, cb: () => Promise<string>) => cb());
    exportUtilsState.exportFullDiagramByAdjustingViewportToPngDataUrl.mockRejectedValue(
      new Error('Authorization: Bearer live-token')
    );
    exportUtilsState.buildExportFileName.mockReturnValue('diagram.png');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('warns through safeLog when exports are triggered too frequently', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const { useOptimizedDiagramControls } = await import('../useOptimizedDiagramControls');
    const { result } = renderHook(() => useOptimizedDiagramControls('diagram-1'));

    await act(async () => {
      const first = result.current.exportToPNG();
      vi.advanceTimersByTime(200);
      await first;
    });

    await act(async () => {
      await result.current.exportToPNG();
    });

    expect(safeLogState.warn).toHaveBeenCalledWith('导出过于频繁，请稍候再试');
  });

  it('redacts export failures before logging and emits string error payloads', async () => {
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
    const { useOptimizedDiagramControls } = await import('../useOptimizedDiagramControls');
    const { result } = renderHook(() => useOptimizedDiagramControls('diagram-1'));

    await act(async () => {
      const promise = result.current.exportToPNG();
      vi.advanceTimersByTime(200);
      await promise;
    });

    expect(safeLogState.error).toHaveBeenCalledWith(
      'PNG导出失败:',
      expect.objectContaining({
        message: 'Authorization: [redacted]',
      })
    );

    const errorEvent = dispatchEventSpy.mock.calls
      .map(call => call[0] as CustomEvent)
      .find(event => event.type === 'diagramExportError');

    expect(errorEvent?.detail).toEqual({
      diagramId: 'diagram-1',
      type: 'png',
      error: 'Authorization: Bearer live-token',
    });
    expect(alertMock).toHaveBeenCalledWith('导出失败: Authorization: Bearer live-token');
  });

  it('exports SVG from explicit snapshots without using the legacy DOM SVG exporter', async () => {
    exportUtilsState.exportFullDiagramByAdjustingViewportToSvgDataUrl.mockResolvedValue('data:image/svg+xml,<svg/>');
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
    const { useOptimizedDiagramControls } = await import('../useOptimizedDiagramControls');
    const getReactFlowSnapshot = vi.fn(() => ({
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, measured: { width: 100, height: 50 }, data: { label: 'Explicit A' } },
        { id: 'b', position: { x: 160, y: 0 }, measured: { width: 100, height: 50 }, data: { label: 'Explicit B' } },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b', markerEnd: { type: MarkerType.ArrowClosed }, label: 'Explicit edge' },
      ],
      viewport: { x: 1, y: 2, zoom: 1.5 },
    }));
    const { result } = renderHook(() => useOptimizedDiagramControls('diagram-1', { getReactFlowSnapshot }));

    await act(async () => {
      const promise = result.current.exportToSVG();
      vi.advanceTimersByTime(200);
      await promise;
    });

    expect(getReactFlowSnapshot).toHaveBeenCalledTimes(1);
    expect(exportUtilsState.exportFullDiagramByAdjustingViewportToSvgDataUrl).not.toHaveBeenCalled();
    expect(exportUtilsState.triggerDownload).toHaveBeenCalledWith(
      expect.stringContaining('data:image/svg+xml;charset=utf-8,'),
      'diagram.png',
    );
    const svgDataUrl = exportUtilsState.triggerDownload.mock.calls[0]?.[0] as string;
    const svg = decodeURIComponent(svgDataUrl.replace('data:image/svg+xml;charset=utf-8,', ''));
    expect(svg).toContain('Explicit A');
    expect(svg).toContain('Explicit edge');
    expect(dispatchEventSpy.mock.calls.map(call => call[0].type)).toContain('diagramExportComplete');
  });
});
