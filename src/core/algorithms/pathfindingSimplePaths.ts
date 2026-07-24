import type { Position } from '@xyflow/react';

import { SpatialIndex } from './SpatialIndex';
import {
    areSegmentsCollinearAndOverlapping,
    isPathBlocked,
} from './pathfindingCollision';
import type { LineObstacle, Point, Rectangle } from './pathfindingTypes';

const isSpatialIndex = (value: Rectangle[] | SpatialIndex): value is SpatialIndex => (
    !Array.isArray(value) && typeof value.queryLine === 'function'
);

/** Generates a direct, L-shaped, or Z-shaped path when geometry permits. */
export function generateSimplePath(
    start: Point,
    end: Point,
    obstacles: Rectangle[] | SpatialIndex,
    lineObstacles: LineObstacle[] = [],
    options?: {
        enableBuffer?: boolean;  // 是否考虑缓冲区(默认true)
        bufferDistance?: number; // 缓冲区距离(默认20px)
        maxSegments?: number;    // 允许的最大段数: 2=直线, 3=L型, 4=Z型(默认4)
        sourcePos?: Position;
        targetPos?: Position;
        allowLineCrossings?: boolean;
    }
): Point[] | null {
    // 合并默认选项
    const opts = {
        enableBuffer: true,
        bufferDistance: 5,  // [FIX] Reduced from 15 to 5. 15px buffer in dense diagrams causes bypass failure in 20px corridors.
        maxSegments: 4,
        allowLineCrossings: false,
        ...options
    };

    // enableBuffer=false 时使用非常小的 padding(1px) 只检测直接碰撞
    // enableBuffer=true 时使用指定的 bufferDistance
    const padding = opts.enableBuffer ? opts.bufferDistance : 1;

    // Helper to check if a path is valid and respects port directions
    const checkPath = (path: Point[], allowLineCrossings: boolean = false) => {
        if (opts.sourcePos) {
            const dx = path[1].x - path[0].x;
            const dy = path[1].y - path[0].y;
            if (opts.sourcePos === 'left' && dx > 0) return false;
            if (opts.sourcePos === 'right' && dx < 0) return false;
            if (opts.sourcePos === 'top' && dy > 0) return false;
            if (opts.sourcePos === 'bottom' && dy < 0) return false;
        }
        if (opts.targetPos) {
            const n = path.length;
            const dx = path[n - 1].x - path[n - 2].x;
            const dy = path[n - 1].y - path[n - 2].y;
            if (opts.targetPos === 'left' && dx < 0) return false;
            if (opts.targetPos === 'right' && dx > 0) return false;
            if (opts.targetPos === 'top' && dy < 0) return false;
            if (opts.targetPos === 'bottom' && dy > 0) return false;
        }

        if (allowLineCrossings) {
            // Only check collinear overlaps, ignore crossings
            return !isPathBlocked(path, obstacles, padding, []) &&
                   !path.some((p, i) => i < path.length - 1 && lineObstacles.some(line => areSegmentsCollinearAndOverlapping(path[i], path[i+1], line.start, line.end)));
        } else {
            return !isPathBlocked(path, obstacles, padding, lineObstacles);
        }
    };

    const lineCrossingPasses = opts.allowLineCrossings ? [false, true] : [false];
    for (const allowCrossings of lineCrossingPasses) {
        // 1. 直线检查 (水平或垂直对齐)
        if (Math.abs(start.x - end.x) < 0.1 || Math.abs(start.y - end.y) < 0.1) {
            if (checkPath([start, end], allowCrossings)) {
                return [start, end];
            }
        }

    // 2. L型路径 (2个点 + 1个转角 = 3个点)
    if (opts.maxSegments >= 3) {
        // L型有两种可能: 横-竖 或 竖-横
        const cornerA = { x: end.x, y: start.y };  // 先横向再竖向
        const cornerB = { x: start.x, y: end.y };  // 先竖向再横向

        const pathA = [start, cornerA, end];
        const pathB = [start, cornerB, end];

        // 检查两种L型路径，优先返回第一个不被阻挡的
        if (checkPath(pathA, allowCrossings)) return pathA;
        if (checkPath(pathB, allowCrossings)) return pathB;
    }

    // 3. Z型路径 (4个点)
    if (opts.maxSegments >= 4) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;

        // [FIX] Removed `isHorizontalDominant` check. We do not know the source/target port directions,
        // so `Math.abs(dx) >= Math.abs(dy)` is a flawed heuristic that skips perfectly valid paths
        // when the spatial proportion doesn't match the port orientation.
        // We now check BOTH H-V-H and V-H-V orientations.

        // --- Try H-V-H 形状: 横-竖-横 ---
        // [I-3] Reduce STEPS: boundary-edge candidates (leftSweep/rightSweep) already cover
        // the critical narrow-corridor x-values. Uniform steps are a coarse backup,
        // so cap at 8 (was 20) to cut ~60% of isPathBlocked calls per Z-path probe.
        let candidates: number[] = [];

        // [FIX] Explicitly add the exact midpoint to guarantee perfectly symmetrical
        // Z-paths when unobstructed. Odd STEPS would otherwise miss the exact midpoint.
        const midP = start.x + dx / 2;
        candidates.push(midP);

        const STEPS = Math.min(8, Math.max(3, Math.floor(Math.abs(dx) / 20)));
        for (let i = 1; i < STEPS; i++) {
            candidates.push(start.x + (dx * i) / STEPS);
        }

        // [FIX] Ensure we also test critical gap lines formed by obstacles
        // This guarantees narrow corridors are found even if step resolution misses them entirely
        let localObstacles = obstacles as Rectangle[];
        if (isSpatialIndex(obstacles)) {
            localObstacles = obstacles.query({
                x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
                width: Math.abs(dx), height: Math.abs(dy)
            });
        }
        for (const obs of localObstacles) {
            const leftSweep = obs.x - padding - 1;
            const rightSweep = obs.x + obs.width + padding + 1;
            if (leftSweep > Math.min(start.x, end.x) && leftSweep < Math.max(start.x, end.x)) candidates.push(leftSweep);
            if (rightSweep > Math.min(start.x, end.x) && rightSweep < Math.max(start.x, end.x)) candidates.push(rightSweep);
        }

        // [I-3] Deduplicate and cap candidates to avoid redundant isPathBlocked calls.
        // Snap to 1px grid to cluster near-identical values, then keep closest-to-midpoint first.
        candidates = [...new Set(candidates.map(v => Math.round(v)))];
        candidates.sort((a, b) => Math.abs(a - midP) - Math.abs(b - midP));
        candidates = candidates.slice(0, 10);

        // Add explicit U-shape bypass candidates
        // [FIX] 动态 U-bypass 距离：取源/目标间距离的 20%，最小 30px，最大 200px
        const uBypassMargin = Math.max(30, Math.min(200, Math.abs(dx) * 0.2));
        candidates.push(Math.max(start.x, end.x) + uBypassMargin);
        candidates.push(Math.min(start.x, end.x) - uBypassMargin);

        for (const midX of candidates) {
            const path = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
            if (checkPath(path, allowCrossings)) {
                return path;
            }
        }

        // --- Try V-H-V 形状: 竖-横-竖 ---
        let candidatesY: number[] = [];
        const midPy = start.y + dy / 2;
        candidatesY.push(midPy); // Explicitly add midpoint for perfect symmetry

        const STEPS_Y = Math.min(8, Math.max(3, Math.floor(Math.abs(dy) / 20)));
        for (let i = 1; i < STEPS_Y; i++) {
            candidatesY.push(start.y + (dy * i) / STEPS_Y);
        }

        for (const obs of localObstacles) {
            const topSweep = obs.y - padding - 1;
            const bottomSweep = obs.y + obs.height + padding + 1;
            if (topSweep > Math.min(start.y, end.y) && topSweep < Math.max(start.y, end.y)) candidatesY.push(topSweep);
            if (bottomSweep > Math.min(start.y, end.y) && bottomSweep < Math.max(start.y, end.y)) candidatesY.push(bottomSweep);
        }

        // Deduplicate and cap
        candidatesY = [...new Set(candidatesY.map(v => Math.round(v)))];
        candidatesY.sort((a, b) => Math.abs(a - midPy) - Math.abs(b - midPy));
        candidatesY = candidatesY.slice(0, 10);

        // Add explicit U-shape bypass candidates
        // [FIX] 动态 U-bypass 距离：取源/目标间距离的 20%，最小 30px，最大 200px
        const uBypassMarginY = Math.max(30, Math.min(200, Math.abs(dy) * 0.2));
        candidatesY.push(Math.max(start.y, end.y) + uBypassMarginY);
        candidatesY.push(Math.min(start.y, end.y) - uBypassMarginY);

        for (const midY of candidatesY) {
            const path = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
            if (checkPath(path, allowCrossings)) {
                return path;
            }
        }
    } // end if maxSegments >= 4
    } // end for passes

    // 4. 无法生成简单路径，返回null让A*处理
    return null;
}



export function simplifyPath(path: Point[]): Point[] {
    if (path.length <= 2) return path;
    const simplified: Point[] = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
        const prev = path[i - 1];
        const curr = path[i];
        const next = path[i + 1];

        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;

        // [FIX] Cross product accurately detects collinearity regardless of segment length.
        // dx1 !== dx2 failed when lengths differed.
        const crossProduct = dx1 * dy2 - dy1 * dx2;
        // Dot product < 0 means a U-turn (backtrack). We must keep backtrack turning points.
        const dotProduct = dx1 * dx2 + dy1 * dy2;

        if (Math.abs(crossProduct) > 0.1 || dotProduct < 0) {
            simplified.push(curr);
        }
    }
    simplified.push(path[path.length - 1]);
    return simplified;
}

/**
 * Cost Configuration
 * Industry Standard Tuning:
 * - High Direction Change Cost: Encourages long straight lines (Orthogonal priority).
 * - High Line Cross Cost: Discourages crossing other edges.
 * - Buffer Zones: Keeps paths away from nodes but allows approach.
 */
// [NEW] Shared Grid Interface

/** Generates a bounded C-shaped detour from the requested source side. */
export function generateSmartCShapePath(
    start: Point,
    end: Point,
    startPos: Position,
    _sRect: Rectangle | null,
    _tRect: Rectangle | null,
    obstacles: Rectangle[] | SpatialIndex,
    options: {
        gridSize?: number;
        detourFactor?: number;
        debug?: boolean;
        debugOut?: {
            visited?: Point[];
            grid?: {
                minX: number;
                minY: number;
                cols: number;
                rows: number;
                size: number;
                data: Int32Array;
            };
        };
    } = {}
): Point[] | null {
    const { gridSize = 20, debug = false } = options;

    // Determine direction based on Position
    let dirX = 0, dirY = 0;
    if (startPos === 'top') dirY = -1;
    else if (startPos === 'bottom') dirY = 1;
    else if (startPos === 'left') dirX = -1;
    else if (startPos === 'right') dirX = 1;

    // Candidates for margin
    const margins = [60, 80, 120, 160];

    for (const margin of margins) {
        let p1: Point, p2: Point;

        if (dirX !== 0) { // Horizontal (Left/Right)
            const x = start.x + (dirX * margin);
            p1 = { x, y: start.y };
            p2 = { x, y: end.y };
        } else { // Vertical (Top/Bottom)
            const y = start.y + (dirY * margin);
            p1 = { x: start.x, y };
            p2 = { x: end.x, y };
        }

        const path = [start, p1, p2, end];

        // Simple 3-segment check
        const seg1 = [start, p1];
        const seg2 = [p1, p2];
        const seg3 = [p2, end];

        if (!isPathBlocked(seg1, obstacles, gridSize) &&
            !isPathBlocked(seg2, obstacles, gridSize) &&
            !isPathBlocked(seg3, obstacles, gridSize)) {

            if (debug) {
                // debug logging placeholder
            }
            return path;
        }
    }

    return null;
}
