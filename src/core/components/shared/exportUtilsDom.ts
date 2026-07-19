/**
 * 计算当前 React Flow 图的内容包围盒（基于节点位置与尺寸）。
 * 若无法获取 React Flow 实例或节点列表，则返回 null。
 */
/**
 * 计算当前 React Flow 图的内容包围盒（基于节点的绝对位置与尺寸）。
 * 优先使用节点的 positionAbsolute，其次回退到 position。
 * 若无法获取 React Flow 实例或节点列表为空，返回 null。
 */
export function computeDiagramBBox(): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null {
  const runtimeWindow = window as Window & { reactFlowInstance?: unknown };
  const instance = runtimeWindow.reactFlowInstance;
  if (!instance || typeof instance !== 'object' || !('getNodes' in instance)) return null;
  const getNodes = (instance as { getNodes?: unknown }).getNodes;
  if (typeof getNodes !== 'function') return null;

  let nodes: unknown;
  try {
    nodes = getNodes.call(instance);
  } catch {
    return null;
  }
  if (!Array.isArray(nodes) || nodes.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  let visibleNodeCount = 0;
  nodes.forEach((candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') return;
    const n = candidate as Record<string, unknown>;
    // [FIX] 过滤隐藏节点，避免撑大包围盒导致导出空白
    if (n.hidden === true) return;
    const style = n.style && typeof n.style === 'object' ? n.style as Record<string, unknown> : undefined;
    if (style?.display === 'none') return;
    const measured = n.measured && typeof n.measured === 'object' ? n.measured as Record<string, unknown> : undefined;
    const positionAbsolute = n.positionAbsolute && typeof n.positionAbsolute === 'object'
      ? n.positionAbsolute as Record<string, unknown>
      : undefined;
    const position = n.position && typeof n.position === 'object' ? n.position as Record<string, unknown> : undefined;

    const w = (typeof measured?.width === 'number' && Number.isFinite(measured.width))
      ? measured.width
      : (typeof n.width === 'number' && Number.isFinite(n.width))
        ? n.width
        : (typeof style?.width === 'number' && Number.isFinite(style.width))
          ? style.width
          : 220;
    const h = (typeof measured?.height === 'number' && Number.isFinite(measured.height))
      ? measured.height
      : (typeof n.height === 'number' && Number.isFinite(n.height))
        ? n.height
        : (typeof style?.height === 'number' && Number.isFinite(style.height))
          ? style.height
          : 120;
    const rawX = positionAbsolute?.x ?? position?.x;
    const rawY = positionAbsolute?.y ?? position?.y;
    if (typeof rawX !== 'number' || !Number.isFinite(rawX)) return;
    if (typeof rawY !== 'number' || !Number.isFinite(rawY)) return;
    const x1 = rawX;
    const y1 = rawY;
    const x2 = x1 + w;
    const y2 = y1 + h;
    visibleNodeCount++;
    if (x1 < minX) minX = x1;
    if (y1 < minY) minY = y1;
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;
  });

  if (visibleNodeCount === 0) return null;
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
    if (parts.length >= 6 && parts.every(Number.isFinite)) {
      return { x: parts[4], y: parts[5] };
    }
  }
  // translate(xpx, ypx) 或 translate(x, y)
  const tr = t.match(/translate\(\s*([-\d.]+)(px)?\s*,\s*([-\d.]+)(px)?\s*\)/);
  if (tr) {
    const x = parseFloat(tr[1]);
    const y = parseFloat(tr[3]);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  return { x: 0, y: 0 };
}

/**
 * DOM 兜底：基于目标元素内的 .react-flow__node 节点，
 * 解析每个节点的 transform 平移与尺寸，计算整图包围盒。
 * 适用于无法获取 ReactFlow 实例的情况。
 */
export function computeDomBBox(root: HTMLElement): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } | null {
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
export function computeHeaderOffset(root: HTMLElement): number {
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
  try {
    for (const selector of Array.isArray(selectors) ? selectors.slice(0, 100) : []) {
      if (typeof selector !== 'string' || selector.length === 0 || selector.length > 500) continue;
      let elements: NodeListOf<Element>;
      try {
        elements = document.querySelectorAll(selector);
      } catch {
        continue;
      }
      elements.forEach(el => {
        if (el instanceof HTMLElement) {
          records.push({ el, display: el.style.display, visibility: el.style.visibility });
          el.style.visibility = 'hidden';
          el.style.display = 'none';
        }
      });
    }
    return await fn();
  } finally {
    records.forEach(({ el, display, visibility }) => { el.style.display = display; el.style.visibility = visibility; });
  }
};
