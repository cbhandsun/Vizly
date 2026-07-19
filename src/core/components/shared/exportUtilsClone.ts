import { normalizeRasterExportBounds } from './exportUtilsBoundary';
import {
  computeDiagramBBox,
  computeDomBBox,
  computeHeaderOffset,
  getTargetDiagramElement,
} from './exportUtilsDom';
import {
  exportElementToPngDataUrl,
  exportElementToSvgDataUrl,
} from './exportUtilsElement';

/**
 * 导出“完整架构图”为 PNG 数据URL。
 * 核心思路：离屏克隆 React Flow 容器，依据节点包围盒重设 viewport 的 transform，
 * 令整张图内容在克隆容器内完整可见，再用 html-to-image 渲染。
 *
 * @param diagramId 图表实例ID（用于定位容器）
 * @param paddingPx 导出边距（像素）
 * @param pixelRatio 像素比（提升清晰度）
 */
export async function exportFullDiagramToPngDataUrl(diagramId: string, paddingPx = 40, pixelRatio: number = 2): Promise<string> {
  const diagramElement = getTargetDiagramElement(diagramId);
  if (!diagramElement) throw new Error('未找到架构图容器');

  // 优先使用 ReactFlow 实例包围盒；失败则使用 DOM 兜底
  const bbox = computeDiagramBBox() || computeDomBBox(diagramElement);
  if (!bbox) {
    // 回退：无法获取包围盒时，直接导出当前容器
    return exportElementToPngDataUrl(diagramElement, paddingPx, pixelRatio);
  }

  const { minX, minY, width, height } = bbox;
  const headerOffset = computeHeaderOffset(diagramElement);

  // 创建离屏容器，尺寸按整图内容 + 边距 + 头部偏移
  const bounds = normalizeRasterExportBounds(width + paddingPx * 2, height + paddingPx * 2 + headerOffset, pixelRatio);
  const offscreen = document.createElement('div');
  offscreen.style.position = 'fixed';
  offscreen.style.left = '-10000px';
  offscreen.style.top = '-10000px';
  const exportWidth = bounds.width;
  const exportHeight = bounds.height;
  offscreen.style.width = `${exportWidth}px`;
  offscreen.style.height = `${exportHeight}px`;
  offscreen.style.background = '#ffffff';
  offscreen.style.zIndex = '0';
  offscreen.style.overflow = 'visible';
  document.body.appendChild(offscreen);

  // 克隆目标容器
  const clone = diagramElement.cloneNode(true) as HTMLElement;
  clone.style.width = `${exportWidth}px`;
  clone.style.height = `${exportHeight}px`;
  clone.style.overflow = 'visible';
  offscreen.appendChild(clone);

  // 同步克隆中的 ReactFlow 根与 renderer 尺寸，避免内部 SVG 仍保留原始大小导致空白
  const cloneReactFlow = clone.classList.contains('react-flow')
    ? (clone as HTMLElement)
    : (clone.querySelector('.react-flow') as HTMLElement | null);

  if (cloneReactFlow) {
    cloneReactFlow.style.width = `${exportWidth}px`;
    cloneReactFlow.style.height = `${Math.ceil(height + paddingPx * 2)}px`;
    cloneReactFlow.style.overflow = 'visible';
    if (headerOffset > 0) cloneReactFlow.style.flex = 'none';
  }

  const rendererSvg = clone.querySelector('svg.react-flow__renderer') as SVGSVGElement | null;
  if (rendererSvg) {
    rendererSvg.setAttribute('width', String(exportWidth));
    rendererSvg.setAttribute('height', String(Math.ceil(height + paddingPx * 2)));
    rendererSvg.style.overflow = 'visible';
  }

  // 隐藏克隆中的控制元素/背景
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
    '.menu-toggle-btn',
    // 在基础帧中隐藏“动画边”，避免底图与叠加重复导致线条加粗或重影
    '.edge-animated',
    '.react-flow__edge-path.animated',
    '.react-flow__edge.animated',
    '.smart-edge.animated'
  ];
  hideSelectors.forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => {
      if (el instanceof HTMLElement) el.style.display = 'none';
    });
  });

  // 将 viewport 平移到包围盒左上角 + 边距，并取消缩放
  const cloneViewport = clone.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (cloneViewport) {
    cloneViewport.style.transform = `translate(${paddingPx - minX}px, ${paddingPx - minY}px) scale(1)`;
    // 确保溢出内容可见
    cloneViewport.style.overflow = 'visible';
  }

  // 渲染为 PNG
  try {
    const target = clone;
    const dataUrl = await (await import('html-to-image')).toPng(target, {
      backgroundColor: '#ffffff',
      quality: 1.0,
      pixelRatio: bounds.pixelRatio,
      cacheBust: true,
      width: exportWidth,
      height: exportHeight,
      // style: { backgroundColor: '#ffffff', overflow: 'visible', padding: `${paddingPx}px` }
      // 移除 padding，因为我们已经把内容平移和尺寸计算包含了边距
      style: { backgroundColor: '#ffffff', overflow: 'visible', padding: '0' }
    });
    return dataUrl;
  } finally {
    offscreen.remove();
  }
}

/**
 * 导出“完整架构图”为 SVG 数据URL。
 * 与 PNG 方案一致：在离屏克隆容器中重设 viewport，完整显示整图后转换为 SVG。
 */
export async function exportFullDiagramToSvgDataUrl(diagramId: string, paddingPx = 40): Promise<string> {
  const diagramElement = getTargetDiagramElement(diagramId);
  if (!diagramElement) throw new Error('未找到架构图容器');

  const bbox = computeDiagramBBox() || computeDomBBox(diagramElement);
  if (!bbox) {
    return exportElementToSvgDataUrl(diagramElement, paddingPx);
  }

  const { minX, minY, width, height } = bbox;
  const headerOffset = computeHeaderOffset(diagramElement);
  const bounds = normalizeRasterExportBounds(width + paddingPx * 2, height + paddingPx * 2 + headerOffset, 1);

  const offscreen = document.createElement('div');
  offscreen.style.position = 'fixed';
  offscreen.style.left = '-10000px';
  offscreen.style.top = '-10000px';
  const exportWidth = bounds.width;
  const exportHeight = bounds.height;
  offscreen.style.width = `${exportWidth}px`;
  offscreen.style.height = `${exportHeight}px`;
  offscreen.style.background = '#ffffff';
  offscreen.style.zIndex = '0';
  offscreen.style.overflow = 'visible';
  document.body.appendChild(offscreen);

  const clone = diagramElement.cloneNode(true) as HTMLElement;
  clone.style.width = offscreen.style.width;
  clone.style.height = offscreen.style.height;
  clone.style.overflow = 'visible';
  offscreen.appendChild(clone);

  // 同步克隆中的 ReactFlow 根与 renderer 尺寸
  const cloneReactFlow = clone.classList.contains('react-flow')
    ? (clone as HTMLElement)
    : (clone.querySelector('.react-flow') as HTMLElement | null);
  if (cloneReactFlow) {
    cloneReactFlow.style.width = `${exportWidth}px`;
    cloneReactFlow.style.height = `${Math.ceil(height + paddingPx * 2)}px`;
    cloneReactFlow.style.overflow = 'visible';
    if (headerOffset > 0) cloneReactFlow.style.flex = 'none';
  }
  const rendererSvg = clone.querySelector('svg.react-flow__renderer') as SVGSVGElement | null;
  if (rendererSvg) {
    rendererSvg.setAttribute('width', String(exportWidth));
    rendererSvg.setAttribute('height', String(Math.ceil(height + paddingPx * 2)));
    rendererSvg.style.overflow = 'visible';
  }

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

  const cloneViewport = clone.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (cloneViewport) {
    cloneViewport.style.transform = `translate(${paddingPx - minX}px, ${paddingPx - minY}px) scale(1)`;
    cloneViewport.style.overflow = 'visible';
  }

  try {
    const target = clone;
    const dataUrl = await (await import('html-to-image')).toSvg(target, {
      backgroundColor: '#ffffff',
      quality: 1.0,
      cacheBust: true,
      width: exportWidth,
      height: exportHeight,
      style: { backgroundColor: '#ffffff', overflow: 'visible', padding: '0' }
    });
    return dataUrl;
  } finally {
    offscreen.remove();
  }
}
