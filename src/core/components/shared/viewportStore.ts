export type Viewport = { x: number; y: number; zoom: number };

import { getQueryParamFromSearch, getWindowSearchString } from '../../utils/inputBoundary';
import { logViewportStoreFailure } from './viewportLogging';

let lastViewport: Viewport | null = null;

type ViewportListener = (vp: Viewport) => void;
const listeners = new Set<ViewportListener>();

export const getLastViewport = (): Viewport | null => {
  try {
    return lastViewport;
  } catch (error) {
    logViewportStoreFailure('getLastViewport', error);
    return null;
  }
};

// 订阅视口变化
export const subscribeViewport = (listener: ViewportListener) => {
  try {
    listeners.add(listener);
    // 立即推送当前视口（若存在），使订阅方初始渲染一致
    if (lastViewport) {
      try { listener(lastViewport); } catch (error) {
        logViewportStoreFailure('notifyInitialListener', error);
      }
    }
    return () => {
      listeners.delete(listener);
    };
  } catch (error) {
    logViewportStoreFailure('subscribeViewport', error);
    return () => { };
  }
};

export const setLastViewport = (vp: Viewport) => {
  try {
    lastViewport = vp;
    // 通知所有订阅者
    listeners.forEach((fn) => {
      try { fn(vp); } catch (error) {
        logViewportStoreFailure('notifyListener', error);
      }
    });
  } catch (error) {
    logViewportStoreFailure('setLastViewport', error);
  }
};

/**
 * 获取当前界面 UI 缩放比例（与 DiagramLayout 保持一致）
 * 来源优先级：URL 参数 ?uiScale= > 配置 ui.scale > 默认 1.0
 */
export const getUiScale = (): number => {
  try {
    const urlScale = parseFloat(getQueryParamFromSearch(getWindowSearchString(), 'uiScale') || '');
    if (!isNaN(urlScale) && urlScale > 0.3 && urlScale <= 3) return urlScale;
    // 动态导入避免循环依赖：直接读取 DOM 上的实际 zoom 值
    const rootLayout = document.getElementById('app-root-layout');
    if (rootLayout) {
      const computedZoom = parseFloat(getComputedStyle(rootLayout).zoom || '1');
      if (!isNaN(computedZoom) && computedZoom > 0.3 && computedZoom <= 3) return computedZoom;
    }
    return 1.0;
  } catch (error) {
    logViewportStoreFailure('getUiScale', error);
    return 1.0;
  }
};

/**
 * CSS zoom 感知的屏幕坐标 → Flow 坐标转换
 *
 * 为什么不用 React Flow 的 screenToFlowPosition？
 * 因为 screenToFlowPosition 的内部公式是:
 *   flowX = (clientX - domBcrLeft - viewport.x) / viewport.zoom
 * 其中 (clientX - domBcrLeft) 是物理像素空间的相对位置，
 * 但 viewport.x/zoom 是基于 offsetWidth（CSS逻辑像素）计算的。
 * CSS zoom ≠ 1 时，物理 ≠ 逻辑，导致坐标偏差。
 *
 * 正确公式:
 *   relativeInner = (clientX - domBcrLeft) * cssZoom
 *   flowX = (relativeInner - viewport.x) / viewport.zoom
 */
export const screenToFlowPositionCssZoomAware = (
  clientX: number,
  clientY: number,
  viewport: Viewport,
  containerSelector = '.react-flow'
): { x: number; y: number } => {
  try {
    const uiScale = getUiScale();
    const container = document.querySelector(containerSelector) as HTMLElement | null;
    if (!container) return { x: clientX, y: clientY };
    const bcr = container.getBoundingClientRect();
    // 物理像素空间的相对位置
    const relPhysX = clientX - bcr.left;
    const relPhysY = clientY - bcr.top;
    // 转为 CSS 逻辑像素空间（与 viewport transform 同一空间）
    const relLogX = relPhysX / uiScale;
    const relLogY = relPhysY / uiScale;
    // 应用 viewport 逆变换 → flow 坐标
    return {
      x: (relLogX - viewport.x) / viewport.zoom,
      y: (relLogY - viewport.y) / viewport.zoom,
    };
  } catch (error) {
    logViewportStoreFailure('screenToFlowPositionCssZoomAware', error);
    return { x: clientX, y: clientY };
  }
};
