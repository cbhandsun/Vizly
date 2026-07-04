import { describe, expect, it } from 'vitest';
import { findPath, generateSimplePath, type LineObstacle, type Point } from '../pathfinding';

describe('pathfinding edge avoidance', () => {
    it('does not use a simple path that crosses an existing routed edge', () => {
        const start = { x: 0, y: 0 };
        const end = { x: 100, y: 0 };
        const lineObstacles: LineObstacle[] = [
            { start: { x: 50, y: -40 }, end: { x: 50, y: 40 } },
        ];

        expect(generateSimplePath(start, end, [], lineObstacles)).toBeNull();
        expect(generateSimplePath(start, end, [], lineObstacles, { allowLineCrossings: true })).toEqual([start, end]);
    });

    it('routes around an existing edge instead of sharing its segment', () => {
        const lineObstacles: LineObstacle[] = [
            { start: { x: 20, y: 0 }, end: { x: 80, y: 0 } },
        ];

        const path = findPath(
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            [],
            20,
            lineObstacles
        );

        expect(path).not.toBeNull();
        expect(pathHasCollinearOverlap(path!, lineObstacles)).toBe(false);
    });

    it('keeps the smoothed path from shortcutting back across an existing edge', () => {
        const lineObstacles: LineObstacle[] = [
            { start: { x: 50, y: -30 }, end: { x: 50, y: 30 } },
        ];

        const path = findPath(
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            [],
            20,
            lineObstacles
        );

        expect(path).not.toBeNull();
        expect(pathHasStrictCrossing(path!, lineObstacles)).toBe(false);
    });
});

function pathHasStrictCrossing(path: Point[], lineObstacles: LineObstacle[]): boolean {
    return path.some((point, index) => {
        if (index >= path.length - 1) return false;
        return lineObstacles.some(line => segmentsStrictlyCross(point, path[index + 1], line.start, line.end));
    });
}

function pathHasCollinearOverlap(path: Point[], lineObstacles: LineObstacle[]): boolean {
    return path.some((point, index) => {
        if (index >= path.length - 1) return false;
        return lineObstacles.some(line => segmentsOverlap(point, path[index + 1], line.start, line.end));
    });
}

function segmentsStrictlyCross(a: Point, b: Point, c: Point, d: Point): boolean {
    const aHorizontal = Math.abs(a.y - b.y) < 1;
    const cHorizontal = Math.abs(c.y - d.y) < 1;
    if (aHorizontal === cHorizontal) return false;

    const h1 = aHorizontal ? a : c;
    const h2 = aHorizontal ? b : d;
    const v1 = aHorizontal ? c : a;
    const v2 = aHorizontal ? d : b;
    const minHX = Math.min(h1.x, h2.x);
    const maxHX = Math.max(h1.x, h2.x);
    const minVY = Math.min(v1.y, v2.y);
    const maxVY = Math.max(v1.y, v2.y);
    const x = v1.x;
    const y = h1.y;

    return x > minHX + 1 && x < maxHX - 1 && y > minVY + 1 && y < maxVY - 1;
}

function segmentsOverlap(a: Point, b: Point, c: Point, d: Point): boolean {
    const aVertical = Math.abs(a.x - b.x) < 1;
    const cVertical = Math.abs(c.x - d.x) < 1;
    if (aVertical !== cVertical) return false;

    if (aVertical) {
        if (Math.abs(a.x - c.x) > 1) return false;
        return Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y))
            < Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - 1;
    }

    if (Math.abs(a.y - c.y) > 1) return false;
    return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
        < Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - 1;
}
