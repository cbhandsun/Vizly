import { describe, expect, it } from 'vitest';

import { resolveMindMapFloatingBarLeft } from '../mindMapFloatingBarLayout';

describe('resolveMindMapFloatingBarLeft', () => {
    it('centers the measured toolbar around the selected node when space allows', () => {
        expect(resolveMindMapFloatingBarLeft({
            anchorX: 600,
            measuredWidth: 320,
            viewportWidth: 1280,
        })).toBe(440);
    });

    it('keeps the full toolbar inside the viewport near either edge', () => {
        expect(resolveMindMapFloatingBarLeft({
            anchorX: 24,
            measuredWidth: 300,
            viewportWidth: 390,
        })).toBe(8);
        expect(resolveMindMapFloatingBarLeft({
            anchorX: 380,
            measuredWidth: 300,
            viewportWidth: 390,
        })).toBe(82);
    });

    it('uses the visible scroll width when the toolbar is wider than the viewport', () => {
        expect(resolveMindMapFloatingBarLeft({
            anchorX: 195,
            measuredWidth: 520,
            viewportWidth: 390,
        })).toBe(8);
    });

    it('coerces invalid and extreme layout inputs to a safe position', () => {
        expect(resolveMindMapFloatingBarLeft({
            anchorX: Number.NaN,
            measuredWidth: Number.POSITIVE_INFINITY,
            viewportWidth: -1,
        })).toBe(0);
    });
});
