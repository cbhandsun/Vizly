export const EDGE_PROPERTY_STROKE_WIDTH_MIN = 1;
export const EDGE_PROPERTY_STROKE_WIDTH_MAX = 16;
export const EDGE_PROPERTY_STROKE_WIDTH_DEFAULT = 2;

export const coerceEdgePropertyStrokeWidth = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return EDGE_PROPERTY_STROKE_WIDTH_DEFAULT;
    }

    return Math.min(
        EDGE_PROPERTY_STROKE_WIDTH_MAX,
        Math.max(EDGE_PROPERTY_STROKE_WIDTH_MIN, value),
    );
};
