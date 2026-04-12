// src/config/edgeConfig.ts

/**
 * Edge configuration defaults and types.
 * This file defines configurable parameters for smart edge routing.
 */
export type EdgeType = "straight" | "orthogonal" | "bezier";

export interface EdgeConfig {
    /** Preferred edge types in order of fallback. */
    preferredEdgeTypes: EdgeType[];
    /** Strategy for selecting ports. */
    portSelectionStrategy: "greedy" | "aStar" | "costAware";
    /** Maximum number of jump points allowed. */
    maxJumps: number;
    /** Grid size for routing algorithms. */
    gridSize: number;
    /** Padding around obstacles to avoid collisions. */
    obstaclePadding: number;
    /** Border radius for rounded corners. */
    borderRadius: number;
    /** Offset from source/target ports. */
    sourceOffset: number;
    targetOffset: number;
    /** Minimum length for the last segment. */
    minLastSegment: number;
    /** Jump radius for visual jumps. */
    jumpRadius: number;
    /** Jitter suppression multiplier. */
    jitterThresholdMultiplier: number;
    /** Debug flag to render extra visuals. */
    debug: boolean;
    /** Debug flag for port heatmap. */
    debugPortHeatmap: boolean;
    /** Minimum spacing between parallel edges (pixels). */
    edgeMinSpacing?: number;
    /** Strength of bundling (0-1). */
    bundleStrength?: number;
    /** [NEW] Enable cost-aware port selection algorithm. */
    enableCostAwarePorts?: boolean;
    /** [NEW] Cost for each 90° direction change in pathfinding. */
    directionChangeCost?: number;
    /** [NEW] Number of buffer zone levels around obstacles. */
    bufferZoneLevels?: number;
}

export const defaultEdgeConfig: EdgeConfig = {
    preferredEdgeTypes: ["orthogonal", "straight", "bezier"],
    portSelectionStrategy: "costAware",
    maxJumps: 5,
    gridSize: 20,
    obstaclePadding: 10,
    borderRadius: 16,
    sourceOffset: 8,
    targetOffset: 10,
    minLastSegment: 30,
    jumpRadius: 10,
    jitterThresholdMultiplier: 2,
    debug: false,
    debugPortHeatmap: false,
    edgeMinSpacing: 12,
    bundleStrength: 0.6,
    enableCostAwarePorts: true,
    directionChangeCost: 8,
    bufferZoneLevels: 2,
};
