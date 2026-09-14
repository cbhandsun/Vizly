import { describe, expect, it } from 'vitest';
import { getWarehouseHtmlOverlayFrameStyle } from '../WarehouseHtmlOverlayProjection';

describe('WarehouseHtmlOverlay projection style', () => {
    it('centers visible overlays at projected viewport coordinates', () => {
        const style = getWarehouseHtmlOverlayFrameStyle({
            projectedX: 0,
            projectedY: 0,
            projectedZ: 0,
            viewportWidth: 1200,
            viewportHeight: 800,
            center: true,
            distanceFactor: 25,
            cameraDistance: 50,
            zIndexRange: [1000, 0],
        });

        expect(style.display).toBe('block');
        expect(style.transform).toBe('translate3d(600.00px, 400.00px, 0) translate(-50%, -50%) scale(0.500)');
        expect(style.zIndex).toBe('500');
    });

    it('hides overlays outside clip depth and clamps distance scaling', () => {
        const nearStyle = getWarehouseHtmlOverlayFrameStyle({
            projectedX: 1,
            projectedY: -1,
            projectedZ: 1.2,
            viewportWidth: 1000,
            viewportHeight: 500,
            center: false,
            distanceFactor: 25,
            cameraDistance: 0,
        });

        expect(nearStyle.display).toBe('none');
        expect(nearStyle.transform).toBe('translate3d(1000.00px, 500.00px, 0) scale(2.500)');
    });
});
