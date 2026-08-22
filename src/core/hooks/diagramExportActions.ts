import {
  getTargetDiagramElement,
  temporarilyHideElements,
  exportElementToPngDataUrl,
  buildExportFileName,
  exportFullDiagramToPngDataUrl,
  exportFullDiagramByAdjustingViewportToPngDataUrl,
  exportGifFrameWithAnimationClone,
  exportGifFramesWithAnimationCloneBatch,
  isSafeExportDataUrl,
  triggerDownload,
} from '../components/shared/exportUtils';
import { safeLog } from '../utils/consoleCleanup';
import { redactSensitiveLogValue } from '../utils/logSecurity';
import {
  buildRenderSceneFromGlobalReactFlow,
  buildRenderSceneFromReactFlowSnapshot,
  type ReactFlowRenderSnapshot,
} from '../rendering/reactFlowScene';
import { exportRenderSceneToSvgDataUrl } from '../export/svgExport';

export { isSafeExportDataUrl } from '../components/shared/exportUtils';

export type DiagramExportType = 'png' | 'pdf' | 'svg' | 'gif';
export type DiagramExportEventName =
  | 'diagramExportStart'
  | 'diagramExportProgress'
  | 'diagramExportComplete'
  | 'diagramExportError'
  | 'diagramExportCancelled';

export type DiagramExportEventDetail =
  | { diagramId: string; type: DiagramExportType }
  | { diagramId: string; type: 'gif'; progress: number; frameIndex?: number; frameCount?: number; stage?: 'capturing' | 'encoding' }
  | { diagramId: string; type: DiagramExportType; error: string };

export type DispatchExportEvent = (name: DiagramExportEventName, detail: DiagramExportEventDetail) => void;

interface ExportActionContext {
  diagramId: string;
  enableMainFlowAnimation?: boolean;
  dispatchExportEvent: DispatchExportEvent;
  yieldToPaint: () => Promise<void>;
  getReactFlowSnapshot?: () => ReactFlowRenderSnapshot | null | undefined;
  signal?: AbortSignal;
}

interface GifCreateResult {
  error?: boolean;
  errorCode?: string;
  errorMsg?: string;
  image?: string;
}

const CONTROLS_TO_HIDE = [
  '.react-flow__controls',
  '.react-flow__minimap',
  '.react-flow__background',
  '.mini-map',
  '.react-flow__minimap-container',
  '.diagram-controls',
  '.single-menu-toggle-floating',
  '.menu-toggle-floating',
  '.menu-toggle-btn',
];

const GIF_CONTROLS_TO_HIDE = [
  '.react-flow__controls',
  '.react-flow__minimap',
  '.react-flow__background',
  'svg.react-flow__background',
  '.mini-map',
  '.react-flow__minimap-container',
  '.diagram-controls',
  '.single-menu-toggle-floating',
  '.menu-toggle-floating',
  '.menu-toggle-btn',
];

export const serializeExportError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

export const createExportAbortError = (): Error => {
  const error = new Error('Export cancelled');
  error.name = 'AbortError';
  return error;
};

export const isExportAbortError = (error: unknown): boolean => (
  error instanceof Error && error.name === 'AbortError'
);

export const throwIfExportAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw createExportAbortError();
};

const handleExportActionFailure = (
  error: unknown,
  diagramId: string,
  type: DiagramExportType,
  dispatchExportEvent: DispatchExportEvent,
  logMessage: string,
  userMessage: string,
): void => {
  if (isExportAbortError(error)) {
    dispatchExportEvent('diagramExportCancelled', { diagramId, type });
    dispatchExportEvent('diagramExportError', { diagramId, type, error: 'export_cancelled' });
    throw error;
  }
  safeLog.error(logMessage, redactSensitiveLogValue(error));
  dispatchExportEvent('diagramExportError', { diagramId, type, error: serializeExportError(error) });
  alert(userMessage);
};

const downloadDataUrl = (href: string, fileName: string) => {
  if (!isSafeExportDataUrl(href)) {
    throw new Error('Unsafe export data URL');
  }
  triggerDownload(href, fileName);
};

const waitForImageLoad = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load export image'));
    img.src = src;
  });

export const exportDiagramToPNG = async ({
  diagramId,
  dispatchExportEvent,
  yieldToPaint,
  signal,
}: ExportActionContext) => {
  try {
    dispatchExportEvent('diagramExportStart', { diagramId, type: 'png' });
    await yieldToPaint();
    throwIfExportAborted(signal);
    const diagramElement = getTargetDiagramElement(diagramId);
    if (!diagramElement) {
      alert('无法找到要导出的架构图');
      dispatchExportEvent('diagramExportError', { diagramId, type: 'png', error: 'element_not_found' });
      return;
    }

    const dataUrl = await temporarilyHideElements(CONTROLS_TO_HIDE, async () =>
      exportFullDiagramByAdjustingViewportToPngDataUrl(diagramId, 40, 3)
    );

    throwIfExportAborted(signal);
    downloadDataUrl(dataUrl, buildExportFileName(diagramId, 'png'));
    dispatchExportEvent('diagramExportComplete', { diagramId, type: 'png' });
  } catch (error) {
    handleExportActionFailure(
      error, diagramId, 'png', dispatchExportEvent, '导出PNG失败:', '导出PNG失败，请稍后重试',
    );
  }
};

export const exportDiagramToPDF = async ({
  diagramId,
  dispatchExportEvent,
  yieldToPaint,
  signal,
}: ExportActionContext) => {
  try {
    dispatchExportEvent('diagramExportStart', { diagramId, type: 'pdf' });
    await yieldToPaint();
    throwIfExportAborted(signal);
    const diagramElement = getTargetDiagramElement(diagramId);
    if (!diagramElement) {
      alert('无法找到要导出的架构图');
      dispatchExportEvent('diagramExportError', { diagramId, type: 'pdf', error: 'element_not_found' });
      return;
    }

    const dataUrl = await temporarilyHideElements(CONTROLS_TO_HIDE, async () =>
      exportFullDiagramByAdjustingViewportToPngDataUrl(diagramId, 40, 3)
    );
    throwIfExportAborted(signal);
    if (!isSafeExportDataUrl(dataUrl)) throw new Error('Unsafe export data URL');

    const img = await waitForImageLoad(dataUrl);
    throwIfExportAborted(signal);
    const paddedWidth = img.naturalWidth;
    const paddedHeight = img.naturalHeight;
    const isPortrait = paddedHeight > paddedWidth;
    const { jsPDF } = await import('jspdf');
    throwIfExportAborted(signal);
    const pdf = new jsPDF({
      orientation: isPortrait ? 'portrait' : 'landscape',
      unit: 'px',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth() - 80;
    const pdfHeight = pdf.internal.pageSize.getHeight() - 80;
    const scale = Math.min(pdfWidth / paddedWidth, pdfHeight / paddedHeight);
    const scaledWidth = paddedWidth * scale;
    const scaledHeight = paddedHeight * scale;

    pdf.addImage(
      dataUrl,
      'PNG',
      (pdf.internal.pageSize.getWidth() - scaledWidth) / 2,
      (pdf.internal.pageSize.getHeight() - scaledHeight) / 2,
      scaledWidth,
      scaledHeight
    );

    throwIfExportAborted(signal);
    pdf.save(buildExportFileName(diagramId, 'pdf'));
    dispatchExportEvent('diagramExportComplete', { diagramId, type: 'pdf' });
  } catch (error) {
    handleExportActionFailure(
      error, diagramId, 'pdf', dispatchExportEvent, '导出PDF失败:', '导出PDF失败，请稍后重试',
    );
  }
};

export const exportDiagramToSVG = async ({
  diagramId,
  dispatchExportEvent,
  yieldToPaint,
  getReactFlowSnapshot,
  signal,
}: ExportActionContext) => {
  try {
    dispatchExportEvent('diagramExportStart', { diagramId, type: 'svg' });
    await yieldToPaint();
    throwIfExportAborted(signal);
    const diagramElement = getTargetDiagramElement(diagramId);
    if (!diagramElement) {
      alert('无法找到要导出的架构图');
      dispatchExportEvent('diagramExportError', { diagramId, type: 'svg', error: 'element_not_found' });
      return;
    }

    const svgDataUrl = await temporarilyHideElements(CONTROLS_TO_HIDE, async () => {
      const snapshot = getReactFlowSnapshot?.();
      const scene = snapshot
        ? buildRenderSceneFromReactFlowSnapshot(snapshot, { padding: 40 })
        : buildRenderSceneFromGlobalReactFlow({ padding: 40 });
      return exportRenderSceneToSvgDataUrl(scene, { title: diagramId });
    });

    throwIfExportAborted(signal);
    downloadDataUrl(svgDataUrl, buildExportFileName(diagramId, 'svg'));
    dispatchExportEvent('diagramExportComplete', { diagramId, type: 'svg' });
  } catch (error) {
    handleExportActionFailure(
      error, diagramId, 'svg', dispatchExportEvent, '导出SVG失败:', '导出SVG失败，请稍后重试',
    );
  }
};

const waitForExportFonts = async (diagramId: string) => {
  await new Promise(resolve => setTimeout(resolve, 300));

  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
      const forceReflow = () => {
        const container = document.querySelector(`#diagram-${diagramId}`);
        if (container) {
          void (container as HTMLElement).offsetHeight;
          void (container as HTMLElement).offsetWidth;
        }
      };

      forceReflow();
      await new Promise(resolve => setTimeout(resolve, 100));
      forceReflow();
      await new Promise(resolve => setTimeout(resolve, 100));
      return;
    } catch (error) {
      safeLog.warn('字体加载API不可用，使用回退方案:', redactSensitiveLogValue(error));
    }
  }

  await new Promise(resolve => setTimeout(resolve, 500));
};

export const exportDiagramToGIF = async ({
  diagramId,
  enableMainFlowAnimation = true,
  dispatchExportEvent,
  yieldToPaint,
  signal,
}: ExportActionContext) => {
  try {
    dispatchExportEvent('diagramExportStart', { diagramId, type: 'gif' });
    await yieldToPaint();
    throwIfExportAborted(signal);
    const diagramElement = getTargetDiagramElement(diagramId);
    if (!diagramElement) {
      alert('无法找到要导出的架构图');
      dispatchExportEvent('diagramExportError', { diagramId, type: 'gif', error: 'element_not_found' });
      return;
    }
    const { createGIF } = await import('gifshot');

    const fps = enableMainFlowAnimation ? 12 : 2;
    const totalFrames = enableMainFlowAnimation ? 24 : 3;
    const paddingPx = 32;

    const originalSizeFrame = await exportFullDiagramToPngDataUrl(diagramId, paddingPx, 1);
    throwIfExportAborted(signal);
    if (!isSafeExportDataUrl(originalSizeFrame)) throw new Error('Unsafe GIF source frame');
    const tempImg = await waitForImageLoad(originalSizeFrame);
    const originalWidth = tempImg.naturalWidth || tempImg.width;
    const originalHeight = tempImg.naturalHeight || tempImg.height;
    const maxGifSide = Math.min(2000, Math.max(originalWidth, originalHeight));
    const scale = Math.min(1, maxGifSide / Math.max(originalWidth, originalHeight));
    const targetWidth = Math.round(originalWidth * scale);
    const targetHeight = Math.round(originalHeight * scale);

    await waitForExportFonts(diagramId);
    throwIfExportAborted(signal);

    const frames: string[] = await temporarilyHideElements(GIF_CONTROLS_TO_HIDE, async () => {
      try {
        return await exportGifFramesWithAnimationCloneBatch(
          diagramId,
          paddingPx,
          2.25,
          totalFrames,
          (fi, tf) => {
            const progress = fi / tf;
            dispatchExportEvent('diagramExportProgress', {
              diagramId,
              type: 'gif',
              progress: progress * 0.8,
              frameIndex: fi - 1,
              frameCount: tf,
              stage: 'capturing',
            });
          },
          signal,
        );
      } catch (e) {
        safeLog.warn('批量离屏克隆方案失败，回退到逐帧克隆方案：', redactSensitiveLogValue(e));
        const capturedFrames: string[] = [];
        for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
          throwIfExportAborted(signal);
          let frame: string;
          try {
            frame = await exportGifFrameWithAnimationClone(
              diagramId, paddingPx, 2.25, frameIndex, totalFrames, signal,
            );
          } catch (_) {
            frame = await exportElementToPngDataUrl(diagramElement, paddingPx, 2.25);
          }
          capturedFrames.push(frame);
          const progress = (frameIndex + 1) / totalFrames;
          dispatchExportEvent('diagramExportProgress', {
            diagramId,
            type: 'gif',
            progress: progress * 0.8,
            frameIndex,
            frameCount: totalFrames,
            stage: 'capturing',
          });
        }
        return capturedFrames;
      }
    });
    throwIfExportAborted(signal);
    const safeFrames = frames.filter(isSafeExportDataUrl);
    if (safeFrames.length === 0) {
      throw new Error('No safe GIF frames captured');
    }

    await new Promise<void>((resolve, reject) => {
      const loadedImages: HTMLImageElement[] = [];
      let imagesLoaded = 0;
      let settled = false;
      const handleAbort = () => {
        if (settled) return;
        settled = true;
        reject(createExportAbortError());
      };
      const settleResolve = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', handleAbort);
        resolve();
      };
      signal?.addEventListener('abort', handleAbort, { once: true });
      if (signal?.aborted) handleAbort();

      const encodeGif = (width: number, height: number, attempt: number, fallbackMaxSide: number) => {
        if (settled) return;
        createGIF({
          images: loadedImages,
          interval: 1 / fps,
          gifWidth: width,
          gifHeight: height,
          numWorkers: 3,
          sampleInterval: 4,
          quality: 9,
          dither: false,
          transparent: false,
          crossOrigin: 'Anonymous',
          progressCallback: (captureProgress: number) => {
            if (settled) return;
            dispatchExportEvent('diagramExportProgress', {
              diagramId,
              type: 'gif',
              progress: 0.8 + (captureProgress * 0.2),
              stage: 'encoding',
            });
          },
        }, (obj: GifCreateResult) => {
          if (settled) return;
          if (obj.error || !obj.image) {
            safeLog.warn(`GIF 创建失败（第${attempt}次）：`, obj.errorMsg || obj.errorCode);
            if (attempt === 1) {
              const fallbackScale = Math.min(1, fallbackMaxSide / Math.max(targetWidth, targetHeight));
              const fallbackW = Math.max(1, Math.round(targetWidth * fallbackScale));
              const fallbackH = Math.max(1, Math.round(targetHeight * fallbackScale));
              encodeGif(fallbackW, fallbackH, 2, fallbackMaxSide);
              return;
            }
            dispatchExportEvent('diagramExportError', {
              diagramId,
              type: 'gif',
              error: obj.errorMsg || obj.errorCode || 'gif_create_failed',
            });
            alert('导出GIF失败，请稍后重试');
            settleResolve();
            return;
          }
          downloadDataUrl(obj.image, buildExportFileName(diagramId, 'gif'));
          dispatchExportEvent('diagramExportComplete', { diagramId, type: 'gif' });
          settleResolve();
        });
      };

      safeFrames.forEach((frameDataUrl, index) => {
        const img = new Image();
        img.onload = () => {
          if (settled) return;
          loadedImages[index] = img;
          imagesLoaded++;
          if (imagesLoaded === safeFrames.length) {
            encodeGif(targetWidth, targetHeight, 1, 1500);
          }
        };
        img.onerror = () => {
          if (settled) return;
          safeLog.warn(`帧 ${index} 加载失败`);
          imagesLoaded++;
          if (imagesLoaded === safeFrames.length && loadedImages.length > 0) {
            encodeGif(targetWidth, targetHeight, 1, 900);
          }
        };
        img.src = frameDataUrl;
      });
    });
  } catch (error) {
    handleExportActionFailure(
      error, diagramId, 'gif', dispatchExportEvent, '导出GIF失败:', '导出GIF失败，请稍后重试',
    );
  }
};
