/** Keep text readable down to a 5% overview, with a finite bound for tiny zoom.
 * Rendering and collision rectangles must share this bound. */
export const MIN_READABLE_EDGE_LABEL_ZOOM = 0.72;
export const MAX_EDGE_LABEL_SCALE = 14.4;

export const resolveEdgeLabelScale = (zoom: number): number => {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.min(MAX_EDGE_LABEL_SCALE, Math.max(1, MIN_READABLE_EDGE_LABEL_ZOOM / zoom));
};
