import { logDiagramExportProgressCallbackFailure } from '../../hooks/diagramExportLogging';
import {
  MAX_GIF_EXPORT_PIXELS,
  normalizeGifFrameCount,
  normalizeRasterExportBounds,
} from './exportUtilsBoundary';
import {
  computeDiagramBBox,
  computeDomBBox,
  computeHeaderOffset,
  getTargetDiagramElement,
} from './exportUtilsDom';
import { exportElementToPngDataUrl } from './exportUtilsElement';

export const throwIfGifExportAborted = (signal?: AbortSignal): void => {
  if (!signal?.aborted) return;
  const error = new Error('Export cancelled');
  error.name = 'AbortError';
  throw error;
};

/**
 * 专门用于 GIF 导出的帧捕获函数，强制应用 CSS 动画状态
 * 通过修改 SVG 路径的 stroke-dashoffset 来模拟动画效果
 * @param diagramId 图表实例ID
 * @param paddingPx 导出边距
 * @param pixelRatio 像素比
 * @param frameIndex 当前帧索引（用于动画进度计算）
 * @param totalFrames 总帧数
 */


/**
 * 导出 GIF 帧（CSS 原生方案，离屏克隆）
 * 函数级注释：
 * - 目的：回到纯 CSS 的视觉生成，不进行 Canvas 叠加，避免“拼凑痕迹”。
 * - 方法：将图容器克隆到离屏，统一视口与尺寸，在克隆中对 animated 边按帧设置 stroke-dasharray 与 stroke-dashoffset，禁用 CSS 动画，直接一次性截图。
 * - 优势：只绘制一次（无叠加），不依赖运行时动画捕获，视觉干净稳定。
 * - 注意：保留类名以沿用主题的颜色与粗细，但通过 inline 样式禁用动画并强制虚线与偏移。
 */
export async function exportGifFrameWithAnimationClone(
  diagramId: string,
  paddingPx: number = 40,
  pixelRatio: number = 2,
  frameIndex: number = 0,
  totalFrames: number = 10,
  signal?: AbortSignal,
): Promise<string> {
  throwIfGifExportAborted(signal);
  const diagramElement = getTargetDiagramElement(diagramId);
  if (!diagramElement) throw new Error('未找到架构图容器');

  const bbox = computeDiagramBBox() || computeDomBBox(diagramElement);
  if (!bbox) {
    // 没有包围盒时直接导出当前容器
    return exportElementToPngDataUrl(diagramElement, paddingPx, pixelRatio);
  }

  const { minX, minY, width, height } = bbox;
  const headerOffset = computeHeaderOffset(diagramElement);
  const safeTotalFrames = normalizeGifFrameCount(totalFrames);
  const bounds = normalizeRasterExportBounds(width + paddingPx * 2, height + paddingPx * 2 + headerOffset, pixelRatio, MAX_GIF_EXPORT_PIXELS);
  const exportWidth = bounds.width;
  const exportHeight = bounds.height;

  // 离屏容器
  const offscreen = document.createElement('div');
  offscreen.style.position = 'fixed';
  offscreen.style.left = '-10000px';
  offscreen.style.top = '-10000px';
  offscreen.style.width = `${exportWidth}px`;
  offscreen.style.height = `${exportHeight}px`;
  offscreen.style.background = '#ffffff';
  offscreen.style.zIndex = '0';
  offscreen.style.overflow = 'visible';
  document.body.appendChild(offscreen);

  // 克隆容器
  const clone = diagramElement.cloneNode(true) as HTMLElement;
  clone.style.width = `${exportWidth}px`;
  clone.style.height = `${exportHeight}px`;
  clone.style.overflow = 'visible';
  offscreen.appendChild(clone);

  // 同步克隆内的根与渲染器尺寸
  const cloneReactFlow = clone.classList.contains('react-flow')
    ? (clone as HTMLElement)
    : (clone.querySelector('.react-flow') as HTMLElement | null);
  if (cloneReactFlow) {
    cloneReactFlow.style.width = `${exportWidth}px`;
    cloneReactFlow.style.height = `${Math.ceil(height + paddingPx * 2)}px`;
    cloneReactFlow.style.overflow = 'visible';
    if (headerOffset > 0) cloneReactFlow.style.flex = 'none';
  }
  const cloneRenderer = clone.querySelector('svg.react-flow__renderer') as SVGSVGElement | null;
  if (cloneRenderer) {
    cloneRenderer.setAttribute('width', String(exportWidth));
    cloneRenderer.setAttribute('height', String(Math.ceil(height + paddingPx * 2)));
    cloneRenderer.style.overflow = 'visible';
  }

  // 隐藏不需要的 UI
  const hideSelectors = [
    '.react-flow__controls',
    '.react-flow__minimap',
    '.react-flow__background',
    'svg.react-flow__background',
    '.mini-map',
    '.react-flow__minimap-container',
    '.diagram-controls',
    '.single-menu-toggle-floating',
    '.menu-toggle-floating',
    '.menu-toggle-btn'
  ];
  hideSelectors.forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => {
      if (el instanceof HTMLElement) el.style.display = 'none';
    });
  });

  // 平移视口至内容左上角 + 边距
  const cloneViewport = clone.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (cloneViewport) {
    cloneViewport.style.transform = `translate(${paddingPx - minX}px, ${paddingPx - minY}px) scale(1)`;
    cloneViewport.style.overflow = 'visible';
  }

  // 在克隆中定位 animated 边，禁用 CSS 动画并按帧设置 dash 样式与偏移
  const animatedNodeList = clone.querySelectorAll(
    '.edge-animated, .react-flow__edge.animated path, .react-flow__edge-path.animated, .smart-edge.animated'
  );
  const uniquePaths = new Set<SVGPathElement>();
  animatedNodeList.forEach((el) => {
    let pathEl: SVGPathElement | null = null;
    if (el instanceof SVGPathElement) {
      pathEl = el;
    } else if (el instanceof SVGElement) {
      pathEl = el.querySelector('path') as SVGPathElement | null;
      // 禁用容器级 CSS 动画，防止样式干扰
      (el as SVGElement).style.animation = 'none';
      (el as SVGElement).style.transition = 'none';
    }
    if (!pathEl) return;
    uniquePaths.add(pathEl);
  });

  uniquePaths.forEach((pathEl) => {
    const cs = getComputedStyle(pathEl);
    const stroke = pathEl.style.stroke || cs.stroke || '#2563eb';
    const strokeWidth = parseFloat(pathEl.style.strokeWidth || cs.strokeWidth || '3') || 3;
    const dashStr = pathEl.style.strokeDasharray || cs.strokeDasharray || '6 3';
    const dashArr = dashStr.split(/[ ,]+/).map(v => parseFloat(v)).filter(v => !Number.isNaN(v) && v > 0);
    const dashArray = (dashArr.length ? dashArr : [6, 3]);

    // 计算无缝循环的虚线周期（dash 周期 = 所有段长度之和）
    const dashPeriod = dashArray.reduce((sum, v) => sum + v, 0) || 9;
    // 为保证首尾无缝，使用 (totalFrames - 1) 作为分母，使最后一帧恰好位于整周期位置
    const framesDenom = (safeTotalFrames > 1) ? (safeTotalFrames - 1) : 1;
    // 在一个 GIF 中走过的周期数（可调速）。选择 6 周期以匹配 CSS 视觉速度（约 20px/s）
    const cycles = 6;
    const progress = frameIndex / framesDenom;
    const dashOffset = -(dashPeriod * cycles) * progress;

    // 禁用 path 自身动画，强制使用我们设置的虚线与偏移
    pathEl.style.animation = 'none';
    pathEl.style.transition = 'none';
    pathEl.style.stroke = stroke;
    pathEl.style.strokeWidth = String(strokeWidth);
    pathEl.style.strokeDasharray = dashArray.join(' ');
    pathEl.style.strokeDashoffset = String(dashOffset);
    pathEl.style.fill = 'none';
    pathEl.style.strokeLinecap = 'round';
    pathEl.style.strokeLinejoin = 'round';
  });

  try {
    const target = clone;
    const dataUrl = await (await import('html-to-image')).toPng(target, {
      backgroundColor: '#ffffff',
      quality: 1.0,
      pixelRatio: bounds.pixelRatio,
      cacheBust: true,
      width: exportWidth,
      height: exportHeight,
      style: { backgroundColor: '#ffffff', overflow: 'visible', padding: '0' }
    });
    throwIfGifExportAborted(signal);
    return dataUrl;
  } finally {
    offscreen.remove();
  }
}
/**
 * 导出 GIF 多帧（CSS 原生方案，离屏克隆批量）
 * 函数级注释：
 * - 目的：减少每帧克隆与选择器遍历的开销，提升总导出效率；视觉保持纯 CSS、无叠加痕迹。
 * - 方法：只克隆一次图容器至离屏，预选 animated 路径及其样式元数据；逐帧仅更新 dashoffset 并截图。
 * - 优势：避免重复克隆 DOM 与重复查找节点；降低 html-to-image 的序列化成本；整体性能显著提升。
 * - 注意：禁用克隆中的 CSS 动画，统一使用我们计算的周期偏移；保持主题色与线宽。
 */
export async function exportGifFramesWithAnimationCloneBatch(
  diagramId: string,
  paddingPx: number = 40,
  pixelRatio: number = 3,
  totalFrames: number = 24,
  onProgress?: (frameIndex: number, totalFrames: number) => void,
  signal?: AbortSignal,
): Promise<string[]> {
  throwIfGifExportAborted(signal);
  const diagramElement = getTargetDiagramElement(diagramId);
  if (!diagramElement) throw new Error('未找到架构图容器');

  const bbox = computeDiagramBBox() || computeDomBBox(diagramElement);
  if (!bbox) {
    // 无包围盒：退化为单帧导出
    const single = await exportElementToPngDataUrl(diagramElement, paddingPx, pixelRatio);
    return [single];
  }

  const { minX, minY, width, height } = bbox;
  const headerOffset = computeHeaderOffset(diagramElement);
  const safeTotalFrames = normalizeGifFrameCount(totalFrames);
  const bounds = normalizeRasterExportBounds(width + paddingPx * 2, height + paddingPx * 2 + headerOffset, pixelRatio, MAX_GIF_EXPORT_PIXELS);
  const exportWidth = bounds.width;
  const exportHeight = bounds.height;

  // 离屏容器
  const offscreen = document.createElement('div');
  offscreen.style.position = 'fixed';
  offscreen.style.left = '-10000px';
  offscreen.style.top = '-10000px';
  offscreen.style.width = `${exportWidth}px`;
  offscreen.style.height = `${exportHeight}px`;
  offscreen.style.background = '#ffffff';
  offscreen.style.zIndex = '0';
  offscreen.style.overflow = 'visible';
  document.body.appendChild(offscreen);

  try {
    // 克隆一次
    const clone = diagramElement.cloneNode(true) as HTMLElement;
    clone.style.width = `${exportWidth}px`;
    clone.style.height = `${exportHeight}px`;
    clone.style.overflow = 'visible';
    offscreen.appendChild(clone);

    const cloneReactFlow = clone.classList.contains('react-flow')
      ? (clone as HTMLElement)
      : (clone.querySelector('.react-flow') as HTMLElement | null);
    if (cloneReactFlow) {
      cloneReactFlow.style.width = `${exportWidth}px`;
      cloneReactFlow.style.height = `${Math.ceil(height + paddingPx * 2)}px`;
      cloneReactFlow.style.overflow = 'visible';
      if (headerOffset > 0) cloneReactFlow.style.flex = 'none';
    }
    const cloneRenderer = clone.querySelector('svg.react-flow__renderer') as SVGSVGElement | null;
    if (cloneRenderer) {
      cloneRenderer.setAttribute('width', String(exportWidth));
      cloneRenderer.setAttribute('height', String(Math.ceil(height + paddingPx * 2)));
      cloneRenderer.style.overflow = 'visible';
    }

    // 隐藏不需要的 UI
    const hideSelectors = [
      '.react-flow__controls',
      '.react-flow__minimap',
      '.react-flow__background',
      'svg.react-flow__background',
      '.mini-map',
      '.react-flow__minimap-container',
      '.diagram-controls',
      '.single-menu-toggle-floating',
      '.menu-toggle-floating',
      '.menu-toggle-btn'
    ];
    hideSelectors.forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => {
        if (el instanceof HTMLElement) el.style.display = 'none';
      });
    });

    // 平移视口至内容左上角 + 边距
    const cloneViewport = clone.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (cloneViewport) {
      cloneViewport.style.transform = `translate(${paddingPx - minX}px, ${paddingPx - minY}px) scale(1)`;
      cloneViewport.style.overflow = 'visible';
    }

    // 预选 animated 路径及其样式元数据
    const animatedNodeList = clone.querySelectorAll(
      '.edge-animated, .react-flow__edge.animated path, .react-flow__edge-path.animated, .smart-edge.animated'
    );
    const uniquePaths = new Set<SVGPathElement>();
    animatedNodeList.forEach((el) => {
      let pathEl: SVGPathElement | null = null;
      if (el instanceof SVGPathElement) {
        pathEl = el;
      } else if (el instanceof SVGElement) {
        pathEl = el.querySelector('path') as SVGPathElement | null;
        (el as SVGElement).style.animation = 'none';
        (el as SVGElement).style.transition = 'none';
      }
      if (pathEl) uniquePaths.add(pathEl);
    });

    const pathMeta: Array<{ path: SVGPathElement; stroke: string; strokeWidth: number; dashArray: number[]; dashPeriod: number }> = [];
    uniquePaths.forEach((pathEl) => {
      const cs = getComputedStyle(pathEl);
      const stroke = pathEl.style.stroke || cs.stroke || '#2563eb';
      const strokeWidth = parseFloat(pathEl.style.strokeWidth || cs.strokeWidth || '3') || 3;
      const dashStr = pathEl.style.strokeDasharray || cs.strokeDasharray || '6 3';
      const dashArr = dashStr.split(/[ ,]+/).map(v => parseFloat(v)).filter(v => !Number.isNaN(v) && v > 0);
      const dashArray = (dashArr.length ? dashArr : [6, 3]);
      const dashPeriod = dashArray.reduce((sum, v) => sum + v, 0) || 9;
      pathMeta.push({ path: pathEl, stroke, strokeWidth, dashArray, dashPeriod });
    });

    const frames: string[] = [];
    const framesDenom = (safeTotalFrames > 1) ? (safeTotalFrames - 1) : 1;
    const cycles = 6;

    for (let frameIndex = 0; frameIndex < safeTotalFrames; frameIndex++) {
      throwIfGifExportAborted(signal);
      const progress = frameIndex / framesDenom;
      // 更新每条路径偏移与基础样式
      pathMeta.forEach(({ path, stroke, strokeWidth, dashArray, dashPeriod }) => {
        path.style.animation = 'none';
        path.style.transition = 'none';
        path.style.stroke = stroke;
        path.style.strokeWidth = String(strokeWidth);
        path.style.strokeDasharray = dashArray.join(' ');
        path.style.strokeDashoffset = String(-(dashPeriod * cycles) * progress);
        path.style.fill = 'none';
        path.style.strokeLinecap = 'round';
        path.style.strokeLinejoin = 'round';
      });

      const target = clone;
      const dataUrl = await (await import('html-to-image')).toPng(target, {
        backgroundColor: '#ffffff',
        quality: 1.0,
        pixelRatio: bounds.pixelRatio,
        cacheBust: false,
        width: exportWidth,
        height: exportHeight,
        style: { backgroundColor: '#ffffff', overflow: 'visible', padding: '0' }
      });
      throwIfGifExportAborted(signal);
      frames.push(dataUrl);
      // 逐帧进度回调，便于外部更新进度条
      if (onProgress) {
        try { onProgress(frameIndex + 1, safeTotalFrames); } catch (error) { logDiagramExportProgressCallbackFailure(error); }
      }
      // 让浏览器有机会刷新 UI（避免长任务阻塞进度条）
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    return frames;
  } finally {
    offscreen.remove();
  }
}
