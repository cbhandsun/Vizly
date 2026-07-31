const MIN_PHYSICAL_TOUCH_TARGET = 44;

export const resolveLayerTouchTargetSize = (uiScale: unknown): number => {
    const scale = typeof uiScale === 'number'
        && Number.isFinite(uiScale)
        && uiScale > 0
        ? uiScale
        : 1;
    return Math.ceil(MIN_PHYSICAL_TOUCH_TARGET / scale);
};
