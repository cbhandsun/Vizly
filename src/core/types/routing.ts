// src/types/routing.ts

export enum Position {
    Left = 'left',
    Right = 'right',
    Top = 'top',
    Bottom = 'bottom'
}

import type { PathfindingGrid } from '../algorithms/pathfinding';
import type { VisibilityGraph } from '../algorithms/visibilityGraph';
import type { SpatialIndex } from '../algorithms/SpatialIndex';

// Common Geometry Types
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

export interface LineObstacle {
    start: Point;
    end: Point;
}

// Algorithm Debug Info
export interface AlgorithmDebugInfo { // Renamed from AStarDebugInfo
    visited?: Point[];
    grid?: {
        minX: number;
        minY: number;
        cols: number;
        rows: number;
        size: number;
        data: Int32Array;
    };
    trace?: string[];
    algorithmDebug?: unknown;
}

/**
 * Port Selection Configuration
 * Controls the behavior of the smart port selection algorithm
 */
export interface PortSelectionConfig {
    // Cost thresholds for port selection confidence
    bonusCostThreshold: number;        // default: -100, ports with cost below this are considered "bonus" (highly favorable)
    lowConfidenceThreshold: number;    // default: 0.2, confidence threshold for bonus candidates
    highConfidenceThreshold: number;   // default: 0.8, confidence threshold for normal candidates

    // Strategy preferences
    preferGeometryOverBus: boolean;    // default: true, prioritize geometric optimality over bus alignment
    enableObstacleAwareness: boolean;  // default: true, consider obstacle density when selecting ports

    // Port capacity management (already implemented in Quick Optimizations)
    portUsageWeight: number;           // default: 50, cost penalty per existing connection on a port

    enableDynamicPorts: boolean;
    portSlidePadding: number;

    // Global Channel Awareness
    globalChannelIndex?: number;
    globalChannelCount?: number;
    globalChannelType?: 'horizontal' | 'vertical';

    // [NEW] Weighted Preference for Bus/Trunk Routing
    preferredSourcePort?: Position;
    preferredTargetPort?: Position;

    // [P3] Advanced Tuning & Context (Merged from costAwarePorts.ts)
    bendPenalty?: number;      // Cost per bend (default: 50)
    obstaclePenalty?: number;  // Cost for near-obstacle paths (default: 100)
    crossingPenalty?: number;  // Cost for crossing existing lines (default: 80)
    layoutDirection?: 'TB' | 'LR' | 'BT' | 'RL'; // Layout direction for flow optimization

    // Contextual Data (Per-Request)
    portUsage?: Record<string, number>; // Usage count for each port
    portUsageData?: {
        source: Array<{ pos: Position; usageWeight?: number }>;
        target: Array<{ pos: Position; usageWeight?: number }>;
    };
    sourceId?: string; // ID of source node
    targetId?: string; // ID of target node
    returnAllCandidates?: boolean; // Debugging
}

/**
 * [P2-3] Unified Routing Configuration
 * Consolidates all routing-related configuration into a single interface
 */
export interface UnifiedRoutingConfig {
    // Algorithm parameters
    algorithm: {
        gridSize: number;                  // default: 15
        useVisibilityGraph: boolean;       // default: true
        visibilityGraphThreshold: number;  // default: 6 (lowered from 10 in P1)
        enableJPS: boolean;                // default: false (future optimization)
        enableThetaStar?: boolean;         // [NEW]
    };

    // Cost system
    costs: {
        normal: number;                    // default: 10
        bufferZoneClose: number;           // default: 2000
        bufferZoneFar: number;             // default: 100
        directionChange: number;           // default: 200
        lineOccupied: number;              // default: 5000
        lineCross: number;                 // default: 50000
        obstacle: number;                  // default: 10000000
        mergePath: number;                 // default: 1
    };

    // Bus configuration
    bus: {
        spacing: number;                   // default: 25 (BUS_SEPARATION)
        manyToOneSpacing: number;          // default: 3 (from P1 optimization)
        trunkBase: number;                 // default: 60
        trunkMultiplier: number;           // default: 8
        enableAdaptiveSeparation: boolean; // default: true
        parallelTrunkSpacing?: number;     // [Phase 3] Spacing between forward/backward trunks (default: 80, increased from 60)
        parallelTrunkStrategy?: 'count-based' | 'forward-first' | 'backward-first'; // [Phase 3.5] Trunk assignment strategy (default: 'count-based')
        bidirectionalSpacing?: number;     // [FIX] Spacing for A↔B bidirectional edge pairs (default: 25)
    };

    // Port selection (from P2-1)
    portSelection: PortSelectionConfig;

    channel: {
        enableChannelRouting: boolean;
        enableEdgeBundling: boolean;
        channelSpacing: number;
        minEdgeSeparation: number;
        bundleStrength: number;
    };

    // Post-processing
    postProcessing: {
        enableSimplification: boolean;     // default: true
        simplificationLevel?: 'low' | 'medium' | 'high'; // [FIX] Control simplification aggressiveness (default: 'medium')
        preserveObstacleAvoidance?: boolean; // [FIX] Preserve pathfinding obstacle avoidance (default: true)
        enableNudge: boolean;              // default: true
        enableOrthogonalization: boolean;  // default: true
        borderRadius: number;              // default: 4
        minFirstSegment: number;           // default: 30 (source port stub min length)
        minLastSegment: number;            // default: 30 (target port stub min length)
        redundantBendThreshold: number;    // default: 40
        finalRedundantBendThreshold: number; // default: 10
        finalSimplificationThreshold?: number; // [FIX] Threshold for final simplification (default: 30, increased from 15)
        nudgeSpacing: number;              // default: 12
        nudgeSearchLimit: number;          // default: 200
    };

    // Offsets
    offsets: {
        source: number;                    // default: 25
        target: number;                    // default: 35
    };

    // Debug
    debug: boolean;                        // default: false

    // [P0 OPTIMIZATION] Experimental Features
    experimental?: {
        enable1BendVG?: boolean;           // default: true (1-Bend VG优化)
        enableLPNudge?: boolean;           // default: false (线性规划Nudge)
        enableCrossingOpt?: boolean;       // default: false (交叉优化)
    };
}

/**
 * [P2-3] Create default routing configuration
 */
export function createDefaultRoutingConfig(): UnifiedRoutingConfig {
    return {
        algorithm: {
            gridSize: 20,  // [FIX] 20px grid: reduces search space 4x vs 10px. Post-processing handles sub-pixel alignment.
            useVisibilityGraph: true,
            visibilityGraphThreshold: 20, // [FIX] Increased from 6. TypedArray Grid A* is blisteringly fast & provides strictly orthogonal lines. Save VG for highly dense clusters.
            enableJPS: false,
            enableThetaStar: false // [FIX] Disabled. Theta* calls isPathBlocked() per neighbor, making each A* iteration O(N*obstacles) instead of O(1). This caused 25k iterations to only explore 10% of a 457x504 grid. Post-processing optimizePath() handles smoothing instead.
        },
        costs: {
            normal: 10,
            bufferZoneClose: 10, // [FIX] Reduced from 15 to 10. Forms a 10px zero-penalty safe channel in a 30px gap.
            bufferZoneFar: 10,   // [FIX] Reduced from 100 to 10.
            directionChange: 150, // [FIX] Reduced from 1000. Liberates A* to thread through tight gaps via L-shapes rather than detouring around massive components out of fear of corners.
            lineOccupied: 10,
            lineCross: 300,        // [FIX] Reduced from 50000. Allow jump-overs instead of huge global detours.
            obstacle: 10000000,
            mergePath: 1
        },
        bus: {
            spacing: 30,  // [总线优化] 增大分支间距(原25)
            manyToOneSpacing: 5,  // [总线优化] 增大多对一间距(原3)
            trunkBase: 80,  // [总线优化] 增大基础干道长度(原60)
            trunkMultiplier: 10,  // [总线优化] 增大干道倍数(原8)
            enableAdaptiveSeparation: true,
            parallelTrunkSpacing: 80,  // [FIX] 双主干间距 (increased from 60 to 80)
            bidirectionalSpacing: 25   // [FIX] 双向连线间距
        },
        portSelection: {
            bonusCostThreshold: -100,
            lowConfidenceThreshold: 0.2,
            highConfidenceThreshold: 0.8,
            preferGeometryOverBus: false,
            enableObstacleAwareness: true,
            portUsageWeight: 50,
            enableDynamicPorts: true,
            portSlidePadding: 12,

            // [P3] Advanced Tuning
            bendPenalty: 50,
            obstaclePenalty: 100,
            crossingPenalty: 80,
            layoutDirection: 'TB',
            returnAllCandidates: false
        },
        channel: {
            enableChannelRouting: true,
            enableEdgeBundling: true,
            channelSpacing: 20,
            minEdgeSeparation: 10,
            bundleStrength: 0.5
        },
        postProcessing: {
            enableSimplification: true,
            simplificationLevel: 'medium' as 'low' | 'medium' | 'high',
            preserveObstacleAvoidance: true,
            enableNudge: true,
            enableOrthogonalization: true,
            borderRadius: 4,  // [FIX] 从20降至4: 直角折线风格，消除"弯曲"视觉
            minFirstSegment: 20, // [FIX] 降低：borderRadius=4 只需 4*2+5=13，取 20 留余
            minLastSegment: 20,
            redundantBendThreshold: 60,
            finalRedundantBendThreshold: 15,
            finalSimplificationThreshold: 30,
            nudgeSpacing: 12,
            nudgeSearchLimit: 120
        },
        offsets: {
            source: 25,  // [FIX] 降低：borderRadius=4 不再需要 40px 偏移
            target: 25
        },
        debug: true,
        experimental: {
            enable1BendVG: true,      // [P0-1] 启用1-Bend优化
            enableLPNudge: true,      // [P0-2] 启用LP Nudge
            enableCrossingOpt: true   // [P0-3] 启用交叉优化
        }
    };
}

// [P2-3] Generic Edge Constraints (Replacements for hardcoded behavior)
export interface EdgeConstraint {
    routingType: 'standard' | 'bus' | 'direct' | 'orthogonal'; // Strategy
    obstacleBehavior: 'strict' | 'relaxed' | 'ignore';         // Collision handling
    lanePreference?: 'inner' | 'outer' | 'center';             // Bus sorting
    priority: number;                                          // Lower = Routed later (on top)
    debug?: boolean;                                           // Verbose logging
}

/**
 * [P2-3] Pathfinding Execution Context
 * Encapsulates all parameters for executeEdgePathfinding function
 */
export interface PathfindingContext {
    job: PathFindingJob;               // Edge-specific job data
    graph: SharedGraphContext;         // Shared graph context (nodes, edges, obstacles)
    config: UnifiedRoutingConfig;      // Unified configuration
    constraints?: EdgeConstraint;      // [P2-3] Edge-specific constraints
    runtime?: {                        // Optional runtime data
        prebuiltGrid?: PathfindingGrid;
        spatialIndex?: SpatialIndex;
        visibilityGraphCache?: VisibilityGraph;
        guideLines?: LineObstacle[];   // Guide lines for trunk routing
        portUsage?: Record<string, number>; // Port usage map for capacity management
        congestionGrid?: Int32Array;        // [NEW] Global congestion grid
    };
}

// Worker Input

export interface PathFindingJob {
    jobId: string;
    source: string;
    target: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    sourcePosition?: Position;
    targetPosition?: Position;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    isManyToOne?: boolean;
    isOneToMany?: boolean;
    effectiveIsManyToOne?: boolean; // [COMPAT] Support for alternative naming
    effectiveIsOneToMany?: boolean; // [COMPAT] Support for alternative naming
    layoutDirection?: 'LR' | 'RL' | 'TB' | 'BT' | string;
    busTrunkSource?: Point;
    busTrunkTarget?: Point;
    busTrunkPort?: Position; // [DEPRECATED] kept for backward compatibility if needed, but preferable to remove usage

    // [NEW] Specific suggested ports for Source and Target sides
    busSourcePort?: Position;
    busTargetPort?: Position;

    // [FIX] Pass Absolute Node Geometry to Worker to avoid Relative vs Absolute mismatch
    sourceRect?: Rectangle;
    targetRect?: Rectangle;

    // Candidate Ports: allow worker to choose the best port
    candidatePorts?: {
        source: Array<{ id: string; x: number; y: number; dir: string; usage?: number }>;
        target: Array<{ id: string; x: number; y: number; dir: string; usage?: number }>;
    };

    // [P2-3] Graph data moved to SharedGraphContext
    // nodes, edges, obstacles, config are now in SharedGraphContext

    edgeId: string;

    // Bus Routing Metadata
    outgoingIndex?: number;
    outgoingCount?: number;
    incomingIndex?: number;
    incomingCount?: number;

    // Global Channel Metadata
    globalChannelIndex?: number;
    globalChannelCount?: number;
    globalChannelType?: 'horizontal' | 'vertical';

    // [FIX] Bidirectional Edge Separation
    bidirectionalChannel?: number;     // 0 for forward, 1 for backward in A↔B pair
    bidirectionalSpacing?: number;     // Spacing override for bidirectional edges

    // [NEW] Reverse Edge Flag - triggers bypass routing strategy in Worker
    isReverseEdge?: boolean;

    // Debug
    debug?: boolean;
}


// [NEW] Shared Context for Batch Processing
// Alias for backward compatibility if needed, but prefer SharedGraphContext
export type PathFindingGraph = SharedGraphContext;

export interface SharedGraphContext {
    nodes: unknown[];
    edges: unknown[];
    obstacles: Rectangle[];
    pendingEdges?: LineObstacle[];  // [P2-3] Moved from PathFindingJob
    config: Partial<UnifiedRoutingConfig>;
    graphVersion?: number; // [Imp-8] For Worker Caching
}


export interface PathFindingContext {
    job: PathFindingJob;
    graph: SharedGraphContext;
    config: UnifiedRoutingConfig;
    runtime?: {
        prebuiltGrid?: PathfindingGrid;
        guideLines?: LineObstacle[];
        portUsage?: Record<string, number>;
        spatialIndex?: SpatialIndex;
        visibilityGraphCache?: VisibilityGraph;
        congestionGrid?: Int32Array;
    };
}

/**
 * [P2-3] Full routing request sent to the Worker/Pool
 */
export interface PathFindingRequest {
    job: PathFindingJob;
    graph: SharedGraphContext;
}

// [NEW] Batch Job Structure
export interface BatchPathFindingJob {
    mode: 'batch';
    jobId: string; // Batch ID
    context: SharedGraphContext;
    tasks: PathFindingJob[];  // [P2-3] No need for Omit anymore
}



export interface PathFindingTaskResult {
    jobId: string; // The original sub-job ID
    result: PathFindingResult;
    error?: string;
}

export interface BatchPathFindingResult {
    batchId: string;
    results: PathFindingTaskResult[];
}

// Worker Output
export interface PathFindingResult {
    jobId: string;
    edgeId: string;
    path: string;
    points: Point[];
    labelX: number;
    labelY: number;
    // New: Bus and Port metadata
    effectiveIsManyToOne?: boolean;
    effectiveIsOneToMany?: boolean;
    busTrunkSource?: Point;
    busTrunkTarget?: Point;
    sourcePos?: Position;
    targetPos?: Position;
    sourceId?: string;
    targetId?: string;
    usedSourcePos?: Position;
    usedTargetPos?: Position;

    debugInfo?: {
        edgeId?: string; // Sometimes echoed back
        visited?: Point[];
        grid?: { x: number, y: number, cost: number }[]; // Note: Legacy format in simpler type? Or match AStarDebugInfo grid
        algorithmDebug?: unknown;
        trace?: string[];
        selectedSourcePos?: Position;
        selectedTargetPos?: Position;
        [key: string]: unknown;
    };
    metadata?: {
        strategy?: string; // [Imp-10]
        executionTime?: number;
        [key: string]: unknown;
    };
    error?: string;
}


// Coordinator Request (Matches PathFindingRequest structure)
export interface RoutingRequest {
    edgeId: string;
    job: Omit<PathFindingJob, 'edgeId'>;
    graph: SharedGraphContext;
}

/**
 * [SharedTrunk] Represents the shared horizontal/vertical trunk segment
 * extracted from a M2O or O2M buddy group.
 * Rendered as a single SVG path in the canvas trunk layer instead of
 * N overlapping individual edge paths.
 */
export interface SharedTrunkSegment {
    /** Unique key: 'm2o:<targetId>' or 'o2m:<sourceId>' */
    id: string;
    /** The full trunk path points (branch junction → ... → hub port) */
    points: Point[];
    /** SVG path string with rounded corners */
    path: string;
    /** Which edge IDs contribute branches to this trunk */
    edgeIds: string[];
    /** The hub node ID (ASN for M2O, source node for O2M) */
    hubId: string;
    /** Trunk group type */
    type: 'm2o' | 'o2m';
}

