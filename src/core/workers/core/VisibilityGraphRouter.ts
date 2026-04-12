/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Visibility Graph Router
 * 
 * Handles VG-based pathfinding with intelligent strategy selection and caching.
 * Integrates P1.2 VG optimizations.
 */

import type { Point, Rectangle } from '../../algorithms/geometryUtils';
import type { SpatialIndex } from '../../algorithms/SpatialIndex';
import type { UnifiedRoutingConfig } from '../../types/routing';
import { findPathOnVisibilityGraph } from '../../algorithms/visibilityGraph';
import { VisibilityGraphCache } from '../../algorithms/VisibilityGraphCache';
import { RoutingStrategySelector, RoutingAlgorithm } from '../../algorithms/RoutingStrategySelector';
import { OneBendVisibilityGraph } from '../../algorithms/OneBendVisibilityGraph';

export class VisibilityGraphRouter {
    private config: UnifiedRoutingConfig;
    private vgCache: VisibilityGraphCache;
    private strategySelector: RoutingStrategySelector;
    private oneBendOptimizer: OneBendVisibilityGraph;

    constructor(config: UnifiedRoutingConfig) {
        this.config = config;
        this.vgCache = new VisibilityGraphCache({ maxSize: 10 });
        this.strategySelector = new RoutingStrategySelector();
        this.oneBendOptimizer = new OneBendVisibilityGraph({
            debug: config.debug
        });
    }

    /**
     * Attempt VG-based routing with 1-Bend optimization
     * 
     * Strategy:
     * 1. Try 1-Bend VG first (fast path for simple cases)
     * 2. Fall back to full VG if needed
     * 3. Return null if VG not recommended
     * 
     * @param start Start point
     * @param end End point
     * @param obstacles Obstacles
     * @param spatialIndex Optional spatial index
     * @returns Path if successful, null otherwise
     */
    findPath(
        start: Point,
        end: Point,
        obstacles: Rectangle[] | SpatialIndex,
        spatialIndex?: SpatialIndex
    ): Point[] | null {
        const isSpatialIndex = (obs: any): obs is SpatialIndex =>
            typeof (obs as SpatialIndex).query === 'function';

        const obstacleList: Rectangle[] = isSpatialIndex(obstacles)
            ? obstacles.getAll()
            : obstacles;

        // Smart strategy selection
        const strategy = this.strategySelector.selectStrategy({
            obstacleCount: obstacleList.length,
            canvasBounds: {
                width: Math.abs(end.x - start.x) * 2,
                height: Math.abs(end.y - start.y) * 2
            },
            obstacles: obstacleList
        });

        // Only use VG if strategy recommends it
        if (strategy !== RoutingAlgorithm.VISIBILITY_GRAPH) {
            return null; // Fall back to Grid A*
        }

        // [P0-1 OPTIMIZATION] Try 1-Bend VG first
        if (this.shouldUseOneBend()) {
            const quickResult = this.oneBendOptimizer.findPath(
                start,
                end,
                obstacleList
            );

            if (quickResult) {
                // if (this.config.debug) {
                //     console.log(`[VGRouter] 1-Bend optimization succeeded (${quickResult.bendType})`);
                // }
                return quickResult.path;
            }

            // if (this.config.debug) {
            //     console.log('[VGRouter] 1-Bend optimization failed, trying full VG');
            // }
        }

        // Fall back to full VG
        const vg = this.vgCache.getOrBuild(obstacleList, spatialIndex);
        const path = findPathOnVisibilityGraph(start, end, obstacles, vg);

        return path;
    }

    /**
     * Check if VG should be used based on config and obstacle count
     */
    shouldUseVG(obstacleCount: number): boolean {
        if (!this.config.algorithm.useVisibilityGraph) {
            return false;
        }

        return obstacleCount >= this.config.algorithm.visibilityGraphThreshold;
    }

    /**
     * Check if 1-Bend VG optimization should be attempted
     * 
     * Feature flag: experimental.enable1BendVG (defaults to true if not set)
     */
    private shouldUseOneBend(): boolean {
        // Check for experimental feature flag
        const experimental = (this.config as any).experimental;
        if (experimental && typeof experimental.enable1BendVG === 'boolean') {
            return experimental.enable1BendVG;
        }

        // Default: enabled (since it's a fallback-safe optimization)
        return true;
    }

    /**
     * Get VG cache statistics
     */
    getCacheStats() {
        return this.vgCache.getStats();
    }

    /**
     * Clear VG cache
     */
    clearCache(): void {
        this.vgCache.clear();
    }

    /**
     * Get 1-Bend optimizer for external configuration
     */
    getOneBendOptimizer(): OneBendVisibilityGraph {
        return this.oneBendOptimizer;
    }
}
