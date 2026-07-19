import { Position } from '../types/flow';
import type { PortSelectionConfig } from '../types/routing';
import {
  type LineObstacle,
  type Rectangle,
  isPathBlocked,
  generateSimplePath as _generateSimplePath,
} from './pathfinding';
import { SpatialIndex } from './SpatialIndex';
import {
  analyzeGeometry,
  getPortRulesForGeometry,
  portCombinationToString,
  type GeometryType,
} from './geometry-classifier';
import {
  calculatePathLength,
  countLineCrossings,
  estimateBendCount,
  generateProbePath,
  getPortPoint,
  isPortDirectionValid,
} from './costAwarePortGeometry';
import type { NodeRect, PortCandidate } from './costAwarePortTypes';

const WEIGHT = {
    // [I-8] Raised from 10_000 to 100_000. At 10_000, a route with 8+ crossings
    // (8 × 1200 = 9_600) could outscore a semantic violation, causing a port with
    // reversed direction to be selected. 100_000 is a true hard prohibition.
    SEMANTIC_VIOLATION: 100_000,
    GEOMETRIC_INVALID: 15000,
    GEOMETRIC_UNLISTED: 1500,
    PRIMARY_BONUS: -600,          // [TUNE] 降低奖励，防止掩盖交叉惩罚
    DIRECT_BONUS: -1200,          // [TUNE] 同上
    PATH_LENGTH_MULTIPLIER: 3,
    BEND_PENALTY: 800,
    // [FIX] 交叉惩罚从 80 提升到 1200。
    // 每次交叉代价 ≈ 1.5 个弯折，迫使算法主动选择稍长但不交叉的路径。
    // 原来 80 远低于任何路径代价，导致算法完全忽略交叉问题。
    CROSSING_PENALTY: 1200,
    OBSTACLE_HEAVY_PENALTY: 2000000
};


export function evaluatePortCombination(
    sourceNode: NodeRect,
    targetNode: NodeRect,
    sourcePos: Position,
    targetPos: Position,
    obstacles: Rectangle[] | SpatialIndex,
    lineObstacles: LineObstacle[],
    config: PortSelectionConfig,
    dynamicObstacles: Rectangle[] = []
): PortCandidate {
    // DEBUG: Confirm evaluation is running
    //
    const sourceCenter = { x: sourceNode.x + sourceNode.width / 2, y: sourceNode.y + sourceNode.height / 2 };
    const targetCenter = { x: targetNode.x + targetNode.width / 2, y: targetNode.y + targetNode.height / 2 };
    const sharedCenter = {
        x: (sourceCenter.x + targetCenter.x) / 2,
        y: (sourceCenter.y + targetCenter.y) / 2
    };
    const sourcePort = getPortPoint(sourceNode, sourcePos, sharedCenter, config);
    const targetPort = getPortPoint(targetNode, targetPos, sharedCenter, config);

    // Check basic validity
    const isValid = isPortDirectionValid(sourcePort, targetPort, sourcePos, targetPos);

    // Generate probe path
    const probePath = generateProbePath(sourcePort, targetPort, sourcePos, targetPos);

    // Calculate metrics
    const pathLength = calculatePathLength(probePath);
    const bendCount = estimateBendCount(sourcePort, targetPort, sourcePos, targetPos);

    // Check main obstacles
    // [OPTIMIZED] Only mark as BLOCKED if the immediate vicinity of the port is blocked.
    // If an obstacle is in the middle of the path, A* can route around it.
    // We treat mid-path obstacles as a "Detour Cost" rather than a hard invalidation.

    // Helper to get a point at distance D along the segment p0->p1
    const getPointAt = (p0: { x: number, y: number }, p1: { x: number, y: number }, dist: number) => {
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len <= dist) return p1; // Segment shorter than check distance
        return { x: p0.x + (dx / len) * dist, y: p0.y + (dy / len) * dist };
    };

    // [FIX] Filter obstacles that overlap with Source or Target Nodes
    // We do NOT want to mistakenly flag the port as "Blocked" just because the Source/Target node itself is in the obstacle list.
    // const relevantObstacles: Rectangle[] = [];

    // Helper to check if rects match (approximate)
    const isSameRect = (r1: Rectangle, r2: Rectangle) => {
        const c1x = r1.x + r1.width / 2;
        const c1y = r1.y + r1.height / 2;
        const c2x = r2.x + r2.width / 2;
        const c2y = r2.y + r2.height / 2;
        return Math.abs(c1x - c2x) < 10 && Math.abs(c1y - c2y) < 10;
    };

    // Filter Logic: remove source/target nodes from obstacle set to avoid false port-blocked positives.
    // Implementation: query SpatialIndex by probe-path bounds, then filter results with filterSelf.
    // (Actual implementation at obstaclesForCheck assignment below)

    // Defined a custom checker or filter obstacles before passing
    const filterSelf = (obs: Rectangle) => {
        // [FIX] Filter by ID if available (more robust than geometry)
        const obsWithId = obs as Rectangle & { id?: string };
        if (obsWithId.id) {
            if (config.sourceId && obsWithId.id === config.sourceId) return false;
            if (config.targetId && obsWithId.id === config.targetId) return false;
        }
        return !isSameRect(obs, sourceNode) && !isSameRect(obs, targetNode);
    };

    // [OPTIMIZATION] If it's a raw array, filter it. If it's SpatialIndex, we must rely on post-check.
    // However, isPathBlocked takes "Rectangle[] | SpatialIndex".
    // Let's create a specialized isPathBlocked wrapper or just modify isPathBlocked in pathfinding.ts?
    // Modifying pathfinding.ts is risky for global behavior.

    // Better Approach: Query the spatial index for the probe path bounds,
    // filter the results, and pass the FILTERED ARRAY to isPathBlocked.
    // This downgrades performance slightly (Index -> Array) but ensures correctness.

    let obstaclesForCheck: Rectangle[] | SpatialIndex = obstacles;

    if ('query' in obstacles && typeof (obstacles as SpatialIndex).query === 'function') {
        // It is SpatialIndex. query() with a generous bounds to cover the probe path.
        const minX = Math.min(sourcePort.x, targetPort.x) - 100;
        const minY = Math.min(sourcePort.y, targetPort.y) - 100;
        const width = Math.abs(sourcePort.x - targetPort.x) + 200;
        const height = Math.abs(sourcePort.y - targetPort.y) + 200;

        const raw = (obstacles as SpatialIndex).query({ x: minX, y: minY, width, height });
        obstaclesForCheck = raw.filter(filterSelf);
    } else if (Array.isArray(obstacles)) {
        obstaclesForCheck = obstacles.filter(filterSelf);
    }

    const fullPathBlocked = isPathBlocked(probePath, obstaclesForCheck, 10);
    let isBlocked = false;
    let obstaclePenalty = 0;

    if (fullPathBlocked) {
        // Check strict start/end clearance (e.g. 60px from nodes)
        const startCheck = [probePath[0], getPointAt(probePath[0], probePath[1], 10)];
        const endLast = probePath[probePath.length - 1];
        const endPrev = probePath[probePath.length - 2];
        const endCheck = [getPointAt(endLast, endPrev, 10), endLast];

        const startBlocked = isPathBlocked(startCheck, obstaclesForCheck, 5);
        const endBlocked = isPathBlocked(endCheck, obstaclesForCheck, 5);

        if (startBlocked || endBlocked) {
            // [FIX] If nodes are very close (direct connection), allow minor overlap
            const dist = Math.sqrt(Math.pow(targetCenter.x - sourceCenter.x, 2) + Math.pow(targetCenter.y - sourceCenter.y, 2));
            if (dist < 150 && !isPortDirectionValid(sourcePort, targetPort, sourcePos, targetPos) === false) {
                // Soften the blow for short direct paths
                isBlocked = false;
                obstaclePenalty = 5000; // Still penalize, but don't kill it (was IsBlocked=true)
            } else {
                isBlocked = true;
            }
        } else {
            // Path is blocked but not at ports -> Soft Penalty (Detour)
            // [FIX] Reduced from 7000 to 2500. 7000 was so high it forced
            // the router to pick geometrically absurd ports (like Target=Right when approaching from Left)
            // just to avoid a minor mid-path obstacle that A* could easily trace around.
            obstaclePenalty = 2500;
        }
    }

    // [INDUSTRY STANDARD] Strict Directional Penalty
    // Heavily penalize exiting in the opposite direction of the target.
    // This prevents "U-Turn" exits (e.g., Exiting Left to go Right).

    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;
    // absDx and absDy removed as they were unused
    const STRICT_DIRECTION_PENALTY = 3000;
    const WRONG_SIDE_BUFFER = 40; // Only penalize if target is significantly on the other side

    let directionalPenalty = 0;

    // Source Port Penalties
    if (sourcePos === Position.Left && dx > WRONG_SIDE_BUFFER) directionalPenalty += STRICT_DIRECTION_PENALTY;
    if (sourcePos === Position.Right && dx < -WRONG_SIDE_BUFFER) directionalPenalty += STRICT_DIRECTION_PENALTY;
    if (sourcePos === Position.Top && dy > WRONG_SIDE_BUFFER) directionalPenalty += STRICT_DIRECTION_PENALTY;
    if (sourcePos === Position.Bottom && dy < -WRONG_SIDE_BUFFER) directionalPenalty += STRICT_DIRECTION_PENALTY;

    // Target Port Penalties (Entry Direction)
    // We want to enter the face that "looks at" the source.
    // e.g. If Source is Left (dx > 0), we want Target.Left.
    // We penalize the "Back Face" (requiring U-turn around the node).

    // If Source is Right (dx < 0), we approach from Right. Target.Left is the FAR side. BAD.
    if (targetPos === Position.Left && dx < -WRONG_SIDE_BUFFER) directionalPenalty += STRICT_DIRECTION_PENALTY;

    // If Source is Left (dx > 0), we approach from Left. Target.Right is the FAR side. BAD.
    if (targetPos === Position.Right && dx > WRONG_SIDE_BUFFER) directionalPenalty += STRICT_DIRECTION_PENALTY;

    // If Source is Bottom (dy < 0), we approach from Bottom. Target.Top is the FAR side. BAD.
    if (targetPos === Position.Top && dy < -WRONG_SIDE_BUFFER) directionalPenalty += STRICT_DIRECTION_PENALTY;

    // If Source is Top (dy > 0), we approach from Top. Target.Bottom is the FAR side. BAD.
    if (targetPos === Position.Bottom && dy > WRONG_SIDE_BUFFER) directionalPenalty += STRICT_DIRECTION_PENALTY;

    // Check dynamic obstacles (strict padding)
    if (!isBlocked && dynamicObstacles.length > 0) {
        if (isPathBlocked(probePath, dynamicObstacles, 0)) {
            isBlocked = true;
        }
    }

    // [NEW] Check for near-miss obstacles (Buffer Zone)
    // If the path isn't blocked but is within 40px of an obstacle, apply a "crowded" penalty.
    // This discourages ports that are technically valid but visually cramped.
    // Only check for crowding if the path is completely clear.
    // If it's blocked (mid-path), we already applied obstaclePenalty.
    // We don't want to double-penalize as 'Crowded' (which is expensive).
    let isCrowded = false;
    if (!fullPathBlocked) {
        if (isPathBlocked(probePath, obstacles, 40)) {
            isCrowded = true;
        }
    }

    const crossings = countLineCrossings(probePath, lineObstacles);


    // =========================================================================
    // [NEW ARCHITECTURE] Geometry-Based Port Selection with Three-Tier Weights
    // =========================================================================
    // Replaces all scattered Case 1-5 logic with unified geometry classification

    // Step 1: Calculate base cost from path metrics
    let estimatedCost = pathLength * WEIGHT.PATH_LENGTH_MULTIPLIER;
    estimatedCost += bendCount * WEIGHT.BEND_PENALTY;
    estimatedCost += crossings * WEIGHT.CROSSING_PENALTY;
    estimatedCost += directionalPenalty; // Add accumulated directional penalties
    if (isBlocked) estimatedCost += WEIGHT.OBSTACLE_HEAVY_PENALTY;
    else {
        estimatedCost += obstaclePenalty; // Add soft penalty for mid-path obstacles
        // [FIX] The 'isCrowded' penalty was brutally adding 1,000,000 points!
        // This instantly destroyed perfectly valid routes through tight (but unblocked) corridors.
        // Replaced with a modest 1000 penalty to act merely as a tie-breaker.
        if (isCrowded) estimatedCost += 1000;
    }
    if (!isValid) estimatedCost += WEIGHT.GEOMETRIC_INVALID;

    // Step 2: Analyze geometry (independent of layout configuration)
    const nodeCenterDx = (targetNode.x + targetNode.width / 2) - (sourceNode.x + sourceNode.width / 2);
    const nodeCenterDy = (targetNode.y + targetNode.height / 2) - (sourceNode.y + sourceNode.height / 2);

    // [UPDATED] Pass center coordinates for geometry analysis
    // [S4-P11] Also provide bounding boxes for accurate boundary-gap collocated detection
    const geometry: GeometryType = analyzeGeometry(nodeCenterDx, nodeCenterDy, {
        sourceBounds: { x: sourceNode.x, y: sourceNode.y, width: sourceNode.width, height: sourceNode.height },
        targetBounds: { x: targetNode.x, y: targetNode.y, width: targetNode.width, height: targetNode.height },
        sourceSize: { width: sourceNode.width, height: sourceNode.height },
        targetSize: { width: targetNode.width, height: targetNode.height },
    });


    // [UPDATED] Pass layout direction to enforce Strict TB rules if needed
    const portRules = getPortRulesForGeometry(geometry);
    const combination = portCombinationToString(sourcePos, targetPos);

    const isPreferred = (config.preferredSourcePort !== undefined && sourcePos === config.preferredSourcePort) ||
        (config.preferredTargetPort !== undefined && targetPos === config.preferredTargetPort);


    // Step 3: Apply geometry-based port rules (Three-Tier System)
    // [FIX] If Preferred (Consensus), ignore Forbidden status to allow "Forced" ports (e.g. Bus U-turns)
    if (portRules.forbidden.includes(combination) && !isPreferred) {
        // Layer 1: Semantic Violation (e.g., using Top as output in reverse flow)
        estimatedCost += WEIGHT.SEMANTIC_VIOLATION;
    } else if (portRules.preferred.includes(combination)) {
        // Layer 3: Preferred combination bonus
        estimatedCost += WEIGHT.DIRECT_BONUS;

        // [NEW] Primary Bonus
        // If this is the absolute #1 recommendation (index 0), give it an extra boost.
        // This acts as a "Tie Breaker" against shorter paths (e.g., choosing B->T over R->L for Diagonals)
        // [FIX] DO NOT give Primary Bonus to Diagonal geometries. In diagonal setups,
        // let the ACTUAL path metrics (bend count, path length) decide the winner, rather than hardcoding R->L over B->T.
        if (portRules.preferred.indexOf(combination) === 0 && !geometry.startsWith('diagonal')) {
            estimatedCost += WEIGHT.PRIMARY_BONUS;
        }
    } else if (portRules.neutral.includes(combination)) {
        // Neutral: No bonus or penalty
    } else if (!isPreferred) {
        // [NEW] Unlisted Penalty
        // If a combination is NOT Preferred, NOT Forbidden, and NOT Neutral,
        // it means it's an "awkward" or "rare" case for this geometry.
        // We apply a soft penalty safely discourage it without forbidding it entirely.
        estimatedCost += WEIGHT.GEOMETRIC_UNLISTED;
    }

    // =========================================================================
    // [FIX v2] Step 3.5: Same-Side Overshoot Penalty (UNCONDITIONAL)
    // =========================================================================
    // Same-side ports (B→B, T→T, L→L, R→R) create U-turn loops when the
    // node-to-node vector is ALIGNED with the exit direction.
    //
    // This penalty is UNCONDITIONAL — it overrides even "preferred" geometry rules.
    // Physical geometry (where the target actually is) always beats soft rule preferences.
    //
    // Examples:
    //   B→B when dy > 0 : exits bottom → overshoots below target → loops back up → BAD
    //   T→T when dy < 0 : exits top → overshoots above target → loops back down → BAD
    //   R→R when dx > 0 : exits right → overshoots past target right → loops back → BAD
    //   L→L when dx < 0 : exits left → overshoots past target left → loops back → BAD
    //
    // Root cause of: "horizontal-reverse" geometry marking B→B as preferred, but
    // when dy is significant the physical path is a massive detour.
    //
    // Penalty: 50000 — stronger than DIRECT_BONUS+PRIMARY_BONUS combined,
    //          weaker than SEMANTIC_VIOLATION (100,000).
    const SAME_SIDE_OVERSHOOT_PENALTY = 50000;
    const OVERSHOOT_THRESHOLD = 30; // px; ignore negligible offsets

    if (sourcePos === targetPos) {
        let isOvershoot = false;
        if (sourcePos === Position.Bottom && dy > OVERSHOOT_THRESHOLD) isOvershoot = true;
        if (sourcePos === Position.Top    && dy < -OVERSHOOT_THRESHOLD) isOvershoot = true;
        if (sourcePos === Position.Right  && dx > OVERSHOOT_THRESHOLD) isOvershoot = true;
        if (sourcePos === Position.Left   && dx < -OVERSHOOT_THRESHOLD) isOvershoot = true;
        if (isOvershoot) {
            estimatedCost += SAME_SIDE_OVERSHOOT_PENALTY;
        }
    }


    // Neutral combinations: no bonus or penalty (rely on path length)

    // =========================================================================
    // [CORRECTED] Geometry-Based Port Alignment Bonus
    // =========================================================================
    // Previous approach used STATIC layoutDirection config, which was WRONG!
    //
    // CORRECT approach: Use the ACTUAL GEOMETRIC RELATIONSHIP between nodes
    // - If geometry is 'vertical-forward/reverse' -> STRONGLY prefer vertical ports (T/B)
    // - If geometry is 'horizontal-forward/reverse' -> STRONGLY prefer horizontal ports (L/R)
    //
    // This is DYNAMIC and based on ACTUAL node positions, not static config.
    // Weight: -3000 (stronger bonus, ensures geometric consistency)
    // =========================================================================

    const isSourceVerticalPort = sourcePos === Position.Top || sourcePos === Position.Bottom;
    const isTargetVerticalPort = targetPos === Position.Top || targetPos === Position.Bottom;
    const isSourceHorizontalPort = sourcePos === Position.Left || sourcePos === Position.Right;
    const isTargetHorizontalPort = targetPos === Position.Left || targetPos === Position.Right;
    const GEOMETRY_AXIS_BONUS = -1000; // [FIX] Reduced from -2000 to prevent port flapping during diagonal transitions

    // Apply bonus based on ACTUAL geometry (not config)
    if (geometry === 'vertical-forward') {
        // Pure downward flow: STRONGLY prefer vertical ports (Bottom → Top natural flow)
        if (isSourceVerticalPort && isTargetVerticalPort) {
            estimatedCost += GEOMETRY_AXIS_BONUS; // Both ports are vertical
        } else if (isSourceVerticalPort || isTargetVerticalPort) {
            estimatedCost += GEOMETRY_AXIS_BONUS / 2; // One port is vertical
        }
    } else if (geometry === 'vertical-reverse') {
        // Upward flow (back-edge) — prefer based on horizontal offset:
        // If there is significant horizontal displacement, horizontal ports (R->L, L->R)
        // route directly through the open space between nodes.
        // Only give vertical bonus when nodes are mostly stacked (little horizontal offset).
        const absHorizOffset = Math.abs(dx);
        const absVertOffset = Math.abs(dy);
        if (absHorizOffset > absVertOffset * 0.4) {
            // Meaningful horizontal component: prefer horizontal ports
            if (isSourceHorizontalPort && isTargetHorizontalPort) {
                estimatedCost += GEOMETRY_AXIS_BONUS;
            } else if (isSourceHorizontalPort || isTargetHorizontalPort) {
                estimatedCost += GEOMETRY_AXIS_BONUS / 2;
            }
        } else {
            // Mostly vertical: prefer vertical ports (B->T Z-shape)
            if (isSourceVerticalPort && isTargetVerticalPort) {
                estimatedCost += GEOMETRY_AXIS_BONUS;
            } else if (isSourceVerticalPort || isTargetVerticalPort) {
                estimatedCost += GEOMETRY_AXIS_BONUS / 2;
            }
        }
    } else if (geometry === 'horizontal-forward' || geometry === 'horizontal-reverse') {
        // Horizontal geometry: STRONGLY prefer horizontal ports
        if (isSourceHorizontalPort && isTargetHorizontalPort) {
            estimatedCost += GEOMETRY_AXIS_BONUS; // Both ports are horizontal
        } else if (isSourceHorizontalPort || isTargetHorizontalPort) {
            estimatedCost += GEOMETRY_AXIS_BONUS / 2; // One port is horizontal
        }
    }
    // For diagonal geometries, no axis preference (let geometry rules decide)

    // =========================================================================
    // [NEW] Dynamic Aspect Ratio Penalty
    // =========================================================================
    // Even if the geometry classifier says "Diagonal" (because we lowered threshold or it's just on the edge),
    // we want to heavily penalize Cross-Axis ports if the physical layout is clearly dominant in one direction.
    // e.g. If dy=500, dx=100 (Ratio 5:1), we should NOT use Left/Right ports even if they are "valid" L-shapes.

    const absDx = Math.abs(targetNode.x - sourceNode.x); // Approx center diff
    const absDy = Math.abs(targetNode.y - sourceNode.y);
    const ASPECT_RATIO_THRESHOLD = 3.0; // [TUNED] Relaxed from 1.2 to 3.0 to allow L-shapes
    const ASPECT_PENALTY = 1000; // [FIX] Reduced from 2000 to prevent sharp cliffs when ratio crosses threshold

    // [UPDATED] Aspect Ratio Penalty with Layout Awareness
    // We only penalize Cross-Axis ports if they contradict the Global Layout.
    // e.g. In TB layout, we tolerate Wide Horizontal Offsets (dx > dy) without penalizing Vertical ports,
    // because the user likely still wants Top-Down flow.

    let applyHorizontalPenalty = absDy > absDx * ASPECT_RATIO_THRESHOLD;
    let applyVerticalPenalty = absDx > absDy * ASPECT_RATIO_THRESHOLD;

    // Disable Vertical Penalty if we are in TB layout and flowing downward
    if (config.layoutDirection === 'TB' && dy > 0) {
        applyVerticalPenalty = false;
        // [FIX] 仅在顺向流（dy > 0）且比例明显时才强制惩罚水平端口
        // 原来无条件 dy > 100 就打开，导致反向流（Decision→上方节点）的 B->T 也被牵连惩罚
        if (dy > 100 && absDy > absDx * 1.5) applyHorizontalPenalty = true;
    }

    // Disable Horizontal Penalty if we are in LR layout and flowing rightward
    if (config.layoutDirection === 'LR' && dx > 0) {
        applyHorizontalPenalty = false;
    }

    if (applyHorizontalPenalty) {
        // Vertical Dominant -> Penalize Horizontal Ports
        if (isSourceHorizontalPort || isTargetHorizontalPort) {
            estimatedCost += ASPECT_PENALTY;
        }
    } else if (applyVerticalPenalty) {
        // Horizontal Dominant -> Penalize Vertical Ports
        if (isSourceVerticalPort || isTargetVerticalPort) {
            estimatedCost += ASPECT_PENALTY;
        }
    }

    // =========================================================================
    // [NEW] Layout Direction Conformity Bonus
    // =========================================================================
    // Give a slight bonus to ports that respect the global layout direction.
    // This helps break ties or override weak geometric preferences (e.g. slight diagonal).
    // Bonus: -1000 (roughly equivalent to saving ~1.2 bends)

    const LAYOUT_BONUS = -1000; // [FIX] Drastically reduced from -5000! 5000 points equalled 1600px of path length bypass, creating insane route flapping.
    let hasLayoutBonus = false;

    if (config.layoutDirection === 'TB') {
        if (sourcePos === Position.Bottom && dy > 0) {
            estimatedCost += LAYOUT_BONUS;
            hasLayoutBonus = true;
        }
        if (targetPos === Position.Top && dy > 0 && !hasLayoutBonus) {
            estimatedCost += LAYOUT_BONUS;
        }
    } else if (config.layoutDirection === 'LR') {
        if (sourcePos === Position.Right && dx > 0) {
            estimatedCost += LAYOUT_BONUS;
            hasLayoutBonus = true;
        }
        if (targetPos === Position.Left && dx > 0 && !hasLayoutBonus) {
            estimatedCost += LAYOUT_BONUS;
        }
    }

    // =========================================================================
    // [NEW] Weighted Bus/Trunk Preference (Soft Consensus)
    // =========================================================================
    // If the worker suggests a specific port (based on Bus Consensus), give it a strong bonus.
    // This allows it to "win" unless blocked or geometrically invalid.

    // [TUNED] Bonus: -20000.
    // This is strong enough to override "Preferred Geometry" (-3000) but weak enough to yield to "Obstacles" (+2M).
    const CONSENSUS_BONUS = -20000;

    if (config.preferredSourcePort !== undefined && sourcePos === config.preferredSourcePort) {
        estimatedCost += CONSENSUS_BONUS;
    }
    if (config.preferredTargetPort !== undefined && targetPos === config.preferredTargetPort) {
        estimatedCost += CONSENSUS_BONUS;
    }

    // =========================================================================
    // [NEW] Global Channel Ordering Bias
    // =========================================================================
    // If this edge is part of a parallel group (Global Channel), we bias the port selection
    // to match its spatial position. This pre-aligns edges before routing.
    // e.g. Top-most edge in a group should prefer Top ports.

    if (config.globalChannelCount && config.globalChannelCount > 1 && config.globalChannelIndex !== undefined) {
        const index = config.globalChannelIndex;
        const count = config.globalChannelCount;
        const type = config.globalChannelType;
        const normalizedPos = index / (count - 1); // 0.0 (Top/Left) to 1.0 (Bottom/Right)

        const CHANNEL_BIAS = -800; // Moderate bonus to break ties

        if (type === 'horizontal') {
            // Group is stacked vertically (sorted by Y).
            // Low index = Top, High index = Bottom

            // Bias Source Port
            if (normalizedPos < 0.4 && sourcePos === Position.Top) estimatedCost += CHANNEL_BIAS;
            if (normalizedPos > 0.6 && sourcePos === Position.Bottom) estimatedCost += CHANNEL_BIAS;

            // Bias Target Port
            if (normalizedPos < 0.4 && targetPos === Position.Top) estimatedCost += CHANNEL_BIAS;
            if (normalizedPos > 0.6 && targetPos === Position.Bottom) estimatedCost += CHANNEL_BIAS;

        } else if (type === 'vertical') {
            // Group is stacked horizontally (sorted by X).
            // Low index = Left, High index = Right

            // Bias Source Port
            if (normalizedPos < 0.4 && sourcePos === Position.Left) estimatedCost += CHANNEL_BIAS;
            if (normalizedPos > 0.6 && sourcePos === Position.Right) estimatedCost += CHANNEL_BIAS;

            // Bias Target Port
            if (normalizedPos < 0.4 && targetPos === Position.Left) estimatedCost += CHANNEL_BIAS;
            if (normalizedPos > 0.6 && targetPos === Position.Right) estimatedCost += CHANNEL_BIAS;
        }
    }

    // =========================================================================
    // [SMART] Approach-Direction-Aware Port Conflict Resolution
    // =========================================================================
    // Strategy: distinguish between two types of port reuse:
    //
    //   MERGE (same approach direction):
    //     e.g. two edges both coming from above → both enter via Top.
    //     This is GOOD — they bundle naturally. Give a small bonus.
    //
    //   CONFLICT (different approach directions):
    //     e.g. edge from above + edge from left both entering Top.
    //     This is BAD — they collide visually. Apply STRONG penalty.
    //
    // Detection uses approach-direction keys stored by the worker:
    //   "${nodeId}-${portDir}-from-${approachDir}" = count of edges from that direction
    //   "${nodeId}-${portDir}"                      = total count at port
    //
    if (config.portUsage) {
        const portKey = (pos: Position): string => {
            switch (pos) {
                case Position.Top: return 'top';
                case Position.Bottom: return 'bottom';
                case Position.Left: return 'left';
                case Position.Right: return 'right';
            }
        };

        const tPortDir = portKey(targetPos);
        const sPortDir = portKey(sourcePos);

        // ── Approach direction of THIS edge (source center → target center dominant axis) ──
        const absDxCenter = Math.abs(targetCenter.x - sourceCenter.x);
        const absDyCenter = Math.abs(targetCenter.y - sourceCenter.y);
        let myApproachDir: string;
        if (absDxCenter > absDyCenter) {
            myApproachDir = (targetCenter.x - sourceCenter.x) > 0 ? 'right' : 'left';
        } else {
            myApproachDir = (targetCenter.y - sourceCenter.y) > 0 ? 'bottom' : 'top';
        }

        // ── Target port: smart merge/diverge ──
        if (config.targetId) {
            const tTotalKey = `${config.targetId}-${tPortDir}`;
            const tSameDirKey = `${config.targetId}-${tPortDir}-from-${myApproachDir}`;

            const tTotal = config.portUsage[tTotalKey] || 0;
            const tSameDir = config.portUsage[tSameDirKey] || 0;
            const tDiffDir = tTotal - tSameDir; // edges already at this port from OTHER directions

            if (tDiffDir > 0) {
                // CONFLICT: different-direction edges already here → strongly push away
                estimatedCost += 14000 * tDiffDir;
            } else if (tSameDir > 0) {
                // MERGE: same-direction edges → small bundling bonus
                estimatedCost -= 300 * Math.min(tSameDir, 3);
            }
        }

        // ── Source port: mild crowding penalty only ──
        if (config.sourceId) {
            const sTotalKey = `${config.sourceId}-${sPortDir}`;
            const sTotal = config.portUsage[sTotalKey] || 0;
            if (sTotal > 0) {
                estimatedCost += Math.min(sTotal, 3) * 1500;
            }
        }
    }


    // [REMOVED] Legacy layout-based penalties
    //
    // The old code applied a +10 penalty for using "wrong-direction" ports:
    //   if (isVerticalLayout && !isSourceVerticalPort) estimatedCost += 10;
    //
    // This was removed because:
    // 1. Geometry classifier uses much stronger weights (1M for violations, -5k for bonuses)
    // 2. Layout direction should NOT influence port selection at all
    // 3. The +10 penalty was completely dominated by geometry-based rules
    // 4. Violates the design principle: "port selection is purely geometry-based"



    return {
        sourcePos,
        targetPos,
        estimatedCost,
        pathLength,
        bendCount,
        isValid: isValid && !isBlocked,
        debugInfo: {
            geometry,
            combination,
            portRules,
            nodeCenterDx,
            nodeCenterDy,
            sRect: sourceNode,
            tRect: targetNode
        }
    };
}

/**
 * Select optimal port combination for an edge
 *
 * @param sourceNode - Source node rectangle
 * @param targetNode - Target node rectangle
 * @param obstacles - Obstacle rectangles to avoid
 * @param lineObstacles - Existing line segments to avoid
 * @param constraints - [Phase 5] Edge constraints for custom routing behavior
 * @returns Best port combination with confidence score
 */
