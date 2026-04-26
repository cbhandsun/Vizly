/**
 * A*寻路算法 - 工业级高性能核心 (TypedArray + MinHeap + Spatial Rasterization)
 *
 * improvements:
 * - Weighted Grid: Support "Cost" instead of just Blocked/Free.
 * - Flat Memory: Uses Int32Array/Uint8Array instead of Map<string, object> for 50x perf.
 * - MinHeap: O(log n) priority queue for open set.
 * - Spatial Rasterization: O(TotalArea) obstacle painting instead of O(N*G) checks.
 * - Buffer Zones: High cost near obstacles to discourage "hugging".
 * - Line Crossing: High cost to cross existing lines.
 * - [P1-1] Visibility Graph: Optimize search for dense obstacle scenarios.
 */

import {
    findPathOnVisibilityGraph,
    type VisibilityGraph
} from './visibilityGraph';
import { RoutingStrategySelector, RoutingAlgorithm } from './RoutingStrategySelector';
import { VisibilityGraphCache } from './VisibilityGraphCache';
import { SpatialIndex } from './SpatialIndex';
import type { Position } from '@xyflow/react';

/**
 * [P1-1] Pathfinding configuration
 */
export interface PathfindingConfig {
    useVisibilityGraph?: boolean;           // 启用可见性图优化（默认false）
    visibilityGraphMinObstacles?: number;   // 最小障碍物数量阈值（默认10）
    visibilityGraphCache?: VisibilityGraph; // 预构建的可见性图缓存
    enableSmartStrategy?: boolean;          // [P1.2] 启用智能算法选择
    strategySelector?: RoutingStrategySelector; // [P1.2] 策略选择器实例
    vgCacheManager?: VisibilityGraphCache;  // [P1.2] VG缓存管理器
    enableThetaStar?: boolean;
}

// Global config (可通过外部设置)
let globalPathfindingConfig: PathfindingConfig = {
    useVisibilityGraph: false,
    visibilityGraphMinObstacles: 6,
    enableSmartStrategy: true,
    strategySelector: new RoutingStrategySelector(),
    vgCacheManager: new VisibilityGraphCache({ maxSize: 10 })
};

export function setPathfindingConfig(config: Partial<PathfindingConfig>): void {
    globalPathfindingConfig = { ...globalPathfindingConfig, ...config };
}

export function getPathfindingConfig(): PathfindingConfig {
    return globalPathfindingConfig;
}

export interface Point {
    x: number;
    y: number;
}

export interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Line segment for obstacle
export interface LineObstacle {
    start: Point;
    end: Point;
}

// Minimal Priority Queue Implementation
class MinHeap {
    // [I-6] Use Int32Array instead of number[] to eliminate per-push GC allocations.
    // The heap stores grid indices (Int32), not floating-point values.
    // Initial capacity = min(maxIndex, 65536) balances pre-allocation cost vs. coverage:
    //   - A typical 100×100 grid (10K cells) easily fits in 65536 slots.
    //   - For a 2M-cell grid, 65536 is still generous (open set peaks at sqrt(N) ~ 1414).
    // Growth: capacity doubles on overflow (rare, only on pathologically dense graphs).
    private heap: Int32Array;
    private capacity: number;
    private _size: number = 0;
    private weights: Float32Array;

    constructor(weights: Float32Array) {
        this.weights = weights;
        this.capacity = Math.min(weights.length, 65536);
        this.heap = new Int32Array(this.capacity);
    }

    push(index: number) {
        if (this._size >= this.capacity) {
            // Grow: double capacity (rare path)
            const newCapacity = Math.min(this.capacity * 2, this.weights.length);
            const newHeap = new Int32Array(newCapacity);
            newHeap.set(this.heap.subarray(0, this._size));
            this.heap = newHeap;
            this.capacity = newCapacity;
        }
        this.heap[this._size] = index;
        this.bubbleUp(this._size++);
    }

    pop(): number | undefined {
        if (this._size === 0) return undefined;
        const top = this.heap[0];
        this._size--;
        if (this._size > 0) {
            this.heap[0] = this.heap[this._size];
            this.bubbleDown(0);
        }
        return top;
    }

    size(): number {
        return this._size;
    }

    private bubbleUp(i: number) {
        while (i > 0) {
            const p = (i - 1) >>> 1;
            if (this.weights[this.heap[i]] < this.weights[this.heap[p]]) {
                this.swap(i, p);
                i = p;
            } else {
                break;
            }
        }
    }

    private bubbleDown(i: number) {
        // [I-6] Use this._size (not heap.length) to avoid comparing uninitialized slots
        const len = this._size;
        while (i >= 0) {
            const l = (i << 1) + 1;
            const r = l + 1;
            let smallest = i;

            if (l < len && this.weights[this.heap[l]] < this.weights[this.heap[smallest]]) {
                smallest = l;
            }
            if (r < len && this.weights[this.heap[r]] < this.weights[this.heap[smallest]]) {
                smallest = r;
            }
            if (smallest !== i) {
                this.swap(i, smallest);
                i = smallest;
            } else {
                break;
            }
        }
    }

    private swap(a: number, b: number) {
        const tmp = this.heap[a];
        this.heap[a] = this.heap[b];
        this.heap[b] = tmp;
    }
}

/**
 * 检查点是否在矩形内(包含边界)
 */
function isPointInRectangle(x: number, y: number, rect: Rectangle, padding: number = 0): boolean {
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

function areSegmentsCollinearAndOverlapping(p1: Point, p2: Point, p3: Point, p4: Point, threshold: number = 2): boolean {
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

/**
 * 简化路径生成 - 增强版
 * 
 * 尝试使用几何推导生成简单路径(直线、L型、Z型)，避免使用A*网格搜索。
 * 这是性能优化的关键：90%的简单场景可以用解析几何快速计算。
 * 
 * @param start 起点
 * @param end 终点
 * @param obstacles 障碍物列表或空间索引
 * @param lineObstacles 线性障碍物(其他边)
 * @param options 配置选项
 * @returns 路径点数组，如果无法生成简单路径则返回null
 */
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
    }
): Point[] | null {
    // 合并默认选项
    const opts = {
        enableBuffer: true,
        bufferDistance: 5,  // [FIX] Reduced from 15 to 5. 15px buffer in dense diagrams causes bypass failure in 20px corridors.
        maxSegments: 4,
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
        
        let localLineObs = lineObstacles;
        if (allowLineCrossings) {
            // Only check collinear overlaps, ignore crossings
            return !isPathBlocked(path, obstacles, padding, []) && 
                   !path.some((p, i) => i < path.length - 1 && lineObstacles.some(line => areSegmentsCollinearAndOverlapping(path[i], path[i+1], line.start, line.end)));
        } else {
            return !isPathBlocked(path, obstacles, padding, lineObstacles);
        }
    };

    // Run passes: strict first, then relaxed (allowing crossings)
    for (const allowCrossings of [false, true]) {
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
        let midP = start.x + dx / 2;
        candidates.push(midP);
        
        let STEPS = Math.min(8, Math.max(3, Math.floor(Math.abs(dx) / 20)));
        for (let i = 1; i < STEPS; i++) {
            candidates.push(start.x + (dx * i) / STEPS);
        }
        
        // [FIX] Ensure we also test critical gap lines formed by obstacles
        // This guarantees narrow corridors are found even if step resolution misses them entirely
        const isSpIdx = (obs: any): obs is SpatialIndex => typeof obs.queryLine === 'function';
        let localObstacles = obstacles as Rectangle[];
        if (isSpIdx(obstacles)) {
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
        candidates.push(Math.max(start.x, end.x) + 30);
        candidates.push(Math.min(start.x, end.x) - 30);

        for (const midX of candidates) {
            const path = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
            if (checkPath(path, allowCrossings)) {
                return path;
            }
        }

        // --- Try V-H-V 形状: 竖-横-竖 ---
        let candidatesY: number[] = [];
        let midPy = start.y + dy / 2;
        candidatesY.push(midPy); // Explicitly add midpoint for perfect symmetry
        
        let STEPS_Y = Math.min(8, Math.max(3, Math.floor(Math.abs(dy) / 20)));
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
        candidatesY.push(Math.max(start.y, end.y) + 30);
        candidatesY.push(Math.min(start.y, end.y) - 30);

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



function simplifyPath(path: Point[]): Point[] {
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
export interface PathfindingGrid {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    cols: number;
    rows: number;
    size: number;
    data: Int32Array;
    maxIndex: number;
}

const COSTS = {
    MERGE_PATH: 1,      // Extremely low cost to encourage merging
    SOURCE_TARGET: 9,   // [NEW] Distinct cost for Source/Target nodes (slightly lower than Normal to encourage entry/exit)
    NORMAL: 10,         // Base cost
    BUFFER_ZONE_CLOSE: 15, // [FIX] Reduced from 20 to 15. Let A* graze nodes much more freely.
    BUFFER_ZONE_FAR: 10, // 
    DIRECTION_CHANGE: 1000, // [FIX] Increased massively from 400 to 1000. Forcing straight lines over almost everything.
    LINE_OCCUPIED: 10,
    // [FIX] LINE_CROSS drastically reduced from 50000 to 300.
    // 50000 caused massive visual detours (looping entirely around the graph components)
    // just to avoid crossing a line. We have LineJumpEngine which cleanly renders jumps
    // over overlapping lines. A penalty of 300 is enough to discourage crossing if a 
    // short detour (< 30 grid units) exists, but permits intersections over ridiculous detours.
    LINE_CROSS: 300, 
    OBSTACLE: 10000000,
    CONTAINER_BORDER: 400
};

/**
 * [NEW] Pre-build Grid for Reuse
 */
export function buildPathfindingGrid(
    obstacles: Rectangle[] | SpatialIndex,
    boundsSpec: { startX: number, startY: number, endX: number, endY: number },
    gridSize: number = 20,
    alignTo?: Point
): PathfindingGrid {
    // Calculate Bounds (based on provided spec, usually bounding box of all tasks)
    const GRID_PADDING = 200; // [FIX] 200px is sufficient for routing detours. 600px wasted ~60% of grid area.

    // [NEW] Dynamic Grid Alignment (Hanan-inspired)
    // Align grid lines to the start point (alignTo) to ensure key coordinates are exact grid intersections.
    let offsetX = 0;
    let offsetY = 0;
    if (alignTo) {
        offsetX = alignTo.x % gridSize;
        offsetY = alignTo.y % gridSize;
        if (offsetX < 0) offsetX += gridSize;
        if (offsetY < 0) offsetY += gridSize;
    }

    const snapToGrid = (val: number, offset: number) => Math.floor((val - offset) / gridSize) * gridSize + offset;

    // Align to grid
    const sX = snapToGrid(boundsSpec.startX, offsetX);
    const sY = snapToGrid(boundsSpec.startY, offsetY);
    const eX = Math.ceil((boundsSpec.endX - offsetX) / gridSize) * gridSize + offsetX;
    const eY = Math.ceil((boundsSpec.endY - offsetY) / gridSize) * gridSize + offsetY;

    // [FIX] Dynamic Grid Bounds Expansion
    let minX_raw = Math.min(sX, eX) - GRID_PADDING;
    let minY_raw = Math.min(sY, eY) - GRID_PADDING;
    let maxX_raw = Math.max(sX, eX) + GRID_PADDING;
    let maxY_raw = Math.max(sY, eY) + GRID_PADDING;

    const _isSpatialIndex = (obs: any): obs is SpatialIndex => typeof (obs as SpatialIndex).query === 'function';
    let expansionObstacles: Rectangle[];

    if (_isSpatialIndex(obstacles)) {
        expansionObstacles = obstacles.query({
            x: minX_raw - 100,
            y: minY_raw - 100,
            width: (maxX_raw - minX_raw) + 200,
            height: (maxY_raw - minY_raw) + 200
        });
    } else {
        expansionObstacles = obstacles;
    }

    for (const obs of expansionObstacles) {
        const intersects = !(obs.x > maxX_raw || obs.x + obs.width < minX_raw || obs.y > maxY_raw || obs.y + obs.height < minY_raw);
        if (intersects) {
            const routeMargin = 200;
            minX_raw = Math.min(minX_raw, obs.x - routeMargin);
            maxX_raw = Math.max(maxX_raw, obs.x + obs.width + routeMargin);
            minY_raw = Math.min(minY_raw, obs.y - routeMargin);
            maxY_raw = Math.max(maxY_raw, obs.y + obs.height + routeMargin);
        }
    }

    const minX = snapToGrid(minX_raw, offsetX);
    const maxX = Math.ceil((maxX_raw - offsetX) / gridSize) * gridSize + offsetX;
    const minY = snapToGrid(minY_raw, offsetY);
    const maxY = Math.ceil((maxY_raw - offsetY) / gridSize) * gridSize + offsetY;

    const cols = Math.round((maxX - minX) / gridSize) + 1; // Use round to avoid float errors
    const rows = Math.round((maxY - minY) / gridSize) + 1;
    const maxIndex = cols * rows;

    if (maxIndex > 2000000) {
        console.warn(`[Pathfinding] Grid massive: ${cols}x${rows} = ${maxIndex}. Memory impact high.`);
    }

    const costs = new Int32Array(maxIndex).fill(COSTS.NORMAL);

    // Rasterization
    const bufferDistanceClose = gridSize * 1.0;
    const bufferDistanceFar = gridSize * 2.0;

    // Helper: Rasterize Rect (Inline for perf or copied logic)
    const rasterizeRect = (rect: Rectangle, padding: number, cost: number) => {
        const rx = rect.x - padding;
        const ry = rect.y - padding;
        const rw = rect.width + padding * 2;
        const rh = rect.height + padding * 2;

        const startC = Math.max(0, Math.floor((rx - minX) / gridSize));
        const endC = Math.min(cols - 1, Math.floor((rx + rw - minX) / gridSize));

        const startR = Math.max(0, Math.floor((ry - minY) / gridSize));
        const endR = Math.min(rows - 1, Math.floor((ry + rh - minY) / gridSize));

        for (let r = startR; r <= endR; r++) {
            const rowOffset = r * cols;
            for (let c = startC; c <= endC; c++) {
                const idx = rowOffset + c;
                // Don't overwrite hard obstacles
                if (costs[idx] === COSTS.OBSTACLE) continue;

                if (cost === COSTS.OBSTACLE) {
                    costs[idx] = COSTS.OBSTACLE;
                } else {
                    costs[idx] = Math.max(costs[idx], cost);
                }
            }
        }
    };

    // [DEBUG] Log total obstacles applied
    // const shouldLog = obstacles.length > 20; // e10 should have 24 obstacles
    // if (shouldLog) {
    //
    // }

    // Apply Obstacles
    const isSpatialIndex = (obs: Rectangle[] | SpatialIndex): obs is SpatialIndex => typeof (obs as SpatialIndex).query === 'function';
    let relevantObstacles: Rectangle[] = [];

    if (isSpatialIndex(obstacles)) {
        // Query obstacles intersecting the grid area (plus buffer for safety)
        const buffer = bufferDistanceFar;
        const queryRange = {
            x: minX - buffer,
            y: minY - buffer,
            width: (maxX - minX) + buffer * 2,
            height: (maxY - minY) + buffer * 2
        };
        relevantObstacles = obstacles.query(queryRange);
    } else {
        relevantObstacles = obstacles;
    }

    for (const obs of relevantObstacles) {
        // [FIX] Extract custom padding and soft zone flags from obstacle
        const customPadding = (obs as any).padding ?? 0;
        const isSoftZone = (obs as any).isSoftZone === true;

        if (isSoftZone) {
            // Soft zone applies a graduated high cost but does not block pathing
            rasterizeRect(obs, bufferDistanceFar + customPadding, COSTS.BUFFER_ZONE_FAR);
            rasterizeRect(obs, bufferDistanceClose + customPadding, COSTS.BUFFER_ZONE_CLOSE);
            rasterizeRect(obs, customPadding, COSTS.CONTAINER_BORDER); // High but traversable cost
        } else {
            // Hard obstacle
            rasterizeRect(obs, bufferDistanceFar + customPadding, COSTS.BUFFER_ZONE_FAR);
            rasterizeRect(obs, bufferDistanceClose + customPadding, COSTS.BUFFER_ZONE_CLOSE);
            rasterizeRect(obs, customPadding, COSTS.OBSTACLE);
        }
    }

    return {
        minX, minY, maxX, maxY, cols, rows, size: gridSize,
        data: costs,
        maxIndex
    };
}

/**
 * A*寻路算法 (High Performance TypedArray + Spatial Rasterization)
 */
export function findPath(
    start: Point,
    end: Point,
    obstacles: Rectangle[] | SpatialIndex,
    gridSize: number = 20,
    lineObstacles: LineObstacle[] = [],
    debugOut?: { visited?: Point[]; grid?: { minX: number, minY: number, cols: number, rows: number, size: number, data: Int32Array } },
    prebuiltGrid?: PathfindingGrid, // [NEW] Optional reused grid
    guideLines: LineObstacle[] = [], // [NEW] Low-cost lines to attract path
    returnNullOnFail: boolean = false, // [NEW] Allow caller to handle failure
    dynamicObstacles: Rectangle[] = [], // [NEW] Dynamic obstacles (e.g., strict padding) to be added to grid
    containerBorders: Rectangle[] = [], // [NEW] Soft penalty for container borders
    congestionGrid?: Int32Array,   // [NEW] Congestion map
    clearanceRects: Rectangle[] = [],   // [NEW] Areas to force clear (source/target)
    generateOpts?: { sourcePos?: Position, targetPos?: Position } // [NEW] Port directions for simple path validation
): Point[] | null {
    // [DEBUG] Log findPath invocation for e10 debugging

    const isSpatialIndex = (obs: Rectangle[] | SpatialIndex): obs is SpatialIndex => typeof (obs as SpatialIndex).query === 'function';
    const spatialIndex = isSpatialIndex(obstacles) ? obstacles : undefined;
    const obstacleList: Rectangle[] = spatialIndex ? spatialIndex.getAll() : (obstacles as Rectangle[]);

    const simplePath = generateSimplePath(start, end, obstacles, lineObstacles, generateOpts);
    if (simplePath) {
        const hasDynamicObstacles = dynamicObstacles.length > 0;

        // [I-1] Removed dead `const isBlocked = false` branch.
        // generateSimplePath already checks all obstacles. If it returns a path, always use it
        // (unless dynamic obstacles are present, which require A* for precise avoidance).
        if (!hasDynamicObstacles) {
            if (debugOut) {
                const debugGrid = buildPathfindingGrid(
                    obstacles,
                    { startX: start.x, startY: start.y, endX: end.x, endY: end.y },
                    gridSize
                );
                debugOut.grid = {
                    minX: debugGrid.minX,
                    minY: debugGrid.minY,
                    cols: debugGrid.cols,
                    rows: debugGrid.rows,
                    size: debugGrid.size,
                    data: new Int32Array(debugGrid.data)
                };
            }
            return simplePath;
        }
    }


    // [P1.2] Smart Strategy Selection
    const config = getPathfindingConfig();
    // obstacleList已在前面声明

    // Use smart strategy selector if enabled (Skip if we already have a prebuilt grid)
    if (!prebuiltGrid && config.enableSmartStrategy && config.strategySelector) {
        const strategy = config.strategySelector.selectStrategy({
            obstacleCount: obstacleList.length,
            canvasBounds: {
                width: Math.abs(end.x - start.x) * 2,
                height: Math.abs(end.y - start.y) * 2
            },
            obstacles: obstacleList
        });

        // If strategy recommends VG, use it
        if (strategy === RoutingAlgorithm.VISIBILITY_GRAPH) {
            // Use VG cache if available
            const vgCache = config.vgCacheManager;
            let visibilityGraph: VisibilityGraph | undefined;

            if (vgCache) {
                visibilityGraph = vgCache.getOrBuild(obstacleList, spatialIndex, undefined, { obstacleOffset: 20 });
            } else if (config.visibilityGraphCache) {
                visibilityGraph = config.visibilityGraphCache;
            }

            const visibilityPath = findPathOnVisibilityGraph(
                start,
                end,
                obstacles,
                visibilityGraph,
                { obstacleOffset: 20 }
            );

            if (visibilityPath) {
                if (debugOut) {
                    const debugGrid = buildPathfindingGrid(
                        obstacles,
                        { startX: start.x, startY: start.y, endX: end.x, endY: end.y },
                        gridSize
                    );
                    debugOut.grid = {
                        minX: debugGrid.minX,
                        minY: debugGrid.minY,
                        cols: debugGrid.cols,
                        rows: debugGrid.rows,
                        size: debugGrid.size,
                        data: new Int32Array(debugGrid.data)
                    };
                }
                return visibilityPath;
            }

            // VG failed, fallback to Grid A*
        }
        // Otherwise use Grid A* (strategy already selected it)
    } else {
        // Legacy logic: Manual threshold check
        const obstacleCount = isSpatialIndex(obstacles) ? 100 : obstacleList.length;

        if (config.useVisibilityGraph &&
            obstacleCount >= (config.visibilityGraphMinObstacles || 10)) {

            const visibilityPath = findPathOnVisibilityGraph(
                start,
                end,
                obstacles,
                config.visibilityGraphCache,
                { obstacleOffset: 20 }
            );

            if (visibilityPath) {
                return visibilityPath;
            }
        }
    }


    // 1. Grid Setup (Or Reuse)
    let grid: PathfindingGrid;

    if (prebuiltGrid) {
        // [FIX] COW Save/Restore: Instead of cloning the entire 2MB Int32Array,
        // we mutate the shared grid in-place (only ~20-30 cells for clearLaunchZone,
        // lineObstacles, safety unblock) and restore original values after A* search.
        // This eliminates ~52MB of memory copies per batch of 26 edges.
        // Exception: congestionGrid modifies ALL cells, so we must clone in that case.
        if (congestionGrid && congestionGrid.length === prebuiltGrid.data.length) {
            // Full clone required for congestion merge
            grid = {
                ...prebuiltGrid,
                data: new Int32Array(prebuiltGrid.data)
            };
            for (let i = 0; i < grid.data.length; i++) {
                if (grid.data[i] < COSTS.OBSTACLE) {
                    grid.data[i] += congestionGrid[i];
                }
            }
        } else {
            // Zero-copy: reuse grid directly, will save/restore modified cells
            grid = prebuiltGrid;
        }
    } else {
        // Build fresh
        grid = buildPathfindingGrid(obstacles, { startX: start.x, startY: start.y, endX: end.x, endY: end.y }, gridSize);
    }

    // [New] Apply Clearance Rects
    // (Removed duplicate clearing logic, handled at line 868 instead)

    // [DEBUG] Capture Grid State if requested
    if (debugOut) {
        debugOut.grid = {
            minX: grid.minX,
            minY: grid.minY,
            cols: grid.cols,
            rows: grid.rows,
            size: grid.size,
            data: new Int32Array(grid.data)
        };
    }

    const { minX, minY, maxX, maxY, cols, rows, maxIndex, size, data: costs } = grid;

    // [FIX] COW Save/Restore tracking: when reusing prebuiltGrid without cloning,
    // save original cell values before modification and restore after A* search.
    const needsRestore = prebuiltGrid && grid === prebuiltGrid;
    const savedCells: { idx: number; val: number }[] = needsRestore ? [] : (undefined as any);
    const saveCost = (idx: number) => {
        if (needsRestore && idx >= 0 && idx < maxIndex) {
            savedCells.push({ idx, val: costs[idx] });
        }
    };
    const getIdx = (x: number, y: number) => {
        const c = Math.floor((x - minX) / size);
        const r = Math.floor((y - minY) / size);
        if (c < 0 || c >= cols || r < 0 || r >= rows) return -1;
        return r * cols + c;
    };


    // Helper to get coords form index
    const getCoords = (idx: number) => {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        return { x: minX + c * size, y: minY + r * size };
    };

    // [DEBUG] Capture
    if (debugOut) {
        if (!debugOut.grid) {
            debugOut.grid = { minX, minY, cols, rows, size, data: new Int32Array(costs) };
        }
    }

    // [FIX] Clear a 3x3 "launch corridor" around start/end points.
    // Single-cell clearing (original) left A* boxed by buffer zones,
    // causing immediate turns near nodes. 3x3 = 60px clear zone at 20px grid.
    // [FIX] Restore helper for COW grid
    const restoreSavedCells = () => {
        if (needsRestore && savedCells) {
            for (let i = savedCells.length - 1; i >= 0; i--) {
                costs[savedCells[i].idx] = savedCells[i].val;
            }
        }
    };

    const clearLaunchZone = (p: Point) => {
        const cx = Math.round(p.x / size) * size;
        const cy = Math.round(p.y / size) * size;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const idx = getIdx(cx + dc * size, cy + dr * size);
                if (idx !== -1 && costs[idx] < COSTS.OBSTACLE) {
                    saveCost(idx);
                    costs[idx] = COSTS.NORMAL;
                }
            }
        }
    };
    clearLaunchZone(start);
    clearLaunchZone(end);

    // Safety unblock exact points
    const sIdx = getIdx(Math.round(start.x / size) * size, Math.round(start.y / size) * size);
    if (sIdx !== -1 && costs[sIdx] === COSTS.OBSTACLE) { saveCost(sIdx); costs[sIdx] = COSTS.NORMAL; }

    const eIdx = getIdx(Math.round(end.x / size) * size, Math.round(end.y / size) * size);
    if (eIdx !== -1 && costs[eIdx] === COSTS.OBSTACLE) { saveCost(eIdx); costs[eIdx] = COSTS.NORMAL; }

    // [FIX] Disabled the clearanceRects loop. 
    // GridBuilder now omits padding for source/target natively.
    // This dangerous hack was previously blasting traversable holes 
    // into adjacent nodes if they happened to touch the padding ring!

    // Rasterize Line Obstacles
    const LINE_COST = COSTS.LINE_CROSS;
    for (const line of lineObstacles) {
        const lx1 = Math.min(line.start.x, line.end.x);
        const lx2 = Math.max(line.start.x, line.end.x);
        const ly1 = Math.min(line.start.y, line.end.y);
        const ly2 = Math.max(line.start.y, line.end.y);

        if (lx2 < minX || lx1 > maxX || ly2 < minY || ly1 > maxY) continue;

        const gStart = {
            x: Math.round(line.start.x / size) * size,
            y: Math.round(line.start.y / size) * size
        };
        const gEnd = {
            x: Math.round(line.end.x / size) * size,
            y: Math.round(line.end.y / size) * size
        };

        const idxStart = getIdx(gStart.x, gStart.y);
        const idxEnd = getIdx(gEnd.x, gEnd.y);

        if (idxStart !== -1 && costs[idxStart] < COSTS.OBSTACLE) { saveCost(idxStart); costs[idxStart] = Math.max(costs[idxStart], LINE_COST); }
        if (idxEnd !== -1 && costs[idxEnd] < COSTS.OBSTACLE) { saveCost(idxEnd); costs[idxEnd] = Math.max(costs[idxEnd], LINE_COST); }

        if (Math.abs(gStart.y - gEnd.y) < 1) { // Horizontal
            const sIdx = Math.min(idxStart, idxEnd);
            const eIdx = Math.max(idxStart, idxEnd);
            for (let i = sIdx; i <= eIdx; i++) {
                if (i >= 0 && i < maxIndex && costs[i] < COSTS.OBSTACLE) { saveCost(i); costs[i] = Math.max(costs[i], LINE_COST); }
            }
        } else if (Math.abs(gStart.x - gEnd.x) < 1) { // Vertical
            const sIdx = Math.min(idxStart, idxEnd);
            const eIdx = Math.max(idxStart, idxEnd);
            for (let i = sIdx; i <= eIdx; i += cols) {
                if (i >= 0 && i < maxIndex && costs[i] < COSTS.OBSTACLE) { saveCost(i); costs[i] = Math.max(costs[i], LINE_COST); }
            }
        }
    }

    // [NEW] Rasterize Guide Lines (Merge Paths)
    // These overwrite NORMAL cost with MERGE_PATH (lower), effectively creating a "trench" or "highway"
    if (guideLines && guideLines.length > 0) {
        const GUIDE_COST = COSTS.MERGE_PATH;
        for (const line of guideLines) {
            const lx1 = Math.min(line.start.x, line.end.x);
            const lx2 = Math.max(line.start.x, line.end.x);
            const ly1 = Math.min(line.start.y, line.end.y);
            const ly2 = Math.max(line.start.y, line.end.y);

            if (lx2 < minX || lx1 > maxX || ly2 < minY || ly1 > maxY) continue;

            const gStart = {
                x: Math.round(line.start.x / size) * size,
                y: Math.round(line.start.y / size) * size
            };
            const gEnd = {
                x: Math.round(line.end.x / size) * size,
                y: Math.round(line.end.y / size) * size
            };

            const idxStart = getIdx(gStart.x, gStart.y);
            const idxEnd = getIdx(gEnd.x, gEnd.y);

            // Only lower the cost if it's currently NORMAL or higher (but not OBSTACLE)
            // Basically, if it's a valid walkable area, make it cheaper.
            const applyGuideCost = (i: number) => {
                if (i >= 0 && i < maxIndex && costs[i] < COSTS.OBSTACLE) {
                    // We want to SET it to MERGE_PATH if it's not already blocked
                    // But wait, what if it is BUFFER_ZONE? 
                    // Guide lines should override buffer zones (because we WANT to hug the guide)
                    // But shouldn't override OBSTACLE or LINE_CROSS (if we clearly shouldn't go there)
                    // The guideLines passed in should be 'safe' paths from siblings.
                    // So we can aggressively set cost.
                    saveCost(i);
                    costs[i] = GUIDE_COST;
                }
            };

            if (Math.abs(gStart.y - gEnd.y) < 1) { // Horizontal
                const sIdx = Math.min(idxStart, idxEnd);
                const eIdx = Math.max(idxStart, idxEnd);
                for (let i = sIdx; i <= eIdx; i++) applyGuideCost(i);
            } else if (Math.abs(gStart.x - gEnd.x) < 1) { // Vertical
                const sIdx = Math.min(idxStart, idxEnd);
                const eIdx = Math.max(idxStart, idxEnd);
                for (let i = sIdx; i <= eIdx; i += cols) applyGuideCost(i);
            }
        }
    }

    // [NEW] Rasterize Dynamic Obstacles (Strict Mode)
    if (dynamicObstacles.length > 0) {
        for (const rect of dynamicObstacles) {
            const rx = rect.x;
            const ry = rect.y;
            const rw = rect.width;
            const rh = rect.height;

            const startC = Math.max(0, Math.floor((rx - minX) / size));
            const endC = Math.min(cols - 1, Math.floor((rx + rw - minX) / size));

            const startR = Math.max(0, Math.floor((ry - minY) / size));
            const endR = Math.min(rows - 1, Math.floor((ry + rh - minY) / size));

            for (let r = startR; r <= endR; r++) {
                const rowOffset = r * cols;
                for (let c = startC; c <= endC; c++) {
                    const idx = rowOffset + c;
                    saveCost(idx);
                    costs[idx] = COSTS.OBSTACLE;
                }
            }
        }
    }

    // [NEW] Rasterize Container Borders (Soft Penalty)
    if (containerBorders.length > 0) {
        for (const rect of containerBorders) {
            const rx = rect.x;
            const ry = rect.y;
            const rw = rect.width;
            const rh = rect.height;

            const startC = Math.max(0, Math.floor((rx - minX) / size));
            const endC = Math.min(cols - 1, Math.floor((rx + rw - minX) / size));
            const startR = Math.max(0, Math.floor((ry - minY) / size));
            const endR = Math.min(rows - 1, Math.floor((ry + rh - minY) / size));

            const applyPenalty = (r: number, c: number) => {
                if (r < 0 || r >= rows || c < 0 || c >= cols) return;
                const idx = r * cols + c;
                if (idx >= 0 && idx < maxIndex && costs[idx] < COSTS.OBSTACLE) {
                    saveCost(idx);
                    costs[idx] = Math.max(costs[idx], COSTS.CONTAINER_BORDER);
                }
            };


            for (let c = startC; c <= endC; c++) {
                applyPenalty(startR, c);
                applyPenalty(startR - 1, c);
                applyPenalty(startR + 1, c);
                applyPenalty(endR, c);
                applyPenalty(endR - 1, c);
                applyPenalty(endR + 1, c);
            }

            for (let r = startR; r <= endR; r++) {
                applyPenalty(r, startC);
                applyPenalty(r, startC - 1);
                applyPenalty(r, startC + 1);
                applyPenalty(r, endC);
                applyPenalty(r, endC - 1);
                applyPenalty(r, endC + 1);
            }
        }
    }

    // 3. A* Execution
    // Re-align start/end to be sure
    const startX = Math.round(start.x / size) * size;
    const startY = Math.round(start.y / size) * size;
    const endX = Math.round(end.x / size) * size;
    const endY = Math.round(end.y / size) * size;

    const startIdx = getIdx(startX, startY);
    const endIdx = getIdx(endX, endY);

    // Helper: Find nearest walkable grid index
    const findNearestWalkable = (idx: number, centerX: number, centerY: number, radiusSteps: number = 8): number => {
        if (idx !== -1 && costs[idx] < COSTS.OBSTACLE) return idx;

        // Spiral search
        let bestIdx = -1;
        let minCost = Infinity;

        // Simple BFS or Spiral around center
        // Grid bounds
        const c0 = Math.floor((centerX - minX) / size);
        const r0 = Math.floor((centerY - minY) / size);

        for (let r = 1; r <= radiusSteps; r++) {
            // Check ring 'r'
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // Only ring edges

                    const nc = c0 + dx;
                    const nr = r0 + dy;
                    if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
                        const nIdx = nr * cols + nc;
                        const cost = costs[nIdx];
                        if (cost < COSTS.OBSTACLE) {
                            // Found walkable
                            // Pick lowest cost (e.g. NORMAL preferred over BUFFER)
                            if (cost < minCost) {
                                minCost = cost;
                                bestIdx = nIdx;
                            }
                        }
                    }
                }
            }
            if (bestIdx !== -1 && minCost < COSTS.OBSTACLE) return bestIdx;
        }
        return -1;
    };

    let validStartIdx = startIdx;
    let validEndIdx = endIdx;

    if (startIdx === -1 || costs[startIdx] >= COSTS.OBSTACLE) {
        validStartIdx = findNearestWalkable(startIdx, startX, startY, 5);
    }
    if (endIdx === -1 || costs[endIdx] >= COSTS.OBSTACLE) {
        validEndIdx = findNearestWalkable(endIdx, endX, endY, 5);
    }

    if (validStartIdx === -1 || validEndIdx === -1) {
        console.warn(`[A*] Failed to find walkable start/end. start=(${Math.round(start.x)},${Math.round(start.y)}) end=(${Math.round(end.x)},${Math.round(end.y)}) gridBounds=[${minX},${minY}]-[${maxX},${maxY}] startIdx=${startIdx} endIdx=${endIdx} validS=${validStartIdx} validE=${validEndIdx} obstacles=${obstacleList.length} grid=${cols}x${rows}`);
        if (returnNullOnFail) return null;
        return [start, { x: end.x, y: start.y }, end];
    }

    // Use the valid indices
    const actualStartIdx = validStartIdx;
    const actualEndIdx = validEndIdx;

    const fScores = new Float32Array(maxIndex).fill(Infinity);
    const gScores = new Float32Array(maxIndex).fill(Infinity);
    const cameFrom = new Int32Array(maxIndex).fill(-1);
    const directionTo = new Uint8Array(maxIndex).fill(0);

    // [FIX] Direction Locking: Set initial direction at start point.
    // Without this, directionTo[startIdx]=0 means the FIRST turn has NO penalty,
    // letting A* immediately deviate. By pre-setting the direction based on the
    // start→end vector, the first deviation costs DIRECTION_CHANGE (1000),
    // enforcing a straight first segment (industry pattern: JointJS startDirections).
    // Dirs: 1=Up, 2=Right, 3=Down, 4=Left
    const dx = endX - startX;
    const dy = endY - startY;
    if (Math.abs(dy) >= Math.abs(dx)) {
        // Primarily vertical → set initial dir to Down(3) or Up(1)
        directionTo[actualStartIdx] = dy >= 0 ? 3 : 1;
    } else {
        // Primarily horizontal → set initial dir to Right(2) or Left(4)
        directionTo[actualStartIdx] = dx >= 0 ? 2 : 4;
    }

    gScores[actualStartIdx] = 0;
    fScores[actualStartIdx] = Math.abs(startX - endX) + Math.abs(startY - endY);

    const openSet = new MinHeap(fScores);
    openSet.push(actualStartIdx);

    const neighborOffsets = [-cols, 1, cols, -1]; // Up, Right, Down, Left
    const neighborDirs = [1, 2, 3, 4];

    // [FIX] Hard iteration limit to prevent UI hanging on degenerate graphs.
    // With Theta* disabled, each iteration is O(1) grid lookup, so 100k iterations
    // finish in <50ms even on large grids. This covers ~43% of a 457x504 grid.
    const MAX_ITERATIONS = 100000;
    let iterations = 0;

    while (openSet.size() > 0) {
        if (++iterations > MAX_ITERATIONS) {
            console.warn(`[A*] Aborted: Exceeded max iterations (${MAX_ITERATIONS}). Falling back.`);
            break;
        }

        const currentIdx = openSet.pop();
        if (currentIdx === undefined) break;

        if (debugOut) {
            if (!debugOut.visited) debugOut.visited = [];
            debugOut.visited.push(getCoords(currentIdx));
        }

        if (currentIdx === actualEndIdx) {
            // Reconstruct
            const path: Point[] = [];
            let curr = endIdx;
            while (curr !== -1) {
                path.unshift(getCoords(curr));
                curr = cameFrom[curr];
            }
            // Stitch points
            const result: Point[] = [];

            // Start connection - [OPTIMIZED] Always ensure orthogonal connection
            if (path.length > 0 && (path[0].x !== start.x || path[0].y !== start.y)) {
                const p1 = start;
                const p2 = path[0];
                const dx = Math.abs(p1.x - p2.x);
                const dy = Math.abs(p1.y - p2.y);

                if (dx < 1 || dy < 1) {
                    // Already orthogonal (aligned on X or Y axis)
                    result.push(start);
                } else {
                    // Diagonal connection - must insert corner point
                    result.push(start);

                    // Choose best corner: Horizontal-first vs Vertical-first
                    // Horizontal-first: (p2.x, p1.y) - move horizontally first, then vertically
                    // Vertical-first: (p1.x, p2.y) - move vertically first, then horizontally
                    const cornerH = { x: p2.x, y: p1.y };
                    const cornerV = { x: p1.x, y: p2.y };

                    // Check which corner is blocked by obstacles
                    let hBlocked = false;
                    let vBlocked = false;

                    for (const obs of obstacleList) {
                        // Check if cornerH is inside obstacle (with padding)
                        if (isPointInRectangle(cornerH.x, cornerH.y, obs, 10)) {
                            hBlocked = true;
                        }
                        // Check if cornerV is inside obstacle
                        if (isPointInRectangle(cornerV.x, cornerV.y, obs, 10)) {
                            vBlocked = true;
                        }
                    }

                    // Prefer unblocked corner; if both blocked or both free, choose horizontal-first
                    if (!hBlocked) {
                        result.push(cornerH);
                    } else if (!vBlocked) {
                        result.push(cornerV);
                    } else {
                        // Both blocked - prefer horizontal-first as default (industry convention)
                        result.push(cornerH);
                    }
                }
            } else {
                result.push(start);
            }

            result.push(...path);

            // End connection - [OPTIMIZED] Always ensure orthogonal connection
            const last = path[path.length - 1];
            if (last.x !== end.x || last.y !== end.y) {
                const dx = Math.abs(last.x - end.x);
                const dy = Math.abs(last.y - end.y);

                if (dx < 1 || dy < 1) {
                    // Already orthogonal - just add end point
                    result.push(end);
                } else {
                    // Diagonal connection - must insert corner point
                    // Vertical-first: (last.x, end.y) - go down/up first, then horizontally to end
                    // Horizontal-first: (end.x, last.y) - go right/left first, then vertically to end
                    const cornerV = { x: last.x, y: end.y };
                    const cornerH = { x: end.x, y: last.y };

                    // Check which corner is blocked
                    let hBlocked = false;
                    let vBlocked = false;

                    if (spatialIndex) {
                        const pad = 10;
                        const candsH = spatialIndex.query({ x: cornerH.x - pad, y: cornerH.y - pad, width: pad * 2, height: pad * 2 });
                        hBlocked = candsH.some(obs => isPointInRectangle(cornerH.x, cornerH.y, obs, 10));

                        const candsV = spatialIndex.query({ x: cornerV.x - pad, y: cornerV.y - pad, width: pad * 2, height: pad * 2 });
                        vBlocked = candsV.some(obs => isPointInRectangle(cornerV.x, cornerV.y, obs, 10));
                    } else {
                        for (const obs of obstacleList) {
                            if (isPointInRectangle(cornerH.x, cornerH.y, obs, 10)) {
                                hBlocked = true;
                            }
                            if (isPointInRectangle(cornerV.x, cornerV.y, obs, 10)) {
                                vBlocked = true;
                            }
                        }
                    }

                    // Prefer vertical-first for end (to match industry convention of entering from side)
                    if (!vBlocked) {
                        result.push(cornerV);
                    } else if (!hBlocked) {
                        result.push(cornerH);
                    } else {
                        // Both blocked - prefer vertical-first as default
                        result.push(cornerV);
                    }
                    result.push(end);
                }
            }

            // ... A* result construction ...
            // End connection logic handles 'last' at the end of the chain
            // We removed the duplicate block here.


            restoreSavedCells();
            return optimizePath(result, obstacles);
        }

        // Explore neighbors
        for (let i = 0; i < 4; i++) {
            const neighborIdx = currentIdx + neighborOffsets[i];
            const direction = neighborDirs[i];

            // 1. Boundary & Obstacle Check
            if (neighborIdx < 0 || neighborIdx >= maxIndex) continue;

            // Row-wrap safety check (Crucial!)
            const currentCol = currentIdx % cols;
            const neighborCol = neighborIdx % cols;
            if (Math.abs(currentCol - neighborCol) > 1) continue;

            const cost = costs[neighborIdx];
            if (cost >= COSTS.OBSTACLE) continue;

            // 2. Cost Calculation
            let moveCost = cost;
            // Add penalty for direction change to encourage straight lines
            if (directionTo[currentIdx] !== 0 && directionTo[currentIdx] !== direction) {
                moveCost += COSTS.DIRECTION_CHANGE;
            }

            const tentativeGScore = gScores[currentIdx] + moveCost;

            // 3. Update Path if Better
            // [THETA*] Any-angle Pathfinding
            // Check if we can go directly from Parent(Current) -> Neighbor
            // Standard A*: Parent -> Current -> Neighbor
            // Theta*: Parent -> Neighbor (if Line-of-Sight)

            const parentIdx = cameFrom[currentIdx];
            let processedGScore = tentativeGScore;
            let processedParent = currentIdx;

            // Only apply Theta* if enabled and we have a parent
            if (config.enableSmartStrategy && config.enableThetaStar && parentIdx !== -1) {
                const parentCoords = getCoords(parentIdx);
                const neighborCoords = getCoords(neighborIdx);

                // Line-of-Sight Check
                // We use simplified check: if direct line is unblocked
                // Check if cost is cheaper: dist(parent, neighbor) < g(parent) + dist(parent, current) + dist(current, neighbor)
                // Actually we compare: g(parent) + dist(parent, neighbor) vs g(current) + cost(current, neighbor)

                // Note: isPathBlocked is expensive. Use sparingly or with SpatialIndex.
                // For grid A*, we can use a Bresenham line check on the grid itself if we trust the grid costs.
                // Here we use the generic isPathBlocked for safety against thin obstacles not on grid.

                // [FIX] Use 10px padding for diagonal safety to match grid buffer configuration
                if (!isPathBlocked([parentCoords, neighborCoords], obstacles, 10)) {
                    // Line of Sight exists!

                    // [CRITICAL FIX] Orthogonal Safety Check
                    // We must ensure that this diagonal can be converted to an orthogonal path (L-shape)
                    // without hitting obstacles.
                    // Check Path A: Parent -> (N.x, P.y) -> Neighbor
                    // Check Path B: Parent -> (P.x, N.y) -> Neighbor

                    let orthogonalSafe = true;
                    // Only check if it is actually diagonal
                    if (Math.abs(parentCoords.x - neighborCoords.x) > 1 && Math.abs(parentCoords.y - neighborCoords.y) > 1) {
                        const cornerA = { x: neighborCoords.x, y: parentCoords.y };
                        const cornerB = { x: parentCoords.x, y: neighborCoords.y };

                        // [FIX] Use 10px padding for L-shapes to match config buffer
                        const blockedA = isPathBlocked([parentCoords, cornerA, neighborCoords], obstacles, 10);
                        const blockedB = isPathBlocked([parentCoords, cornerB, neighborCoords], obstacles, 10);

                        if (blockedA && blockedB) {
                            orthogonalSafe = false;
                        }
                    }

                    if (orthogonalSafe) {
                        const dist = Math.sqrt(Math.pow(parentCoords.x - neighborCoords.x, 2) + Math.pow(parentCoords.y - neighborCoords.y, 2));
                        const costPerPx = COSTS.NORMAL / size; // 10 / 20 = 0.5
                        const shortcutG = gScores[parentIdx] + dist * costPerPx;

                        if (shortcutG < tentativeGScore) {
                            processedGScore = shortcutG;
                            processedParent = parentIdx;
                        }
                    }
                }
            }

            if (processedGScore < gScores[neighborIdx]) {
                cameFrom[neighborIdx] = processedParent;
                directionTo[neighborIdx] = direction;
                gScores[neighborIdx] = processedGScore;

                // Manhattan Distance Heuristic
                const coords = getCoords(neighborIdx);
                const h = Math.abs(coords.x - endX) + Math.abs(coords.y - endY);

                // For Theta*, Euclidean heuristic is often better, but Manhattan is admissible for 4-grid.
                // Let's keep Manhattan for consistency or switch to Euclidean?
                // Euclidean: Math.sqrt(...) * costPerPx

                fScores[neighborIdx] = processedGScore + h;
                openSet.push(neighborIdx);
            }
        }
    }

    if (returnNullOnFail) {
        console.warn(`[A*] openSet exhausted. iterations=${iterations} start=(${Math.round(start.x)},${Math.round(start.y)}) end=(${Math.round(end.x)},${Math.round(end.y)}) grid=${cols}x${rows} obstacles=${obstacleList.length}`);
        restoreSavedCells();
        return null;
    }

    // Default Fallback (Naive L-Shape) when A* fails completely
    console.warn(`[A*] Fallback L-shape. iterations=${iterations} start=(${Math.round(start.x)},${Math.round(start.y)}) end=(${Math.round(end.x)},${Math.round(end.y)}) grid=${cols}x${rows}`);
    restoreSavedCells();
    return [start, { x: end.x, y: start.y }, end];
}



/**
 * Industry Standard Optimization: Greedy Line-of-Sight Orthogonal Smoothing
 * Drastically reduces "Staircase" zig-zags by scanning for the furthest point in the path 
 * that can be reached via a clear orthogonal L-shape (1 corner) or straight line.
 */
function optimizePath(
    rawPath: Point[],
    obstacles: Rectangle[] | SpatialIndex,
    extraObstacles: Rectangle[] = [] // [NEW] Support for soft borders/containers
): Point[] {
    let path = simplifyPath(rawPath);
    if (path.length <= 2) return path;
    
    // Helper to verify if a candidate sub-path is collision-free
    const checkClear = (pts: Point[]) => {
        // Use 15px padding for smoothing to ensure we don't graze obstacles too tightly
        if (isPathBlocked(pts, obstacles, 15)) return false;
        if (extraObstacles.length > 0 && isPathBlocked(pts, extraObstacles, 0)) return false;
        return true;
    };

    const newPath: Point[] = [path[0]];
    let currIdx = 0;

    // Greedy look-ahead strategy
    while (currIdx < path.length - 1) {
        const curr = path[currIdx];
        let jumped = false;

        // Scan backwards from the end of the path to find the longest possible clear jump
        for (let targetIdx = path.length - 1; targetIdx >= currIdx + 2; targetIdx--) {
            const target = path[targetIdx];

            // 1. Check if they can be connected by a STRAIGHT line
            if (Math.abs(curr.x - target.x) < 0.1 || Math.abs(curr.y - target.y) < 0.1) {
                if (checkClear([curr, target])) {
                    newPath.push(target);
                    currIdx = targetIdx;
                    jumped = true;
                    break;
                }
                continue;
            }

            // 2. Off-axis: Check if they can be connected by an L-SHAPE (1 corner)
            const c1 = { x: target.x, y: curr.y };
            const c2 = { x: curr.x, y: target.y };

            // Start with the corner that continues the largest direction vector
            const checkOrder = Math.abs(target.x - curr.x) > Math.abs(target.y - curr.y) ? [c1, c2] : [c2, c1];

            let lJumpFound = false;
            for (const corner of checkOrder) {
                if (checkClear([curr, corner, target])) {
                    newPath.push(corner);
                    newPath.push(target);
                    currIdx = targetIdx;
                    lJumpFound = true;
                    break;
                }
            }

            if (lJumpFound) {
                jumped = true;
                break;
            }
        }

        // If no large jump was possible, step to the immediate next point
        if (!jumped) {
            currIdx++;
            newPath.push(path[currIdx]);
        }
    }

    return simplifyPath(newPath);
}

/**
 * 智能C形路径生成器
 * 尝试多个安全边距，寻找无障碍的C形路径
 */
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
        debugOut?: any;
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


