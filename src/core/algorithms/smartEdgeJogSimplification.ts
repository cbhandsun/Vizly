import { Position } from '../types/flow';
import type { Rectangle, Point } from './pathfinding';
import { isPathBlocked } from './pathfinding';
import type { SpatialIndex } from './SpatialIndex';


export function removeSmallJogs(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex = [],
    options?: { sourcePos?: Position, targetPos?: Position }
) {
    if (points.length < 4) return points;
    const res = [...points];
    let changed = true;
    let maxIter = 5;

    while (changed && maxIter > 0) {
        changed = false;
        maxIter--;

        // We need at least 4 points for a jog: p0 -> p1 -> p2 -> p3
        for (let i = 0; i < res.length - 3; i++) {
            const p0 = res[i];
            const p1 = res[i + 1];
            const p2 = res[i + 2];
            const p3 = res[i + 3];

            const p0Fixed = (i === 0);
            const p3Fixed = (i + 3 === res.length - 1);

            // [NEW] Aggressive Endpoint Jog Removal
            // If p0 is start (Fixed), and p1 -> p2 is a tiny bridge (< 5px) that realigns to p0's axis
            // Snap p1, p2 to p0's axis.
            if (p0Fixed) {
                // Standard Z-jog:
                // H (p0-p1) -> V (p1-p2) -> H (p2-p3)
                const h1 = Math.abs(p0.y - p1.y) < 1;
                const vBridge = Math.abs(p1.x - p2.x) < 1;
                const h2 = Math.abs(p2.y - p3.y) < 1;

                if (h1 && vBridge && h2) {
                    const bridgeLen = Math.abs(p1.y - p2.y);
                    const misalignment = Math.abs(p0.y - p3.y);
                    // If bridge is small OR misalignment is small (< 1px), flatten it
                    if (bridgeLen < 3 || misalignment < 1.1) {
                        // [FIX] Check Source Port Direction
                        if (p0Fixed && options?.sourcePos) {
                            const isSourceVert = options.sourcePos === Position.Top || options.sourcePos === Position.Bottom;
                            // p1.y = p0.y makes p0->p1 Horizontal.
                            // If Source needs Vertical, this is invalid.
                            if (isSourceVert) continue;
                        }

                        // Align p1, p2, p3 to p0.y (Since p0 is fixed)
                        // But wait, p3 might be fixed too? No, p3 is i+3.
                        // If p3 is fixed (end), check if we can move p1/p2.

                        // Scenario: p0 (fixed) --(tiny jog)--> rest
                        // Just make p1 and p2 align with p0.y
                        p1.y = p0.y;
                        p2.y = p0.y;
                        // Now p0-p1-p2 are collinear. Next iteration cleans them up.
                        changed = true;
                        continue;
                    }
                }

                // V (p0-p1) -> H (p1-p2) -> V (p2-p3)
                const v1 = Math.abs(p0.x - p1.x) < 1;
                const hBridge = Math.abs(p1.y - p2.y) < 1;
                const v2 = Math.abs(p2.x - p3.x) < 1;

                if (v1 && hBridge && v2) {
                    const bridgeLen = Math.abs(p1.x - p2.x);
                    const misalignment = Math.abs(p0.x - p3.x);
                    if (bridgeLen < 5 || misalignment < 5) {
                        // [FIX] Check Source Port Direction
                        if (p0Fixed && options?.sourcePos) {
                            const isSourceHoriz = options.sourcePos === Position.Left || options.sourcePos === Position.Right;
                            // p1.x = p0.x makes p0->p1 Vertical.
                            // If Source needs Horizontal, this is invalid.
                            if (isSourceHoriz) continue;
                        }

                        p1.x = p0.x;
                        p2.x = p0.x;
                        changed = true;
                        continue;
                    }
                }
            }

            // [NEW] End-side Jog Removal (p3 is fixed)
            if (p3Fixed) {
                // H -> V -> H (Targeting p3)
                const h1 = Math.abs(p0.y - p1.y) < 1;
                const vBridge = Math.abs(p1.x - p2.x) < 1;
                const h2 = Math.abs(p2.y - p3.y) < 1;

                if (h1 && vBridge && h2) {
                    const bridgeLen = Math.abs(p1.y - p2.y);
                    const misalignment = Math.abs(p0.y - p3.y);
                    if (bridgeLen < 5 || misalignment < 5) {
                        // [FIX] Check Target Port Direction
                        if (p3Fixed && options?.targetPos) {
                            const isTargetVert = options.targetPos === Position.Top || options.targetPos === Position.Bottom;
                            // p1.y = p3.y makes p2->p3 Horizontal.
                            // If Target needs Vertical, this is invalid.
                            if (isTargetVert) continue;
                        }

                        // Align p1, p2 to p3.y
                        p1.y = p3.y;
                        p2.y = p3.y;
                        changed = true;
                        continue;
                    }
                }

                // V -> H -> V
                const v1 = Math.abs(p0.x - p1.x) < 1;
                const hBridge = Math.abs(p1.y - p2.y) < 1;
                const v2 = Math.abs(p2.x - p3.x) < 1;

                if (v1 && hBridge && v2) {
                    const bridgeLen = Math.abs(p1.x - p2.x);
                    const misalignment = Math.abs(p0.x - p3.x);
                    if (bridgeLen < 5 || misalignment < 5) {
                        // [FIX] Check Target Port Direction
                        if (p3Fixed && options?.targetPos) {
                            const isTargetHoriz = options.targetPos === Position.Left || options.targetPos === Position.Right;
                            // p1.x = p3.x makes p2->p3 Vertical.
                            // If Target needs Horizontal, this is invalid.
                            if (isTargetHoriz) continue;
                        }

                        p1.x = p3.x;
                        p2.x = p3.x;
                        changed = true;
                        continue;
                    }
                }
            }

            // Check for Z-Jog (Parallel Segments) - Logic from previous version
            // Case A: Vertical -> Horizontal -> Vertical
            const isV1 = Math.abs(p0.x - p1.x) < 1;
            const isV2 = Math.abs(p2.x - p3.x) < 1;
            const bridgeLen = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);

            if (isV1 && isV2) {
                // Bridge is Horizontal p1->p2 (Variation from p1.x..p2.x)
                // We want to align p1 and p2 to targetX.
                if (Math.abs(p1.y - p2.y) < 1 && bridgeLen < 80) {
                    let targetX: number;
                    if (p0Fixed && p3Fixed) {
                        if (Math.abs(p0.x - p3.x) > 1) continue;
                        targetX = p0.x;
                    } else if (p0Fixed) {
                        targetX = p0.x;
                    } else if (p3Fixed) {
                        targetX = p3.x;
                    } else {
                        targetX = p1.x;
                    }

                    // [FIX] Check orthogonality preservation for p0 and p3
                    // If we move p0.x, pPrev->p0 must be Horizontal.
                    if (!p0Fixed && Math.abs(p0.x - targetX) > 0.1) {
                        const pPrev = i > 0 ? res[i - 1] : null;
                        if (pPrev && Math.abs(pPrev.y - p0.y) > 1) continue; // Prev is Vert/Diag, moving X breaks it
                    }
                    // If we move p3.x, p3->pNext must be Horizontal.
                    if (!p3Fixed && Math.abs(p3.x - targetX) > 0.1) {
                        const pNext = i + 4 < res.length ? res[i + 4] : null;
                        if (pNext && Math.abs(p3.y - pNext.y) > 1) continue; // Next is Vert/Diag, moving X breaks it
                    }

                    if (!p0Fixed) p0.x = targetX;
                    // [SAFE CHECK]
                    // Validate if the horizontal consolidation hits any obstacles
                    // It's a vertical segment merge. Check if the vertical line at targetX is blocked.
                    // Range: min(p1.y, p2.y) to max(p1.y, p2.y) at x=targetX
                    // Actually, the new path is p0 -> p1(moved) -> p2(moved) -> p3
                    // We should check the key segments.
                    // For simplicity, check the full 4-point polyline proposal
                    const testPoints = [
                        { x: !p0Fixed ? targetX : p0.x, y: p0.y }, // Adjusted p0
                        { x: targetX, y: p1.y },
                        { x: targetX, y: p2.y },
                        { x: !p3Fixed ? targetX : p3.x, y: p3.y }
                    ];

                    if (!isPathBlocked(testPoints, obstacles, 20)) {
                        p1.x = targetX;
                        p2.x = targetX;
                        if (!p3Fixed) p3.x = targetX;
                        changed = true;
                    } else {
                        // Revert p0 if modified (local var in array)
                        // Actually we operate on `res` references directly (p0, p1...).
                        // So we must be careful.
                        // The code above: if (!p0Fixed) p0.x = targetX; was mutating BEFORE check.
                        // FIX: Do not mutate until check passes.
                        if (!p0Fixed) p0.x = res[i].x; // Revert
                    }
                }
            }

            // Case B: Horizontal -> Vertical -> Horizontal
            const isH1 = Math.abs(p0.y - p1.y) < 1;
            const isH2 = Math.abs(p2.y - p3.y) < 1;

            if (isH1 && isH2) {
                // Bridge is Vertical p1->p2
                if (Math.abs(p1.x - p2.x) < 1 && bridgeLen < 80) {
                    let targetY: number;
                    if (p0Fixed && p3Fixed) {
                        if (Math.abs(p0.y - p3.y) > 1) continue;
                        targetY = p0.y;
                    } else if (p0Fixed) {
                        targetY = p0.y;
                    } else if (p3Fixed) {
                        targetY = p3.y;
                    } else {
                        targetY = p1.y;
                    }

                    // [FIX] Check orthogonality preservation for p0 and p3
                    // If we move p0.y, pPrev->p0 must be Vertical.
                    if (!p0Fixed && Math.abs(p0.y - targetY) > 0.1) {
                        const pPrev = i > 0 ? res[i - 1] : null;
                        if (pPrev && Math.abs(pPrev.x - p0.x) > 1) continue; // Prev is Horiz/Diag, moving Y breaks it
                    }
                    // If we move p3.y, p3->pNext must be Vertical.
                    if (!p3Fixed && Math.abs(p3.y - targetY) > 0.1) {
                        const pNext = i + 4 < res.length ? res[i + 4] : null;
                        if (pNext && Math.abs(p3.x - pNext.x) > 1) continue; // Next is Horiz/Diag, moving Y breaks it
                    }

                    const originalP0Y = p0.y;
                    if (!p0Fixed) p0.y = targetY; // Propose change

                    // [SAFE CHECK]
                    const testPoints = [
                        { x: p0.x, y: !p0Fixed ? targetY : originalP0Y },
                        { x: p1.x, y: targetY },
                        { x: p2.x, y: targetY },
                        { x: p3.x, y: !p3Fixed ? targetY : p3.y }
                    ];

                    if (!isPathBlocked(testPoints, obstacles, 20)) {
                        // Commit
                        if (!p0Fixed) p0.y = targetY;
                        p1.y = targetY;
                        p2.y = targetY;
                        if (!p3Fixed) p3.y = targetY;
                        changed = true;
                    } else {
                        // Revert
                        if (!p0Fixed) p0.y = originalP0Y;
                    }
                }
            }
        }

        if (changed) {
            const clean = [res[0]];
            for (let k = 1; k < res.length; k++) {
                const prev = clean[clean.length - 1];
                const curr = res[k];
                if (Math.abs(curr.x - prev.x) > 1 || Math.abs(curr.y - prev.y) > 1) {
                    clean.push(curr);
                }
            }
            if (clean.length < res.length) {
                return clean;
            }
        }
    }
    return res;
}

/**
 * [NEW] Collapse redundant bends in orthogonal paths
 * Identifies U-shape and Z-shape patterns that can be simplified
 * when direct routing doesn't cross obstacles
 *
 * @param points - Input path points
 * @param obstacles - Obstacle rectangles to check against
 * @param minBendLength - Minimum length to consider for bend collapsing (default: 40)
 * @returns Simplified path with redundant bends removed
 */
export function collapseRedundantBends(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex = [],
    minBendLength: number = 40,
    options?: { sourcePos?: Position, targetPos?: Position }
): Point[] {
    if (points.length < 4) return points;

    const result = [...points];
    let changed = true;
    let maxIterations = 3;

    while (changed && maxIterations > 0) {
        changed = false;
        maxIterations--;

        // Look for 3-segment patterns (4 points) that can be collapsed
        for (let i = 0; i < result.length - 3; i++) {
            const p0 = result[i];
            const p1 = result[i + 1];
            const p2 = result[i + 2];
            const p3 = result[i + 3];

            // Skip if endpoints are fixed (first or last)
            if (i === 0 || i + 3 === result.length - 1) continue;

            // Calculate segment directions
            const seg1Horiz = Math.abs(p1.y - p0.y) < 1;
            const seg2Horiz = Math.abs(p2.y - p1.y) < 1;
            const seg3Horiz = Math.abs(p3.y - p2.y) < 1;

            // Z-shape detection: H-V-H or V-H-V pattern
            const isZShape = (seg1Horiz && !seg2Horiz && seg3Horiz) ||
                (!seg1Horiz && seg2Horiz && !seg3Horiz);

            if (!isZShape) continue;

            // Calculate the "shortcut" path (p0 -> p3 with one bend)
            // For H-V-H: go p0 -> (p3.x, p0.y) -> p3 OR p0 -> (p0.x, p3.y) -> p3
            // For V-H-V: similar logic

            const mid1 = seg1Horiz ? { x: p3.x, y: p0.y } : { x: p0.x, y: p3.y };
            const shortcutPath1 = [p0, mid1, p3];

            const mid2 = seg1Horiz ? { x: p0.x, y: p3.y } : { x: p3.x, y: p0.y };
            const shortcutPath2 = [p0, mid2, p3];

            // Calculate path lengths
            const currentLength =
                Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y) +
                Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y) +
                Math.abs(p3.x - p2.x) + Math.abs(p3.y - p2.y);

            const shortcut1Length =
                Math.abs(mid1.x - p0.x) + Math.abs(mid1.y - p0.y) +
                Math.abs(p3.x - mid1.x) + Math.abs(p3.y - mid1.y);

            const shortcut2Length =
                Math.abs(mid2.x - p0.x) + Math.abs(mid2.y - p0.y) +
                Math.abs(p3.x - mid2.x) + Math.abs(p3.y - mid2.y);

            // Only consider shortcuts that are significantly shorter
            if (shortcut1Length >= currentLength - minBendLength &&
                shortcut2Length >= currentLength - minBendLength) {
                continue;
            }

            // Choose the better shortcut
            const useShortcut1 = shortcut1Length <= shortcut2Length;
            const bestShortcut = useShortcut1 ? shortcutPath1 : shortcutPath2;
            const bestLength = useShortcut1 ? shortcut1Length : shortcut2Length;

            // [FIX] Validate against Port Direction
            // If i == 0 (Source), the first segment is p0 -> newMid.
            // If i + 3 == result.length - 1 (Target), the last segment is newMid -> p3.

            const newMid = useShortcut1 ? mid1 : mid2;

            if (i === 0 && options?.sourcePos) {
                const isSourceVert = options.sourcePos === Position.Top || options.sourcePos === Position.Bottom;
                const isSourceHoriz = options.sourcePos === Position.Left || options.sourcePos === Position.Right;

                const firstSegHoriz = Math.abs(p0.y - newMid.y) < 0.1;
                const firstSegVert = Math.abs(p0.x - newMid.x) < 0.1;

                if (isSourceVert && firstSegHoriz) continue; // Invalid
                if (isSourceHoriz && firstSegVert) continue; // Invalid
            }

            if (i + 3 === result.length - 1 && options?.targetPos) {
                const isTargetVert = options.targetPos === Position.Top || options.targetPos === Position.Bottom;
                const isTargetHoriz = options.targetPos === Position.Left || options.targetPos === Position.Right;

                const lastSegHoriz = Math.abs(newMid.y - p3.y) < 0.1;
                const lastSegVert = Math.abs(newMid.x - p3.x) < 0.1;

                if (isTargetVert && lastSegHoriz) continue; // Invalid
                if (isTargetHoriz && lastSegVert) continue; // Invalid
            }

            // Check if shortcut is blocked
            // [FIX] Increased padding from 5 to 20 to prevent hugging obstacles after simplification
            if (!isPathBlocked(bestShortcut, obstacles, 20) && bestLength < currentLength - minBendLength) {
                // Apply the shortcut: replace p1, p2 with the new midpoint
                // newMid is already calculated above
                result.splice(i + 1, 2, newMid);
                changed = true;
                break; // Restart iteration after modification
            }
        }
    }

    // Clean up consecutive duplicate points
    const cleaned: Point[] = [result[0]];
    for (let i = 1; i < result.length; i++) {
        const prev = cleaned[cleaned.length - 1];
        const curr = result[i];
        if (Math.abs(curr.x - prev.x) > 1 || Math.abs(curr.y - prev.y) > 1) {
            cleaned.push(curr);
        }
    }

    return cleaned;
}
