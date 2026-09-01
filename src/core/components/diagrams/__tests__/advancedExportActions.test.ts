import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactFlowRenderSnapshot } from '../../../rendering/reactFlowScene';

const exportRenderSceneToPngDataUrl = vi.fn(async () => 'data:image/png;base64,aGVsbG8=');
const exportRenderSceneToSvgDataUrl = vi.fn(() => 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E');
const exportRenderSceneToPdfBlob = vi.fn(async () => new Blob(['pdf'], { type: 'application/pdf' }));
const triggerDownload = vi.fn();
const downloadImage = vi.fn(async () => undefined);
const attachVizlyExportMetadata = vi.fn(async (dataUrl: string) => `${dataUrl}#metadata`);

vi.mock('../../../export/svgRasterExport', () => ({
  exportRenderSceneToPngDataUrl,
}));

vi.mock('../../../export/svgExport', () => ({
  exportRenderSceneToSvgDataUrl,
}));

vi.mock('../../../export/scenePdfExport', () => ({
  exportRenderSceneToPdfBlob,
}));

vi.mock('../../shared/exportUtils', () => ({
  buildExportFileName: (diagramId: string, ext: string) => `${diagramId}.${ext}`,
  triggerDownload,
}));

vi.mock('../../../utils/imageExporter', () => ({
  attachVizlyExportMetadata,
  downloadImage,
}));

const snapshot = {
  nodes: [
    { id: 'a', position: { x: 0, y: 0 }, measured: { width: 80, height: 40 }, data: { label: 'A' } },
  ],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

describe('runAdvancedExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses scene-based PNG export when a snapshot is available', async () => {
    const { runAdvancedExport } = await import('../advancedExportActions');
    const result = await runAdvancedExport({
      diagramId: 'diagram-1',
      nodes: [{ id: 'legacy-node' }],
      format: 'png',
      pixelRatio: 2,
      includeBackground: true,
      embedMetadata: false,
      getReactFlowSnapshot: () => snapshot as unknown as ReactFlowRenderSnapshot,
    });

    expect(result).toBe('scene');
    expect(exportRenderSceneToPngDataUrl).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: [expect.objectContaining({ id: 'a' })] }),
      { title: 'diagram-1', pixelRatio: 2, includeBackground: true },
    );
    expect(triggerDownload).toHaveBeenCalledWith('data:image/png;base64,aGVsbG8=', 'diagram-1.png');
    expect(downloadImage).not.toHaveBeenCalled();
  });

  it('uses the visible diagram title for scene metadata and the download filename', async () => {
    const { runAdvancedExport } = await import('../advancedExportActions');
    await runAdvancedExport({
      diagramId: 'diagram-1',
      diagramTitle: '  客户入驻流程  ',
      nodes: [],
      format: 'png',
      pixelRatio: 2,
      includeBackground: true,
      embedMetadata: false,
      getReactFlowSnapshot: () => snapshot as unknown as ReactFlowRenderSnapshot,
    });

    expect(exportRenderSceneToPngDataUrl).toHaveBeenCalledWith(
      expect.any(Object),
      { title: '客户入驻流程', pixelRatio: 2, includeBackground: true },
    );
    expect(triggerDownload).toHaveBeenCalledWith(
      'data:image/png;base64,aGVsbG8=',
      '客户入驻流程.png',
    );
  });

  it('falls back to the diagram id when the visible title is empty', async () => {
    const { runAdvancedExport } = await import('../advancedExportActions');
    await runAdvancedExport({
      diagramId: ' diagram-2 ',
      diagramTitle: '   ',
      nodes: [],
      format: 'svg',
      pixelRatio: 1,
      includeBackground: true,
      embedMetadata: true,
      getReactFlowSnapshot: () => snapshot as unknown as ReactFlowRenderSnapshot,
    });

    expect(exportRenderSceneToSvgDataUrl).toHaveBeenCalledWith(
      expect.any(Object),
      { title: 'diagram-2', includeBackground: true },
    );
    expect(attachVizlyExportMetadata).toHaveBeenCalledWith(
      'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E',
      'svg',
      { nodes: [] },
    );
    expect(triggerDownload).toHaveBeenCalledWith(
      'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E#metadata',
      'diagram-2.svg',
    );
  });

  it('uses scene-based SVG export when a snapshot is available', async () => {
    const { runAdvancedExport } = await import('../advancedExportActions');
    const result = await runAdvancedExport({
      diagramId: 'diagram-2',
      nodes: [],
      format: 'svg',
      pixelRatio: 1,
      includeBackground: true,
      embedMetadata: true,
      getReactFlowSnapshot: () => snapshot as unknown as ReactFlowRenderSnapshot,
    });

    expect(result).toBe('scene');
    expect(exportRenderSceneToSvgDataUrl).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: [expect.objectContaining({ id: 'a' })] }),
      { title: 'diagram-2', includeBackground: true },
    );
    expect(triggerDownload).toHaveBeenCalledWith(
      'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E#metadata',
      'diagram-2.svg',
    );
  });

  it('applies transparent background and metadata to scene-based PNG exports', async () => {
    const { runAdvancedExport } = await import('../advancedExportActions');
    await runAdvancedExport({
      diagramId: 'diagram-transparent',
      nodes: [{ id: 'metadata-node' }],
      format: 'png',
      pixelRatio: 4,
      includeBackground: false,
      embedMetadata: true,
      getReactFlowSnapshot: () => snapshot as unknown as ReactFlowRenderSnapshot,
    });

    expect(exportRenderSceneToPngDataUrl).toHaveBeenCalledWith(
      expect.any(Object),
      { title: 'diagram-transparent', pixelRatio: 4, includeBackground: false },
    );
    expect(attachVizlyExportMetadata).toHaveBeenCalledWith(
      'data:image/png;base64,aGVsbG8=',
      'png',
      { nodes: [{ id: 'metadata-node' }] },
    );
    expect(triggerDownload).toHaveBeenCalledWith(
      'data:image/png;base64,aGVsbG8=#metadata',
      'diagram-transparent.png',
    );
  });

  it('uses scene-based vector PDF export when a snapshot is available', async () => {
    const { runAdvancedExport } = await import('../advancedExportActions');
    const pdfResult = await runAdvancedExport({
      diagramId: 'diagram-3',
      nodes: [{ id: 'legacy-node' }],
      format: 'pdf',
      pixelRatio: 3,
      includeBackground: false,
      embedMetadata: true,
      getReactFlowSnapshot: () => snapshot as unknown as ReactFlowRenderSnapshot,
    });

    expect(pdfResult).toBe('scene');
    expect(exportRenderSceneToPdfBlob).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: [expect.objectContaining({ id: 'a' })] }),
      { title: 'diagram-3', includeBackground: false },
    );
    expect(triggerDownload).toHaveBeenCalledWith(
      expect.stringMatching(/^blob:/),
      'diagram-3.pdf',
    );
    expect(downloadImage).not.toHaveBeenCalled();
  });

  it('fails closed instead of silently producing a raster PDF when vector conversion fails', async () => {
    const { runAdvancedExport } = await import('../advancedExportActions');
    const vectorFailure = new Error('vector conversion failed');
    exportRenderSceneToPdfBlob.mockRejectedValueOnce(vectorFailure);

    await expect(runAdvancedExport({
      diagramId: 'diagram-pdf-fallback',
      nodes: [{ id: 'legacy-node' }],
      format: 'pdf',
      pixelRatio: 2,
      includeBackground: true,
      embedMetadata: false,
      getReactFlowSnapshot: () => snapshot as unknown as ReactFlowRenderSnapshot,
    })).rejects.toBe(vectorFailure);

    expect(downloadImage).not.toHaveBeenCalled();
    expect(triggerDownload).not.toHaveBeenCalled();
  });

  it.each([
    ['missing provider', undefined],
    ['empty snapshot', () => null],
  ])('rejects vector PDF export for a %s', async (_name, getReactFlowSnapshot) => {
    const { AdvancedExportError, runAdvancedExport } = await import('../advancedExportActions');

    const operation = runAdvancedExport({
      diagramId: 'diagram-pdf-no-scene',
      nodes: [{ id: 'legacy-node' }],
      format: 'pdf',
      pixelRatio: 4,
      includeBackground: true,
      embedMetadata: false,
      getReactFlowSnapshot,
    });

    await expect(operation).rejects.toBeInstanceOf(AdvancedExportError);
    await expect(operation).rejects.toMatchObject({
      code: 'ADVANCED_EXPORT_VECTOR_PDF_SNAPSHOT_REQUIRED',
    });
    expect(exportRenderSceneToPdfBlob).not.toHaveBeenCalled();
    expect(downloadImage).not.toHaveBeenCalled();
  });

  it('falls back to legacy image export for unsupported formats or missing snapshots', async () => {
    const { runAdvancedExport } = await import('../advancedExportActions');
    const pngFallbackResult = await runAdvancedExport({
      diagramId: 'diagram-4',
      nodes: [{ id: 'fallback-node' }],
      format: 'png',
      pixelRatio: 1,
      includeBackground: true,
      embedMetadata: false,
      getReactFlowSnapshot: () => null,
    });

    expect(pngFallbackResult).toBe('fallback');
    expect(downloadImage).toHaveBeenCalledWith([{ id: 'fallback-node' }], {
      format: 'png',
      pixelRatio: 1,
      includeBackground: true,
      embedMetadata: false,
      fileNameBase: 'diagram-4',
    });
  });
});
