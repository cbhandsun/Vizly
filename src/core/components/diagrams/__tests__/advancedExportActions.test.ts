import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactFlowRenderSnapshot } from '../../../rendering/reactFlowScene';

const exportRenderSceneToPngDataUrl = vi.fn(async () => 'data:image/png;base64,aGVsbG8=');
const exportRenderSceneToSvgDataUrl = vi.fn(() => 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E');
const triggerDownload = vi.fn();
const downloadImage = vi.fn(async () => undefined);

vi.mock('../../../export/svgRasterExport', () => ({
  exportRenderSceneToPngDataUrl,
}));

vi.mock('../../../export/svgExport', () => ({
  exportRenderSceneToSvgDataUrl,
}));

vi.mock('../../shared/exportUtils', () => ({
  buildExportFileName: (diagramId: string, ext: string) => `${diagramId}.${ext}`,
  triggerDownload,
}));

vi.mock('../../../utils/imageExporter', () => ({
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
      { title: 'diagram-1', pixelRatio: 2 },
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
      { title: '客户入驻流程', pixelRatio: 2 },
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
      { title: 'diagram-2' },
    );
    expect(triggerDownload).toHaveBeenCalledWith(
      'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E',
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
      { title: 'diagram-2' },
    );
    expect(triggerDownload).toHaveBeenCalledWith('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E', 'diagram-2.svg');
  });

  it('falls back to legacy image export for unsupported formats or missing snapshots', async () => {
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
    const pngFallbackResult = await runAdvancedExport({
      diagramId: 'diagram-4',
      nodes: [{ id: 'fallback-node' }],
      format: 'png',
      pixelRatio: 1,
      includeBackground: true,
      embedMetadata: false,
      getReactFlowSnapshot: () => null,
    });

    expect(pdfResult).toBe('fallback');
    expect(pngFallbackResult).toBe('fallback');
    expect(downloadImage).toHaveBeenCalledWith([{ id: 'legacy-node' }], {
      format: 'pdf',
      pixelRatio: 3,
      includeBackground: false,
      embedMetadata: true,
    });
    expect(downloadImage).toHaveBeenCalledWith([{ id: 'fallback-node' }], {
      format: 'png',
      pixelRatio: 1,
      includeBackground: true,
      embedMetadata: false,
    });
  });
});
