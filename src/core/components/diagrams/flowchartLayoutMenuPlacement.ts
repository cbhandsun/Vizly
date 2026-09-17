type LayoutMenuPlacement = {
    points: [string, string];
    overflow: { adjustX: true; adjustY: true; shiftX: true; shiftY: true };
};

const placement = (points: [string, string]): LayoutMenuPlacement => ({
    points,
    // Flipping a tall submenu can still leave its first items outside the
    // viewport. Shift it back into view after collision flips.
    overflow: { adjustX: true, adjustY: true, shiftX: true, shiftY: true },
});

const ltrPlacements = {
    rightTop: placement(['tl', 'tr']),
    rightBottom: placement(['bl', 'br']),
    leftTop: placement(['tr', 'tl']),
    leftBottom: placement(['br', 'bl']),
};

const rtlPlacements = {
    rightTop: ltrPlacements.leftTop,
    rightBottom: ltrPlacements.leftBottom,
    leftTop: ltrPlacements.rightTop,
    leftBottom: ltrPlacements.rightBottom,
};

export const getFlowchartLayoutMenuPlacements = (direction?: 'ltr' | 'rtl') => (
    direction === 'rtl' ? rtlPlacements : ltrPlacements
);
