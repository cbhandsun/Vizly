

/**
 * 计算当前 React Flow 图的内容包围盒（基于节点位置与尺寸）。
 * 若无法获取 React Flow 实例或节点列表，则返回 null。
 */
/**
 * 计算当前 React Flow 图的内容包围盒（基于节点的绝对位置与尺寸）。
 * 优先使用节点的 positionAbsolute，其次回退到 position。
 * 若无法获取 React Flow 实例或节点列表为空，返回 null。
 */
function computeDiagramBBox(): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null {
  const rf: any = (window as any).reactFlowInstance;
  if (!rf || typeof rf.getNodes !== 'function') return null;
  const nodes = rf.getNodes?.() || [];
  if (!nodes || nodes.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  nodes.forEach((n: any) => {
    // [FIX] 过滤隐藏节点，避免撑大包围盒导致导出空白
    if (n.hidden === true) return;
    if (n.style?.display === 'none') return;

    const w = (typeof n.measured?.width === 'number' && isFinite(n.measured.width))
      ? n.measured.width
      : (typeof n.width === 'number' && isFinite(n.width))
        ? n.width
        : (typeof n.style?.width === 'number' && isFinite(n.style.width))
          ? n.style.width
          : 220;
    const h = (typeof n.measured?.height === 'number' && isFinite(n.measured.height))
      ? n.measured.height
      : (typeof n.height === 'number' && isFinite(n.height))
        ? n.height
        : (typeof n.style?.height === 'number' && isFinite(n.style.height))
          ? n.style.height
          : 120;
    const x1 = (n.positionAbsolute?.x ?? n.position?.x ?? 0);
    const y1 = (n.positionAbsolute?.y ?? n.position?.y ?? 0);
    const x2 = x1 + w;
    const y2 = y1 + h;
    if (x1 < minX) minX = x1;
    if (y1 < minY) minY = y1;
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;
  });

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return { minX, minY, maxX, maxY, width, height };
}

/**
 * 解析 transform 字符串中的平移量（支持 matrix(...) 与 translate(...px, ...px) 两种形式）。
 * 返回 {x, y} 像素值；未解析到时返回 {0, 0}。
 */
function parseTranslateFromTransform(transform: string | null | undefined): { x: number; y: number } {
  const t = (transform || '').trim();
  if (!t || t === 'none') return { x: 0, y: 0 };
  // matrix(a, b, c, d, e, f) => e: translateX, f: translateY
  const m = t.match(/matrix\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(/[,\s]+/).map(Number);
    if (parts.length >= 6 && parts.every(n => !isNaN(n))) {
      return { x: parts[4], y: parts[5] };
    }
  }
  // translate(xpx, ypx) 或 translate(x, y)
  const tr = t.match(/translate\(\s*([\-\d\.]+)(px)?\s*,\s*([\-\d\.]+)(px)?\s*\)/);
  if (tr) {
    const x = parseFloat(tr[1]);
    const y = parseFloat(tr[3]);
    if (isFinite(x) && isFinite(y)) return { x, y };
  }
  return { x: 0, y: 0 };
}

/**
 * 解析 transform 字符串中的缩放值（支持 matrix 与 scale）。
 * @param transform CSS transform 字符串
 * @returns 缩放比例（未解析到时返回 1）
 */
function parseScaleFromTransform(transform: string | null | undefined): number {
  const t = (transform || '').trim();
  if (!t || t === 'none') return 1;
  const m = t.match(/matrix\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(/[\,\s]+/).map(Number);
    if (parts.length >= 6 && parts.every(n => !isNaN(n))) {
      const a = parts[0];
      const d = parts[3];
      const scale = isFinite(a) ? a : (isFinite(d) ? d : 1);
      return scale || 1;
    }
  }
  const s = t.match(/scale\(\s*([\-\d\.]+)\s*\)/);
  if (s) {
    const scale = parseFloat(s[1]);
    return isFinite(scale) ? scale : 1;
  }
  return 1;
}

/**
 * DOM 兜底：基于目标元素内的 .react-flow__node 节点，
 * 解析每个节点的 transform 平移与尺寸，计算整图包围盒。
 * 适用于无法获取 ReactFlow 实例的情况。
 */
function computeDomBBox(root: HTMLElement): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('.react-flow__node'));
  if (nodes.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  nodes.forEach(el => {
    // [FIX] 过滤不显示的 DOM 节点
    const computedStyle = getComputedStyle(el);
    if (computedStyle.display === 'none') return;

    const { x, y } = parseTranslateFromTransform(el.style.transform || computedStyle.transform);
    const w = el.offsetWidth || parseFloat(el.style.width || '0') || 0;
    const h = el.offsetHeight || parseFloat(el.style.height || '0') || 0;
    const x1 = x;
    const y1 = y;
    const x2 = x + w;
    const y2 = y + h;
    if (x1 < minX) minX = x1;
    if (y1 < minY) minY = y1;
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;
  });

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return { minX, minY, maxX, maxY, width, height };
}

/**
 * 获取当前架构图的导出目标元素
 * 优先使用指定 diagramId 的容器，其次回退到全局 ReactFlow 容器。
 * @param diagramId - 架构图实例的标识
 * @returns 可用于截图/导出的 DOM 元素
 */
export const getTargetDiagramElement = (diagramId: string): HTMLElement | null => {
  const container = document.getElementById(`diagram-${diagramId}`);

  // 1. 优先尝试获取带标题的组件根节点 (BaseDiagramComponent)
  const componentRoot = container?.querySelector('.diagram-component-root') as HTMLElement | null;
  if (componentRoot) return componentRoot;

  // 2. 只有 Flow 内容的根元素
  const reactFlowInside = container?.querySelector('.react-flow') as HTMLElement | null;
  if (reactFlowInside) return reactFlowInside;

  // 3. 回退：全局的 .react-flow（用于预览页或未设置容器ID的场景）
  const reactFlowGlobal = document.querySelector('.react-flow') as HTMLElement | null;
  if (reactFlowGlobal) return reactFlowGlobal;

  // 4. 兜底：容器本身（可能是 .diagram-scroll-container 或其它包裹）
  return container as HTMLElement | null;
};

/**
 * 计算头部偏移量（标题栏高度）
 */
function computeHeaderOffset(root: HTMLElement): number {
  if (!root.classList.contains('diagram-component-root')) return 0;
  const rf = root.querySelector('.react-flow');
  if (!rf) return 0;
  const rootRect = root.getBoundingClientRect();
  const rfRect = rf.getBoundingClientRect();
  // 计算 ReactFlow 容器顶部相对于组件根顶部的距离
  return Math.max(0, rfRect.top - rootRect.top);
}

/**
 * 在执行回调期间临时隐藏指定选择器的元素，并在结束后精准恢复其 display/visibility。
 * 该方法用于导出时清理工具条、迷你地图、背景网格等不需要的视觉元素。
 * @param selectors - 需要临时隐藏的 CSS 选择器数组
 * @param fn - 执行导出操作的异步回调
 */
export const temporarilyHideElements = async <T>(selectors: string[], fn: () => Promise<T>): Promise<T> => {
  const records: { el: HTMLElement; display: string; visibility: string }[] = [];
  selectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      if (el instanceof HTMLElement) {
        records.push({ el, display: el.style.display, visibility: el.style.visibility });
        el.style.visibility = 'hidden';
        el.style.display = 'none';
      }
    });
  });
  try {
    const result = await fn();
    return result;
  } finally {
    records.forEach(({ el, display, visibility }) => { el.style.display = display; el.style.visibility = visibility; });
  }
};

/**
 * 导出元素为 PNG 数据URL，统一白色背景并提升像素比，避免导出过小。
 * @param element - 要导出的 HTML 元素
 * @param paddingPx - 导出图像内边距（像素）
 * @param pixelRatio - 像素比（默认 2，建议 3 用于高清）
 */
export const exportElementToPngDataUrl = async (element: HTMLElement, paddingPx = 40, pixelRatio: number = 2) => {
  return (await import('html-to-image')).toPng(element, {
    backgroundColor: '#ffffff',
    quality: 1.0,
    pixelRatio,
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

/**
 * 构建导出文件名：<diagramId>_<ISO时间戳>.<扩展名>
 * 若 diagramId 为空则使用默认名 "diagram"。
 * @param diagramId - 架构图标识
 * @param ext - 文件扩展名（png/svg/pdf/gif）
 */
export const buildExportFileName = (diagramId: string | undefined, ext: 'png' | 'pdf' | 'svg' | 'gif') => {
  const base = diagramId && diagramId.trim() ? diagramId.trim() : 'diagram';
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `${base}_${ts}.${ext}`;
};

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
  const offscreen = document.createElement('div');
  offscreen.style.position = 'fixed';
  offscreen.style.left = '-10000px';
  offscreen.style.top = '-10000px';
  const exportWidth = Math.ceil(width + paddingPx * 2);
  const exportHeight = Math.ceil(height + paddingPx * 2 + headerOffset);
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
    (rendererSvg.style as any).overflow = 'visible';
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
      pixelRatio,
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
  totalFrames: number = 10
): Promise<string> {
  const diagramElement = getTargetDiagramElement(diagramId);
  if (!diagramElement) throw new Error('未找到架构图容器');

  const bbox = computeDiagramBBox() || computeDomBBox(diagramElement);
  if (!bbox) {
    // 没有包围盒时直接导出当前容器
    return exportElementToPngDataUrl(diagramElement, paddingPx, pixelRatio);
  }

  const { minX, minY, width, height } = bbox;
  const headerOffset = computeHeaderOffset(diagramElement);
  const exportWidth = Math.ceil(width + paddingPx * 2);
  const exportHeight = Math.ceil(height + paddingPx * 2 + headerOffset);

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
    (cloneRenderer.style as any).overflow = 'visible';
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
    const dashArr = dashStr.split(/[ ,]+/).map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
    const dashArray = (dashArr.length ? dashArr : [6, 3]);

    // 计算无缝循环的虚线周期（dash 周期 = 所有段长度之和）
    const dashPeriod = dashArray.reduce((sum, v) => sum + v, 0) || 9;
    // 为保证首尾无缝，使用 (totalFrames - 1) 作为分母，使最后一帧恰好位于整周期位置
    const framesDenom = (totalFrames > 1) ? (totalFrames - 1) : 1;
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
    return await (await import('html-to-image')).toPng(target, {
      backgroundColor: '#ffffff',
      quality: 1.0,
      pixelRatio,
      cacheBust: true,
      width: exportWidth,
      height: exportHeight,
      style: { backgroundColor: '#ffffff', overflow: 'visible', padding: '0' }
    });
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
  onProgress?: (frameIndex: number, totalFrames: number) => void
): Promise<string[]> {
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
  const exportWidth = Math.ceil(width + paddingPx * 2);
  const exportHeight = Math.ceil(height + paddingPx * 2 + headerOffset);

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
      (cloneRenderer.style as any).overflow = 'visible';
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
      const dashArr = dashStr.split(/[ ,]+/).map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0);
      const dashArray = (dashArr.length ? dashArr : [6, 3]);
      const dashPeriod = dashArray.reduce((sum, v) => sum + v, 0) || 9;
      pathMeta.push({ path: pathEl, stroke, strokeWidth, dashArray, dashPeriod });
    });

    const frames: string[] = [];
    const framesDenom = (totalFrames > 1) ? (totalFrames - 1) : 1;
    const cycles = 6;

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
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
        pixelRatio,
        cacheBust: false,
        width: exportWidth,
        height: exportHeight,
        style: { backgroundColor: '#ffffff', overflow: 'visible', padding: '0' }
      });
      frames.push(dataUrl);
      // 逐帧进度回调，便于外部更新进度条
      if (onProgress) {
        try { onProgress(frameIndex + 1, totalFrames); } catch (_) { }
      }
      // 让浏览器有机会刷新 UI（避免长任务阻塞进度条）
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }

    return frames;
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

  const offscreen = document.createElement('div');
  offscreen.style.position = 'fixed';
  offscreen.style.left = '-10000px';
  offscreen.style.top = '-10000px';
  const exportWidth = Math.ceil(width + paddingPx * 2);
  const exportHeight = Math.ceil(height + paddingPx * 2 + headerOffset);
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
    (rendererSvg.style as any).overflow = 'visible';
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

/**
 * 视口兜底：直接调整真实视口与容器尺寸进行整图导出（PNG）。
 * 避免离屏克隆导致样式/尺寸不同步或渲染空白的问题。
 * @param diagramId 图表实例ID
 * @param paddingPx 导出边距
 * @param pixelRatio 像素比
 */
export async function exportFullDiagramByAdjustingViewportToPngDataUrl(
  diagramId: string,
  paddingPx = 40,
  pixelRatio: number = 2
): Promise<string> {
  const root = getTargetDiagramElement(diagramId);
  if (!root) throw new Error('未找到架构图容器');

  const bbox = computeDiagramBBox() || computeDomBBox(root);
  if (!bbox) {
    return exportElementToPngDataUrl(root, paddingPx, pixelRatio);
  }

  const headerOffset = computeHeaderOffset(root);

  const viewport = root.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!viewport) {
    return exportElementToPngDataUrl(root, paddingPx, pixelRatio);
  }

  const rendererSvg = root.querySelector('svg.react-flow__renderer') as SVGSVGElement | null;
  const reactFlowContainer = root.classList.contains('react-flow') ? root : root.querySelector('.react-flow') as HTMLElement;

  // Backup styles
  const backup = {
    viewportTransform: viewport.style.transform,
    rootWidth: root.style.width,
    rootHeight: root.style.height,
    rootOverflow: root.style.overflow,
    rfHeight: reactFlowContainer?.style.height,
    rfFlex: reactFlowContainer?.style.flex,
    svgWidth: rendererSvg?.getAttribute('width'),
    svgHeight: rendererSvg?.getAttribute('height'),
    svgOverflow: rendererSvg?.style.overflow
  };

  const exportWidth = Math.ceil(bbox.width + paddingPx * 2);
  const exportHeight = Math.ceil(bbox.height + paddingPx * 2 + headerOffset);

  // Resize Root
  root.style.width = `${exportWidth}px`;
  root.style.height = `${exportHeight}px`;
  root.style.overflow = 'visible';

  // Resize ReactFlow container
  if (reactFlowContainer) {
    reactFlowContainer.style.width = `${exportWidth}px`;
    reactFlowContainer.style.height = `${Math.ceil(bbox.height + paddingPx * 2)}px`;
    if (headerOffset > 0) reactFlowContainer.style.flex = 'none';
  }

  if (rendererSvg) {
    rendererSvg.setAttribute('width', String(exportWidth));
    rendererSvg.setAttribute('height', String(Math.ceil(bbox.height + paddingPx * 2)));
    (rendererSvg.style as any).overflow = 'visible';
  }

  // Hide UI
  const hideSelectors = [
    '.react-flow__controls', '.react-flow__minimap', '.react-flow__background',
    'svg.react-flow__background', '.mini-map', '.react-flow__minimap-container',
    '.diagram-controls', '.single-menu-toggle-floating', '.menu-toggle-floating', '.menu-toggle-btn'
  ];

  // Note: temporarilyHideElements wraps the capture logic
  const result = await temporarilyHideElements(hideSelectors, async () => {
    // Transform Viewport
    viewport.style.transform = `translate(${paddingPx - bbox.minX}px, ${paddingPx - bbox.minY}px) scale(1)`;

    // [FIX] 等待浏览器重排 Reflow/Repaint，防止截断或空白及文字错位
    await new Promise(resolve => setTimeout(resolve, 300));

    return await (await import('html-to-image')).toPng(root, {
      backgroundColor: '#ffffff',
      quality: 1.0,
      pixelRatio,
      cacheBust: true,
      width: exportWidth,
      height: exportHeight,
      style: { backgroundColor: '#ffffff', overflow: 'visible', padding: '0' }
    });
  });

  // Restore
  if (backup.viewportTransform) viewport.style.transform = backup.viewportTransform; else viewport.style.removeProperty('transform');
  if (backup.rootWidth) root.style.width = backup.rootWidth; else root.style.removeProperty('width');
  if (backup.rootHeight) root.style.height = backup.rootHeight; else root.style.removeProperty('height');
  root.style.overflow = backup.rootOverflow;

  if (reactFlowContainer) {
    if (backup.rfHeight) reactFlowContainer.style.height = backup.rfHeight; else reactFlowContainer.style.removeProperty('height');
    if (backup.rfFlex) reactFlowContainer.style.flex = backup.rfFlex; else reactFlowContainer.style.removeProperty('flex');
  }

  if (rendererSvg) {
    if (backup.svgWidth) rendererSvg.setAttribute('width', backup.svgWidth); else rendererSvg.removeAttribute('width');
    if (backup.svgHeight) rendererSvg.setAttribute('height', backup.svgHeight); else rendererSvg.removeAttribute('height');
    if (backup.svgOverflow) rendererSvg.style.overflow = backup.svgOverflow; else rendererSvg.style.removeProperty('overflow');
  }

  return result;
}

/**
 * 视口兜底：直接调整真实视口与容器尺寸进行整图导出（SVG）。
 * @param diagramId 图表实例ID
 * @param paddingPx 导出边距
 */
export async function exportFullDiagramByAdjustingViewportToSvgDataUrl(
  diagramId: string,
  paddingPx = 40
): Promise<string> {
  const root = getTargetDiagramElement(diagramId);
  if (!root) throw new Error('未找到架构图容器');

  const bbox = computeDiagramBBox() || computeDomBBox(root);
  if (!bbox) {
    return exportElementToSvgDataUrl(root, paddingPx);
  }

  const viewport = root.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!viewport) {
    return exportElementToSvgDataUrl(root, paddingPx);
  }

  const rendererSvg = root.querySelector('svg.react-flow__renderer') as SVGSVGElement | null;
  const prevTransformInline = viewport.style.transform;
  const prevTransformComputed = getComputedStyle(viewport).transform;
  const prevTransform = (prevTransformInline && prevTransformInline !== 'none') ? prevTransformInline : (prevTransformComputed || 'none');

  const prevRootWidth = root.style.width;
  const prevRootHeight = root.style.height;
  const prevRootOverflow = root.style.overflow;

  const prevSvgWidth = rendererSvg?.getAttribute('width') || null;
  const prevSvgHeight = rendererSvg?.getAttribute('height') || null;
  const prevSvgOverflow = rendererSvg ? (rendererSvg.style as any).overflow : undefined;

  const exportWidth = Math.ceil(bbox.width + paddingPx * 2);
  const exportHeight = Math.ceil(bbox.height + paddingPx * 2);

  root.style.width = `${exportWidth}px`;
  root.style.height = `${exportHeight}px`;
  root.style.overflow = 'visible';
  if (rendererSvg) {
    rendererSvg.setAttribute('width', String(exportWidth));
    rendererSvg.setAttribute('height', String(exportHeight));
    (rendererSvg.style as any).overflow = 'visible';
  }

  viewport.style.transform = `translate(${paddingPx - bbox.minX}px, ${paddingPx - bbox.minY}px) scale(1)`;
  viewport.style.overflow = 'visible';

  const hideSelectors = [
    '.react-flow__controls',
    '.react-flow__minimap',
    '.react-flow__background',
    '.mini-map',
    '.react-flow__minimap-container',
    '.diagram-controls',
    '.single-menu-toggle-floating',
    '.menu-toggle-floating',
    '.menu-toggle-btn'
  ];

  try {
    const dataUrl = await temporarilyHideElements(hideSelectors, async () => {
      // [FIX] 等待浏览器重排 Reflow/Repaint
      await new Promise(resolve => setTimeout(resolve, 300));

      return (await import('html-to-image')).toSvg(root, {
        backgroundColor: '#ffffff',
        quality: 1.0,
        cacheBust: true,
        width: exportWidth,
        height: exportHeight,
        style: { backgroundColor: '#ffffff', overflow: 'visible', padding: `${paddingPx}px` }
      });
    });
    return dataUrl;
  } finally {
    viewport.style.transform = prevTransform === 'none' ? '' : prevTransform;
    root.style.width = prevRootWidth;
    root.style.height = prevRootHeight;
    root.style.overflow = prevRootOverflow;
    if (rendererSvg) {
      if (prevSvgWidth) rendererSvg.setAttribute('width', prevSvgWidth); else rendererSvg.removeAttribute('width');
      if (prevSvgHeight) rendererSvg.setAttribute('height', prevSvgHeight); else rendererSvg.removeAttribute('height');
      (rendererSvg.style as any).overflow = prevSvgOverflow;
    }
  }
}
