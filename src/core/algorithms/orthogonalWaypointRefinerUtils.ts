import type { Point, Rectangle } from '../types/routing';
import { RoutingCrossingScorer } from './routingCrossingScorer';

export interface CandidateAxes {
    horizontal?: number[];
    vertical?: number[];
}

export type OrthogonalDirection = 'L' | 'R' | 'U' | 'D';

export function mergeCandidateAxes(
    base: CandidateAxes | undefined,
    extra: { horizontal: number[]; vertical: number[] }
): { horizontal: number[]; vertical: number[] } {
    return {
        horizontal: [...new Set([...(base?.horizontal ?? []), ...extra.horizontal])],
        vertical: [...new Set([...(base?.vertical ?? []), ...extra.vertical])],
    };
}

export function buildRouteAwareAxes(
    edgeId: string,
    allPaths: Map<string, Point[]>,
    points: Point[],
    spacing: number
): { horizontal: number[]; vertical: number[] } {
    const horizontal = new Set<number>();
    const vertical = new Set<number>();
    const minX = Math.min(...points.map(p => p.x)) - spacing * 24;
    const maxX = Math.max(...points.map(p => p.x)) + spacing * 24;
    const minY = Math.min(...points.map(p => p.y)) - spacing * 24;
    const maxY = Math.max(...points.map(p => p.y)) + spacing * 24;

    for (const [otherEdgeId, otherPoints] of allPaths) {
        if (otherEdgeId === edgeId) continue;
        for (let i = 0; i < otherPoints.length - 1; i++) {
            const a = otherPoints[i];
            const b = otherPoints[i + 1];
            const isHorizontal = Math.abs(a.y - b.y) < 1.5;
            const isVertical = Math.abs(a.x - b.x) < 1.5;
            if (isHorizontal) {
                const y = (a.y + b.y) / 2;
                const segMinX = Math.min(a.x, b.x);
                const segMaxX = Math.max(a.x, b.x);
                if (y < minY || y > maxY || segMaxX < minX || segMinX > maxX) continue;
                horizontal.add(Math.round(y - spacing));
                horizontal.add(Math.round(y + spacing));
                horizontal.add(Math.round(y - spacing * 2));
                horizontal.add(Math.round(y + spacing * 2));
                vertical.add(Math.round(segMinX - spacing));
                vertical.add(Math.round(segMaxX + spacing));
                vertical.add(Math.round(segMinX - spacing * 2));
                vertical.add(Math.round(segMaxX + spacing * 2));
            } else if (isVertical) {
                const x = (a.x + b.x) / 2;
                const segMinY = Math.min(a.y, b.y);
                const segMaxY = Math.max(a.y, b.y);
                if (x < minX || x > maxX || segMaxY < minY || segMinY > maxY) continue;
                vertical.add(Math.round(x - spacing));
                vertical.add(Math.round(x + spacing));
                vertical.add(Math.round(x - spacing * 2));
                vertical.add(Math.round(x + spacing * 2));
                horizontal.add(Math.round(segMinY - spacing));
                horizontal.add(Math.round(segMaxY + spacing));
                horizontal.add(Math.round(segMinY - spacing * 2));
                horizontal.add(Math.round(segMaxY + spacing * 2));
            }
        }
    }

    return {
        horizontal: [...horizontal].slice(0, 160),
        vertical: [...vertical].slice(0, 160),
    };
}

export function buildPathAxes(points: Point[]): { horizontal: number[]; vertical: number[] } {
    const horizontal = new Set<number>();
    const vertical = new Set<number>();
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (Math.abs(a.y - b.y) < 1.5) {
            horizontal.add(Math.round((a.y + b.y) / 2));
        } else if (Math.abs(a.x - b.x) < 1.5) {
            vertical.add(Math.round((a.x + b.x) / 2));
        }
    }
    return { horizontal: [...horizontal], vertical: [...vertical] };
}

export function buildStartEscapePoints(
    start: Point,
    direction: OrthogonalDirection | null,
    spacing: number,
    lockedPoint?: Point
): Point[] {
    if (lockedPoint) return [clonePoint(lockedPoint)];
    if (!direction) return [];
    return uniquePoints([4, 8, 12].map(mult => pointAlongDirection(start, direction, spacing * mult)));
}

export function buildEndApproachPoints(
    end: Point,
    direction: OrthogonalDirection | null,
    spacing: number,
    lockedPoint?: Point
): Point[] {
    if (lockedPoint) return [clonePoint(lockedPoint)];
    if (!direction) return [];
    return uniquePoints([4, 8, 12].map(mult => pointAlongDirection(end, oppositeDirection(direction), spacing * mult)));
}

export function candidatePathLength(points: Point[]): number {
    return RoutingCrossingScorer.pathLength(RoutingCrossingScorer.simplifyOrthogonalPoints(points));
}

function pointAlongDirection(point: Point, direction: OrthogonalDirection, distance: number): Point {
    switch (direction) {
        case 'L': return { x: point.x - distance, y: point.y };
        case 'R': return { x: point.x + distance, y: point.y };
        case 'U': return { x: point.x, y: point.y - distance };
        case 'D': return { x: point.x, y: point.y + distance };
    }
}

function oppositeDirection(direction: OrthogonalDirection): OrthogonalDirection {
    switch (direction) {
        case 'L': return 'R';
        case 'R': return 'L';
        case 'U': return 'D';
        case 'D': return 'U';
    }
}

export function isHorizontalDirection(direction: OrthogonalDirection): boolean {
    return direction === 'L' || direction === 'R';
}

function uniquePoints(points: Point[]): Point[] {
    const seen = new Set<string>();
    return points.filter(point => {
        const key = `${Math.round(point.x)},${Math.round(point.y)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function clonePoint(point: Point): Point {
    return { x: point.x, y: point.y };
}

export function samePoint(a: Point, b: Point, tolerance = 1.5): boolean {
    return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

export function samePath(a: Point[], b: Point[], tolerance = 1.5): boolean {
    if (a.length !== b.length) return false;
    return a.every((point, index) => samePoint(point, b[index], tolerance));
}

export function getCrossingAwareAxisValues(
    edgeId: string,
    a: Point,
    b: Point,
    allPaths: Map<string, Point[]>,
    softObstacles: Rectangle[],
    isHorizontal: boolean,
    spacing: number
): number[] {
    const values = new Set<number>();
    const segMinX = Math.min(a.x, b.x);
    const segMaxX = Math.max(a.x, b.x);
    const segMinY = Math.min(a.y, b.y);
    const segMaxY = Math.max(a.y, b.y);
    const fixed = isHorizontal ? (a.y + b.y) / 2 : (a.x + b.x) / 2;

    for (const [otherEdgeId, otherPoints] of allPaths) {
        if (otherEdgeId === edgeId) continue;
        for (let i = 0; i < otherPoints.length - 1; i++) {
            const c = otherPoints[i];
            const d = otherPoints[i + 1];
            const otherHorizontal = Math.abs(c.y - d.y) < 1.5;
            const otherVertical = Math.abs(c.x - d.x) < 1.5;
            if (isHorizontal && otherVertical) {
                const x = (c.x + d.x) / 2;
                const minY = Math.min(c.y, d.y);
                const maxY = Math.max(c.y, d.y);
                if (x > segMinX + 2 && x < segMaxX - 2 && fixed > minY + 2 && fixed < maxY - 2) {
                    values.add(minY - spacing);
                    values.add(maxY + spacing);
                }
            } else if (!isHorizontal && otherHorizontal) {
                const y = (c.y + d.y) / 2;
                const minX = Math.min(c.x, d.x);
                const maxX = Math.max(c.x, d.x);
                if (y > segMinY + 2 && y < segMaxY - 2 && fixed > minX + 2 && fixed < maxX - 2) {
                    values.add(minX - spacing);
                    values.add(maxX + spacing);
                }
            }
        }
    }

    for (const rect of softObstacles) {
        if (isHorizontal) {
            if (fixed > rect.y - 1 && fixed < rect.y + rect.height + 1 && segMaxX > rect.x && segMinX < rect.x + rect.width) {
                values.add(rect.y - spacing);
                values.add(rect.y + rect.height + spacing);
            }
        } else if (fixed > rect.x - 1 && fixed < rect.x + rect.width + 1 && segMaxY > rect.y && segMinY < rect.y + rect.height) {
            values.add(rect.x - spacing);
            values.add(rect.x + rect.width + spacing);
        }
    }

    return [...values];
}

export function getDoglegShrinkAxisValues(
    edgeId: string,
    points: Point[],
    segIdx: number,
    allPaths: Map<string, Point[]>,
    movingSegmentIsHorizontal: boolean,
    spacing: number
): number[] {
    const values = new Set<number>();
    const before = points[segIdx - 1];
    const a = points[segIdx];
    const b = points[segIdx + 1];
    const after = points[segIdx + 2];
    if (!before || !after) return [];

    const addInwardCandidate = (anchor: number, fixed: number, crossing: number) => {
        const goingPositive = fixed > anchor;
        const between = goingPositive
            ? crossing > anchor + 2 && crossing < fixed - 2
            : crossing < anchor - 2 && crossing > fixed + 2;
        if (!between) return;

        const inward = goingPositive ? crossing - spacing : crossing + spacing;
        values.add(inward);
        values.add(goingPositive ? crossing - spacing * 2 : crossing + spacing * 2);
    };

    for (const [otherEdgeId, otherPoints] of allPaths) {
        if (otherEdgeId === edgeId) continue;

        for (let i = 0; i < otherPoints.length - 1; i++) {
            const c = otherPoints[i];
            const d = otherPoints[i + 1];
            const otherHorizontal = Math.abs(c.y - d.y) < 1.5;
            const otherVertical = Math.abs(c.x - d.x) < 1.5;

            if (!movingSegmentIsHorizontal && otherVertical) {
                const crossingX = (c.x + d.x) / 2;
                const minY = Math.min(c.y, d.y);
                const maxY = Math.max(c.y, d.y);

                if (Math.abs(before.y - a.y) < 1.5 && before.y > minY + 2 && before.y < maxY - 2) {
                    addInwardCandidate(before.x, a.x, crossingX);
                }
                if (Math.abs(b.y - after.y) < 1.5 && b.y > minY + 2 && b.y < maxY - 2) {
                    addInwardCandidate(after.x, b.x, crossingX);
                }
            } else if (movingSegmentIsHorizontal && otherHorizontal) {
                const crossingY = (c.y + d.y) / 2;
                const minX = Math.min(c.x, d.x);
                const maxX = Math.max(c.x, d.x);

                if (Math.abs(before.x - a.x) < 1.5 && before.x > minX + 2 && before.x < maxX - 2) {
                    addInwardCandidate(before.y, a.y, crossingY);
                }
                if (Math.abs(b.x - after.x) < 1.5 && b.x > minX + 2 && b.x < maxX - 2) {
                    addInwardCandidate(after.y, b.y, crossingY);
                }
            }
        }
    }

    return [...values];
}

export function getDoglegCompactionAxisValues(
    points: Point[],
    segIdx: number,
    movingSegmentIsHorizontal: boolean,
    spacing: number
): number[] {
    const before = points[segIdx - 1];
    const a = points[segIdx];
    const b = points[segIdx + 1];
    const after = points[segIdx + 2];
    if (!before || !after) return [];

    const values = new Set<number>();
    const addTowardAnchors = (base: number, anchorA: number, anchorB: number) => {
        const lowAnchor = Math.min(anchorA, anchorB);
        const highAnchor = Math.max(anchorA, anchorB);
        if (base > highAnchor + spacing * 3) {
            [1, 2, 3, 4].forEach(mult => values.add(highAnchor + spacing * mult));
        } else if (base < lowAnchor - spacing * 3) {
            [1, 2, 3, 4].forEach(mult => values.add(lowAnchor - spacing * mult));
        }
    };

    if (!movingSegmentIsHorizontal) {
        const prevIsHorizontal = Math.abs(before.y - a.y) < 1.5;
        const nextIsHorizontal = Math.abs(b.y - after.y) < 1.5;
        if (prevIsHorizontal && nextIsHorizontal) {
            addTowardAnchors((a.x + b.x) / 2, before.x, after.x);
        }
    } else {
        const prevIsVertical = Math.abs(before.x - a.x) < 1.5;
        const nextIsVertical = Math.abs(b.x - after.x) < 1.5;
        if (prevIsVertical && nextIsVertical) {
            addTowardAnchors((a.y + b.y) / 2, before.y, after.y);
        }
    }

    return [...values];
}

export function getCandidateAxisValues(
    base: number,
    semanticAxes: number[] | undefined,
    spacing: number,
    localAxes: number[] = []
): number[] {
    const values = new Set<number>();
    [-10, 10, -8, 8, -6, 6, -4, 4, -3, 3, -2, 2, -1, 1].forEach(n => values.add(base + n * spacing));
    localAxes.forEach(axis => {
        if (Math.abs(axis - base) <= spacing * 24) values.add(axis);
    });

    for (const axis of semanticAxes ?? []) {
        if (Math.abs(axis - base) <= spacing * 18) {
            values.add(axis);
            values.add(axis - spacing);
            values.add(axis + spacing);
        }
    }

    return [...values]
        .sort((a, b) => Math.abs(a - base) - Math.abs(b - base))
        .slice(0, 36);
}
