export interface CanvasOverlayRect {
    top?: unknown;
    bottom?: unknown;
    left?: unknown;
    right?: unknown;
    width?: unknown;
    height?: unknown;
}

interface CanvasVisibleVerticalBoundsInput {
    containerTop: unknown;
    containerBottom: unknown;
    containerLeft: unknown;
    containerRight: unknown;
    containerHeight: unknown;
    topOverlays?: readonly CanvasOverlayRect[];
    bottomOverlays?: readonly CanvasOverlayRect[];
}

export interface CanvasVisibleVerticalBounds {
    visibleTop: number;
    visibleBottom: number;
}

const toFiniteNumber = (value: unknown): number | null => (
    typeof value === 'number' && Number.isFinite(value) ? value : null
);

const clamp = (value: number, min: number, max: number): number => (
    Math.min(Math.max(value, min), max)
);

const intersectsContainer = (
    overlay: CanvasOverlayRect,
    container: { top: number; bottom: number; left: number; right: number },
): overlay is CanvasOverlayRect & { top: number; bottom: number } => {
    const top = toFiniteNumber(overlay.top);
    const bottom = toFiniteNumber(overlay.bottom);
    if (top === null || bottom === null || bottom <= top) return false;

    const left = toFiniteNumber(overlay.left);
    const right = toFiniteNumber(overlay.right);
    const horizontallyIntersects = left === null || right === null
        ? true
        : right > container.left && left < container.right;
    return horizontallyIntersects && bottom > container.top && top < container.bottom;
};

export const calculateCanvasVisibleVerticalBounds = ({
    containerTop,
    containerBottom,
    containerLeft,
    containerRight,
    containerHeight,
    topOverlays = [],
    bottomOverlays = [],
}: CanvasVisibleVerticalBoundsInput): CanvasVisibleVerticalBounds => {
    const top = toFiniteNumber(containerTop);
    const bottom = toFiniteNumber(containerBottom);
    const left = toFiniteNumber(containerLeft);
    const right = toFiniteNumber(containerRight);
    const height = toFiniteNumber(containerHeight);
    if (
        top === null
        || bottom === null
        || left === null
        || right === null
        || height === null
        || height <= 0
        || bottom <= top
        || right <= left
    ) {
        return { visibleTop: 0, visibleBottom: 0 };
    }

    const container = { top, bottom, left, right };
    const visibleTop = topOverlays.reduce((current, overlay) => (
        intersectsContainer(overlay, container)
            ? Math.max(current, clamp(overlay.bottom - top, 0, height))
            : current
    ), 0);
    const visibleBottom = bottomOverlays.reduce((current, overlay) => (
        intersectsContainer(overlay, container)
            ? Math.min(current, clamp(overlay.top - top, 0, height))
            : current
    ), height);

    return visibleBottom > visibleTop
        ? { visibleTop, visibleBottom }
        : { visibleTop: 0, visibleBottom: height };
};
