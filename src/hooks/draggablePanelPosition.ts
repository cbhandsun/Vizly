export interface DraggablePanelPositionInput {
    x: number;
    y: number;
    panelWidth: number;
    panelHeight: number;
    viewportWidth: number;
    viewportHeight: number;
    inset?: number;
}

const finiteOr = (value: number, fallback: number): number => (
    Number.isFinite(value) ? value : fallback
);

export const clampDraggablePanelPosition = ({
    x,
    y,
    panelWidth,
    panelHeight,
    viewportWidth,
    viewportHeight,
    inset = 16,
}: DraggablePanelPositionInput): { x: number; y: number } => {
    const safeInset = Math.max(0, finiteOr(inset, 16));
    const safeViewportWidth = Math.max(0, finiteOr(viewportWidth, 0));
    const safeViewportHeight = Math.max(0, finiteOr(viewportHeight, 0));
    const safePanelWidth = Math.max(0, finiteOr(panelWidth, 0));
    const safePanelHeight = Math.max(0, finiteOr(panelHeight, 0));
    const maxX = Math.max(safeInset, safeViewportWidth - safePanelWidth - safeInset);
    const maxY = Math.max(safeInset, safeViewportHeight - safePanelHeight - safeInset);

    return {
        x: Math.min(maxX, Math.max(safeInset, finiteOr(x, safeInset))),
        y: Math.min(maxY, Math.max(safeInset, finiteOr(y, safeInset))),
    };
};
