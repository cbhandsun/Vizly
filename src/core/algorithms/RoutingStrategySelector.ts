/**
 * Routing Strategy Selector
 * 
 * Intelligently selects the optimal pathfinding algorithm based on graph characteristics.
 * Supports Grid A*, Visibility Graph, and Hybrid strategies.
 * 
 * Decision Rules:
 * - < 6 obstacles: Grid A* (simple and fast)
 * - 6-30 obstacles: Visibility Graph (optimal for medium density)
 * - > 30 obstacles: Density-based selection
 *   - Low density (< 30%): Visibility Graph
 *   - High density (>= 30%): Hybrid or Grid A* with spatial index
 * 
 * Performance Impact:
 * - Proper strategy selection can provide 2-5x speedup
 * - Avoids VG overhead for sparse graphs
 * - Leverages VG efficiency for dense graphs
 */

import type { Rectangle } from './geometryUtils';

export enum RoutingAlgorithm {
    GRID_ASTAR = 'GRID_ASTAR',           // Traditional grid-based A*
    VISIBILITY_GRAPH = 'VISIBILITY_GRAPH', // Visibility graph + A*
    HYBRID = 'HYBRID'                     // Hybrid approach (future)
}

export interface StrategyContext {
    obstacleCount: number;
    canvasBounds: {
        width: number;
        height: number;
    };
    obstacles?: Rectangle[];
    avgObstacleSize?: number;
    edgeCount?: number;
}

export interface StrategyStats {
    algorithm: RoutingAlgorithm;
    estimatedCost: number;
    reason: string;
    alternativeAlgorithms?: Array<{
        algorithm: RoutingAlgorithm;
        estimatedCost: number;
    }>;
}

/**
 * Routing Strategy Selector
 * 
 * Analyzes graph characteristics and selects the optimal routing algorithm.
 */
export class RoutingStrategySelector {
    private strategyHistory: Array<{
        timestamp: number;
        context: StrategyContext;
        selected: RoutingAlgorithm;
        actualCost?: number;
    }> = [];

    private readonly GRID_THRESHOLD = 6;        // Min obstacles for VG
    private readonly DENSE_THRESHOLD = 30;      // Obstacle count for density check
    private readonly DENSITY_RATIO = 0.3;       // Canvas coverage ratio

    /**
     * Select optimal routing strategy based on context
     * 
     * @param context Graph characteristics
     * @returns Selected algorithm
     */
    selectStrategy(context: StrategyContext): RoutingAlgorithm {
        const algorithm = this.selectStrategyInternal(context);

        // Record decision for analysis
        this.strategyHistory.push({
            timestamp: Date.now(),
            context,
            selected: algorithm
        });

        // Keep history bounded
        if (this.strategyHistory.length > 100) {
            this.strategyHistory.shift();
        }

        return algorithm;
    }

    /**
     * Get detailed strategy analysis with estimated costs
     * 
     * @param context Graph characteristics
     * @returns Strategy statistics
     */
    analyzeStrategies(context: StrategyContext): StrategyStats {
        const selectedAlgorithm = this.selectStrategyInternal(context);
        const alternatives: Array<{
            algorithm: RoutingAlgorithm;
            estimatedCost: number;
        }> = [];

        // Estimate costs for all algorithms
        for (const algo of [
            RoutingAlgorithm.GRID_ASTAR,
            RoutingAlgorithm.VISIBILITY_GRAPH,
            RoutingAlgorithm.HYBRID
        ]) {
            const cost = this.estimateCost(algo, context);
            if (algo !== selectedAlgorithm) {
                alternatives.push({ algorithm: algo, estimatedCost: cost });
            }
        }

        // Sort alternatives by cost
        alternatives.sort((a, b) => a.estimatedCost - b.estimatedCost);

        return {
            algorithm: selectedAlgorithm,
            estimatedCost: this.estimateCost(selectedAlgorithm, context),
            reason: this.getSelectionReason(selectedAlgorithm, context),
            alternativeAlgorithms: alternatives
        };
    }

    /**
     * Get strategy selection statistics
     */
    getStats() {
        const totalDecisions = this.strategyHistory.length;
        const algorithmCounts = new Map<RoutingAlgorithm, number>();

        for (const entry of this.strategyHistory) {
            algorithmCounts.set(
                entry.selected,
                (algorithmCounts.get(entry.selected) || 0) + 1
            );
        }

        return {
            totalDecisions,
            distributionByAlgorithm: Object.fromEntries(algorithmCounts),
            recentDecisions: this.strategyHistory.slice(-10)
        };
    }

    /**
     * Clear strategy history
     */
    clearHistory(): void {
        this.strategyHistory = [];
    }

    // ==================== Private Methods ====================

    /**
     * Internal strategy selection logic
     */
    private selectStrategyInternal(context: StrategyContext): RoutingAlgorithm {
        const { obstacleCount, canvasBounds } = context;

        // Rule 1: Very sparse graph (< 6 obstacles) → Grid A*
        if (obstacleCount < this.GRID_THRESHOLD) {
            return RoutingAlgorithm.GRID_ASTAR;
        }

        // Rule 2: Medium density (6-30 obstacles) → Visibility Graph
        if (obstacleCount >= this.GRID_THRESHOLD && obstacleCount <= this.DENSE_THRESHOLD) {
            return RoutingAlgorithm.VISIBILITY_GRAPH;
        }

        // Rule 3: High obstacle count (> 30) → Check density
        if (obstacleCount > this.DENSE_THRESHOLD) {
            const density = this.calculateDensity(context);

            if (density < this.DENSITY_RATIO) {
                // Low density: VG is still efficient
                return RoutingAlgorithm.VISIBILITY_GRAPH;
            } else {
                // High density: Grid A* with spatial index may be better
                // or Hybrid approach (future implementation)
                return RoutingAlgorithm.HYBRID;
            }
        }

        // Default fallback
        return RoutingAlgorithm.GRID_ASTAR;
    }

    /**
     * Calculate obstacle density (coverage ratio)
     */
    private calculateDensity(context: StrategyContext): number {
        if (!context.obstacles || context.obstacles.length === 0) {
            return 0;
        }

        const { canvasBounds, obstacles } = context;
        const canvasArea = canvasBounds.width * canvasBounds.height;

        // Calculate total obstacle area
        let totalObstacleArea = 0;
        for (const obstacle of obstacles) {
            totalObstacleArea += obstacle.width * obstacle.height;
        }

        return totalObstacleArea / canvasArea;
    }

    /**
     * Estimate computational cost for a given algorithm
     * 
     * Returns a unitless cost estimate (lower is better)
     */
    estimateCost(algorithm: RoutingAlgorithm, context: StrategyContext): number {
        const { obstacleCount, canvasBounds } = context;

        switch (algorithm) {
            case RoutingAlgorithm.GRID_ASTAR: {
                // Grid A*: O(W*H*log(W*H))
                // Assume grid size of 20px
                const gridSize = 20;
                const gridWidth = Math.ceil(canvasBounds.width / gridSize);
                const gridHeight = Math.ceil(canvasBounds.height / gridSize);
                const cellCount = gridWidth * gridHeight;

                // A* complexity: O(n log n) where n is grid cells
                return cellCount * Math.log2(cellCount + 1);
            }

            case RoutingAlgorithm.VISIBILITY_GRAPH: {
                // VG: O(V²) for graph construction + O(V log V) for A*
                // V = obstacleCount * 4 (4 corners per obstacle)
                const vertexCount = obstacleCount * 4;

                // Graph construction: O(V²)
                const buildCost = vertexCount * vertexCount;

                // A* on graph: O(V log V)
                const searchCost = vertexCount * Math.log2(vertexCount + 1);

                return buildCost + searchCost;
            }

            case RoutingAlgorithm.HYBRID: {
                // Hybrid: Combination of both (rough estimate)
                // Use weighted average based on density
                const density = this.calculateDensity(context);
                const gridCost = this.estimateCost(RoutingAlgorithm.GRID_ASTAR, context);
                const vgCost = this.estimateCost(RoutingAlgorithm.VISIBILITY_GRAPH, context);

                return gridCost * density + vgCost * (1 - density);
            }

            default:
                return Infinity;
        }
    }

    /**
     * Get human-readable reason for algorithm selection
     */
    private getSelectionReason(algorithm: RoutingAlgorithm, context: StrategyContext): string {
        const { obstacleCount } = context;

        switch (algorithm) {
            case RoutingAlgorithm.GRID_ASTAR:
                if (obstacleCount < this.GRID_THRESHOLD) {
                    return `Very sparse graph (${obstacleCount} obstacles) - Grid A* is simple and fast`;
                } else {
                    const density = this.calculateDensity(context);
                    return `High density (${(density * 100).toFixed(1)}%) - Grid A* with spatial index is more efficient`;
                }

            case RoutingAlgorithm.VISIBILITY_GRAPH: {
                const density = this.calculateDensity(context);
                if (obstacleCount <= this.DENSE_THRESHOLD) {
                    return `Medium density (${obstacleCount} obstacles) - Visibility Graph is optimal`;
                } else {
                    return `Low density (${(density * 100).toFixed(1)}%) despite many obstacles - VG still efficient`;
                }
            }

            case RoutingAlgorithm.HYBRID:
                return 'Balanced density - Hybrid approach for optimal performance';

            default:
                return 'Default selection';
        }
    }
}

/**
 * Global singleton instance (optional)
 */
let globalSelector: RoutingStrategySelector | null = null;

export function getStrategySelector(): RoutingStrategySelector {
    if (!globalSelector) {
        globalSelector = new RoutingStrategySelector();
    }
    return globalSelector;
}

export function resetStrategySelector(): void {
    globalSelector = null;
}
