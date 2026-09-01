import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

const scenePdfState = vi.hoisted(() => ({
  exportRenderSceneToPdfBlob: vi.fn(async () => new Blob(['vector-pdf'], {
    type: 'application/pdf',
  })),
}));

vi.mock('../../utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

vi.mock('../../components/shared/exportUtils', () => ({
  getTargetDiagramElement: vi.fn(() => ({ id: 'diagram-1' })),
  temporarilyHideElements: vi.fn(async (_selectors, cb) => cb()),
  exportElementToPngDataUrl: vi.fn(),
  buildExportFileName: vi.fn(() => 'diagram.png'),
  exportFullDiagramToPngDataUrl: vi.fn(),
  exportFullDiagramByAdjustingViewportToPngDataUrl: vi.fn().mockRejectedValue(
    new Error('Authorization: Bearer live-token')
  ),
  exportFullDiagramByAdjustingViewportToSvgDataUrl: vi.fn(),
  exportGifFrameWithAnimationClone: vi.fn(),
  exportGifFramesWithAnimationCloneBatch: vi.fn(),
  isSafeExportDataUrl: vi.fn(() => true),
  triggerDownload: vi.fn(),
}));

vi.mock('../../export/scenePdfExport', () => scenePdfState);

import * as exportUtils from '../../components/shared/exportUtils';
import {
  exportDiagramToPDF,
  exportDiagramToPNG,
  exportDiagramToSVG,
} from '../diagramExportActions';

describe('diagramExportActions logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (window as any).reactFlowInstance;
  });

  it('redacts PNG export failures before logging and dispatches a string error payload', async () => {
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const dispatchExportEvent = vi.fn();

    await exportDiagramToPNG({
      diagramId: 'diagram-1',
      dispatchExportEvent,
      yieldToPaint: async () => undefined,
    });

    expect(safeLogState.error).toHaveBeenCalledWith(
      '导出PNG失败:',
      expect.objectContaining({
        message: 'Authorization: [redacted]',
      })
    );
    expect(dispatchExportEvent).toHaveBeenCalledWith('diagramExportError', {
      diagramId: 'diagram-1',
      type: 'png',
      error: 'Authorization: Bearer live-token',
    });
    expect(alertMock).toHaveBeenCalledWith('导出PNG失败，请稍后重试');
  });

  it('exports SVG through the model-based scene exporter instead of the legacy DOM SVG path', async () => {
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    alertMock.mockClear();
    const dispatchExportEvent = vi.fn();
    (window as any).reactFlowInstance = {
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      getNodes: () => [
        { id: 'a', position: { x: 0, y: 0 }, measured: { width: 100, height: 50 }, data: { label: 'Alpha' } },
        { id: 'b', position: { x: 160, y: 0 }, measured: { width: 100, height: 50 }, data: { label: 'Beta' } },
      ],
      getEdges: () => [
        { id: 'e1', source: 'a', target: 'b', markerEnd: { type: 'arrowclosed' }, label: 'Alpha to Beta' },
      ],
    };

    await exportDiagramToSVG({
      diagramId: 'diagram-1',
      dispatchExportEvent,
      yieldToPaint: async () => undefined,
    });

    expect(exportUtils.exportFullDiagramByAdjustingViewportToSvgDataUrl).not.toHaveBeenCalled();
    expect(exportUtils.triggerDownload).toHaveBeenCalledWith(
      expect.stringContaining('data:image/svg+xml;charset=utf-8,'),
      'diagram.png',
    );
    expect(dispatchExportEvent).toHaveBeenCalledWith('diagramExportComplete', { diagramId: 'diagram-1', type: 'svg' });
    expect(alertMock).not.toHaveBeenCalled();
  });

  it('prefers explicit React Flow snapshots for SVG export over the global instance', async () => {
    const dispatchExportEvent = vi.fn();
    (exportUtils.triggerDownload as any).mockClear();
    (window as any).reactFlowInstance = {
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      getNodes: () => [{ id: 'global', position: { x: 0, y: 0 }, data: { label: 'Global node' } }],
      getEdges: () => [],
    };

    await exportDiagramToSVG({
      diagramId: 'diagram-1',
      dispatchExportEvent,
      yieldToPaint: async () => undefined,
      getReactFlowSnapshot: () => ({
        nodes: [{ id: 'explicit', position: { x: 0, y: 0 }, data: { label: 'Explicit node' } } as any],
        edges: [],
        viewport: { x: 5, y: 6, zoom: 1.25 },
      }),
    });

    const dataUrl = (exportUtils.triggerDownload as any).mock.calls.at(-1)?.[0] as string;
    const svg = decodeURIComponent(dataUrl.replace('data:image/svg+xml;charset=utf-8,', ''));
    expect(svg).toContain('Explicit node');
    expect(svg).not.toContain('Global node');
  });

  it('exports PDF as a vector scene without capturing a raster image', async () => {
    const dispatchExportEvent = vi.fn();
    const getReactFlowSnapshot = vi.fn(() => ({
      nodes: [
        { id: 'explicit', position: { x: 0, y: 0 }, data: { label: 'Explicit node' } },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }));
    const createObjectURL = vi.fn(() => 'blob:http://localhost/vector-pdf');
    vi.stubGlobal('URL', { createObjectURL });

    await exportDiagramToPDF({
      diagramId: 'diagram-1',
      dispatchExportEvent,
      getReactFlowSnapshot,
      yieldToPaint: async () => undefined,
    });

    expect(getReactFlowSnapshot).toHaveBeenCalledTimes(1);
    expect(exportUtils.exportFullDiagramByAdjustingViewportToPngDataUrl).not.toHaveBeenCalled();
    expect(scenePdfState.exportRenderSceneToPdfBlob).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: [expect.objectContaining({ id: 'explicit' })] }),
      { includeBackground: true, title: 'diagram-1' },
    );
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(exportUtils.triggerDownload).toHaveBeenCalledWith(
      'blob:http://localhost/vector-pdf',
      'diagram.png',
    );
    expect(dispatchExportEvent).toHaveBeenCalledWith('diagramExportComplete', {
      diagramId: 'diagram-1',
      type: 'pdf',
    });
  });

  it('suppresses vector PDF download when cancellation arrives during conversion', async () => {
    const controller = new AbortController();
    const dispatchExportEvent = vi.fn();
    scenePdfState.exportRenderSceneToPdfBlob.mockImplementationOnce(async () => {
      controller.abort();
      return new Blob(['cancelled-pdf'], { type: 'application/pdf' });
    });

    await expect(exportDiagramToPDF({
      diagramId: 'diagram-1',
      dispatchExportEvent,
      getReactFlowSnapshot: () => ({ nodes: [], edges: [] }),
      signal: controller.signal,
      yieldToPaint: async () => undefined,
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(exportUtils.triggerDownload).not.toHaveBeenCalled();
    expect(dispatchExportEvent).toHaveBeenCalledWith('diagramExportCancelled', {
      diagramId: 'diagram-1',
      type: 'pdf',
    });
  });

  it('suppresses the download and emits cancellation when aborted after capture', async () => {
    const controller = new AbortController();
    const dispatchExportEvent = vi.fn();
    const capture = vi.mocked(exportUtils.exportFullDiagramByAdjustingViewportToPngDataUrl);
    const download = vi.mocked(exportUtils.triggerDownload);
    capture.mockImplementationOnce(async () => {
      controller.abort();
      return 'data:image/png;base64,aGVsbG8=';
    });
    download.mockClear();

    await expect(exportDiagramToPNG({
      diagramId: 'diagram-1',
      dispatchExportEvent,
      yieldToPaint: async () => undefined,
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(download).not.toHaveBeenCalled();
    expect(dispatchExportEvent).toHaveBeenCalledWith('diagramExportCancelled', {
      diagramId: 'diagram-1',
      type: 'png',
    });
  });
});
