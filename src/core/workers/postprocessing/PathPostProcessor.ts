/**
 * Path Post-Processor
 * 
 * Handles path simplification, orthogonalization, nudging, and SVG path generation.
 * Extracted from pathfinding.worker.ts for modularity.
 */

import { Point, Rectangle } from '../../algorithms/geometryUtils';
import { Position, UnifiedRoutingConfig } from '../../types/routing';
import {
    simplifyPath,
    makePathOrthogonal,
    collapseRedundantBends,
    removeSmallJogs,
    collapseCollinearBacktracks,
    preventEndpointCollinearBacktrack,
    nudgeSegments,
    removeShortDiagonals,
    createFilletedPath,
    ensureMinLastSegment,
    ensureMinFirstSegment,
    removeTinyOrthogonalJogs,
    removeLargeBacktrack
} from '../../algorithms/smartEdgeUtils';

export interface PostProcessContext {
    config: UnifiedRoutingConfig;
    obstacles: Rectangle[];
    startPos: Position;
    endPos: Position;
    metadata: {
        isOneToMany: boolean;
        isManyToOne: boolean;
        outgoingIndex: number;
        outgoingCount: number;
        incomingIndex: number;
        incomingCount: number;
        trunkShift?: number; // [NEW] Support for Dual Channel Trunk
        globalChannelIndex?: number;
        globalChannelCount?: number;
        globalChannelType?: 'horizontal' | 'vertical';
        bidirectionalChannel?: number;     // [FIX Phase 2] Bidirectional pair channel (0/1)
        bidirectionalSpacing?: number;     // [FIX Phase 2] Spacing for bidirectional pairs
        strategy?: string;
    };
    extraObstacles?: Rectangle[];
}

export class PathPostProcessor {
    private config: UnifiedRoutingConfig;

    constructor(config: UnifiedRoutingConfig) {
        this.config = config;
    }

    /**
     * Execute full post-processing pipeline
     * 
     * @param points Initial path points
     * @param context Processing context
     * @returns Processed points and SVG path string
     */
    process(points: Point[], context: PostProcessContext): { points: Point[]; svgPath: string } {
        if (points.length < 2) {
            return { points, svgPath: '' };
        }

        // [Trunk Direct] Bypass heavy post-processing for calculated trunk paths
        // These paths are geometrically constructed to be 'perfect' (clean orthogonal routing)
        // and shouldn't be simplified or nudged, which destroys the strict structure.
        const { config } = this;
        const { obstacles, startPos, endPos, metadata, extraObstacles } = context;
        const isBus = metadata.isOneToMany || metadata.isManyToOne;

        if (context.metadata.strategy && context.metadata.strategy.includes('Trunk Direct')) {
            // [H-1] Apply snapAxis before return to eliminate sub-pixel diagonal artifacts
            // that arise from fractional coordinate math in trunk geometry construction.
            const snapped = points.map(p => ({ ...p }));
            for (let i = 0; i < snapped.length - 1; i++) {
                if (Math.abs(snapped[i].x - snapped[i + 1].x) < 1) snapped[i + 1].x = snapped[i].x;
                if (Math.abs(snapped[i].y - snapped[i + 1].y) < 1) snapped[i + 1].y = snapped[i].y;
            }
            // [BACKTRACK-V2] Orthogonal-safe backtrack removal for trunk paths
            const detracked = removeLargeBacktrack(snapped, obstacles, { sourcePos: startPos, targetPos: endPos });
            const svgPath = createFilletedPath(detracked, this.config.postProcessing.borderRadius);
            return { points: detracked, svgPath };
        }

        let finalPoints = [...points];
        const snapAxis = (pts: Point[]): Point[] => {
            if (pts.length < 2) return pts;
            const res = pts.map(p => ({ ...p }));
            for (let i = 0; i < res.length - 1; i++) {
                const a = res[i];
                const b = res[i + 1];
                if (Math.abs(a.x - b.x) < 1) b.x = a.x;
                if (Math.abs(a.y - b.y) < 1) b.y = a.y;
            }
            return res;
        };

        // Phase 0: Ensure minimum segments
        // [FIX] Use independent minFirstSegment and minLastSegment parameters
        // [FIX] BorderRadius Protection: ensure stubs are always long enough for filleted corners
        const safeMinFirst = Math.max(config.postProcessing.minFirstSegment, config.postProcessing.borderRadius + 5);
        const safeMinLast = Math.max(config.postProcessing.minLastSegment, config.postProcessing.borderRadius + 5);
        finalPoints = ensureMinLastSegment(finalPoints, safeMinLast);
        finalPoints = ensureMinFirstSegment(finalPoints, safeMinFirst);

        // Phase 1: Simplification & Redundancy Removal
        const posOptions = { sourcePos: startPos, targetPos: endPos };
        finalPoints = simplifyPath(finalPoints, config.algorithm.gridSize * 2, obstacles, posOptions);
        // [BACKTRACK-V2] Orthogonal-safe large backtrack removal.
        // Threshold: 20px minimum (catches trunk junction micro-backtracks like 52px)
        // Only fires when: dominant direction is clear (≥2:1), AND
        // corner is provably perpendicular to both incoming and outgoing segments.
        finalPoints = removeLargeBacktrack(finalPoints, obstacles, posOptions, 20);
        finalPoints = collapseRedundantBends(finalPoints, obstacles, config.postProcessing.redundantBendThreshold, posOptions);

        // Phase 2: Cleanup (Jogs, Backtracks)
        finalPoints = removeSmallJogs(finalPoints, obstacles, posOptions);
        finalPoints = collapseCollinearBacktracks(preventEndpointCollinearBacktrack(finalPoints));

        // Phase 3: Nudging (Separating parallel paths)
        // [IMPORTANT] Run Nudge BEFORE final Orthogonalization to ensure shifted lines are correctly aligned.
        if (config.algorithm.gridSize > 5 && config.postProcessing.enableNudge) {
            let nudgeOffset = 0;
            const spacing = config.postProcessing.nudgeSpacing;

            if (metadata.isOneToMany && metadata.outgoingCount > 1) {
                // [VISUAL UPGRADE] Shared Trunk Merge
                // Force nudgeOffset to 0 to ensure all branches share the same main trunk line.
                nudgeOffset = 0;
            } else if (metadata.isManyToOne && metadata.incomingCount > 1) {
                // [VISUAL UPGRADE] Shared Trunk Merge
                // Force nudgeOffset to 0 to ensure all branches share the same main trunk line.
                // The separation happens only at the branching points (Source -> Spine).
                nudgeOffset = 0;
            } else if (metadata.globalChannelCount && metadata.globalChannelCount > 1 && metadata.globalChannelIndex !== undefined) {
                // [NEW] Global Channel Ordering
                // Use global index to separate independent parallel edges
                nudgeOffset = (metadata.globalChannelIndex - (metadata.globalChannelCount - 1) / 2) * spacing;
            }

            // [H-2] N-way bidirectional separation: evenly distribute N channels around center.
            // Old formula only handled N=2 (0 → -1, else → +1), causing channels 1..N-1 to collapse.
            if (metadata.bidirectionalChannel !== undefined && metadata.bidirectionalSpacing) {
                const biCount = (metadata as any).bidirectionalCount ?? 2;
                const biOffset = (metadata.bidirectionalChannel - (biCount - 1) / 2) * metadata.bidirectionalSpacing;
                nudgeOffset += biOffset;
            }

            // Always run nudgeSegments to ensure gap centering, even if offset is 0
            const nudgeOptions = {
                lockStart: metadata.isOneToMany && metadata.outgoingCount > 1,
                lockEnd: metadata.isManyToOne && metadata.incomingCount > 1,
                trunkShift: metadata.trunkShift // [NEW] Pass trunk separation
            };
            finalPoints = nudgeSegments(finalPoints, obstacles, config.postProcessing.nudgeSearchLimit, nudgeOffset, extraObstacles, nudgeOptions);
        }

        // Phase 4: Orthogonalization
        if (config.postProcessing.enableOrthogonalization) {
            finalPoints = removeShortDiagonals(finalPoints, 0);
            finalPoints = makePathOrthogonal(finalPoints, {
                sourcePos: startPos,
                targetPos: endPos,
                sourceMinLength: isBus ? undefined : safeMinFirst,
                targetMinLength: isBus ? undefined : safeMinLast
            }, obstacles) || finalPoints;
            if (!isBus) {
                finalPoints = snapAxis(finalPoints);
                finalPoints = collapseCollinearBacktracks(preventEndpointCollinearBacktrack(finalPoints));
            }
        }

        // Phase 5: Final Refinement (Be cautious not to collapse nudged offsets)
        // [FIX] Use configurable threshold to preserve pathfinding results
        const finalSimplificationThreshold = config.postProcessing.finalSimplificationThreshold || Math.max(config.algorithm.gridSize * 2, 30);
        // [H-5] Skip Phase 5 simplify when threshold is not larger than Phase 1's (gridSize*2).
        // Phase 1 already ran simplifyPath at gridSize*2; a second pass with the same threshold
        // is pure O(N²) waste. Only run if finalThreshold adds meaningful resolution.
        const phase1Threshold = config.algorithm.gridSize * 2;
        if (finalSimplificationThreshold > phase1Threshold + 5) {
            finalPoints = simplifyPath(finalPoints, finalSimplificationThreshold, obstacles, posOptions);
        }
        
        // [FIX] Aggressively eliminate tiny orthogonal stair-steps created by A* grid snapping 
        // to continuous anchor coordinates before final simplification. 
        finalPoints = removeTinyOrthogonalJogs(finalPoints, 20, obstacles, posOptions);
        // [FIX] Skip second collapseRedundantBends to preserve pathfinding obstacle avoidance
        // Only apply if preserveObstacleAvoidance is explicitly disabled
        if (config.postProcessing.preserveObstacleAvoidance === false) {
            finalPoints = collapseRedundantBends(finalPoints, obstacles, config.postProcessing.finalRedundantBendThreshold, posOptions);
        }
        if (!isBus) {
            finalPoints = snapAxis(finalPoints);
            finalPoints = collapseCollinearBacktracks(preventEndpointCollinearBacktrack(finalPoints));
        }

        // [A3] 删除多余的无条件 snapAxis（L201），Phase 5 结尾已在上方条件分支内执行了 snapAxis
        // Phase 6 之前的点已是轴对齐状态，无需重复
        // [BACKTRACK-BUS] Run collapseCollinearBacktracks on bus/trunk edges too,
        // to clean up any small directional backtracks introduced by nudging or
        // trunk junction alignment (e.g. 52px overshoot at merge point).
        // This is safe after snapAxis because the points are already axis-snapped.
        finalPoints = collapseCollinearBacktracks(finalPoints);

        // Phase 6: SVG Path Generation
        const svgPath = createFilletedPath(finalPoints, config.postProcessing.borderRadius);

        return { points: finalPoints, svgPath };
    }
}
