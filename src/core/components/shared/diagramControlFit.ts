export const MIN_DIAGRAM_FULL_FIT_ZOOM = 0.1;
export const MAX_DIAGRAM_FULL_FIT_ZOOM = 1;
export const DEFAULT_DIAGRAM_RIGHT_SIDEBAR_OFFSET = 60;
export const MAX_DIAGRAM_SIDEBAR_OFFSET = 800;

export const coerceDiagramSidebarOffset = (
  value: unknown,
  fallback = DEFAULT_DIAGRAM_RIGHT_SIDEBAR_OFFSET,
): number => {
  const parsed = typeof value === 'number'
    ? value
    : (typeof value === 'string' && value.trim() ? Number.parseFloat(value) : Number.NaN);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, MAX_DIAGRAM_SIDEBAR_OFFSET);
};

export const clampDiagramFullFitZoom = (rawZoom: number): number => {
  if (!Number.isFinite(rawZoom) || rawZoom <= 0) {
    return MIN_DIAGRAM_FULL_FIT_ZOOM;
  }

  return Math.max(
    MIN_DIAGRAM_FULL_FIT_ZOOM,
    Math.min(MAX_DIAGRAM_FULL_FIT_ZOOM, rawZoom * 0.98),
  );
};
