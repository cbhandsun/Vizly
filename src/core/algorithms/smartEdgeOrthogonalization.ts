import { Position } from '../types/flow';
import type { Rectangle, Point } from './pathfinding';
import { isPathBlocked } from './pathfinding';
import type { SpatialIndex } from './SpatialIndex';


export interface OrthoOptions {
    sourcePos?: Position;
    targetPos?: Position;
    strictOrthogonal?: boolean; // When true, return null if safe orthogonalization is impossible
    sourceMinLength?: number;
    targetMinLength?: number;
}
/**
 * Ensure all segments in the path are orthogonal.
 * If a segment is diagonal, insert a turning point.
 */
export function makePathOrthogonal(
    points: Point[],
    options?: OrthoOptions,
    obstacles: Rectangle[] | SpatialIndex = []
): Point[] | null {
    if (points.length < 2) return points;

    const isPointBlocked = (p: Point): boolean => {
        const PAD = 10;
        const isSpatialIndex = (obs: unknown): obs is SpatialIndex => typeof (obs as SpatialIndex).query === 'function';

        if (isSpatialIndex(obstacles)) {
            const range = { x: p.x - PAD, y: p.y - PAD, width: PAD * 2, height: PAD * 2 };
            const candidates = obstacles.query(range);
            return candidates.some(obs =>
                p.x > obs.x - PAD && p.x < obs.x + obs.width + PAD &&
                p.y > obs.y - PAD && p.y < obs.y + obs.height + PAD
            );
        } else {
            return obstacles.some(obs =>
                p.x > obs.x - PAD && p.x < obs.x + obs.width + PAD &&
                p.y > obs.y - PAD && p.y < obs.y + obs.height + PAD
            );
        }
    };

    // [FIX] Enforce strict entry/exit stubs based on ports
    // Use configured offsets or default to 20
    const sourceStubLen = options?.sourceMinLength ?? 30;
    const targetStubLen = options?.targetMinLength ?? 30;

    let newStartStub: Point | null = null;
    let newEndStub: Point | null = null;

    if (options?.sourcePos && points.length >= 1) {
        const start = points[0];
        const next = points.length > 1 ? points[1] : null;

        // Calculate ideal stub position
        let stubX = start.x;
        let stubY = start.y;

        switch (options.sourcePos) {
            case Position.Top: stubY = start.y - sourceStubLen; break;
            case Position.Bottom: stubY = start.y + sourceStubLen; break;
            case Position.Left: stubX = start.x - sourceStubLen; break;
            case Position.Right: stubX = start.x + sourceStubLen; break;
        }

        // Check if 'next' is already a valid stub (aligned and far enough)
        let needInsert = true;
        if (next) {
            const isVertical = options.sourcePos === Position.Top || options.sourcePos === Position.Bottom;
            const isHorizontal = options.sourcePos === Position.Left || options.sourcePos === Position.Right;

            if (isVertical) {
                // Must be aligned on X, and Y must be at least sourceStubLen away in correct direction
                const alignedX = Math.abs(next.x - start.x) < 1;
                const correctDir = options.sourcePos === Position.Top ? (next.y <= start.y) : (next.y >= start.y);
                const validY = options.sourcePos === Position.Top ? (next.y <= start.y - sourceStubLen) : (next.y >= start.y + sourceStubLen);
                if (alignedX && validY) {
                    needInsert = false;
                } else if (alignedX && correctDir && !validY) {
                    // [FIX] Extend existing stub instead of inserting a new point.
                    // The next point is on the correct axis and direction, just too close.
                    // Move it outward to meet the minimum stub length.
                    next.y = options.sourcePos === Position.Top
                        ? start.y - sourceStubLen
                        : start.y + sourceStubLen;
                    needInsert = false;
                }
            } else if (isHorizontal) {
                // Must be aligned on Y, and X must be at least sourceStubLen away in correct direction
                const alignedY = Math.abs(next.y - start.y) < 1;
                const correctDir = options.sourcePos === Position.Left ? (next.x <= start.x) : (next.x >= start.x);
                const validX = options.sourcePos === Position.Left ? (next.x <= start.x - sourceStubLen) : (next.x >= start.x + sourceStubLen);
                if (alignedY && validX) {
                    needInsert = false;
                } else if (alignedY && correctDir && !validX) {
                    // [FIX] Extend existing stub instead of inserting a new point.
                    next.x = options.sourcePos === Position.Left
                        ? start.x - sourceStubLen
                        : start.x + sourceStubLen;
                    needInsert = false;
                }
            }
        }

        if (needInsert) {
            newStartStub = { x: stubX, y: stubY };
        }
    }

    if (options?.targetPos && points.length >= 1) {
        const end = points[points.length - 1];
        const prev = points.length > 1 ? points[points.length - 2] : null;

        // Calculate ideal stub position
        let stubX = end.x;
        let stubY = end.y;

        switch (options.targetPos) {
            case Position.Top: stubY = end.y - targetStubLen; break;
            case Position.Bottom: stubY = end.y + targetStubLen; break;
            case Position.Left: stubX = end.x - targetStubLen; break;
            case Position.Right: stubX = end.x + targetStubLen; break;
        }

        // Check if 'prev' is already a valid stub
        let needInsert = true;
        if (prev) {
            const isVertical = options.targetPos === Position.Top || options.targetPos === Position.Bottom;
            const isHorizontal = options.targetPos === Position.Left || options.targetPos === Position.Right;

            if (isVertical) {
                const alignedX = Math.abs(prev.x - end.x) < 1;
                const correctDir = options.targetPos === Position.Top ? (prev.y <= end.y) : (prev.y >= end.y);
                const validY = options.targetPos === Position.Top ? (prev.y <= end.y - targetStubLen) : (prev.y >= end.y + targetStubLen);
                if (alignedX && validY) {
                    needInsert = false;
                } else if (alignedX && correctDir && !validY) {
                    // [FIX] Extend existing stub instead of inserting a new point.
                    prev.y = options.targetPos === Position.Top
                        ? end.y - targetStubLen
                        : end.y + targetStubLen;
                    needInsert = false;
                }
            } else if (isHorizontal) {
                const alignedY = Math.abs(prev.y - end.y) < 1;
                const correctDir = options.targetPos === Position.Left ? (prev.x <= end.x) : (prev.x >= end.x);
                const validX = options.targetPos === Position.Left ? (prev.x <= end.x - targetStubLen) : (prev.x >= end.x + targetStubLen);
                if (alignedY && validX) {
                    needInsert = false;
                } else if (alignedY && correctDir && !validX) {
                    // [FIX] Extend existing stub instead of inserting a new point.
                    prev.x = options.targetPos === Position.Left
                        ? end.x - targetStubLen
                        : end.x + targetStubLen;
                    needInsert = false;
                }
            }
        }

        if (needInsert) {
            newEndStub = { x: stubX, y: stubY };
        }
    }

    const workPoints = [...points];
    // Insert end stub first (to not mess up start index if we used indices, but here we push/splice)
    // Actually, splice from end is safer if we splice start too.
    if (newEndStub) {
        workPoints.splice(workPoints.length - 1, 0, newEndStub);
    }
    if (newStartStub) {
        workPoints.splice(1, 0, newStartStub);
    }

    const orthoPoints: Point[] = [workPoints[0]];

    for (let i = 0; i < workPoints.length - 1; i++) {
        const curr = orthoPoints[orthoPoints.length - 1]; // Use the last added point
        const next = workPoints[i + 1];

        // Check if diagonal (tolerance 1px)
        const dx = Math.abs(curr.x - next.x);
        const dy = Math.abs(curr.y - next.y);

        if (dx > 1 && dy > 1) {
            // [FIX] Increased from 2.5 to 15. Values like dx=12, dy=419 are "almost vertical"
            // and must be snapped to orthogonal. The old 2.5 threshold only caught sub-pixel jitter;
            // 15px catches real layout coordinate misalignment (handle offset vs node center).
            const smallDiagonal = Math.min(dx, dy) < 15;
            if (smallDiagonal) {
                let corner: Point;
                if (options?.sourcePos && i === 0 && !newStartStub) {
                    const verticalFirst = !(options.sourcePos === Position.Left || options.sourcePos === Position.Right);
                    corner = verticalFirst ? { x: curr.x, y: next.y } : { x: next.x, y: curr.y };
                } else {
                    corner = dx < dy ? { x: curr.x, y: next.y } : { x: next.x, y: curr.y };
                }
                orthoPoints.push(corner);
                orthoPoints.push(next);
                continue;
            }

            // Diagonal! Insert corner.
            // Heuristic: Choose the corner that creates longer segments (less sharp/tiny turns)
            // Option A: Horizontal first (curr.x -> next.x, then curr.y)  => Corner: (next.x, curr.y)
            // Option B: Vertical first (curr.y -> next.y, then curr.x)    => Corner: (curr.x, next.y)

            const cornerA = { x: next.x, y: curr.y };
            const cornerB = { x: curr.x, y: next.y };

            // [FIX] Checking just the POINT is insufficient. We must check the SEGMENTS.
            // Path A: curr -> cornerA -> next
            // Path B: curr -> cornerB -> next
            const pathA = [curr, cornerA, next];
            const pathB = [curr, cornerB, next];

            // [FIX] Use 15px padding first, but if both fail (because VG endpoints are ~5px from obstacles), fallback to 2px
            let blockedA = isPathBlocked(pathA, obstacles, 15);
            let blockedB = isPathBlocked(pathB, obstacles, 15);

            if (blockedA && blockedB) {
                blockedA = isPathBlocked(pathA, obstacles, 2);
                blockedB = isPathBlocked(pathB, obstacles, 2);
            }

            // [DEBUG] Log decision for e10-like coordinates
            // if (Math.abs(curr.x - 2276) < 100 || Math.abs(next.x - 1225) < 100) {
            //            //            // }

            let preferHorizontal = true; // Default

            if (!blockedA && blockedB) {
                preferHorizontal = true;
            } else if (blockedA && !blockedB) {
                preferHorizontal = false;
            } else if (blockedA && blockedB) {
                // Both blocked! This means a simple L-shape collision.
                // Attempt to solve using Z-shape (staircase) by splitting the segment.
                // We try multiple split ratios because the obstacle might cover the center.

                const ratios = [0.5, 0.25, 0.75, 0.33, 0.66, 0.1, 0.9];
                let foundZ = false;

                // Pass 1: Standard Padding (10px)
                for (const r of ratios) {
                    const midX = curr.x + (next.x - curr.x) * r;
                    const pathC = [curr, { x: midX, y: curr.y }, { x: midX, y: next.y }, next];

                    // [FIX] Ensure first segment respects Source Port Direction
                    let validC = true;
                    if (options?.sourcePos && i === 0 && !newStartStub) {
                        if (options.sourcePos === Position.Top || options.sourcePos === Position.Bottom) {
                            validC = false;
                        }
                    }

                    if (validC && !isPathBlocked(pathC, obstacles, 10)) {
                        orthoPoints.push({ x: midX, y: curr.y });
                        orthoPoints.push({ x: midX, y: next.y });
                        foundZ = true;
                        break;
                    }

                    const midY = curr.y + (next.y - curr.y) * r;
                    const pathD = [curr, { x: curr.x, y: midY }, { x: next.x, y: midY }, next];

                    // [FIX] Ensure first segment respects Source Port Direction
                    let validD = true;
                    if (options?.sourcePos && i === 0 && !newStartStub) {
                        if (options.sourcePos === Position.Left || options.sourcePos === Position.Right) {
                            validD = false;
                        }
                    }

                    if (validD && !isPathBlocked(pathD, obstacles, 10)) {
                        orthoPoints.push({ x: curr.x, y: midY });
                        orthoPoints.push({ x: next.x, y: midY });
                        foundZ = true;
                        break;
                    }
                }

                // Pass 2: Reduced Padding (2px) - if standard fails, try to squeeze through cleanly
                if (!foundZ) {
                    for (const r of ratios) {
                        const midX = curr.x + (next.x - curr.x) * r;
                        const pathC = [curr, { x: midX, y: curr.y }, { x: midX, y: next.y }, next];

                        // [FIX] Ensure first segment respects Source Port Direction
                        let validC = true;
                        if (options?.sourcePos && i === 0 && !newStartStub) {
                            // This is the first segment directly from Source
                            if (options.sourcePos === Position.Top || options.sourcePos === Position.Bottom) {
                                // Must leave Vertically. PathC is Horiz first. INVALID.
                                validC = false;
                            }
                        }

                        if (validC && !isPathBlocked(pathC, obstacles, 2)) {
                            orthoPoints.push({ x: midX, y: curr.y });
                            orthoPoints.push({ x: midX, y: next.y });
                            foundZ = true;
                            break;
                        }

                        const midY = curr.y + (next.y - curr.y) * r;
                        const pathD = [curr, { x: curr.x, y: midY }, { x: next.x, y: midY }, next];

                        // [FIX] Ensure first segment respects Source Port Direction
                        let validD = true;
                        if (options?.sourcePos && i === 0 && !newStartStub) {
                            // This is the first segment directly from Source
                            if (options.sourcePos === Position.Left || options.sourcePos === Position.Right) {
                                // Must leave Horizontally. PathD is Vertical first. INVALID.
                                validD = false;
                            }
                        }

                        if (validD && !isPathBlocked(pathD, obstacles, 2)) {
                            orthoPoints.push({ x: curr.x, y: midY });
                            orthoPoints.push({ x: next.x, y: midY });
                            foundZ = true;
                            break;
                        }
                    }
                }

                if (foundZ) {
                    // [FIX] Z-shape logic must NOT skip the next point.
                    // The Z-shape replaces the path from `curr` to `next`.
                    // But `next` itself is the destination point of this segment.
                    // If we `continue` without pushing `next`, we create a gap in `orthoPoints`.
                    // In the next iteration, `curr` will be the last Z-point, but `next` will be `workPoints[i+2]`.
                    // The original `next` (workPoints[i+1]) is lost.
                    orthoPoints.push(next);
                    continue;
                }

                // All simple options blocked.
                if (options?.strictOrthogonal) {
                    return null; // Signal that safe orthogonalization is mathematically impossible
                }

                // Fallback to geometry heuristic.
                const dx = Math.abs(curr.x - next.x);
                const dy = Math.abs(curr.y - next.y);
                preferHorizontal = dx > dy;
            } else {
                // Both free. Use geometry heuristic.
                // Check previous segment direction if possible
                const prev = orthoPoints.length > 1 ? orthoPoints[orthoPoints.length - 2] : null;

                if (prev) {
                    // If we were moving Horizontally, keep moving Horizontally (Option A)
                    if (Math.abs(prev.y - curr.y) < 1) preferHorizontal = true;
                    // If we were moving Vertically, keep moving Vertically (Option B)
                    else if (Math.abs(prev.x - curr.x) < 1) preferHorizontal = false;
                } else {
                    // No history, choose larger movement
                    const dx = Math.abs(curr.x - next.x);
                    const dy = Math.abs(curr.y - next.y);
                    preferHorizontal = dx > dy;
                }
            }

            if (preferHorizontal) {
                orthoPoints.push(cornerA);
            } else {
                orthoPoints.push(cornerB);
            }
        }
        orthoPoints.push(next);
    }

    // [FIX] Final validation: ensure first and last segments are truly orthogonal
    // This catches any edge cases where the earlier logic didn't work correctly
    if (orthoPoints.length >= 2) {
        const first = orthoPoints[0];
        const second = orthoPoints[1];
        // If first segment is still diagonal, force orthogonal by inserting corner
        if (Math.abs(first.x - second.x) > 1 && Math.abs(first.y - second.y) > 1) {
            // Use port direction if available
            let verticalFirst = true; // Default to vertical first

            if (options?.sourcePos) {
                if (options.sourcePos === Position.Left || options.sourcePos === Position.Right) {
                    verticalFirst = false; // Horizontal first for side ports
                } else {
                    verticalFirst = true; // Vertical first for top/bottom ports
                }
            }

            // [CHECK] Check if corner is blocked
            const cornerV = { x: first.x, y: second.y }; // Vertical first
            const cornerH = { x: second.x, y: first.y }; // Horizontal first

            const blockedV = isPointBlocked(cornerV);
            const blockedH = isPointBlocked(cornerH);

            if (!blockedV && blockedH) verticalFirst = true;
            else if (blockedV && !blockedH) verticalFirst = false;

            if (verticalFirst) {
                orthoPoints.splice(1, 0, cornerV);
            } else {
                orthoPoints.splice(1, 0, cornerH);
            }
        }
    }

    if (orthoPoints.length >= 2) {
        const last = orthoPoints[orthoPoints.length - 1];
        const secondLast = orthoPoints[orthoPoints.length - 2];
        // If last segment is still diagonal, force orthogonal
        if (Math.abs(last.x - secondLast.x) > 1 && Math.abs(last.y - secondLast.y) > 1) {
            // Use port direction if available
            let verticalForLast = true;

            if (options?.targetPos) {
                if (options.targetPos === Position.Left || options.targetPos === Position.Right) {
                    verticalForLast = false; // Horizontal approach for side ports
                } else {
                    verticalForLast = true; // Vertical approach for top/bottom ports
                }
            }

            // [CHECK] Check if corner is blocked
            const cornerV = { x: last.x, y: secondLast.y }; // Vertical approach
            const cornerH = { x: secondLast.x, y: last.y }; // Horizontal approach

            const blockedV = isPointBlocked(cornerV);
            const blockedH = isPointBlocked(cornerH);

            if (!blockedV && blockedH) verticalForLast = true;
            else if (blockedV && !blockedH) verticalForLast = false;

            if (verticalForLast) {
                orthoPoints.splice(orthoPoints.length - 1, 0, cornerV);
            } else {
                orthoPoints.splice(orthoPoints.length - 1, 0, cornerH);
            }
        }
    }

    return orthoPoints;
}
