const DEFAULT_EDGE_PADDING = 8;

export interface MindMapFloatingBarLayoutInput {
    anchorX: number;
    measuredWidth: number;
    viewportWidth: number;
    edgePadding?: number;
}

export interface MindMapFloatingBarVisibleRightInput {
    sidebarHeight?: number;
    sidebarLeft?: number;
    sidebarVisible?: boolean;
    sidebarWidth?: number;
    viewportWidth: number;
}

export interface MindMapFloatingBarFallbackWidthInput {
    edgeInset?: number;
    preferredWidth?: number;
    visibleRight: number;
}

export interface MindMapFloatingBarTopInput {
    anchorY: number;
    measuredHeight: number;
    edgePadding?: number;
}

const finiteNonNegative = (value: number): number => (
    Number.isFinite(value) ? Math.max(0, value) : 0
);

export function resolveMindMapFloatingBarFallbackWidth({
    edgeInset = 16,
    preferredWidth = 320,
    visibleRight,
}: MindMapFloatingBarFallbackWidthInput): number {
    const availableWidth = Math.max(
        0,
        finiteNonNegative(visibleRight) - finiteNonNegative(edgeInset),
    );

    return Math.min(availableWidth, finiteNonNegative(preferredWidth));
}

export function resolveMindMapFloatingBarVisibleRight({
    sidebarHeight,
    sidebarLeft,
    sidebarVisible,
    sidebarWidth,
    viewportWidth,
}: MindMapFloatingBarVisibleRightInput): number {
    const safeViewportWidth = finiteNonNegative(viewportWidth);
    if (
        !sidebarVisible
        || !Number.isFinite(sidebarLeft)
        || finiteNonNegative(sidebarWidth ?? 0) === 0
        || finiteNonNegative(sidebarHeight ?? 0) === 0
    ) {
        return safeViewportWidth;
    }

    return Math.min(finiteNonNegative(sidebarLeft ?? safeViewportWidth), safeViewportWidth);
}

export function resolveMindMapFloatingBarLeft({
    anchorX,
    measuredWidth,
    viewportWidth,
    edgePadding = DEFAULT_EDGE_PADDING,
}: MindMapFloatingBarLayoutInput): number {
    const safeViewportWidth = finiteNonNegative(viewportWidth);
    const safePadding = Math.min(finiteNonNegative(edgePadding), safeViewportWidth / 2);
    const availableWidth = Math.max(0, safeViewportWidth - safePadding * 2);
    const visibleWidth = Math.min(finiteNonNegative(measuredWidth), availableWidth);
    const safeAnchorX = Number.isFinite(anchorX) ? anchorX : safePadding;
    const idealLeft = safeAnchorX - visibleWidth / 2;
    const maxLeft = Math.max(safePadding, safeViewportWidth - visibleWidth - safePadding);

    return Math.min(Math.max(idealLeft, safePadding), maxLeft);
}

export function resolveMindMapFloatingBarTop({
    anchorY,
    measuredHeight,
    edgePadding = DEFAULT_EDGE_PADDING,
}: MindMapFloatingBarTopInput): number {
    const safePadding = finiteNonNegative(edgePadding);
    const safeAnchorY = Number.isFinite(anchorY) ? Math.max(safePadding, anchorY) : safePadding;
    const safeHeight = finiteNonNegative(measuredHeight);

    return Math.max(safeAnchorY - safeHeight, safePadding);
}
