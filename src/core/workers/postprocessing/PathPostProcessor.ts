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
    removeLargeBacktrack,
    trySimplify4PointCShape,
    removeCrossAxisDetour,
    removeMainAxisOvershoot
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

        const cleanupConstructedPath = (pts: Point[]): Point[] => {
            const cleaned: Point[] = [];
            for (const p of pts) {
                const prev = cleaned[cleaned.length - 1];
                if (!prev || Math.abs(prev.x - p.x) > 1 || Math.abs(prev.y - p.y) > 1) {
                    cleaned.push({ ...p });
                }
            }
            return collapseCollinearBacktracks(cleaned);
        };

        if (context.metadata.strategy && context.metadata.strategy.includes('Trunk Direct')) {
            // [H-1] Apply snapAxis before return to eliminate sub-pixel diagonal artifacts
            // that arise from fractional coordinate math in trunk geometry construction.
            let trunkPoints = snapAxis(points);
            // [BACKTRACK-V2] Orthogonal-safe backtrack removal for trunk paths
            trunkPoints = removeLargeBacktrack(trunkPoints, obstacles, { sourcePos: startPos, targetPos: endPos });
            
            // [FIX] Remove main-axis overshoot: path goes past destination then folds back.
            // e.g. wms→visibility: path goes to x=-32 when dst.x=180, then folds back.
            // removeLargeBacktrack can't handle this because the ratio check rejects
            // near-diagonal paths (dx/dy ≈ 1.07:1 < 1.2:1).
            trunkPoints = removeMainAxisOvershoot(trunkPoints, obstacles);
            
            // [FIX] Remove cross-axis C-shaped detours that trunk geometry may produce
            trunkPoints = removeCrossAxisDetour(trunkPoints, obstacles, { sourcePos: startPos, targetPos: endPos });
            // [FIX] Also remove tiny orthogonal jogs (e.g. 10px S-bends from port offset)
            // that Trunk Direct geometry construction may produce.
            const jogThreshold = Math.max(config.algorithm.gridSize * 1.5, 40);
            trunkPoints = removeTinyOrthogonalJogs(trunkPoints, jogThreshold, obstacles, { sourcePos: startPos, targetPos: endPos });
            trunkPoints = collapseCollinearBacktracks(trunkPoints);
            const svgPath = createFilletedPath(trunkPoints, this.config.postProcessing.borderRadius);
            return { points: trunkPoints, svgPath };
        }

        if (context.metadata.strategy === 'Reverse U-Turn') {
            const safeMinFirst = Math.max(config.postProcessing.minFirstSegment, config.postProcessing.borderRadius + 5);
            const safeMinLast = Math.max(config.postProcessing.minLastSegment, config.postProcessing.borderRadius + 5);
            const orthogonal = makePathOrthogonal(snapAxis(points), {
                sourcePos: startPos,
                targetPos: endPos,
                sourceMinLength: safeMinFirst,
                targetMinLength: safeMinLast,
            }, obstacles) || points;
            const finalPoints = cleanupConstructedPath(snapAxis(orthogonal));
            const svgPath = createFilletedPath(finalPoints, this.config.postProcessing.borderRadius);
            return { points: finalPoints, svgPath };
        }

        let finalPoints = [...points];

        // Phase 0: Ensure minimum segments
        // [FIX] Use independent minFirstSegment and minLastSegment parameters
        // [FIX] BorderRadius Protection: ensure stubs are always long enough for filleted corners
        const safeMinFirst = Math.max(config.postProcessing.minFirstSegment, config.postProcessing.borderRadius + 5);
        const safeMinLast = Math.max(config.postProcessing.minLastSegment, config.postProcessing.borderRadius + 5);
        finalPoints = ensureMinLastSegment(finalPoints, safeMinLast, endPos);
        finalPoints = ensureMinFirstSegment(finalPoints, safeMinFirst, startPos);

        // Phase 0b: Strip points inside source/target nodes
        // A* excludes source/target from obstacles, so intermediate waypoints may
        // land inside the node body. Remove them — Phase 1 simplification with
        // simplifyObstacles will reconnect the path correctly (going around the node).
        if (extraObstacles && extraObstacles.length >= 2 && finalPoints.length > 2) {
            const sR = extraObstacles[0];
            const tR = extraObstacles[1];
            const isInside = (p: Point, r: Rectangle) =>
                p.x > r.x + 2 && p.x < r.x + r.width - 2 &&
                p.y > r.y + 2 && p.y < r.y + r.height - 2;

            finalPoints = finalPoints.filter((p, i) => {
                if (i === 0 || i === finalPoints.length - 1) return true; // keep start/end
                return !isInside(p, sR) && !isInside(p, tR);
            });
        }

        // Phase 1: Simplification & Redundancy Removal
        const posOptions = { sourcePos: startPos, targetPos: endPos };
        // [FIX] Merge extraObstacles (source/target node rects) into obstacle list.
        // routingObstacles excludes source/target to let A* enter the port zone,
        // but simplification must NOT shortcut through the source/target node bodies.
        const simplifyObstacles = extraObstacles && extraObstacles.length > 0
            ? [...obstacles, ...extraObstacles]
            : obstacles;
        finalPoints = simplifyPath(finalPoints, config.algorithm.gridSize * 2, simplifyObstacles, posOptions);
        // [NEW] Handle 4-point C-shape paths before removeLargeBacktrack (which requires ≥5 pts)
        finalPoints = trySimplify4PointCShape(finalPoints, simplifyObstacles, posOptions);
        // [BACKTRACK-V2] Orthogonal-safe large backtrack removal.
        // Threshold: 20px minimum (catches trunk junction micro-backtracks like 52px)
        // Only fires when: dominant direction is clear (≥2:1), AND
        // corner is provably perpendicular to both incoming and outgoing segments.
        finalPoints = removeLargeBacktrack(finalPoints, simplifyObstacles, posOptions, 20);
        // [FIX] Remove cross-axis C-shaped detours (e.g. path goes left then right when target is to the right)
        finalPoints = removeCrossAxisDetour(finalPoints, simplifyObstacles, posOptions);
        finalPoints = collapseRedundantBends(finalPoints, simplifyObstacles, config.postProcessing.redundantBendThreshold, posOptions);

        // Phase 2: Cleanup (Jogs, Backtracks)
        finalPoints = removeSmallJogs(finalPoints, simplifyObstacles, posOptions);
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
                nudgeOffset = 0;
            } else if (metadata.globalChannelCount && metadata.globalChannelCount > 1 && metadata.globalChannelIndex !== undefined) {
                // [NEW] Global Channel Ordering
                nudgeOffset = (metadata.globalChannelIndex - (metadata.globalChannelCount - 1) / 2) * spacing;
            }

            // [REMOVED] Bidirectional offset from nudgeSegments — it gets clipped by safeOffset.
            // Moved to Phase 3b below for direct application.

            // Always run nudgeSegments to ensure gap centering, even if offset is 0
            const nudgeOptions = {
                lockStart: metadata.isOneToMany && metadata.outgoingCount > 1,
                lockEnd: metadata.isManyToOne && metadata.incomingCount > 1,
                trunkShift: metadata.trunkShift // [NEW] Pass trunk separation
            };
            finalPoints = nudgeSegments(finalPoints, obstacles, config.postProcessing.nudgeSearchLimit, nudgeOffset, extraObstacles, nudgeOptions);
        }

        // Phase 3b: Bidirectional Direct Offset
        // 对双向边的中间路径点直接做硬偏移，绕过 nudgeSegments 的安全裁剪。
        if (metadata.bidirectionalChannel !== undefined && metadata.bidirectionalSpacing) {
            const biCount = (metadata as any).bidirectionalCount ?? 2;
            const biOffset = (metadata.bidirectionalChannel - (biCount - 1) / 2) * metadata.bidirectionalSpacing;

            if (Math.abs(biOffset) > 0.5) {
                const dx = finalPoints[finalPoints.length - 1].x - finalPoints[0].x;
                const dy = finalPoints[finalPoints.length - 1].y - finalPoints[0].y;
                const isMainlyVertical = Math.abs(dy) > Math.abs(dx);

                if (finalPoints.length >= 3) {
                    // 有中间点：直接偏移
                    for (let k = 1; k < finalPoints.length - 1; k++) {
                        if (isMainlyVertical) {
                            finalPoints[k].x += biOffset;
                        } else {
                            finalPoints[k].y += biOffset;
                        }
                    }
                } else if (finalPoints.length === 2) {
                    // 只有起点+终点（直线路径）：
                    // 在起点/终点附近各插入一个偏移后的中间点，形成正交折线
                    const p0 = finalPoints[0];
                    const p1 = finalPoints[1];
                    const stubLen = 20; // 从 handle 出发的短直线段长度

                    if (isMainlyVertical) {
                        // 垂直主流向 → 水平偏移中间段
                        const yDir = Math.sign(p1.y - p0.y);
                        const mid1 = { x: p0.x + biOffset, y: p0.y + yDir * stubLen };
                        const mid2 = { x: p0.x + biOffset, y: p1.y - yDir * stubLen };
                        finalPoints.splice(1, 0, { x: p0.x, y: mid1.y }, mid1, mid2, { x: p1.x, y: mid2.y });
                    } else {
                        // 水平主流向 → 垂直偏移中间段
                        const xDir = Math.sign(p1.x - p0.x);
                        const mid1 = { x: p0.x + xDir * stubLen, y: p0.y + biOffset };
                        const mid2 = { x: p1.x - xDir * stubLen, y: p0.y + biOffset };
                        finalPoints.splice(1, 0, { x: mid1.x, y: p0.y }, mid1, mid2, { x: mid2.x, y: p1.y });
                    }
                }
            }
        }

        // Phase 4: Orthogonalization
        if (config.postProcessing.enableOrthogonalization) {
            finalPoints = removeShortDiagonals(finalPoints, 0);
            finalPoints = makePathOrthogonal(finalPoints, {
                sourcePos: startPos,
                targetPos: endPos,
                sourceMinLength: isBus ? undefined : safeMinFirst,
                targetMinLength: isBus ? undefined : safeMinLast
            }, simplifyObstacles) || finalPoints;
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
            finalPoints = simplifyPath(finalPoints, finalSimplificationThreshold, simplifyObstacles, posOptions);
        }
        
        // [FIX] Aggressively eliminate tiny orthogonal stair-steps created by A* grid snapping 
        // to continuous anchor coordinates before final simplification. Use a dynamic threshold
        // that is strictly greater than the grid size to catch 1-grid-step jogs (e.g., 20px).
        finalPoints = removeTinyOrthogonalJogs(finalPoints, Math.max(config.algorithm.gridSize * 1.5, 40), simplifyObstacles, posOptions);
        // [FIX] Skip second collapseRedundantBends to preserve pathfinding obstacle avoidance
        // Only apply if preserveObstacleAvoidance is explicitly disabled
        if (config.postProcessing.preserveObstacleAvoidance === false) {
            finalPoints = collapseRedundantBends(finalPoints, simplifyObstacles, config.postProcessing.finalRedundantBendThreshold, posOptions);
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
        // Visibility Graph often produces an already-clean single-bend orthogonal route.
        // Filleting that one corner creates a visible curve that reads like a diagonal segment.
        const isSingleBendVisibilityGraph =
            finalPoints.length <= 4 &&
            (metadata.strategy === 'Visibility Graph' || metadata.strategy === 'Hybrid VG');
        const renderRadius = isSingleBendVisibilityGraph ? 0 : config.postProcessing.borderRadius;
        const svgPath = createFilletedPath(finalPoints, renderRadius);

        return { points: finalPoints, svgPath };
    }
}
