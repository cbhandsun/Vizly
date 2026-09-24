import { describe, expect, it } from 'vitest';

import { clampDraggablePanelPosition } from '../draggablePanelPosition';

describe('clampDraggablePanelPosition', () => {
    it('keeps an already visible position unchanged', () => {
        expect(clampDraggablePanelPosition({
            x: 120,
            y: 80,
            panelWidth: 480,
            panelHeight: 500,
            viewportWidth: 1440,
            viewportHeight: 900,
        })).toEqual({ x: 120, y: 80 });
    });

    it('keeps the close edge reachable on a narrow viewport', () => {
        expect(clampDraggablePanelPosition({
            x: 320,
            y: 80,
            panelWidth: 374,
            panelHeight: 620,
            viewportWidth: 406,
            viewportHeight: 720,
        })).toEqual({ x: 16, y: 80 });
    });

    it('coerces invalid and extreme coordinates into the safe inset', () => {
        expect(clampDraggablePanelPosition({
            x: Number.POSITIVE_INFINITY,
            y: Number.NaN,
            panelWidth: 900,
            panelHeight: 900,
            viewportWidth: 320,
            viewportHeight: 480,
            inset: -10,
        })).toEqual({ x: 0, y: 0 });
    });
});
