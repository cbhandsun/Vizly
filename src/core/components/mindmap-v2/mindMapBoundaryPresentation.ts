const DEFAULT_BOUNDARY_COLOR = "#6366f1";

const normalizeHexColor = (value: unknown): string => {
  if (typeof value !== "string") return DEFAULT_BOUNDARY_COLOR;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [red, green, blue] = trimmed.slice(1);
    return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase();
  }
  return DEFAULT_BOUNDARY_COLOR;
};

export const resolveMindMapContainer = (
  container: HTMLElement | null | undefined,
): HTMLElement | null => {
  if (!container) return null;
  if (container.matches(".map-container")) return container;
  return container.querySelector<HTMLElement>(".map-container");
};

export const resolveMindMapBoundaryTarget = (topic: HTMLElement): HTMLElement | null => {
  if (topic.closest("me-root")) return topic.closest<HTMLElement>("me-nodes");
  return topic.closest<HTMLElement>("me-wrapper");
};

export interface MindMapBoundaryRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const measureMindMapBoundaryRect = (
  container: HTMLElement,
  target: HTMLElement,
  padding = 15,
): MindMapBoundaryRect => {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const scaleX = container.offsetWidth > 0 ? containerRect.width / container.offsetWidth : 1;
  const scaleY = container.offsetHeight > 0 ? containerRect.height / container.offsetHeight : 1;
  const safeScaleX = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1;
  const safeScaleY = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1;
  const safePadding = Number.isFinite(padding) ? Math.max(0, padding) : 0;

  return {
    x: (targetRect.left - containerRect.left) / safeScaleX + container.scrollLeft - safePadding,
    y: (targetRect.top - containerRect.top) / safeScaleY + container.scrollTop - safePadding,
    width: targetRect.width / safeScaleX + safePadding * 2,
    height: targetRect.height / safeScaleY + safePadding * 2,
  };
};

export const mindMapBoundaryColorToRgba = (
  color: unknown,
  alpha: unknown,
): string => {
  const normalized = normalizeHexColor(color);
  const parsedAlpha =
    typeof alpha === "number" && Number.isFinite(alpha) ? alpha : 1;
  const safeAlpha = Math.min(1, Math.max(0, parsedAlpha));
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
};
