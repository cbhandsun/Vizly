// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { exportRenderSceneToPngDataUrl, SvgRasterExportError } from '../../export/svgRasterExport';
import { buildRenderSceneFromReactFlow } from '../../rendering/reactFlowScene';

const buildScene = () => buildRenderSceneFromReactFlow([
  {
    id: 'node-a',
    position: { x: 0, y: 0 },
    data: { label: 'A' },
    measured: { width: 100, height: 60 },
  },
], [], { padding: 10 });

const installCanvasMock = (context: CanvasRenderingContext2D | null = {
  fillStyle: '',
  fillRect: vi.fn(),
  drawImage: vi.fn(),
} as unknown as CanvasRenderingContext2D) => {
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toDataURL: vi.fn(() => 'data:image/png;base64,aGVsbG8='),
  } as unknown as HTMLCanvasElement;
  const originalCreateElement = document.createElement.bind(document);
  const spy = vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
    if (String(tagName).toLowerCase() === 'canvas') return canvas;
    return originalCreateElement(tagName, options);
  });
  return { canvas, context, spy };
};

const installImageMock = (mode: 'load' | 'error' = 'load') => {
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private currentSrc = '';

    get src() {
      return this.currentSrc;
    }

    set src(value: string) {
      this.currentSrc = value;
      queueMicrotask(() => {
        if (mode === 'load') this.onload?.();
        else this.onerror?.();
      });
    }
  }

  vi.stubGlobal('Image', MockImage);
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('svgRasterExport', () => {
  it('rasterizes a render scene through deterministic SVG', async () => {
    installImageMock();
    const { canvas, context } = installCanvasMock();

    const dataUrl = await exportRenderSceneToPngDataUrl(buildScene(), { pixelRatio: 2, title: 'unit' });

    expect(dataUrl).toBe('data:image/png;base64,aGVsbG8=');
    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(160);
    expect(canvas.getContext).toHaveBeenCalledWith('2d');
    expect(context?.fillRect).toHaveBeenCalledTimes(1);
  });

  it('preserves a transparent PNG canvas when the background is disabled', async () => {
    installImageMock();
    const { context } = installCanvasMock();

    await exportRenderSceneToPngDataUrl(buildScene(), { includeBackground: false });

    expect(context?.fillRect).not.toHaveBeenCalled();
    expect(context?.drawImage).toHaveBeenCalledTimes(1);
  });

  it('rejects raster dimensions above the configured limits', async () => {
    installImageMock();
    installCanvasMock();

    await expect(
      exportRenderSceneToPngDataUrl(buildScene(), { pixelRatio: 3, maxPixels: 10 }),
    ).rejects.toMatchObject({
      code: 'SVG_RASTER_DIMENSION_LIMIT',
    });
  });

  it('fails with a structured error when canvas is unavailable', async () => {
    installImageMock();
    installCanvasMock(null);

    await expect(exportRenderSceneToPngDataUrl(buildScene())).rejects.toMatchObject({
      code: 'SVG_RASTER_CANVAS_UNAVAILABLE',
    });
  });

  it('fails with a structured error when the SVG image cannot load', async () => {
    installImageMock('error');
    installCanvasMock();

    await expect(exportRenderSceneToPngDataUrl(buildScene())).rejects.toMatchObject({
      code: 'SVG_RASTER_IMAGE_LOAD_FAILED',
      name: SvgRasterExportError.name,
    });
  });
});
