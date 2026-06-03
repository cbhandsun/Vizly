import { describe, expect, it } from 'vitest';
import { __smartEdgeRoutingTestUtils } from '../useSmartEdgeRouting';

const parsePoints = (path: string): Array<{ x: number; y: number }> => {
    const matches = [...path.matchAll(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)].map(match => Number(match[0]));
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i + 1 < matches.length; i += 2) {
        points.push({ x: matches[i], y: matches[i + 1] });
    }
    return points;
};

describe('useSmartEdgeRouting repair helpers', () => {
    it('delays same-source fan-out detours when the target enters from a side port', () => {
        const detouredPath = [
            'M 100 100',
            'L 100 130',
            'L 20 130',
            'L 20 500',
            'L 250 500',
            'L 250 470',
            'L 300 470',
        ].join(' ');

        const repaired = __smartEdgeRoutingTestUtils.repairEarlySameSourceFanOut(
            'e10',
            detouredPath,
            0,
            true,
            true,
            []
        );
        const points = parsePoints(repaired);
        const firstHorizontal = points.find((point, index) => {
            if (index === 0) return false;
            const prev = points[index - 1];
            return Math.abs(prev.y - point.y) < 1 && Math.abs(prev.x - point.x) > 40;
        });

        expect(repaired).not.toBe(detouredPath);
        expect(firstHorizontal?.y).toBeGreaterThan(350);
    });
});
