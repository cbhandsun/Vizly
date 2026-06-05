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

const pathHitsRect = (
    points: Array<{ x: number; y: number }>,
    rect: { x: number; y: number; width: number; height: number }
): boolean => {
    const left = rect.x + 2;
    const right = rect.x + rect.width - 2;
    const top = rect.y + 2;
    const bottom = rect.y + rect.height - 2;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (Math.abs(a.y - b.y) < 1) {
            const y = a.y;
            if (y > top && y < bottom && Math.max(Math.min(a.x, b.x), left) < Math.min(Math.max(a.x, b.x), right)) {
                return true;
            }
        }
        if (Math.abs(a.x - b.x) < 1) {
            const x = a.x;
            if (x > left && x < right && Math.max(Math.min(a.y, b.y), top) < Math.min(Math.max(a.y, b.y), bottom)) {
                return true;
            }
        }
    }
    return false;
};

const minDistanceToRect = (
    points: Array<{ x: number; y: number }>,
    rect: { x: number; y: number; width: number; height: number }
): number => {
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;
    let best = Infinity;

    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (Math.abs(a.y - b.y) < 1) {
            const y = a.y;
            const minX = Math.min(a.x, b.x);
            const maxX = Math.max(a.x, b.x);
            const overlapsX = Math.max(minX, left) <= Math.min(maxX, right);
            if (overlapsX && y >= top && y <= bottom) return 0;
            if (overlapsX) best = Math.min(best, Math.abs(y - top), Math.abs(y - bottom));
        }
        if (Math.abs(a.x - b.x) < 1) {
            const x = a.x;
            const minY = Math.min(a.y, b.y);
            const maxY = Math.max(a.y, b.y);
            const overlapsY = Math.max(minY, top) <= Math.min(maxY, bottom);
            if (overlapsY && x >= left && x <= right) return 0;
            if (overlapsY) best = Math.min(best, Math.abs(x - left), Math.abs(x - right));
        }
    }

    return best;
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

    it('doglegs locked rendered paths around non-endpoint business nodes', () => {
        const crossingPath = 'M 60 280 L 1120 280';
        const greedySpec = { x: 100, y: 244, width: 180, height: 92 };
        const mergeRes = { x: 610, y: 244, width: 220, height: 92 };

        const repaired = __smartEdgeRoutingTestUtils.repairHardObstacleRenderedPath(
            'e16',
            crossingPath,
            0,
            true,
            [greedySpec, mergeRes]
        );
        const points = parsePoints(repaired);

        expect(repaired).not.toBe(crossingPath);
        expect(pathHitsRect(points, greedySpec)).toBe(false);
        expect(pathHitsRect(points, mergeRes)).toBe(false);
    });

    it('doglegs locked rendered paths away from near-miss business nodes', () => {
        const nearMissPath = 'M 60 232 L 1120 232';
        const greedySpec = { x: 100, y: 244, width: 180, height: 92 };

        const repaired = __smartEdgeRoutingTestUtils.repairHardObstacleRenderedPath(
            'e16',
            nearMissPath,
            0,
            true,
            [greedySpec]
        );
        const points = parsePoints(repaired);

        expect(repaired).not.toBe(nearMissPath);
        expect(pathHitsRect(points, greedySpec)).toBe(false);
        expect(minDistanceToRect(points, greedySpec)).toBeGreaterThanOrEqual(18);
    });
});
