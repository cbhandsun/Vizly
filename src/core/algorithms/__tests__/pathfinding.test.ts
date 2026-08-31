import { describe, expect, it } from 'vitest';
import { buildPathfindingGrid, findPath, generateSimplePath, type LineObstacle, type Point } from '../pathfinding';
import { isPathBlocked } from '../pathfindingCollision';

describe('pathfinding edge avoidance', () => {
    it('relaxes soft-zone costs without turning an actual node into a soft obstacle', () => {
        const start = { x: 0, y: 0 };
        const end = { x: 400, y: 0 };
        const softZone = { x: 150, y: -150, width: 100, height: 300, padding: 40, isSoftZone: true };
        const peerLines = [{ start: end, end: { x: 25, y: 0 } }];
        const bounds = { startX: 0, startY: 0, endX: 400, endY: 0 };
        const grid = buildPathfindingGrid([softZone], bounds, 20);
        const softPath = findPath(start, end, [softZone], 20, peerLines, undefined, grid, [], true);
        expect(softPath).not.toBeNull();
        if (!softPath) throw new Error('Expected a traversable soft zone');
        expect(softPath[0]).toEqual(start);
        expect(softPath.at(-1)).toEqual(end);
        const length = softPath.slice(1).reduce((total, point, index) => total
            + Math.abs(point.x - softPath[index].x) + Math.abs(point.y - softPath[index].y), 0);
        expect(length).toBeLessThanOrEqual(400 * 1.8);
        expect(isPathBlocked(softPath, [softZone], 0)).toBe(true);

        const node = { x: 150, y: -80, width: 100, height: 160, padding: 0 };
        const obstacles = [softZone, node];
        const blockedGrid = buildPathfindingGrid(obstacles, bounds, 20);
        const path = findPath(start, end, obstacles, 20, peerLines, undefined, blockedGrid, [], true);
        expect(path).not.toBeNull();
        if (!path) throw new Error('Expected a detour around the hard node');
        expect(isPathBlocked(path, [node], 0)).toBe(false);
    });

    it.each([false, true])('still shortens a safe narrow corridor (custom clearance: %s)', customClearance => {
        const start = { x: 288, y: 140 };
        const end = { x: 512, y: 140 };
        const obstacles = [
            { x: 302, y: -200, width: 196, height: 338, ...(customClearance ? { padding: 10 } : {}) },
            { x: 302, y: 142, width: 196, height: 300, ...(customClearance ? { padding: 10 } : {}) },
        ];
        const grid = buildPathfindingGrid(obstacles, {
            startX: start.x, startY: start.y, endX: end.x, endY: end.y,
        }, 16);
        expect(generateSimplePath(start, end, obstacles)).toBeNull();
        const path = findPath(start, end, obstacles, 16, [], undefined, grid, [], true);
        expect(path).toEqual([start, end]);
        expect(isPathBlocked(path ?? [], obstacles.map(rect => ({ ...rect, padding: 1 })), 1)).toBe(false);
    });

    it.each([
        { strict: false, vertical: false, reverse: false },
        { strict: true, vertical: false, reverse: false },
        { strict: true, vertical: true, reverse: false },
        { strict: true, vertical: false, reverse: true },
        { strict: true, vertical: true, reverse: true },
    ])('preserves a necessary long detour: %j', ({ strict, vertical, reverse }) => {
        const transform = (x: number, y: number): Point => vertical ? { x: y, y: x } : { x, y };
        const start = transform(reverse ? 512 : 288, 140);
        const end = transform(reverse ? 288 : 512, 140);
        const obstacles = [{ ...transform(302, 52), width: vertical ? 176 : 196,
            height: vertical ? 196 : 176, padding: 0 }];
        const before = structuredClone(obstacles);
        const grid = buildPathfindingGrid(obstacles, {
            startX: start.x, startY: start.y, endX: end.x, endY: end.y,
        }, 16);
        const path = findPath(start, end, obstacles, 16, [], undefined, grid, [], strict);
        expect(path).not.toBeNull();
        if (!path) throw new Error('Expected a safe detour');
        expect(path[0]).toEqual(start);
        expect(path.at(-1)).toEqual(end);
        expect(isPathBlocked(path, obstacles, 0)).toBe(false);
        expect(obstacles).toEqual(before);
    });

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
