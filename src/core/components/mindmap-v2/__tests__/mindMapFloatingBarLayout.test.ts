import { describe, expect, it } from 'vitest';

import {
    resolveMindMapFloatingBarFallbackWidth,
    resolveMindMapFloatingBarLeft,
    resolveMindMapFloatingBarTop,
    resolveMindMapFloatingBarVisibleRight,
} from '../mindMapFloatingBarLayout';

describe('resolveMindMapFloatingBarFallbackWidth', () => {
    it('uses the preferred width when the visible canvas has room', () => {
        expect(resolveMindMapFloatingBarFallbackWidth({ visibleRight: 1280 })).toBe(320);
    });

    it('shrinks to the bounded visible width on a narrow canvas', () => {
        expect(resolveMindMapFloatingBarFallbackWidth({ visibleRight: 200 })).toBe(184);
        expect(resolveMindMapFloatingBarFallbackWidth({ visibleRight: 8 })).toBe(0);
    });

    it('coerces invalid and extreme inputs without producing a negative width', () => {
        expect(resolveMindMapFloatingBarFallbackWidth({
            edgeInset: Number.POSITIVE_INFINITY,
            preferredWidth: -1,
            visibleRight: Number.NaN,
        })).toBe(0);
    });
});

describe('resolveMindMapFloatingBarTop', () => {
    it('places the complete measured toolbar above the node anchor', () => {
        expect(resolveMindMapFloatingBarTop({
            anchorY: 327.5,
            measuredHeight: 65.1,
        })).toBeCloseTo(262.4);
    });

    it('keeps the toolbar inside the top edge of the viewport', () => {
        expect(resolveMindMapFloatingBarTop({
            anchorY: 48,
            measuredHeight: 66,
        })).toBe(8);
    });

    it('coerces invalid and extreme measurements to a safe position', () => {
        expect(resolveMindMapFloatingBarTop({
            anchorY: Number.NaN,
            measuredHeight: Number.POSITIVE_INFINITY,
            edgePadding: -1,
        })).toBe(0);
    });
});

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

describe('resolveMindMapFloatingBarVisibleRight', () => {
    it('keeps the floating toolbar before a visible right sidebar', () => {
        expect(resolveMindMapFloatingBarVisibleRight({
            viewportWidth: 1280,
            sidebarLeft: 960,
            sidebarWidth: 306,
            sidebarHeight: 639,
            sidebarVisible: true,
        })).toBe(960);
    });

    it('uses the viewport when the sidebar is hidden or has no usable area', () => {
        expect(resolveMindMapFloatingBarVisibleRight({
            viewportWidth: 1280,
            sidebarLeft: 960,
            sidebarWidth: 306,
            sidebarHeight: 639,
            sidebarVisible: false,
        })).toBe(1280);
        expect(resolveMindMapFloatingBarVisibleRight({
            viewportWidth: 1280,
            sidebarLeft: 960,
            sidebarWidth: 0,
            sidebarHeight: 639,
            sidebarVisible: true,
        })).toBe(1280);
    });

    it('bounds invalid and off-screen measurements to the viewport', () => {
        expect(resolveMindMapFloatingBarVisibleRight({
            viewportWidth: 1280,
            sidebarLeft: Number.POSITIVE_INFINITY,
            sidebarWidth: 306,
            sidebarHeight: 639,
            sidebarVisible: true,
        })).toBe(1280);
        expect(resolveMindMapFloatingBarVisibleRight({
            viewportWidth: 1280,
            sidebarLeft: 1600,
            sidebarWidth: 306,
            sidebarHeight: 639,
            sidebarVisible: true,
        })).toBe(1280);
    });
});
