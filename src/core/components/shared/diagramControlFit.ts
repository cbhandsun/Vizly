export const MIN_DIAGRAM_FULL_FIT_ZOOM = 0.1;
export const MAX_DIAGRAM_FULL_FIT_ZOOM = 1;

export const clampDiagramFullFitZoom = (rawZoom: number): number => {
  if (!Number.isFinite(rawZoom) || rawZoom <= 0) {
    return MIN_DIAGRAM_FULL_FIT_ZOOM;
  }

  return Math.max(
    MIN_DIAGRAM_FULL_FIT_ZOOM,
    Math.min(MAX_DIAGRAM_FULL_FIT_ZOOM, rawZoom * 0.98),
  );
};
