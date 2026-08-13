const DEFAULT_EDGE_PADDING = 8;
const DEFAULT_MENU_WIDTH = 230;
const DEFAULT_ESTIMATED_HEIGHT = 560;

export interface MindMapContextMenuPositionInput {
    estimatedHeight?: number;
    menuWidth?: number;
    viewportHeight: number;
    viewportWidth: number;
    x: number;
    y: number;
}

const finiteNonNegative = (value: number): number => (
    Number.isFinite(value) ? Math.max(0, value) : 0
);

const clampAxis = (
    requested: number,
    viewportSize: number,
    overlaySize: number,
): number => {
    const safeViewport = finiteNonNegative(viewportSize);
    const padding = Math.min(DEFAULT_EDGE_PADDING, safeViewport / 2);
    const safeOverlay = Math.min(finiteNonNegative(overlaySize), Math.max(0, safeViewport - padding * 2));
    const maximum = Math.max(padding, safeViewport - safeOverlay - padding);
    const safeRequested = Number.isFinite(requested) ? requested : padding;
    return Math.min(Math.max(safeRequested, padding), maximum);
};

export function resolveMindMapContextMenuPosition({
    estimatedHeight = DEFAULT_ESTIMATED_HEIGHT,
    menuWidth = DEFAULT_MENU_WIDTH,
    viewportHeight,
    viewportWidth,
    x,
    y,
}: MindMapContextMenuPositionInput): { left: number; top: number } {
    return {
        left: clampAxis(x, viewportWidth, menuWidth),
        top: clampAxis(y, viewportHeight, estimatedHeight),
    };
}
