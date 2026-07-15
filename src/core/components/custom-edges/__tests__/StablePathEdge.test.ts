import { describe, expect, it } from 'vitest';

import { estimateEdgeLabelRect, getEdgeLabelAutoOffset } from '../edgeLabelAvoidance';

describe('edge label avoidance', () => {
    it('moves generated labels away from peer edge paths', () => {
        const offset = getEdgeLabelAutoOffset(
            [{ x: 100, y: 0 }, { x: 100, y: 200 }],
            { x: 100, y: 100 },
            '发货指令(SOP)',
            [[{ x: 130, y: 60 }, { x: 130, y: 140 }]],
        );

        expect(offset.x).toBeLessThan(-10);
        expect(Math.abs(offset.y)).toBeLessThanOrEqual(32);
    });

    it('moves generated labels away from node obstacles', () => {
        const offset = getEdgeLabelAutoOffset(
            [{ x: 0, y: 100 }, { x: 200, y: 100 }],
            { x: 100, y: 100 },
            'approval',
            [],
            [{ x: 62, y: 86, width: 76, height: 28 }],
        );

        expect(Math.abs(offset.y)).toBeGreaterThan(10);
        expect(Math.abs(offset.x)).toBeLessThanOrEqual(32);
    });

    it('ignores invalid peer paths and obstacle rectangles', () => {
        const offset = getEdgeLabelAutoOffset(
            [{ x: 0, y: 0 }, { x: 0, y: 100 }],
            { x: 0, y: 50 },
            '<script>alert(1)</script>safe',
            [
                [{ x: Number.NaN, y: 0 }, { x: 10, y: 100 }],
                [{ x: 40, y: 0 }, { x: 40, y: 100 }],
            ] as any,
            [
                { x: Number.POSITIVE_INFINITY, y: 0, width: 100, height: 20 },
                { x: 18, y: 38, width: 60, height: 24 },
            ] as any,
        );

        expect(Number.isFinite(offset.x)).toBe(true);
        expect(Number.isFinite(offset.y)).toBe(true);
        expect(offset.x).toBeLessThan(-10);
    });

    it('keeps measurement bounded for very long labels and invalid centers', () => {
        const rect = estimateEdgeLabelRect(
            { x: Number.NaN, y: Number.POSITIVE_INFINITY },
            `${'超长标签'.repeat(100)}<img src=x onerror=alert(1)>`,
        );

        expect(rect).toEqual({ x: -110, y: -13, width: 220, height: 26 });
    });
});
