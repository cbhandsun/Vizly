const DEFAULT_EDGE_PADDING = 8;

export interface MindMapFloatingBarLayoutInput {
    anchorX: number;
    measuredWidth: number;
    viewportWidth: number;
    edgePadding?: number;
}
const finiteNonNegative = (value: number): number => (
    Number.isFinite(value) ? Math.max(0, value) : 0
);

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
