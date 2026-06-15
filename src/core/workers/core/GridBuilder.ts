/**
 * Grid Builder
 * 
 * Responsible for building pathfinding grids with cost rasterization.
 * Extracted from pathfinding.ts for modularity.
 */

import type { Rectangle } from '../../algorithms/geometryUtils';
import type { PathfindingGrid } from '../../algorithms/pathfinding';
import type { SpatialIndex } from '../../algorithms/SpatialIndex';
import type { UnifiedRoutingConfig } from '../../types/routing';

export class GridBuilder {
    private config: UnifiedRoutingConfig;

    constructor(config: UnifiedRoutingConfig) {
        this.config = config;
    }

    /**
     * Build pathfinding grid with cost rasterization
     * 
     * @param obstacles Obstacles to rasterize
     * @param bounds Bounding box for the grid
     * @returns Pathfinding grid
     */
    public buildGrid(
        obstacles: Rectangle[] | SpatialIndex,
        bounds: { startX: number; startY: number; endX: number; endY: number },
        sourceId?: string,
        targetId?: string
    ): PathfindingGrid {
        const baseGridSize = this.config.algorithm.gridSize;
        const gridSize = this.calculateAdaptiveGridSize(bounds.startX, bounds.startY, bounds.endX, bounds.endY, baseGridSize);
        const GRID_PADDING = 200; // [FIX] Sync with pathfinding.ts. 200px sufficient for detours.

        // [FIX] Dynamic Grid Bounds Expansion
        let minX_raw = Math.min(bounds.startX, bounds.endX) - GRID_PADDING;
        let minY_raw = Math.min(bounds.startY, bounds.endY) - GRID_PADDING;
        let maxX_raw = Math.max(bounds.startX, bounds.endX) + GRID_PADDING;
        let maxY_raw = Math.max(bounds.startY, bounds.endY) + GRID_PADDING;

        const isSpatialIndex = (obs: any): obs is SpatialIndex => typeof (obs as SpatialIndex).query === 'function';
        let relevantObstacles: Rectangle[];

        if (isSpatialIndex(obstacles)) {
            relevantObstacles = obstacles.query({
                x: minX_raw - 100,
                y: minY_raw - 100,
                width: (maxX_raw - minX_raw) + 200,
                height: (maxY_raw - minY_raw) + 200
            });
        } else {
            relevantObstacles = obstacles;
        }

        // [P2] 短距离路径（<=400px）跳过障碍物边界扩展循环。
        // 对于短路径，每个障碍物均会对边界扩展 ±200px，导致网格大小远超路径需求。
        // GRID_PADDING=200 对于短路径的绕路空间已足够。
        const routeDist = Math.hypot(bounds.endX - bounds.startX, bounds.endY - bounds.startY);
        if (routeDist > 400) {
            // Expand bounds to fully enclose any obstacle that touches our initial grid
            for (const obs of relevantObstacles) {
                // Skip source/target node to prevent over-expansion or weird behavior
                const nodeObs = obs as any;
                if (nodeObs.id && (nodeObs.id === sourceId || nodeObs.id === targetId)) continue;

                const intersects = !(obs.x > maxX_raw || obs.x + obs.width < minX_raw || obs.y > maxY_raw || obs.y + obs.height < minY_raw);
                if (intersects) {
                    // Expand by the obstacle's bounds PLUS a safe routing margin (200px)
                    const routeMargin = 200;
                    minX_raw = Math.min(minX_raw, obs.x - routeMargin);
                    maxX_raw = Math.max(maxX_raw, obs.x + obs.width + routeMargin);
                    minY_raw = Math.min(minY_raw, obs.y - routeMargin);
                    maxY_raw = Math.max(maxY_raw, obs.y + obs.height + routeMargin);
                }
            }
        }

        // Align to grid (Critically: must be multiples of gridSize for A* clearRegion to work)
        const minX = Math.floor(minX_raw / gridSize) * gridSize;
        const minY = Math.floor(minY_raw / gridSize) * gridSize;
        const maxX = Math.ceil(maxX_raw / gridSize) * gridSize;
        const maxY = Math.ceil(maxY_raw / gridSize) * gridSize;

        const cols = Math.floor((maxX - minX) / gridSize) + 1;
        const rows = Math.floor((maxY - minY) / gridSize) + 1;
        const maxIndex = cols * rows;

        if (maxIndex > 2000000) {
            console.warn(`[GridBuilder] Grid massive: ${cols}x${rows} = ${maxIndex}. Memory impact high.`);
        }

        const costs = new Int32Array(maxIndex).fill(this.config.costs.normal);

        // Rasterize obstacles
        this.rasterizeObstacles(obstacles, costs, minX, minY, cols, rows, gridSize, sourceId, targetId);

        return {
            minX,
            minY,
            maxX,
            maxY,
            cols,
            rows,
            size: gridSize,
            data: costs,
            maxIndex
        };
    }

    /**
     * Rasterize obstacles onto grid
     */
    private rasterizeObstacles(
        obstacles: Rectangle[] | SpatialIndex,
        costs: Int32Array,
        minX: number,
        minY: number,
        cols: number,
        rows: number,
        gridSize: number,
        sourceId?: string,
        targetId?: string
    ): void {
        const isSpatialIndex = (obs: any): obs is SpatialIndex =>
            typeof (obs as SpatialIndex).query === 'function';

        const bufferDistanceClose = gridSize * 1.0;
        const bufferDistanceFar = gridSize * 2.0;

        // Get relevant obstacles
        let relevantObstacles: Rectangle[];
        if (isSpatialIndex(obstacles)) {
            const buffer = bufferDistanceFar;
            const queryRange = {
                x: minX - buffer,
                y: minY - buffer,
                width: (cols * gridSize) + buffer * 2,
                height: (rows * gridSize) + buffer * 2
            };
            relevantObstacles = obstacles.query(queryRange);
        } else {
            relevantObstacles = obstacles;
        }

        // Rasterize each obstacle with graduated buffer zones
        for (const obs of relevantObstacles) {
            const nodeObs = obs as any;
            if (nodeObs.id && (nodeObs.id === sourceId || nodeObs.id === targetId)) {
                // Buffer = 0 (no padding), Cost = OBSTACLE
                this.rasterizeRect(obs, 0, this.config.costs.obstacle, costs, minX, minY, cols, rows, gridSize);
                continue;
            }

            const customPadding = nodeObs.padding ?? 0;
            const isSoftZone = nodeObs.isSoftZone === true;

            if (isSoftZone) {
                // Soft zone applies a graduated high cost but does not block pathing.
                // Cost must be > bufferZoneClose (2000) so paths prefer to exit the soft zone.
                this.rasterizeRect(obs, bufferDistanceFar + customPadding, this.config.costs.bufferZoneFar, costs, minX, minY, cols, rows, gridSize);
                this.rasterizeRect(obs, bufferDistanceClose + customPadding, this.config.costs.bufferZoneClose, costs, minX, minY, cols, rows, gridSize);
                this.rasterizeRect(obs, customPadding, 3000 /* SOFT_ZONE_CORE */, costs, minX, minY, cols, rows, gridSize);
            } else {
                this.rasterizeRect(obs, bufferDistanceFar + customPadding, this.config.costs.bufferZoneFar, costs, minX, minY, cols, rows, gridSize);
                this.rasterizeRect(obs, bufferDistanceClose + customPadding, this.config.costs.bufferZoneClose, costs, minX, minY, cols, rows, gridSize);
                this.rasterizeRect(obs, customPadding, this.config.costs.obstacle, costs, minX, minY, cols, rows, gridSize);
            }
        }
    }

    /**
     * Rasterize single rectangle with padding and cost
     */
    private rasterizeRect(
        rect: Rectangle,
        padding: number,
        cost: number,
        costs: Int32Array,
        minX: number,
        minY: number,
        cols: number,
        rows: number,
        gridSize: number
    ): void {
        const rx = rect.x - padding;
        const ry = rect.y - padding;
        const rw = rect.width + padding * 2;
        const rh = rect.height + padding * 2;

        const startC = Math.max(0, Math.floor((rx - minX) / gridSize));
        const startR = Math.max(0, Math.floor((ry - minY) / gridSize));
        
        // [FIX] Use Math.ceil(x) - 1 for the end bound. 
        // If rx+rw = 300, 300/20 = 15. Math.floor gives 15, which rasterizes the [300-320] block incorrectly!
        // Math.ceil(15) - 1 = 14, which correctly stops at [280-300].
        // The EPSILON handles floating point inaccuracies.
        const EPSILON = 0.0001;
        const endC = Math.min(cols - 1, Math.max(startC, Math.ceil((rx + rw - EPSILON - minX) / gridSize) - 1));
        const endR = Math.min(rows - 1, Math.max(startR, Math.ceil((ry + rh - EPSILON - minY) / gridSize) - 1));

        for (let r = startR; r <= endR; r++) {
            const rowOffset = r * cols;
            for (let c = startC; c <= endC; c++) {
                const idx = rowOffset + c;

                // Don't overwrite hard obstacles
                if (costs[idx] === this.config.costs.obstacle) continue;

                if (cost === this.config.costs.obstacle) {
                    costs[idx] = this.config.costs.obstacle;
                } else {
                    costs[idx] = Math.max(costs[idx], cost);
                }
            }
        }
    }

    /**
     * Calculate adaptive grid size based on distance
     */
    private calculateAdaptiveGridSize(sX: number, sY: number, tX: number, tY: number, baseConfigGrid: number): number {
        const dx = Math.abs(tX - sX);
        const dy = Math.abs(tY - sY);
        const dist = Math.sqrt(dx * dx + dy * dy);

        // For very long paths (> 5000px), increase grid size to prevent OOM
        if (dist > 8000) return Math.max(baseConfigGrid, 40);
        if (dist > 4000) return Math.max(baseConfigGrid, 30);
        if (dist > 2000) return Math.max(baseConfigGrid, 20);

        return baseConfigGrid;
    }
}
