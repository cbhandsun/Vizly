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
import { MinHeap } from './pathfindingMinHeap';
import { isPathBlocked, isPointInRectangle } from './pathfindingCollision';
import { generateSimplePath, simplifyPath } from './pathfindingSimplePaths';
import type {
    LineObstacle,
    PathfindingConfig,
    PathfindingGrid,
    Point,
    Rectangle,
} from './pathfindingTypes';
import {
    logPathfindingFallbackLShape,
    logPathfindingIterationLimit,
    logPathfindingMassiveGrid,
    logPathfindingOpenSetExhausted,
    logPathfindingWalkableEndpointFailure,
} from '../utils/routingLogging';

export { isPathBlocked } from './pathfindingCollision';
export {
    generateSimplePath,
    generateSmartCShapePath,
} from './pathfindingSimplePaths';
export type {
    LineObstacle,
    PathfindingConfig,
    PathfindingGrid,
    Point,
    Rectangle,
} from './pathfindingTypes';

// Global config (可通过外部设置)
let globalPathfindingConfig: PathfindingConfig = {
    useVisibilityGraph: false,
    visibilityGraphMinObstacles: 6,
    enableSmartStrategy: true,
    strategySelector: new RoutingStrategySelector(),
    vgCacheManager: new VisibilityGraphCache({ maxSize: 10 })
};

export function setPathfindingConfig(config: Partial<PathfindingConfig>): void {
    const next = { ...globalPathfindingConfig };
    if (typeof config.useVisibilityGraph === 'boolean') {
        next.useVisibilityGraph = config.useVisibilityGraph;
    }
    if (typeof config.visibilityGraphMinObstacles === 'number'
        && Number.isFinite(config.visibilityGraphMinObstacles)) {
        next.visibilityGraphMinObstacles = Math.min(
            100_000,
            Math.max(0, Math.floor(config.visibilityGraphMinObstacles)),
        );
    }
    if (config.visibilityGraphCache && typeof config.visibilityGraphCache === 'object') {
        next.visibilityGraphCache = config.visibilityGraphCache;
    }
    if (typeof config.enableSmartStrategy === 'boolean') {
        next.enableSmartStrategy = config.enableSmartStrategy;
    }
    if (config.strategySelector instanceof RoutingStrategySelector) {
        next.strategySelector = config.strategySelector;
    }
    if (config.vgCacheManager instanceof VisibilityGraphCache) {
        next.vgCacheManager = config.vgCacheManager;
    }
    if (typeof config.enableThetaStar === 'boolean') {
        next.enableThetaStar = config.enableThetaStar;
    }
    globalPathfindingConfig = next;
}

export function getPathfindingConfig(): PathfindingConfig {
    return { ...globalPathfindingConfig };
}

/**
 * Cost Configuration
 * Industry Standard Tuning:
 * - High Direction Change Cost: Encourages long straight lines (Orthogonal priority).
 * - High Line Cross Cost: Discourages crossing other edges.
 * - Buffer Zones: Keeps paths away from nodes but allows approach.
 */
const COSTS = {
    MERGE_PATH: 1,      // Extremely low cost to encourage merging
    SOURCE_TARGET: 9,   // [NEW] Distinct cost for Source/Target nodes (slightly lower than Normal to encourage entry/exit)
    NORMAL: 10,         // Base cost
    BUFFER_ZONE_CLOSE: 15, // [FIX] Reduced from 20 to 15. Let A* graze nodes much more freely.
    BUFFER_ZONE_FAR: 10, // 
    DIRECTION_CHANGE: 1000, // [FIX] Increased massively from 400 to 1000. Forcing straight lines over almost everything.
    LINE_OCCUPIED: 10,
    // Expensive but traversable last-resort lanes for existing routed edges.
    LINE_CROSS: 2500,
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
        logPathfindingMassiveGrid(cols, rows, maxIndex);
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
    const relevantObstacles: Rectangle[] = isSpatialIndex(obstacles) ? (() => {
        // Query obstacles intersecting the grid area (plus buffer for safety)
        const buffer = bufferDistanceFar;
        const queryRange = {
            x: minX - buffer,
            y: minY - buffer,
            width: (maxX - minX) + buffer * 2,
            height: (maxY - minY) + buffer * 2
        };
        return obstacles.query(queryRange);
    })() : obstacles;

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
    _clearanceRects: Rectangle[] = [],   // [NEW] Areas to force clear (source/target)
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
    const congestionCosts = prebuiltGrid && congestionGrid && congestionGrid.length === prebuiltGrid.data.length
        ? congestionGrid
        : undefined;

    if (prebuiltGrid) {
        // [FIX] COW Save/Restore: Instead of cloning the entire 2MB Int32Array,
        // we mutate the shared grid in-place (only ~20-30 cells for clearLaunchZone,
        // lineObstacles, safety unblock) and restore original values after A* search.
        // This eliminates ~52MB of memory copies per batch of 26 edges.
        // Congestion is a soft per-search surcharge and is applied lazily in the
        // neighbor cost lookup below, avoiding a full Int32Array clone per edge.
        grid = prebuiltGrid;
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
        logPathfindingWalkableEndpointFailure({
            start,
            end,
            minX,
            minY,
            maxX,
            maxY,
            startIdx,
            endIdx,
            validStartIdx,
            validEndIdx,
            obstacleCount: obstacleList.length,
            cols,
            rows,
        });
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
            logPathfindingIterationLimit(MAX_ITERATIONS);
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
            const optimized = optimizePath(result, obstacles, [], lineObstacles);

            // [FIX-detour-cap] libavoid 风格：绕行上限检查
            // 如果 A* 结果路径长度 > 曼哈顿距离 × DETOUR_RATIO，降级为简单 L/Z 型路径
            // 行业标准：libavoid 约 3-4 倍，yFiles 无显式上限但隐含约 3 倍
            const DETOUR_RATIO = 1.8;
            const directDist = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
            let detourLen = 0;
            for (let di = 0; di < optimized.length - 1; di++) {
                detourLen += Math.abs(optimized[di + 1].x - optimized[di].x) + Math.abs(optimized[di + 1].y - optimized[di].y);
            }
            if (detourLen > directDist * DETOUR_RATIO && directDist > 100) {
                // 路径绕行过大，尝试放宽障碍物检查生成更短路径
                const relaxedPath = generateSimplePath(start, end, [], lineObstacles, {
                    enableBuffer: false,
                    maxSegments: 4,
                    sourcePos: generateOpts?.sourcePos,
                    targetPos: generateOpts?.targetPos
                });
                if (relaxedPath) {
                    return simplifyPath(relaxedPath);
                }
                // 最终 fallback：端口感知的 Z 型连接（允许交叉，LineJumpEngine 会处理）
                // 根据源端口方向决定先水平还是先垂直
                const sPos = generateOpts?.sourcePos;
                const tPos = generateOpts?.targetPos;
                const isSourceHoriz = sPos === 'left' || sPos === 'right';
                const isTargetHoriz = tPos === 'left' || tPos === 'right';
                
                let fallbackPath: Point[];
                if (isSourceHoriz && !isTargetHoriz) {
                    // 水平出发 → 垂直到达：H-V-H 型
                    const midX = (start.x + end.x) / 2;
                    fallbackPath = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
                } else if (!isSourceHoriz && isTargetHoriz) {
                    // 垂直出发 → 水平到达：V-H-V 型
                    const midY = (start.y + end.y) / 2;
                    fallbackPath = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
                } else if (isSourceHoriz) {
                    // 两端都水平：H-V-H 型
                    const midX = (start.x + end.x) / 2;
                    fallbackPath = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
                } else {
                    // 两端都垂直或未指定：V-H-V 型
                    const midY = (start.y + end.y) / 2;
                    fallbackPath = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
                }
                return simplifyPath(fallbackPath);
            }

            return optimized;
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
            let moveCost = cost + (congestionCosts?.[neighborIdx] ?? 0);
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
        logPathfindingOpenSetExhausted({
            iterations,
            start,
            end,
            cols,
            rows,
            obstacleCount: obstacleList.length,
        });
        restoreSavedCells();
        return null;
    }

    // Default Fallback (Naive L-Shape) when A* fails completely
    logPathfindingFallbackLShape({
        iterations,
        start,
        end,
        cols,
        rows,
    });
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
    extraObstacles: Rectangle[] = [], // [NEW] Support for soft borders/containers
    lineObstacles: LineObstacle[] = []
): Point[] {
    const path = simplifyPath(rawPath);
    if (path.length <= 2) return path;
    
    // Helper to verify if a candidate sub-path is collision-free
    const checkClear = (pts: Point[]) => {
        // Use 15px padding for smoothing to ensure we don't graze obstacles too tightly
        if (isPathBlocked(pts, obstacles, 15, lineObstacles)) return false;
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

