import { describe, expect, it } from 'vitest';

import {
    normalizeNodePropertyDimension,
    resolveNodePropertyDimensionBounds,
} from '../nodePropertyDimensions';

describe('node property dimension boundaries', () => {
    it('uses the same bounds as standard node resize handles', () => {
        expect(resolveNodePropertyDimensionBounds([{ type: 'flowchart' }], 'width'))
            .toEqual({ min: 80, max: 800 });
        expect(resolveNodePropertyDimensionBounds([{ type: 'flowchart' }], 'height'))
            .toEqual({ min: 40, max: 600 });
    });

    it('uses stricter compatible bounds for mixed selections', () => {
        expect(resolveNodePropertyDimensionBounds([
            { type: 'iconNode' },
            { type: 'titleGroup' },
        ], 'width')).toEqual({ min: 200, max: 800 });
        expect(resolveNodePropertyDimensionBounds([
            { type: 'flowchart' },
            { type: 'swimLane' },
        ], 'height')).toEqual({ min: 250, max: 600 });
    });

    it('supports container and icon-specific resize limits', () => {
        expect(resolveNodePropertyDimensionBounds([{ type: 'iconNode' }], 'width'))
            .toEqual({ min: 32, max: 800 });
        expect(resolveNodePropertyDimensionBounds([{ type: 'networkContainer' }], 'height'))
            .toEqual({ min: 80, max: 8_192 });
    });

    it('rejects empty, invalid, and non-finite values', () => {
        const bounds = { min: 80, max: 800 };
        expect(normalizeNodePropertyDimension(undefined, bounds)).toBeUndefined();
        expect(normalizeNodePropertyDimension(null, bounds)).toBeUndefined();
        expect(normalizeNodePropertyDimension('', bounds)).toBeUndefined();
        expect(normalizeNodePropertyDimension(Number.NaN, bounds)).toBeUndefined();
        expect(normalizeNodePropertyDimension(Number.POSITIVE_INFINITY, bounds)).toBeUndefined();
    });

    it('clamps negative, zero, and extreme values while preserving valid input', () => {
        const bounds = { min: 80, max: 800 };
        expect(normalizeNodePropertyDimension(-100, bounds)).toBe(80);
        expect(normalizeNodePropertyDimension(0, bounds)).toBe(80);
        expect(normalizeNodePropertyDimension(259.5, bounds)).toBe(259.5);
        expect(normalizeNodePropertyDimension(100_000, bounds)).toBe(800);
    });
});
