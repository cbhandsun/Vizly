/**
 * A* Pathfinder Wrapper
 * 
 * Encapsulates Grid-based A* pathfinding logic and configuration.
 */

import { Point, Rectangle } from '../../algorithms/geometryUtils';
import {
    findPath,
    PathfindingGrid,
    isPathBlocked
} from '../../algorithms/pathfinding';
import { UnifiedRoutingConfig } from '../../types/routing';
import { SpatialIndex } from '../../algorithms/SpatialIndex';

export interface PathfinderOptions {
    grid: PathfindingGrid;
    spatialIndex?: SpatialIndex;
    obstacles: Rectangle[];
    config: UnifiedRoutingConfig;
    congestionGrid?: Int32Array;
    clearanceRects?: Rectangle[]; // [NEW] Areas to clear (e.g. source/target nodes)
    // [FIX] 接收其他边的路径线段作为软避障目标（A* 会尝试绕开但不硬性拦截）
    lineObstacles?: import('../../algorithms/pathfinding').LineObstacle[];
    debugOut?: { visited?: Point[]; grid?: { minX: number, minY: number, cols: number, rows: number, size: number, data: Int32Array } };
    sourcePos?: import('../../types/routing').Position;
    targetPos?: import('../../types/routing').Position;
}

export class AStarPathfinder {
    private config: UnifiedRoutingConfig;

    constructor(config: UnifiedRoutingConfig) {
        this.config = config;
    }

    /**
     * Execute Grid-based A* pathfinding
     * 
     * @param start Start point
     * @param end End point
     * @param options Execution options (grid, obstacles, etc.)
     * @returns Path points if found, null otherwise
     */
    findPath(
        start: Point,
        end: Point,
        options: PathfinderOptions
    ): Point[] | null {
        try {
            // [FIX] 将其他边的路径线段传入 A*，使其知晓并尝试绕开
            // 原来硬编码 [] 导致 A* 对其他边完全无感知，路径随意穿越
            const lineObs = options.lineObstacles ?? [];

            // Forward to core pathfinding algorithm
            const result = findPath(
                start,
                end,
                options.obstacles,
                options.grid.size,   // gridSize
                lineObs,             // [FIX] lineObstacles (was always [])
                options.debugOut,    // debugOut
                options.grid,        // prebuiltGrid
                undefined,           // guideLines
                true,                // returnNullOnFail
                [],                  // dynamicObstacles
                [],                  // containerBorders
                options.congestionGrid, // [NEW]
                options.clearanceRects,  // [NEW]
                { sourcePos: options.sourcePos, targetPos: options.targetPos } // [NEW]
            );

            return result;
        } catch (error) {
            // [P6] 仅在 debug 模式打印错误：A* 边界情况（start==end、网格为空）会抛出，
            // 生产环境的 console.error 在 DevTools 开启时有显著开销。
            if (this.config.debug) {
                console.error('[AStarPathfinder] Grid A* failed:', error);
            }
            return null;
        }
    }

    /**
     * Check if a simple direct path is available
     */
    isDirectPathAvailable(
        start: Point,
        end: Point,
        obstacles: Rectangle[] | SpatialIndex
    ): boolean {
        return !isPathBlocked([start, end], obstacles);
    }
}


