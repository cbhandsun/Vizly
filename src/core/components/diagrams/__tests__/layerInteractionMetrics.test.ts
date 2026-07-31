import { describe, expect, it } from 'vitest';
import { resolveLayerTouchTargetSize } from '../layerInteractionMetrics';

describe('resolveLayerTouchTargetSize', () => {
    it('compensates for layout zoom to preserve a 44px physical target', () => {
        expect(resolveLayerTouchTargetSize(1)).toBe(44);
        expect(resolveLayerTouchTargetSize(0.85)).toBe(52);
        expect(resolveLayerTouchTargetSize(2)).toBe(22);
    });

    it('falls back safely for empty, invalid, and extreme scale input', () => {
        expect(resolveLayerTouchTargetSize(null)).toBe(44);
        expect(resolveLayerTouchTargetSize(Number.NaN)).toBe(44);
        expect(resolveLayerTouchTargetSize(0)).toBe(44);
        expect(resolveLayerTouchTargetSize(-1)).toBe(44);
    });
});
