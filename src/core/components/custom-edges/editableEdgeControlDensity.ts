export const COMPACT_EDITABLE_EDGE_ZOOM = 0.55;

export const isCompactEditableEdgeZoom = (zoom: unknown): boolean => (
    typeof zoom !== 'number'
    || !Number.isFinite(zoom)
    || zoom < COMPACT_EDITABLE_EDGE_ZOOM
);
