import { normalizeExportPixelRatio } from './exportUtilsBoundary';

/**
 * 导出元素为 PNG 数据URL，统一白色背景并提升像素比，避免导出过小。
 * @param element - 要导出的 HTML 元素
 * @param paddingPx - 导出图像内边距（像素）
 * @param pixelRatio - 像素比（默认 2，建议 3 用于高清）
 */
export const exportElementToPngDataUrl = async (element: HTMLElement, paddingPx = 40, pixelRatio: number = 2) => {
  const safePixelRatio = normalizeExportPixelRatio(pixelRatio);
  return (await import('html-to-image')).toPng(element, {
    backgroundColor: '#ffffff',
    quality: 1.0,
    pixelRatio: safePixelRatio,
    cacheBust: true,
    style: { padding: `${paddingPx}px`, backgroundColor: '#ffffff', overflow: 'visible' }
  });
};
/**
 * 导出元素为SVG数据URL
 * @param element - 要导出的HTML元素
 * @param paddingPx - 内边距像素值
 * @returns SVG数据URL
 */
export const exportElementToSvgDataUrl = async (element: HTMLElement, paddingPx = 40) => {
  return (await import('html-to-image')).toSvg(element, {
    backgroundColor: '#ffffff',
    quality: 1.0,
    pixelRatio: 2,
    cacheBust: true,
    style: { padding: `${paddingPx}px`, backgroundColor: '#ffffff', overflow: 'visible' }
  });
};
