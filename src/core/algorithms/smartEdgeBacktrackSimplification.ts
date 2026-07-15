import { Position } from '../types/flow';
import type { Rectangle, Point } from './pathfinding';
import { isPathBlocked } from './pathfinding';
import type { SpatialIndex } from './SpatialIndex';


/**
 * Remove main-axis overshoot: detects where the path goes past the destination
 * in a particular axis and then folds back. This is different from a U-turn
 * (which goes backward from source) — this is an overshoot past the target.
 *
 * Example: wms(898,871) → visibility(180,1540). Path goes to x=-32 (past dst x=180)
 * then folds back to x=180. The shortcut replaces the overshoot+foldback with
 * a simple L-shaped path.
 *
 * Unlike removeLargeBacktrack, this function:
 * - Has no ratio check (works for near-diagonal paths)
 * - Uses relaxed orthogonality (10px) for trunk geometry precision errors
 * - Only looks for overshoot past the destination, not general backtracks
 */
export function removeMainAxisOvershoot(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex = []
): Point[] {
    if (points.length < 4) return points;

    const src = points[0];
    const dst = points[points.length - 1];

    const isBlocked = (a: Point, b: Point): boolean => {
        const rects = Array.isArray(obstacles) ? (obstacles as Rectangle[]) : [];
        const CLEAR = 4;
        const minX = Math.min(a.x, b.x) - CLEAR;
        const maxX = Math.max(a.x, b.x) + CLEAR;
        const minY = Math.min(a.y, b.y) - CLEAR;
        const maxY = Math.max(a.y, b.y) + CLEAR;
        return rects.some(obs =>
            obs.x < maxX && obs.x + obs.width > minX &&
            obs.y < maxY && obs.y + obs.height > minY
        );
    };

    // Relaxed orthogonality check (10px) for trunk geometry precision
    const isNearlyHoriz = (a: Point, b: Point) => Math.abs(a.y - b.y) < 10;
    const isNearlyVert  = (a: Point, b: Point) => Math.abs(a.x - b.x) < 10;

    // Try both axes: check if path overshoots in x or y direction
    for (const axis of ['x', 'y'] as const) {
        const coord = (p: Point) => p[axis];
        const dstCoord = coord(dst);
        const srcCoord = coord(src);
        const mainDir = dstCoord - srcCoord; // positive = increasing, negative = decreasing
        if (Math.abs(mainDir) < 50) continue; // too close, skip

        // Scan for overshoot: find point that goes past dst
        for (let i = 1; i < points.length - 1; i++) {
            const ptCoord = coord(points[i]);
            // "past dst" means further than dst in the main direction
            const overshoot = (ptCoord - dstCoord) * Math.sign(mainDir);
            if (overshoot <= 50) continue; // Not a significant overshoot

            // Found overshoot at point i. Find the foldback endpoint (closest to dst after i)
            let bestJ = -1;
            let bestDist = Infinity;
            for (let j = i + 1; j <= points.length - 1; j++) {
                const dist = Math.abs(coord(points[j]) - dstCoord);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestJ = j;
                }
            }
            if (bestJ < 0) continue;

            // Shortcut: A(before overshoot) → corner → B(after foldback)
            // Use i-1 as A if available, to skip the overshoot point entirely
            const aIdx = Math.max(0, i - 1);
            const A = points[aIdx];
            const B = points[bestJ];

            // Check incoming direction to A (relaxed)
            const inIsH = aIdx > 0 ? isNearlyHoriz(points[aIdx - 1], A) : true;
            const inIsV = aIdx > 0 ? isNearlyVert(points[aIdx - 1], A) : true;
            // Check outgoing from B (relaxed)
            const outIsH = bestJ < points.length - 1 ? isNearlyHoriz(B, points[bestJ + 1]) : true;
            const outIsV = bestJ < points.length - 1 ? isNearlyVert(B, points[bestJ + 1]) : true;

            // corner1 = {A.x, B.y}: A→corner1 is V, corner1→B is H
            const c1ok = inIsH && outIsV;
            // corner2 = {B.x, A.y}: A→corner2 is H, corner2→B is V
            const c2ok = inIsV && outIsH;

            if (!c1ok && !c2ok) continue;

            const corner = c1ok ? { x: A.x, y: B.y } : { x: B.x, y: A.y };

            if (isBlocked(A, corner) || isBlocked(corner, B)) continue;

            // Calculate lengths to ensure shortcut is actually shorter
            let origLen = 0;
            for (let k = aIdx; k < bestJ; k++) {
                origLen += Math.abs(points[k].x - points[k + 1].x) + Math.abs(points[k].y - points[k + 1].y);
            }
            const shortLen = Math.abs(A.x - corner.x) + Math.abs(A.y - corner.y) +
                             Math.abs(corner.x - B.x) + Math.abs(corner.y - B.y);
            if (shortLen >= origLen - 20) continue;

            // Apply shortcut
            return [
                ...points.slice(0, aIdx + 1),
                corner,
                ...points.slice(bestJ)
            ];
        }
    }

    return points;
}

export function removeLargeBacktrack(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex = [],
    options?: { sourcePos?: Position; targetPos?: Position },
    threshold = 60
): Point[] {
    if (points.length < 5) return points;  // Need ≥5: start, stub, backtrack, return, end

    const src = points[0];
    const dst = points[points.length - 1];

    const totalDx = dst.x - src.x;
    const totalDy = dst.y - src.y;
    // Require a clear dominant direction (≥1.2:1 ratio), abort otherwise
    // [FIX] Relaxed from 2:1 to 1.2:1 to handle near-diagonal paths like
    // tms→downstream (dx=646, dy=728) where U-turns still need removal.
    const isMainHorizontal = Math.abs(totalDx) >= Math.abs(totalDy);
    if (isMainHorizontal  && Math.abs(totalDx) < Math.abs(totalDy) * 1.2) return points;
    if (!isMainHorizontal && Math.abs(totalDy) < Math.abs(totalDx) * 1.2) return points;

    const mainSign = isMainHorizontal
        ? (totalDx > 0 ? 1 : -1)
        : (totalDy > 0 ? 1 : -1);

    const totalSpan = Math.abs(isMainHorizontal ? totalDx : totalDy);
    const minBacktrackDist = Math.max(threshold, totalSpan * 0.25);

    const mainCoord = (p: Point) => isMainHorizontal ? p.x : p.y;
    const isHoriz   = (a: Point, b: Point) => Math.abs(a.y - b.y) < 1;
    const isVert    = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1;

    const isBlocked = (a: Point, b: Point): boolean => {
        const rects = Array.isArray(obstacles) ? (obstacles as Rectangle[]) : [];
        const CLEAR = 4;
        const minX = Math.min(a.x, b.x) - CLEAR;
        const maxX = Math.max(a.x, b.x) + CLEAR;
        const minY = Math.min(a.y, b.y) - CLEAR;
        const maxY = Math.max(a.y, b.y) + CLEAR;
        return rects.some(obs =>
            obs.x < maxX && obs.x + obs.width > minX &&
            obs.y < maxY && obs.y + obs.height > minY
        );
    };

    let result = [...points];
    let changed = true;
    let maxIter = 3;

    while (changed && maxIter-- > 0) {
        changed = false;
        const pts = result;
        if (pts.length < 5) break;

        // Protect first stub (0→1) and last stub (n-2→n-1); scan interior only
        for (let i = 1; i <= pts.length - 4; i++) {
            const segDelta = mainCoord(pts[i + 1]) - mainCoord(pts[i]);
            if ((segDelta * mainSign) >= -minBacktrackDist) continue;

            const backtrackLevel = mainCoord(pts[i]);
            let returnIdx = -1;
            for (let j = i + 2; j <= Math.min(pts.length - 2, i + 8); j++) {
                if ((mainCoord(pts[j]) - backtrackLevel) * mainSign >= 0) {
                    returnIdx = j;
                    break;
                }
            }
            if (returnIdx < 0 || returnIdx >= pts.length - 1) continue;

            const A = pts[i];
            const B = pts[returnIdx];

            // ── ORTHOGONAL COMPATIBILITY ──────────────────────────────────────────
            // corner1 = {A.x, B.y}: A→corner1 is V (need incomingH), corner1→B is H (need outgoingV)
            // corner2 = {B.x, A.y}: A→corner2 is H (need incomingV), corner2→B is V (need outgoingH)
            const incomingIsH = isHoriz(pts[i - 1], A);
            const incomingIsV = isVert(pts[i - 1], A);
            const outgoingIsH = isHoriz(B, pts[returnIdx + 1]);
            const outgoingIsV = isVert(B, pts[returnIdx + 1]);

            const corner1ok = incomingIsH && outgoingIsV;
            const corner2ok = incomingIsV && outgoingIsH;
            if (!corner1ok && !corner2ok) continue;

            const corner = corner1ok
                ? { x: A.x, y: B.y }
                : { x: B.x, y: A.y };
            // ──────────────────────────────────────────────────────────────────────

            if (isBlocked(A, corner) || isBlocked(corner, B)) continue;

            const shortcutLen =
                Math.abs(A.x - corner.x) + Math.abs(A.y - corner.y) +
                Math.abs(corner.x - B.x) + Math.abs(corner.y - B.y);
            let originalLen = 0;
            for (let k = i; k < returnIdx; k++) {
                originalLen += Math.abs(pts[k].x - pts[k+1].x) + Math.abs(pts[k].y - pts[k+1].y);
            }
            if (shortcutLen >= originalLen - 10) continue;

            result = [
                ...pts.slice(0, i + 1),
                corner,
                ...pts.slice(returnIdx)
            ];
            changed = true;
            break;
        }
    }

    return result;
}


export function collapseCollinearBacktracks(points: Point[]) {

    if (points.length < 3) return points;
    const res: Point[] = [{ x: points[0].x, y: points[0].y }];
    for (let i = 1; i < points.length - 1; i++) {
        const prev = res[res.length - 1];
        const curr = points[i];
        const next = points[i + 1];

        const isHorizontal = Math.abs(prev.y - curr.y) < 1 && Math.abs(curr.y - next.y) < 1;
        const isVertical = Math.abs(prev.x - curr.x) < 1 && Math.abs(curr.x - next.x) < 1;

        if (isHorizontal || isVertical) {
            // [FIX] Skip ALL collinear points (both forward and backward).
            // Retaining forward collinear points causes createFilletedPath to generate
            // impossible semicircular arcs (bulges) on straight lines.
            continue;
        }

        res.push({ x: curr.x, y: curr.y });
    }
    const last = points[points.length - 1];
    res.push({ x: last.x, y: last.y });
    return res;
}
