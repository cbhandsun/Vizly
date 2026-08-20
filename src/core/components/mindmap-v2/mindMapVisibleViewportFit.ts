import type { MindElixirInstance } from 'mind-elixir';

const DEFAULT_FIT_PADDING = 32;
const DEFAULT_MAX_FIT_SCALE = 1;
const MIN_MEANINGFUL_OFFSET = 0.5;

interface RectLike {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

export interface MindMapViewportFitPlan {
  scale: number;
  visibleRect: RectLike;
}

export interface MindMapViewportFitResult extends MindMapViewportFitPlan {
  dx: number;
  dy: number;
  mode: 'fit';
}

export interface MindMapViewportFitOptions {
  documentRoot?: ParentNode;
  padding?: number;
  sidebarSelector?: string;
}

const isFinitePositive = (value: number): boolean => Number.isFinite(value) && value > 0;

const normalizeRect = (rect: RectLike): RectLike | null => {
  if (
    !Number.isFinite(rect.left)
    || !Number.isFinite(rect.right)
    || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.bottom)
  ) return null;

  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  if (!isFinitePositive(width) || !isFinitePositive(height)) return null;

  return {
    bottom: rect.bottom,
    height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width,
  };
};

export const resolveMindMapVisibleRect = (
  containerRect: RectLike,
  rightOccluderRect?: RectLike | null,
): RectLike | null => {
  const container = normalizeRect(containerRect);
  if (!container) return null;

  const occluder = rightOccluderRect ? normalizeRect(rightOccluderRect) : null;
  if (!occluder) return container;

  const overlapsVertically = occluder.top < container.bottom && occluder.bottom > container.top;
  const coversContainerRightEdge = occluder.right >= container.right - 1;
  const startsInsideContainer = occluder.left > container.left && occluder.left < container.right;
  if (!overlapsVertically || !coversContainerRightEdge || !startsInsideContainer) return container;

  return normalizeRect({
    ...container,
    right: occluder.left,
    width: occluder.left - container.left,
  });
};

export const computeMindMapViewportFitPlan = ({
  contentHeight,
  contentWidth,
  maxScale,
  minScale,
  padding = DEFAULT_FIT_PADDING,
  visibleRect,
}: {
  contentHeight: number;
  contentWidth: number;
  maxScale: number;
  minScale: number;
  padding?: number;
  visibleRect: RectLike;
}): MindMapViewportFitPlan | null => {
  const normalizedVisibleRect = normalizeRect(visibleRect);
  if (!normalizedVisibleRect || !isFinitePositive(contentWidth) || !isFinitePositive(contentHeight)) {
    return null;
  }

  const safePadding = Number.isFinite(padding) ? Math.max(0, padding) : DEFAULT_FIT_PADDING;
  const availableWidth = normalizedVisibleRect.width - safePadding * 2;
  const availableHeight = normalizedVisibleRect.height - safePadding * 2;
  if (!isFinitePositive(availableWidth) || !isFinitePositive(availableHeight)) return null;

  const safeMinScale = isFinitePositive(minScale) ? minScale : 0.1;
  const safeMaxScale = isFinitePositive(maxScale)
    ? Math.max(safeMinScale, Math.min(maxScale, DEFAULT_MAX_FIT_SCALE))
    : DEFAULT_MAX_FIT_SCALE;
  const requestedScale = Math.min(
    safeMaxScale,
    availableWidth / contentWidth,
    availableHeight / contentHeight,
  );

  return {
    scale: Math.max(safeMinScale, requestedScale),
    visibleRect: normalizedVisibleRect,
  };
};

const isElementVisible = (element: HTMLElement): boolean => {
  if (element.hidden) return false;
  const view = element.ownerDocument.defaultView;
  if (!view) return true;
  const style = view.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
};

export const fitMindMapToVisibleViewport = (
  mind: MindElixirInstance,
  {
    documentRoot = document,
    padding = DEFAULT_FIT_PADDING,
    sidebarSelector = '.designer-right-sidebar',
  }: MindMapViewportFitOptions = {},
): MindMapViewportFitResult | null => {
  const sidebar = documentRoot.querySelector<HTMLElement>(sidebarSelector);
  const sidebarRect = sidebar && isElementVisible(sidebar) ? sidebar.getBoundingClientRect() : null;
  const visibleRect = resolveMindMapVisibleRect(
    mind.container.getBoundingClientRect(),
    sidebarRect,
  );
  const plan = visibleRect ? computeMindMapViewportFitPlan({
    contentHeight: mind.nodes.offsetHeight,
    contentWidth: mind.nodes.offsetWidth,
    maxScale: mind.scaleMax,
    minScale: mind.scaleMin,
    padding,
    visibleRect,
  }) : null;

  if (!plan) {
    mind.toCenter();
    return null;
  }

  mind.scale(plan.scale);
  mind.toCenter();

  const renderedNodesRect = normalizeRect(mind.nodes.getBoundingClientRect());
  if (!renderedNodesRect) {
    return { ...plan, dx: 0, dy: 0, mode: 'fit' };
  }

  const dx = (
    plan.visibleRect.left + plan.visibleRect.width / 2
  ) - (
    renderedNodesRect.left + renderedNodesRect.width / 2
  );
  const dy = (
    plan.visibleRect.top + plan.visibleRect.height / 2
  ) - (
    renderedNodesRect.top + renderedNodesRect.height / 2
  );

  if (Math.abs(dx) >= MIN_MEANINGFUL_OFFSET || Math.abs(dy) >= MIN_MEANINGFUL_OFFSET) {
    mind.move(dx, dy, true);
  }

  return { ...plan, dx, dy, mode: 'fit' };
};
