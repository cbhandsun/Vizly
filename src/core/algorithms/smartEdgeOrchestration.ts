import { Position } from '../types/flow';
import type { Rectangle, Point } from './pathfinding';
import { isPathBlocked } from './pathfinding';


/**
 * [NEW] Greedy Orthogonal Path Generator
 * A lightweight heuristic-based router for real-time interactions (dragging).
 * It attempts to find a reasonable orthogonal path without the full cost of A*.
 *
 * Strategy:
 * 1. Start from Source Stub
 * 2. Try to align X or Y with Target Stub
 * 3. If aligned, go straight to Target Stub
 * 4. Ensure we don't cut through Source/Target Nodes (basic check)
 */
export function generateGreedyOrthogonalPath(
    source: Point,
    target: Point,
    sourcePos: Position,
    targetPos: Position,
    offset: number = 20
): Point[] {
    const points: Point[] = [];

    // 1. Calculate Stubs (Start/End Segments)
    const getStub = (p: Point, pos: Position, dist: number): Point => {
        switch (pos) {
            case Position.Top: return { x: p.x, y: p.y - dist };
            case Position.Bottom: return { x: p.x, y: p.y + dist };
            case Position.Left: return { x: p.x - dist, y: p.y };
            case Position.Right: return { x: p.x + dist, y: p.y };
        }
    };

    const startStub = getStub(source, sourcePos, offset);
    const endStub = getStub(target, targetPos, offset);

    points.push(source);
    points.push(startStub);

    // 2. Middle Routing Logic
    // Decide intermediate points based on relative positions

    const midPoints: Point[] = [];

    // Direction vectors
    const isSourceVert = sourcePos === Position.Top || sourcePos === Position.Bottom;
    const isTargetVert = targetPos === Position.Top || targetPos === Position.Bottom;

    if (isSourceVert && isTargetVert) {
        // Vertical -> Vertical
        // Need a horizontal bridge
        const midY = (startStub.y + endStub.y) / 2;
        midPoints.push({ x: startStub.x, y: midY });
        midPoints.push({ x: endStub.x, y: midY });
    } else if (!isSourceVert && !isTargetVert) {
        // Horizontal -> Horizontal
        // Need a vertical bridge
        const midX = (startStub.x + endStub.x) / 2;
        midPoints.push({ x: midX, y: startStub.y });
        midPoints.push({ x: midX, y: endStub.y });
    } else if (isSourceVert && !isTargetVert) {
        // Vertical -> Horizontal
        // One corner intersection
        // Check two possibilities: (start.x, end.y) or (end.x, start.y)
        midPoints.push({ x: startStub.x, y: endStub.y });
    } else {
        // Horizontal -> Vertical
        midPoints.push({ x: endStub.x, y: startStub.y });
    }

    // 3. Simple Node Collision Avoidance (Heuristic)
    // If midPoints cut through source/target rects, try the alternative route?
    // For MVP, we stick to the simple midline approach.
    // It's much better than a straight diagonal line.

    points.push(...midPoints);
    points.push(endStub);
    points.push(target);

    // Optimize: Remove collinear redundant points
    return removeCollinearPoints(points);
}

function removeCollinearPoints(points: Point[]): Point[] {
    if (points.length < 3) return points;
    const result = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        const prev = result[result.length - 1];
        const curr = points[i];
        const next = points[i + 1];

        // Check collinearity
        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;

        const isHorizontal = Math.abs(dy1) < 0.1 && Math.abs(dy2) < 0.1;
        const isVertical = Math.abs(dx1) < 0.1 && Math.abs(dx2) < 0.1;

        if (!isHorizontal && !isVertical) {
            result.push(curr);
        }
    }
    result.push(points[points.length - 1]);
    return result;
}

/**
 * [NEW] Aligns path segments to obstacle borders (Hanan-lite)
 * This fixes the "Grid Misalignment" issue where paths run slightly off-center from obstacles
 * because the A* grid (e.g. 20px) doesn't match the obstacle dimensions perfectly.
 */
export function alignSegmentsToObstacles(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex,
    snapDistance: number = 20 // Max distance to snap
): Point[] {
    if (points.length < 4) return points; // Need at least start->p1->p2->end

    const newPoints = points.map(p => ({ ...p }));
    const isSpatial = (obs: unknown): obs is SpatialIndex => typeof (obs as SpatialIndex).query === 'function';

    // We skip the first and last segments as they are connected to ports
    for (let i = 1; i < newPoints.length - 2; i++) {
        const p1 = newPoints[i];
        const p2 = newPoints[i + 1];

        const isHorizontal = Math.abs(p1.y - p2.y) < 0.1;
        const isVertical = Math.abs(p1.x - p2.x) < 0.1;

        if (!isHorizontal && !isVertical) continue; // Skip diagonals

        // Define search area
        const searchRect = {
            x: Math.min(p1.x, p2.x) - (isVertical ? snapDistance : 0),
            y: Math.min(p1.y, p2.y) - (isHorizontal ? snapDistance : 0),
            width: Math.abs(p1.x - p2.x) + (isVertical ? snapDistance * 2 : 0),
            height: Math.abs(p1.y - p2.y) + (isHorizontal ? snapDistance * 2 : 0)
        };

        const candidates = isSpatial(obstacles)
            ? obstacles.query(searchRect)
            : obstacles; // Linear scan fallback (slow for many obstacles)

        let bestSnap: number | null = null;
        let minDiff = Infinity;

        // Try to find a border to snap to
        for (const obs of candidates) {
            // Target clearance (e.g. 15px away from border)
            const CLEARANCE = 15;

            if (isHorizontal) {
                // Check Top Border (obstacle is below path)
                // We want path to be at obs.y - CLEARANCE
                const targetY_Top = obs.y - CLEARANCE;
                const diffTop = Math.abs(p1.y - targetY_Top);

                // Check Bottom Border (obstacle is above path)
                // We want path to be at obs.y + h + CLEARANCE
                const targetY_Bottom = obs.y + obs.height + CLEARANCE;
                const diffBottom = Math.abs(p1.y - targetY_Bottom);

                if (diffTop < snapDistance && diffTop < minDiff) {
                    minDiff = diffTop;
                    bestSnap = targetY_Top;
                }
                if (diffBottom < snapDistance && diffBottom < minDiff) {
                    minDiff = diffBottom;
                    bestSnap = targetY_Bottom;
                }
            } else {
                // Vertical
                // Check Left Border
                const targetX_Left = obs.x - CLEARANCE;
                const diffLeft = Math.abs(p1.x - targetX_Left);

                // Check Right Border
                const targetX_Right = obs.x + obs.width + CLEARANCE;
                const diffRight = Math.abs(p1.x - targetX_Right);

                if (diffLeft < snapDistance && diffLeft < minDiff) {
                    minDiff = diffLeft;
                    bestSnap = targetX_Left;
                }
                if (diffRight < snapDistance && diffRight < minDiff) {
                    minDiff = diffRight;
                    bestSnap = targetX_Right;
                }
            }
        }

        // Apply Snap if found and valid
        if (bestSnap !== null) {
            const originalX1 = p1.x, originalY1 = p1.y;
            const originalX2 = p2.x, originalY2 = p2.y;

            if (isHorizontal) {
                p1.y = bestSnap;
                p2.y = bestSnap;
            } else {
                p1.x = bestSnap;
                p2.x = bestSnap;
            }

            // Validation: Check if the new segment + connections are blocked
            // Previous point
            const prev = newPoints[i - 1];
            // Next point
            const next = newPoints[i + 2];

            // Check 3 segments: prev->p1, p1->p2, p2->next
            const pathToCheck = [prev, p1, p2, next];

            // If blocked, revert
            if (isPathBlocked(pathToCheck, obstacles, 5)) { // Use small padding for check
                p1.x = originalX1; p1.y = originalY1;
                p2.x = originalX2; p2.y = originalY2;
            }
        }
    }

    return newPoints;
}


/**
 * [NEW] High-level Orthogonal Path Optimizer
 * 1. Minimizes Bends (Z -> L conversion)
 * 2. Balances Segments (Midpoint Routing for Z-shapes)
 *
 * @param points Input orthogonal points
 * @param obstacles Obstacles to avoid
 * @returns Optimized points
 */
export function optimizeOrthogonalPath(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex = [],
    options: { sourcePos?: Position, targetPos?: Position } = {} // [NEW] Port safety options
): Point[] {
    if (points.length < 4) return points;

    const res = [...points];

    // Helper to check blocking
    const isBlocked = (pts: Point[]) => isPathBlocked(pts, obstacles, 15); // Use moderate padding

    // Helper: Check if a proposed segment direction is valid for the port
    const isDirectionValid = (pStart: Point, pEnd: Point, pos?: Position): boolean => {
        if (!pos) return true;
        const dx = Math.abs(pEnd.x - pStart.x);
        const dy = Math.abs(pEnd.y - pStart.y);

        if (pos === Position.Top || pos === Position.Bottom) {
            // Must be Vertical (dx ~ 0)
            return dx < 1;
        } else if (pos === Position.Left || pos === Position.Right) {
            // Must be Horizontal (dy ~ 0)
            return dy < 1;
        }
        return true;
    };

    // Pass 1: Bend Reduction (Z -> L)
    // pattern: p0 -> p1 -> p2 -> p3
    // If p0 and p3 can form a single corner L-shape, do it.
    for (let i = 0; i < res.length - 3; i++) {
        const p0 = res[i];
        const p3 = res[i + 3];

        // Try Corner A: (p3.x, p0.y)
        const cornerA = { x: p3.x, y: p0.y };
        const pathA = [p0, cornerA, p3];

        // Try Corner B: (p0.x, p3.y)
        const cornerB = { x: p0.x, y: p3.y };
        const pathB = [p0, cornerB, p3];

        let success = false;

        // [SAFETY] If i=0 (Start), p0->corner must match sourcePos
        // If i=res.length-4 (End), corner->p3 must match targetPos

        const safeA =
            (i !== 0 || isDirectionValid(p0, cornerA, options.sourcePos)) &&
            (i !== res.length - 4 || isDirectionValid(cornerA, p3, options.targetPos));

        const safeB =
            (i !== 0 || isDirectionValid(p0, cornerB, options.sourcePos)) &&
            (i !== res.length - 4 || isDirectionValid(cornerB, p3, options.targetPos));

        if (safeA && !isBlocked(pathA)) {
            // Replace p1, p2 with cornerA
            res.splice(i + 1, 2, cornerA);
            success = true;
        } else if (safeB && !isBlocked(pathB)) {
            res.splice(i + 1, 2, cornerB);
            success = true;
        }

        if (success) {
            i--; // Retry from previous index to cascade
        }
    }

    // Pass 2: Midpoint Balancing (Symmetry)
    // Pattern: Z-shape (p0 -> p1 -> p2 -> p3)
    // If we have a Z-shape that is necessary (can't be L), try to center the bridge (p1-p2).
    for (let i = 0; i < res.length - 3; i++) {
        const p0 = res[i];
        const p1 = res[i + 1];
        const p2 = res[i + 2];
        const p3 = res[i + 3];

        // Check if Z-shape:
        const seg1Horiz = Math.abs(p0.y - p1.y) < 1;
        const bridgeVert = Math.abs(p1.x - p2.x) < 1;
        const seg3Horiz = Math.abs(p2.y - p3.y) < 1;

        if (seg1Horiz && bridgeVert && seg3Horiz) {
            // Horizontal Z-shape: bridge is Vertical (x constant)
            // Check if p0 and p3 encompass the bridge
            const minX = Math.min(p0.x, p3.x);
            const maxX = Math.max(p0.x, p3.x);

            if (p1.x > minX && p1.x < maxX) {
                // Bridge is overlapping X range.
                // Calculate idealized center X
                const midX = (p0.x + p3.x) / 2;

                // If moving to midX is significant
                if (Math.abs(p1.x - midX) > 10) {
                    const newP1 = { x: midX, y: p1.y };
                    const newP2 = { x: midX, y: p2.y };

                    // [SAFETY] Check Valid Direction for Start/End segments
                    // Here we modify p0->newP1 and newP2->p3.
                    // p0->newP1 is Horizontal (y unchanged).
                    // newP2->p3 is Horizontal (y unchanged).
                    // This preserves orig direction (Horizontal Z).
                    // BUT: we should check just in case.

                    if (i === 0 && !isDirectionValid(p0, newP1, options.sourcePos)) continue;
                    if (i === res.length - 4 && !isDirectionValid(newP2, p3, options.targetPos)) continue;

                    // Verify Path
                    const newPath = [p0, newP1, newP2, p3];
                    if (!isBlocked(newPath)) {
                        res[i + 1] = newP1;
                        res[i + 2] = newP2;
                    }
                }
            }
        } else {
            // Check Vertical Z-shape
            const seg1Vert = Math.abs(p0.x - p1.x) < 1;
            const bridgeHoriz = Math.abs(p1.y - p2.y) < 1;
            const seg3Vert = Math.abs(p2.x - p3.x) < 1;

            if (seg1Vert && bridgeHoriz && seg3Vert) {
                // Vertical Z-shape: bridge is Horizontal (y constant)
                // We want to center Y between p0.y and p3.y

                const minY = Math.min(p0.y, p3.y);
                const maxY = Math.max(p0.y, p3.y);

                if (p1.y > minY && p1.y < maxY) {
                    const midY = (p0.y + p3.y) / 2;

                    if (Math.abs(p1.y - midY) > 10) {
                        const newP1 = { x: p1.x, y: midY };
                        const newP2 = { x: p2.x, y: midY };

                        // [SAFETY] Check Valid Direction
                        if (i === 0 && !isDirectionValid(p0, newP1, options.sourcePos)) continue;
                        if (i === res.length - 4 && !isDirectionValid(newP2, p3, options.targetPos)) continue;

                        const newPath = [p0, newP1, newP2, p3];
                        if (!isBlocked(newPath)) {
                            res[i + 1] = newP1;
                            res[i + 2] = newP2;
                        }
                    }
                }
            }
        }
    }

    return res;
}
