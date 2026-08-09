export const WAREHOUSE_NARROW_VIEWPORT_MAX_WIDTH = 767;

export type WarehouseSceneKeyboardCommand =
    | 'rotate-left'
    | 'rotate-right'
    | 'rotate-up'
    | 'rotate-down'
    | 'zoom-in'
    | 'zoom-out'
    | 'reset';

export const shouldShowWarehouseLabelsByDefault = (viewportWidth: unknown): boolean => {
    if (
        typeof viewportWidth !== 'number'
        || !Number.isFinite(viewportWidth)
        || viewportWidth <= 0
    ) {
        return true;
    }

    return viewportWidth > WAREHOUSE_NARROW_VIEWPORT_MAX_WIDTH;
};

export const parseWarehouseSceneKeyboardCommand = (
    key: unknown,
): WarehouseSceneKeyboardCommand | null => {
    if (typeof key !== 'string') return null;

    switch (key) {
        case 'ArrowLeft':
            return 'rotate-left';
        case 'ArrowRight':
            return 'rotate-right';
        case 'ArrowUp':
            return 'rotate-up';
        case 'ArrowDown':
            return 'rotate-down';
        case '+':
        case '=':
            return 'zoom-in';
        case '-':
        case '_':
            return 'zoom-out';
        case 'Home':
            return 'reset';
        default:
            return null;
    }
};
