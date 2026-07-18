import { SpatialIndex } from './SpatialIndex';
import type { LineObstacle, Point, Rectangle } from './pathfindingTypes';

export function isPointInRectangle(x: number, y: number, rect: Rectangle, padding: number = 0): boolean {
    return (
        x >= rect.x - padding &&
        x <= rect.x + rect.width + padding &&
        y >= rect.y - padding &&
        y <= rect.y + rect.height + padding
    );
}

// Standard utils
function isHLineIntersectingRect(y: number, x1: number, x2: number, rect: Rectangle, padding: number = 0): boolean {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    if (y < rect.y - padding || y > rect.y + rect.height + padding) return false;
    if (maxX < rect.x - padding || minX > rect.x + rect.width + padding) return false;
    return true;
}

function isVLineIntersectingRect(x: number, y1: number, y2: number, rect: Rectangle, padding: number = 0): boolean {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    if (x < rect.x - padding || x > rect.x + rect.width + padding) return false;
    if (maxY < rect.y - padding || minY > rect.y + rect.height + padding) return false;
    return true;
}

export function areSegmentsCollinearAndOverlapping(p1: Point, p2: Point, p3: Point, p4: Point, threshold: number = 2): boolean {
    const isVertical1 = Math.abs(p1.x - p2.x) < 0.1;
    const isVertical2 = Math.abs(p3.x - p4.x) < 0.1;
    if (isVertical1 !== isVertical2) return false;

    if (isVertical1) {
        if (Math.abs(p1.x - p3.x) > threshold) return false;
        const min1 = Math.min(p1.y, p2.y), max1 = Math.max(p1.y, p2.y);
        const min2 = Math.min(p3.y, p4.y), max2 = Math.max(p3.y, p4.y);
        return Math.max(min1, min2) < Math.min(max1, max2) - 0.1;
    } else {
        if (Math.abs(p1.y - p3.y) > threshold) return false;
        const min1 = Math.min(p1.x, p2.x), max1 = Math.max(p1.x, p2.x);
        const min2 = Math.min(p3.x, p4.x), max2 = Math.max(p3.x, p4.x);
        return Math.max(min1, min2) < Math.min(max1, max2) - 0.1;
    }
}

function doLinesIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
    const ccw = (p: Point, a: Point, b: Point) => {
        return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 0;
    };
    return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
}

/**
 * 检查路径是否被任何障碍物阻挡 (Binary Block Check for Quick Probes)
 * Reverted to 15px to allow Bus Trunks to form close to nodes without false positives.
 */
export function isPathBlocked(path: Point[], obstacles: Rectangle[] | SpatialIndex, padding: number = 10, lineObstacles: LineObstacle[] = []): boolean {
    const isSpatialIndex = (obs: Rectangle[] | SpatialIndex): obs is SpatialIndex => typeof (obs as SpatialIndex).queryLine === 'function';

    for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i + 1];

        // 1. Check Rectangles
        if (isSpatialIndex(obstacles)) {
            // [FIX] Use query() with safely padded range to catch soft zones (up to 40px)
            const maxPadding = Math.max(padding, 40);
            const minX = Math.min(p1.x, p2.x) - maxPadding;
            const minY = Math.min(p1.y, p2.y) - maxPadding;
            const width = Math.abs(p1.x - p2.x) + maxPadding * 2;
            const height = Math.abs(p1.y - p2.y) + maxPadding * 2;

            const candidates = obstacles.query({ x: minX, y: minY, width, height });

            if (Math.abs(p1.y - p2.y) < 0.1) { // Horizontal
                for (const obs of candidates) {
                    const dynamicPadding = (obs as any).padding ?? padding;
                    if (isHLineIntersectingRect(p1.y, p1.x, p2.x, obs, dynamicPadding)) return true;
                }
            } else if (Math.abs(p1.x - p2.x) < 0.1) { // Vertical
                for (const obs of candidates) {
                    const dynamicPadding = (obs as any).padding ?? padding;
                    if (isVLineIntersectingRect(p1.x, p1.y, p2.y, obs, dynamicPadding)) return true;
                }
            } else {
                // [FIX] Diagonal Line Check
                for (const obs of candidates) {
                    const dynamicPadding = (obs as any).padding ?? padding;
                    // Check endpoints
                    if (isPointInRectangle(p1.x, p1.y, obs, dynamicPadding) || isPointInRectangle(p2.x, p2.y, obs, dynamicPadding)) return true;

                    // Check intersection with padded borders
                    const x1 = obs.x - dynamicPadding;
                    const y1 = obs.y - dynamicPadding;
                    const x2 = obs.x + obs.width + dynamicPadding;
                    const y2 = obs.y + obs.height + dynamicPadding;

                    const tl = { x: x1, y: y1 };
                    const tr = { x: x2, y: y1 };
                    const bl = { x: x1, y: y2 };
                    const br = { x: x2, y: y2 };

                    if (doLinesIntersect(p1, p2, tl, tr) ||
                        doLinesIntersect(p1, p2, tl, bl) ||
                        doLinesIntersect(p1, p2, tr, br) ||
                        doLinesIntersect(p1, p2, bl, br)) return true;
                }
            }
        } else {
            // Standard Linear Scan
            if (Math.abs(p1.y - p2.y) < 0.1) { // Horizontal
                for (const obs of obstacles) {
                    const dynamicPadding = (obs as any).padding ?? padding;
                    if (isHLineIntersectingRect(p1.y, p1.x, p2.x, obs, dynamicPadding)) return true;
                }
            }
            else if (Math.abs(p1.x - p2.x) < 0.1) { // Vertical
                for (const obs of obstacles) {
                    const dynamicPadding = (obs as any).padding ?? padding;
                    if (isVLineIntersectingRect(p1.x, p1.y, p2.y, obs, dynamicPadding)) return true;
                }
            }
            else {
                // [FIX] Diagonal Line Check (Linear Scan)
                for (const obs of obstacles) {
                    const dynamicPadding = (obs as any).padding ?? padding;
                    // Check endpoints
                    if (isPointInRectangle(p1.x, p1.y, obs, dynamicPadding) || isPointInRectangle(p2.x, p2.y, obs, dynamicPadding)) return true;

                    // Check intersection with padded borders
                    const x1 = obs.x - dynamicPadding;
                    const y1 = obs.y - dynamicPadding;
                    const x2 = obs.x + obs.width + dynamicPadding;
                    const y2 = obs.y + obs.height + dynamicPadding;

                    const tl = { x: x1, y: y1 };
                    const tr = { x: x2, y: y1 };
                    const bl = { x: x1, y: y2 };
                    const br = { x: x2, y: y2 };

                    if (doLinesIntersect(p1, p2, tl, tr) ||
                        doLinesIntersect(p1, p2, tl, bl) ||
                        doLinesIntersect(p1, p2, tr, br) ||
                        doLinesIntersect(p1, p2, bl, br)) return true;
                }
            }
        }

        // 2. Check Lines
        if (lineObstacles.length > 0) {
            for (const line of lineObstacles) {
                // Check intersection (crossing) OR strict overlap (running on top)
                if (doLinesIntersect(p1, p2, line.start, line.end) ||
                    areSegmentsCollinearAndOverlapping(p1, p2, line.start, line.end)) {
                    return true;
                }
            }
        }
    }
    return false;
}
