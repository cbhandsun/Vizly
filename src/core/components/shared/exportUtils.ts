import {
  buildExportFileName,
  triggerDownload,
} from './exportUtilsBoundary';
import {
  exportFullDiagramToPngDataUrl,
  exportFullDiagramToSvgDataUrl,
} from './exportUtilsClone';

export type { ExportFileExtension, NormalizedExportBounds } from './exportUtilsBoundary';
export {
  buildExportFileName,
  isSafeExportDataUrl,
  normalizeExportPixelRatio,
  normalizeGifFrameCount,
  normalizeRasterExportBounds,
  triggerDownload,
} from './exportUtilsBoundary';
export {
  getTargetDiagramElement,
  temporarilyHideElements,
} from './exportUtilsDom';
export {
  exportElementToPngDataUrl,
  exportElementToPngDataUrl as _exportElementToPngDataUrl,
  exportElementToSvgDataUrl,
  exportElementToSvgDataUrl as _exportElementToSvgDataUrl,
} from './exportUtilsElement';
export {
  exportFullDiagramToPngDataUrl,
  exportFullDiagramToSvgDataUrl,
} from './exportUtilsClone';
export {
  exportGifFrameWithAnimationClone,
  exportGifFramesWithAnimationCloneBatch,
  throwIfGifExportAborted,
} from './exportUtilsGif';
export {
  exportFullDiagramByAdjustingViewportToPngDataUrl,
  exportFullDiagramByAdjustingViewportToSvgDataUrl,
} from './exportUtilsViewport';

export async function downloadPngDiagram(diagramId: string, paddingPx = 40, pixelRatio: number = 3) {
  const dataUrl = await exportFullDiagramToPngDataUrl(diagramId, paddingPx, pixelRatio);
  triggerDownload(dataUrl, buildExportFileName(diagramId, 'png'));
}

export async function downloadSvgDiagram(diagramId: string, paddingPx = 40) {
  const dataUrl = await exportFullDiagramToSvgDataUrl(diagramId, paddingPx);
  triggerDownload(dataUrl, buildExportFileName(diagramId, 'svg'));
}
