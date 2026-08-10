import { describe, expect, it } from 'vitest';
import { calculateCanvasVisibleVerticalBounds } from '../canvasVisibleBounds';

describe('calculateCanvasVisibleVerticalBounds', () => {
    it('returns the unobscured area between mobile top and bottom chrome', () => {
        expect(calculateCanvasVisibleVerticalBounds({
            containerTop: 0,
            containerBottom: 612,
            containerLeft: 0,
            containerRight: 374,
            containerHeight: 612,
            topOverlays: [
                { top: 8, bottom: 54, left: 8, right: 366 },
                { top: 50, bottom: 95, left: 8, right: 366 },
            ],
            bottomOverlays: [
                { top: 410, bottom: 525, left: 8, right: 366 },
                { top: 545, bottom: 612, left: 0, right: 374 },
            ],
        })).toEqual({ visibleTop: 95, visibleBottom: 410 });
    });

    it('ignores malformed and horizontally detached overlays', () => {
        expect(calculateCanvasVisibleVerticalBounds({
            containerTop: 10,
            containerBottom: 610,
            containerLeft: 20,
            containerRight: 420,
            containerHeight: 600,
            topOverlays: [
                { top: Number.NaN, bottom: 90 },
                { top: 10, bottom: 90, left: 500, right: 600 },
            ],
            bottomOverlays: [{ top: 560, bottom: 610, left: -200, right: -100 }],
        })).toEqual({ visibleTop: 0, visibleBottom: 600 });
    });

    it('fails safely for invalid containers and contradictory bounds', () => {
        expect(calculateCanvasVisibleVerticalBounds({
            containerTop: Number.POSITIVE_INFINITY,
            containerBottom: 612,
            containerLeft: 0,
            containerRight: 374,
            containerHeight: 612,
        })).toEqual({ visibleTop: 0, visibleBottom: 0 });

        expect(calculateCanvasVisibleVerticalBounds({
            containerTop: 0,
            containerBottom: 300,
            containerLeft: 0,
            containerRight: 300,
            containerHeight: 300,
            topOverlays: [{ top: 0, bottom: 220 }],
            bottomOverlays: [{ top: 180, bottom: 300 }],
        })).toEqual({ visibleTop: 0, visibleBottom: 300 });
    });
});
