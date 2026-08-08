import type { ContextMenuProps } from './DiagramContextMenu';

export type DiagramContextSubmenuPlacement = 'left' | 'right';

interface DiagramContextMenuPositionInput {
    clientX: number;
    clientY: number;
    bounds: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    type: ContextMenuProps['type'];
}

interface DiagramContextMenuPosition {
    left: number;
    top: number;
    submenuPlacement: DiagramContextSubmenuPlacement;
}

const MENU_WIDTH = 220;
const SUBMENU_WIDTH = 220;
const MENU_PADDING = 8;

const ESTIMATED_MENU_HEIGHT: Record<ContextMenuProps['type'], number> = {
    node: 320,
    edge: 400,
    pane: 320,
    selection: 420,
    'multi-node': 420,
};

const finiteOr = (value: number, fallback: number): number =>
    Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), Math.max(min, max));

export const resolveDiagramContextMenuPosition = ({
    clientX,
    clientY,
    bounds,
    type,
}: DiagramContextMenuPositionInput): DiagramContextMenuPosition => {
    const width = Math.max(0, finiteOr(bounds.width, 0));
    const height = Math.max(0, finiteOr(bounds.height, 0));
    const rawLeft = finiteOr(clientX, bounds.left) - finiteOr(bounds.left, 0);
    const rawTop = finiteOr(clientY, bounds.top) - finiteOr(bounds.top, 0);
    const left = clamp(rawLeft, MENU_PADDING, width - MENU_WIDTH - MENU_PADDING);
    const top = clamp(
        rawTop,
        MENU_PADDING,
        height - ESTIMATED_MENU_HEIGHT[type] - MENU_PADDING,
    );
    const spaceOnRight = width - left - MENU_WIDTH - MENU_PADDING;
    const spaceOnLeft = left - MENU_PADDING;
    const submenuPlacement = spaceOnRight >= SUBMENU_WIDTH || spaceOnRight >= spaceOnLeft
        ? 'right'
        : 'left';

    return { left, top, submenuPlacement };
};
