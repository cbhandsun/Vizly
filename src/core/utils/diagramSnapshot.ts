import type { StandardDiagramData } from '../models/DiagramModels';
import { exportFullDiagramToPngDataUrl } from '../components/shared/exportUtils';

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
};

const resizeToJpegDataUrl = async (
  pngDataUrl: string,
  opts: { maxWidth: number; maxHeight: number; quality: number }
): Promise<{ dataUrl: string; width: number; height: number }> => {
  const img = await loadImage(pngDataUrl);
  const srcW = Math.max(1, img.naturalWidth || img.width || 1);
  const srcH = Math.max(1, img.naturalHeight || img.height || 1);

  const scale = Math.min(1, opts.maxWidth / srcW, opts.maxHeight / srcH);
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, outW, outH);

  const dataUrl = canvas.toDataURL('image/jpeg', Math.min(1, Math.max(0.1, opts.quality)));
  return { dataUrl, width: outW, height: outH };
};

export const tryAttachDiagramSnapshot = async (
  diagram: StandardDiagramData,
  renderDiagramId: string,
  opts?: { maxWidth?: number; maxHeight?: number; quality?: number; paddingPx?: number; pixelRatio?: number }
): Promise<{ diagram: StandardDiagramData; warning?: string }> => {
  const maxWidth = opts?.maxWidth ?? 3840;
  const maxHeight = opts?.maxHeight ?? 2160;
  const quality = opts?.quality ?? 0.8;
  const paddingPx = opts?.paddingPx ?? 16;
  const pixelRatio = opts?.pixelRatio ?? 3;

  try {
    const png = await exportFullDiagramToPngDataUrl(renderDiagramId, paddingPx, pixelRatio);
    const resized = await resizeToJpegDataUrl(png, { maxWidth, maxHeight, quality });
    const next: StandardDiagramData = {
      ...diagram,
      metadata: {
        ...(diagram.metadata || {}),
        preview: {
          mime: 'image/jpeg',
          dataUrl: resized.dataUrl,
          width: resized.width,
          height: resized.height,
          generatedAt: new Date().toISOString()
        }
      }
    };
    return { diagram: next };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { diagram, warning: msg || 'snapshot failed' };
  }
};

