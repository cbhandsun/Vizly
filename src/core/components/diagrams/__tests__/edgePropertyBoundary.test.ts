import { describe, expect, it } from 'vitest';

import {
    EDGE_PROPERTY_STROKE_WIDTH_DEFAULT,
    coerceEdgePropertyStrokeWidth,
} from '../edgePropertyBoundary';

describe('edge property boundaries', () => {
    it('preserves finite in-range widths', () => {
        expect(coerceEdgePropertyStrokeWidth(2.5)).toBe(2.5);
    });

    it.each([
        undefined,
        null,
        '',
        '8',
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        { value: 8 },
        '<script>alert(1)</script>',
    ])('uses the commercial default for invalid input (%s)', (value) => {
        expect(coerceEdgePropertyStrokeWidth(value)).toBe(EDGE_PROPERTY_STROKE_WIDTH_DEFAULT);
    });

    it('clamps negative, zero, and extreme widths to the editor contract', () => {
        expect(coerceEdgePropertyStrokeWidth(-100)).toBe(1);
        expect(coerceEdgePropertyStrokeWidth(0)).toBe(1);
        expect(coerceEdgePropertyStrokeWidth(1_000_000)).toBe(16);
    });
});
