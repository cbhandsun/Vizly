import { Position } from '../types/flow';
import type { Rectangle, Point } from './pathfinding';
import { isPathBlocked } from './pathfinding';
import type { SpatialIndex } from './SpatialIndex';


/**
 * [NEW] Remove Short Diagonal Segments
 * Detects and fixes diagonal segments (non-orthogonal) in the path.
 * Converts them to orthogonal paths by inserting appropriate corner points.
 *
 * @param points Path points
 * @param threshold Minimum segment length to consider (default 0 - process all)
 * @returns Path with all segments being strictly orthogonal
 */
export function removeShortDiagonals(points: Point[], threshold: number = 0): Point[] {
    if (points.length < 2) return points;

    const result: Point[] = [points[0]];

    for (let i = 0; i < points.length - 1; i++) {
        const curr = result[result.length - 1];
        const next = points[i + 1];

        const dx = Math.abs(curr.x - next.x);
        const dy = Math.abs(curr.y - next.y);

        // Check if segment is diagonal (both dx and dy > tolerance)
        const TOLERANCE = 0.5; // Stricter tolerance for diagonal detection

        if (dx > TOLERANCE && dy > TOLERANCE) {
            // This is a diagonal segment - need to fix it
            const segmentLength = Math.sqrt(dx * dx + dy * dy);

            if (segmentLength < threshold) {
                // Very short diagonal - snap to nearest orthogonal point
                // Strategy: snap to the axis with smaller delta
                if (dx < dy) {
                    // Snap X to current X (make it vertical)
                    result.push({ x: curr.x, y: next.y });
                } else {
                    // Snap Y to current Y (make it horizontal)
                    result.push({ x: next.x, y: curr.y });
                }
            }
            // [FIX] For longer diagonals, do NOT blindly insert corners.
            // Leave them for makePathOrthogonal which has proper obstacle awareness.
        }

        result.push(next);
    }

    // Clean up consecutive duplicate points
    const cleaned: Point[] = [result[0]];
    for (let i = 1; i < result.length; i++) {
        const prev = cleaned[cleaned.length - 1];
        const curr = result[i];
        if (Math.abs(curr.x - prev.x) > 0.5 || Math.abs(curr.y - prev.y) > 0.5) {
            cleaned.push(curr);
        }
    }

    return cleaned;
}

/**
 * [P15] Gap Centering / Nudge Algorithm
 * "Unsticks" lines from the rigid A* grid by moving them to the visual center of available space.
 *
 * @param points Path points
 * @param obstacles Obstacles list
 * @param searchLimit Max distance to search for gap boundaries (default 200px)
 * @param offset Perpendicular offset to apply from the center (for separating overlapping lines)
 * @param extraObstacles Additional obstacles to check (e.g. container walls)
 */
export function nudgeSegments(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex,
    searchLimit: number = 200,
    offset: number = 0,
    extraObstacles: Rectangle[] = [],
    options: { lockStart?: boolean; lockEnd?: boolean; trunkShift?: number } = {}
): Point[] {
    if (points.length < 4) return points;

    // Helper to check for SpatialIndex
    const isSpatialIndex = (obs: unknown): obs is SpatialIndex => typeof (obs as SpatialIndex).query === 'function';

    // Clone to avoid mutation
    const nudged = points.map(p => ({ ...p }));

    // Loop iterates over segments [i, i+1]
    for (let i = 0; i < nudged.length - 1; i++) {
        const p1 = nudged[i];
        const p2 = nudged[i + 1];

        // Determine orientation
        const isHoriz = Math.abs(p1.y - p2.y) < 2; // Increased tolerance
        const isVert = Math.abs(p1.x - p2.x) < 2;

        // Skip segments that are too short
        const len = Math.abs(isHoriz ? p1.x - p2.x : p1.y - p2.y);
        if (len < 5) continue;

        // [NEW] Shared Trunk Logic
        // If this segment is part of the trunk (Start or End), we force it to the Center (offset 0).
        // If it is a branch, we apply the full offset.
        // This effectively "snaps" the trunk segments to a single shared line,
        // while allowing branches to be separated.
        const isStartTrunk = options.lockStart && i === 0;
        const isEndTrunk = options.lockEnd && i === nudged.length - 2;
        const isTrunk = isStartTrunk || isEndTrunk;

        // Effective offset: Trunk uses trunkShift (Group Separation), Branches use offset (Fan-out)
        const effectiveOffset = isTrunk ? (options.trunkShift ?? 0) : offset;

        if (isHoriz) {
            const y = p1.y;
            const xMin = Math.min(p1.x, p2.x);
            const xMax = Math.max(p1.x, p2.x);

            // Find nearest obs above/below
            let nearestTop = -Infinity;
            let nearestBottom = Infinity;

            let candidates: Rectangle[] = isSpatialIndex(obstacles) ? (() => {
                const range = {
                    x: xMin,
                    y: y - searchLimit,
                    width: xMax - xMin,
                    height: searchLimit * 2
                };
                return obstacles.query(range);
            })() : obstacles;

            if (extraObstacles.length > 0) {
                candidates = candidates.concat(extraObstacles);
            }

            for (const obs of candidates) {
                // Check X overlap
                const startX = Math.max(xMin, obs.x);
                const endX = Math.min(xMax, obs.x + obs.width);

                if (startX < endX) {
                    const obsBottom = obs.y + obs.height;
                    const obsTop = obs.y;

                    if (obsBottom <= y + 0.1 && obsBottom > nearestTop) {
                        nearestTop = obsBottom;
                    }
                    if (obsTop >= y - 0.1 && obsTop < nearestBottom) {
                        nearestBottom = obsTop;
                    }
                }
            }

            // Heuristic limits
            if (nearestTop === -Infinity) nearestTop = y - searchLimit;
            if (nearestBottom === Infinity) nearestBottom = y + searchLimit;
            nearestTop = Math.max(nearestTop, y - searchLimit);
            nearestBottom = Math.min(nearestBottom, y + searchLimit);

            // Calculate Center with Offset
            const gap = nearestBottom - nearestTop;
            const safeOffset = Math.max(-gap / 2 + 5, Math.min(gap / 2 - 5, effectiveOffset));
            const center = (nearestTop + nearestBottom) / 2 + safeOffset;

            // Apply if significant difference
            if (Math.abs(y - center) > 0.5) {
                const isStartPoint = (i === 0);
                const isEndPoint = (i + 1 === nudged.length - 1);

                // For Trunk logic, we MUST modify the terminal points to snap them to center.
                // However, we still respect the rule: don't move "Source/Target" anchors
                // UNLESS we are explicitly in "Shared Trunk" mode (which implies overriding port distribution).
                // Actually, if we move the terminal point, we change the port position.
                // This is desired for "Shared Trunk" to merge visually.

                if (isStartPoint) {
                    if (isStartTrunk) {
                        // Move both p0 and p1 to center (Trunk Snap)
                        nudged[i].y = center;
                        nudged[i + 1].y = center;
                    } else {
                        // Skip nudging first segment if not trunk (keep anchor fixed)
                        continue;
                    }
                } else if (isEndPoint) {
                    if (isEndTrunk) {
                        // Move both pn-2 and pn-1 to center (Trunk Snap)
                        nudged[i].y = center;
                        nudged[i + 1].y = center;
                    } else {
                        // Skip nudging last segment if not trunk
                        continue;
                    }
                } else {
                    // Mid segment: move both
                    nudged[i].y = center;
                    nudged[i + 1].y = center;
                }
            }

        } else if (isVert) {
            const x = p1.x;
            const yMin = Math.min(p1.y, p2.y);
            const yMax = Math.max(p1.y, p2.y);

            let nearestLeft = -Infinity;
            let nearestRight = Infinity;

            let candidates: Rectangle[] = isSpatialIndex(obstacles) ? (() => {
                const range = {
                    x: x - searchLimit,
                    y: yMin,
                    width: searchLimit * 2,
                    height: yMax - yMin
                };
                return obstacles.query(range);
            })() : obstacles;

            if (extraObstacles.length > 0) {
                candidates = candidates.concat(extraObstacles);
            }

            for (const obs of candidates) {
                const startY = Math.max(yMin, obs.y);
                const endY = Math.min(yMax, obs.y + obs.height);

                if (startY < endY) {
                    const obsRight = obs.x + obs.width;
                    const obsLeft = obs.x;

                    if (obsRight <= x + 0.1 && obsRight > nearestLeft) {
                        nearestLeft = obsRight;
                    }
                    if (obsLeft >= x - 0.1 && obsLeft < nearestRight) {
                        nearestRight = obsLeft;
                    }
                }
            }

            if (nearestLeft === -Infinity) nearestLeft = x - searchLimit;
            if (nearestRight === Infinity) nearestRight = x + searchLimit;
            nearestLeft = Math.max(nearestLeft, x - searchLimit);
            nearestRight = Math.min(nearestRight, x + searchLimit);

            const gap = nearestRight - nearestLeft;
            const safeOffset = Math.max(-gap / 2 + 5, Math.min(gap / 2 - 5, effectiveOffset));
            const center = (nearestLeft + nearestRight) / 2 + safeOffset;

            if (Math.abs(x - center) > 0.5) {
                const isStartPoint = (i === 0);
                const isEndPoint = (i + 1 === nudged.length - 1);

                if (isStartPoint) {
                    if (isStartTrunk) {
                        nudged[i].x = center;
                        nudged[i + 1].x = center;
                    } else {
                        continue;
                    }
                } else if (isEndPoint) {
                    if (isEndTrunk) {
                        nudged[i].x = center;
                        nudged[i + 1].x = center;
                    } else {
                        continue;
                    }
                } else {
                    nudged[i].x = center;
                    nudged[i + 1].x = center;
                }
            }
        }
    }

    return nudged;
}

/**
 * Calculates the minimum distance from a point to a polyline path.
 */
export function getClosestDistanceToPath(point: Point, pathPoints: Point[]): number {
    if (!pathPoints || pathPoints.length < 2) return Infinity;

    let minDist = Infinity;

    for (let i = 0; i < pathPoints.length - 1; i++) {
        const p1 = pathPoints[i];
        const p2 = pathPoints[i + 1];

        // Point to Segment distance
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;

        if (dx === 0 && dy === 0) {
            const d = Math.sqrt(Math.pow(point.x - p1.x, 2) + Math.pow(point.y - p1.y, 2));
            if (d < minDist) minDist = d;
            continue;
        }

        const t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / (dx * dx + dy * dy);

        const clampedT = Math.max(0, Math.min(1, t));

        const closeX = p1.x + clampedT * dx;
        const closeY = p1.y + clampedT * dy;

        const d = Math.sqrt(Math.pow(point.x - closeX, 2) + Math.pow(point.y - closeY, 2));
        if (d < minDist) minDist = d;
    }

    return minDist;
}
