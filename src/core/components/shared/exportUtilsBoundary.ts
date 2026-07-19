import { sanitizeDownloadFileName } from '../../utils/downloadUtils';

const MAX_EXPORT_SIDE_PX = 12_000;
const MAX_RASTER_EXPORT_PIXELS = 36_000_000;
export const MAX_GIF_EXPORT_PIXELS = 14_000_000;
const MAX_GIF_FRAMES = 24;
const MAX_EXPORT_DATA_URL_CHARS = 64 * 1024 * 1024;
const MAX_EXPORT_PIXEL_BUDGET = MAX_EXPORT_SIDE_PX * MAX_EXPORT_SIDE_PX * 4;
const SAFE_EXPORT_EXTENSIONS = new Set<ExportFileExtension>(['png', 'pdf', 'svg', 'gif', 'json', 'jpg']);

const SAFE_RASTER_EXPORT_DATA_URL = /^data:image\/(?:png|gif);base64,[a-z0-9+/=\s]+$/i;
const SAFE_SVG_DATA_URL_PREFIX = /^data:image\/svg\+xml(?:;charset=[\w-]+)?(?:;base64)?,/i;
const UNSAFE_SVG_MARKUP = /<(?:script|iframe|object|embed|link|meta)\b|(?:^|[\s<])on[a-z]+\s*=|javascript\s*:|data\s*:\s*text\/html/i;

export interface NormalizedExportBounds {
  width: number;
  height: number;
  pixelRatio: number;
}

export const normalizeExportPixelRatio = (pixelRatio: number, maxPixelRatio = 3): number => {
  const safeMaxPixelRatio = Number.isFinite(maxPixelRatio) && maxPixelRatio > 0
    ? Math.min(8, Math.max(0.5, maxPixelRatio))
    : 3;
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) return 1;
  return Math.min(safeMaxPixelRatio, Math.max(0.5, pixelRatio));
};

export const normalizeRasterExportBounds = (
  width: number,
  height: number,
  pixelRatio: number,
  maxPixels = MAX_RASTER_EXPORT_PIXELS
): NormalizedExportBounds => {
  const safeMaxPixels = Number.isFinite(maxPixels) && maxPixels > 0
    ? Math.min(MAX_EXPORT_PIXEL_BUDGET, Math.floor(maxPixels))
    : MAX_RASTER_EXPORT_PIXELS;
  const safeWidth = Math.ceil(width);
  const safeHeight = Math.ceil(height);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight) || safeWidth <= 0 || safeHeight <= 0) {
    throw new Error('Invalid export dimensions');
  }
  if (safeWidth > MAX_EXPORT_SIDE_PX || safeHeight > MAX_EXPORT_SIDE_PX) {
    throw new Error(`Export dimensions exceed ${MAX_EXPORT_SIDE_PX}px limit`);
  }

  const normalizedRatio = normalizeExportPixelRatio(pixelRatio);
  const rawPixels = safeWidth * safeHeight * normalizedRatio * normalizedRatio;
  if (rawPixels <= safeMaxPixels) {
    return { width: safeWidth, height: safeHeight, pixelRatio: normalizedRatio };
  }

  const reducedRatio = Math.max(0.5, Math.sqrt(safeMaxPixels / (safeWidth * safeHeight)));
  if (safeWidth * safeHeight * reducedRatio * reducedRatio > safeMaxPixels) {
    throw new Error(`Export area exceeds ${safeMaxPixels} pixel limit`);
  }
  return { width: safeWidth, height: safeHeight, pixelRatio: Math.min(normalizedRatio, reducedRatio) };
};

export const normalizeGifFrameCount = (totalFrames: number): number => {
  if (!Number.isFinite(totalFrames) || totalFrames <= 0) return 1;
  return Math.min(MAX_GIF_FRAMES, Math.max(1, Math.floor(totalFrames)));
};

const decodeSvgDataUrl = (href: string): string | null => {
  const prefix = SAFE_SVG_DATA_URL_PREFIX.exec(href);
  if (!prefix) return null;
  const payload = href.slice(prefix[0].length);
  if (!payload) return null;

  try {
    if (/;base64,/i.test(prefix[0])) {
      return atob(payload.replace(/\s+/g, ''));
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
};

export const isSafeExportDataUrl = (href: unknown): href is string => {
  if (typeof href !== 'string' || href.length > MAX_EXPORT_DATA_URL_CHARS) return false;
  if (SAFE_RASTER_EXPORT_DATA_URL.test(href)) return true;

  const svgMarkup = decodeSvgDataUrl(href);
  if (!svgMarkup || UNSAFE_SVG_MARKUP.test(svgMarkup)) return false;
  return /^\s*(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(svgMarkup);
};


export type ExportFileExtension = 'png' | 'pdf' | 'svg' | 'gif' | 'json' | 'jpg';

export const buildExportFileName = (diagramId: string | undefined, ext: ExportFileExtension) => {
  const base = sanitizeDownloadFileName(diagramId && diagramId.trim() ? diagramId.trim() : 'diagram', 'diagram', 80);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeExtension = SAFE_EXPORT_EXTENSIONS.has(ext) ? ext : 'png';
  return `${base}_${ts}.${safeExtension}`;
};

/**
 * 触发基于 Data URL 的浏览器下载
 */
export const triggerDownload = (dataUrl: string, fileName: string) => {
  if (!isSafeExportDataUrl(dataUrl)) {
    throw new Error('Unsafe export data URL');
  }
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = sanitizeDownloadFileName(fileName);
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
};
