import type { DiagramRenderScene } from '../rendering/types';
import { exportRenderSceneToSvg, type SvgExportOptions } from './svgExport';

const DEFAULT_MAX_RASTER_SIDE = 12_000;
const DEFAULT_MAX_RASTER_PIXELS = 36_000_000;
const DEFAULT_IMAGE_TIMEOUT_MS = 10_000;
const MAX_PIXEL_RATIO = 3;

export type SvgRasterExportErrorCode =
  | 'SVG_RASTER_BROWSER_UNAVAILABLE'
  | 'SVG_RASTER_DIMENSION_LIMIT'
  | 'SVG_RASTER_CANVAS_UNAVAILABLE'
  | 'SVG_RASTER_IMAGE_LOAD_FAILED';

export class SvgRasterExportError extends Error {
  constructor(
    public readonly code: SvgRasterExportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SvgRasterExportError';
  }
}

export interface SvgRasterExportOptions extends SvgExportOptions {
  pixelRatio?: number;
  maxSidePx?: number;
  maxPixels?: number;
  imageTimeoutMs?: number;
}

interface RasterBounds {
  width: number;
  height: number;
  pixelRatio: number;
}

const normalizePixelRatio = (pixelRatio: unknown): number => {
  if (typeof pixelRatio !== 'number' || !Number.isFinite(pixelRatio) || pixelRatio <= 0) return 1;
  return Math.min(MAX_PIXEL_RATIO, Math.max(0.5, pixelRatio));
};

const normalizeRasterBounds = (scene: DiagramRenderScene, options: SvgRasterExportOptions): RasterBounds => {
  const width = Math.ceil(scene.bounds.width);
  const height = Math.ceil(scene.bounds.height);
  const maxSidePx = options.maxSidePx ?? DEFAULT_MAX_RASTER_SIDE;
  const maxPixels = options.maxPixels ?? DEFAULT_MAX_RASTER_PIXELS;
  const pixelRatio = normalizePixelRatio(options.pixelRatio);

  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
    || width > maxSidePx
    || height > maxSidePx
    || width * height * pixelRatio * pixelRatio > maxPixels
  ) {
    throw new SvgRasterExportError('SVG_RASTER_DIMENSION_LIMIT', 'SVG raster dimensions exceed limit');
  }

  return { width, height, pixelRatio };
};

const assertBrowserRasterApis = () => {
  if (
    typeof window === 'undefined'
    || typeof window.setTimeout !== 'function'
    || typeof window.clearTimeout !== 'function'
    || typeof document === 'undefined'
    || typeof Image === 'undefined'
  ) {
    throw new SvgRasterExportError('SVG_RASTER_BROWSER_UNAVAILABLE', 'SVG raster export requires browser APIs');
  }
};

const loadSvgImage = (dataUrl: string, timeoutMs: number): Promise<HTMLImageElement> => (
  new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => {
      reject(new SvgRasterExportError('SVG_RASTER_IMAGE_LOAD_FAILED', 'SVG raster image load timed out'));
    }, timeoutMs);

    image.onload = () => {
      window.clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new SvgRasterExportError('SVG_RASTER_IMAGE_LOAD_FAILED', 'SVG raster image load failed'));
    };
    image.src = dataUrl;
  })
);

export const exportRenderSceneToPngDataUrl = async (
  scene: DiagramRenderScene,
  options: SvgRasterExportOptions = {},
): Promise<string> => {
  assertBrowserRasterApis();
  const bounds = normalizeRasterBounds(scene, options);
  const svg = exportRenderSceneToSvg(scene, options);
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = await loadSvgImage(svgDataUrl, options.imageTimeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(bounds.width * bounds.pixelRatio);
  canvas.height = Math.ceil(bounds.height * bounds.pixelRatio);

  const context = canvas.getContext('2d');
  if (!context) {
    throw new SvgRasterExportError('SVG_RASTER_CANVAS_UNAVAILABLE', 'Canvas 2D context is unavailable');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
};
