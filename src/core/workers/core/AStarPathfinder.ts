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
    debugOut?: { visited?: Point[]; grid?: { minX: number, minY: number, cols: number, rows: number, size: number, data: Int32Array } };
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
            // Forward to core pathfinding algorithm
            const result = findPath(
                start,
                end,
                options.obstacles,
                options.grid.size,   // gridSize
                [],                  // lineObstacles
                options.debugOut,    // debugOut
                options.grid,        // prebuiltGrid
                undefined,           // guideLines
                true,                // returnNullOnFail
                [],                  // dynamicObstacles
                [],                  // containerBorders
                options.congestionGrid, // [NEW]
                options.clearanceRects  // [NEW]
            );

            return result;
        } catch (error) {
            console.error('[AStarPathfinder] Grid A* failed:', error);
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
