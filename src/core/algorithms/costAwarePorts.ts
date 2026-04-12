/**
 * Cost-Aware Port Selection Algorithm
 * 
 * Evaluates all port combinations (16 total: 4 source × 4 target)
 * and selects the optimal pair based on estimated path cost.
 * 
 * This implements industry best practices by considering:
 * - Path length estimation
 * - Bend count (fewer bends = better)
 * - Obstacle proximity penalty
 * - Existing line avoidance
 */

import { Position } from '../types/flow';
import { EdgeConstraint, PortSelectionConfig } from '../types/routing';
import { Rectangle, Point, LineObstacle, isPathBlocked, generateSimplePath as _generateSimplePath } from './pathfinding';
import { SpatialIndex } from './SpatialIndex';
import {
    analyzeGeometry,
    getPortRulesForGeometry,
    portCombinationToString,
    type GeometryType
} from './geometry-classifier';

/**
 * Three-Tier Weight System for Port Selection
 * 
 * Layer 1: SEMANTIC VIOLATIONS (1,000,000+)
 *   - Port direction conflicts (e.g., using Input port as Output)
 *   - These are near-absolute prohibitions
 * 
 * Layer 2: GEOMETRIC PENALTIES (10,000 - 100,000)
 *   - Geometrically unreasonable paths
 *   - Same-side routing in inappropriate contexts
 * 
 * Layer 3: PATH OPTIMIZATION (< 10,000)
 *   - Path length, bends, crossings
 *   - Fine-tuning for best visual result
 */
const WEIGHT = {
    SEMANTIC_VIOLATION: 10000,
    GEOMETRIC_INVALID: 15000,
    GEOMETRIC_UNLISTED: 1500,     // [FIX] Reduced from 2500
    PRIMARY_BONUS: -1000,         // [FIX] Reduced from -1500
    DIRECT_BONUS: -2000,          // [FIX] Reduced from -3500
    PATH_LENGTH_MULTIPLIER: 3,
    BEND_PENALTY: 800,
    CROSSING_PENALTY: 80,
    OBSTACLE_HEAVY_PENALTY: 2000000
};


export interface NodeRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PortCandidate {
    sourcePos: Position;
    targetPos: Position;
    estimatedCost: number;
    pathLength: number;
    bendCount: number;
    isValid: boolean;
    debugInfo?: unknown;
}

// PortSelectionConfig imported from types/routing.ts

const DEFAULT_CONFIG: Required<Omit<PortSelectionConfig, 'portUsage' | 'sourceId' | 'targetId' | 'globalChannelIndex' | 'globalChannelCount' | 'globalChannelType' | 'portUsageData' | 'preferredSourcePort' | 'preferredTargetPort'>> & { portUsage: Record<string, number>, sourceId: string, targetId: string } = {
    bendPenalty: 50,
    obstaclePenalty: 100,
    crossingPenalty: 80,
    layoutDirection: 'TB',

    // Default values for standard config
    bonusCostThreshold: -100,
    lowConfidenceThreshold: 0.2,
    highConfidenceThreshold: 0.8,
    preferGeometryOverBus: true,
    enableObstacleAwareness: true,
    portUsageWeight: 50,

    portUsage: {},
    sourceId: '',
    targetId: '',
    returnAllCandidates: false,
    enableDynamicPorts: true,
    portSlidePadding: 12
};

/**
 * Get the connection point on a node's edge based on position
 */
function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function getPortPoint(node: NodeRect, pos: Position, targetCenter?: Point, config?: Partial<PortSelectionConfig>): Point {
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const enableDynamicPorts = Boolean(config?.enableDynamicPorts && targetCenter);
    const padding = Math.max(0, config?.portSlidePadding ?? 0);
    const minX = node.x + padding;
    const maxX = node.x + node.width - padding;
    const minY = node.y + padding;
    const maxY = node.y + node.height - padding;
    const safeMinX = Math.min(minX, maxX);
    const safeMaxX = Math.max(minX, maxX);
    const safeMinY = Math.min(minY, maxY);
    const safeMaxY = Math.max(minY, maxY);
    const targetX = targetCenter ? targetCenter.x : cx;
    const targetY = targetCenter ? targetCenter.y : cy;

    switch (pos) {
        case Position.Top:
            return {
                x: enableDynamicPorts ? clamp(targetX, safeMinX, safeMaxX) : cx,
                y: node.y
            };
        case Position.Bottom:
            return {
                x: enableDynamicPorts ? clamp(targetX, safeMinX, safeMaxX) : cx,
                y: node.y + node.height
            };
        case Position.Left:
            return {
                x: node.x,
                y: enableDynamicPorts ? clamp(targetY, safeMinY, safeMaxY) : cy
            };
        case Position.Right:
            return {
                x: node.x + node.width,
                y: enableDynamicPorts ? clamp(targetY, safeMinY, safeMaxY) : cy
            };
        default:
            return { x: cx, y: cy };
    }
}

/**
 * Get a stub point offset from the port in the correct direction
 */
function getStubPoint(port: Point, pos: Position, stubLength: number = 30): Point {
    switch (pos) {
        case Position.Top:
            return { x: port.x, y: port.y - stubLength };
        case Position.Bottom:
            return { x: port.x, y: port.y + stubLength };
        case Position.Left:
            return { x: port.x - stubLength, y: port.y };
        case Position.Right:
            return { x: port.x + stubLength, y: port.y };
        default:
            return port;
    }
}

/**
 * Estimate the number of bends in a simple orthogonal path
 */
function estimateBendCount(sourcePort: Point, targetPort: Point, sourcePos: Position, targetPos: Position): number {
    const dx = Math.abs(targetPort.x - sourcePort.x);
    const dy = Math.abs(targetPort.y - sourcePort.y);

    // Aligned ports (straight line possible)
    const isHorizontallyAligned = dy < 10;
    const isVerticallyAligned = dx < 10;

    // Same axis exits (e.g., both horizontal or both vertical)
    const isSourceHorizontal = sourcePos === Position.Left || sourcePos === Position.Right;
    const isTargetHorizontal = targetPos === Position.Left || targetPos === Position.Right;
    const sameAxisType = isSourceHorizontal === isTargetHorizontal;

    // Straight line: 0 bends
    if (isHorizontallyAligned && isSourceHorizontal) return 0;
    if (isVerticallyAligned && !isSourceHorizontal) return 0;

    // L-shape: 1 bend
    if (!sameAxisType) return 1;

    // Z-shape or U-shape: 2+ bends
    if (sameAxisType) {
        // Detect "Backwards" vertical flow (requiring 3 bends)
        if (!isSourceHorizontal) {
            // Bottom -> Top but Target is ABOVE Source (y < y)
            // Path: Down -> Side -> Up -> Down (3 bends)
            if (sourcePos === Position.Bottom && targetPos === Position.Top && targetPort.y < sourcePort.y) return 3;

            // Top -> Bottom but Target is BELOW Source (y > y)
            // Path: Up -> Side -> Down -> Up (3 bends)
            if (sourcePos === Position.Top && targetPos === Position.Bottom && targetPort.y > sourcePort.y) return 3;
        }
    }

    return 2;
}

/**
 * Check if the port direction is geometrically valid
 * Uses dynamic threshold based on distance rather than fixed 50px
 * (i.e., doesn't point away from target in a way that causes excessive detour)
 */
function isPortDirectionValid(sourcePort: Point, targetPort: Point, sourcePos: Position, targetPos: Position): boolean {
    // Same-side routing (C-shape) is always valid - let cost evaluation decide preference
    if (sourcePos === targetPos) return true;

    const dx = targetPort.x - sourcePort.x;
    const dy = targetPort.y - sourcePort.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const directDistance = Math.sqrt(dx * dx + dy * dy);

    // Dynamic threshold: 15% of direct distance, minimum 30px, maximum 100px
    const dynamicThreshold = Math.max(30, Math.min(100, directDistance * 0.15));

    // L-shape detection: significant offset on both axes
    const isLShape = absDx > 40 && absDy > 40;

    // Check source port direction - is it pointing away from target?
    let sourceFacingAway = false;
    switch (sourcePos) {
        case Position.Right:
            sourceFacingAway = dx < -dynamicThreshold;
            break;
        case Position.Left:
            sourceFacingAway = dx > dynamicThreshold;
            break;
        case Position.Bottom:
            sourceFacingAway = dy < -dynamicThreshold;
            break;
        case Position.Top:
            sourceFacingAway = dy > dynamicThreshold;
            break;
    }

    // Check target port direction - is it awkward entry?
    let targetAwkward = false;
    // Dynamic separation threshold for awkward entry check
    const separationThreshold = Math.max(20, directDistance * 0.1);

    switch (targetPos) {
        case Position.Left:
            targetAwkward = dx < 0 && absDy < separationThreshold;
            break;
        case Position.Right:
            targetAwkward = dx > 0 && absDy < separationThreshold;
            break;
        case Position.Top:
            targetAwkward = dy < 0 && absDx < separationThreshold;
            break;
        case Position.Bottom:
            targetAwkward = dy > 0 && absDx < separationThreshold;
            break;
    }

    // For L-shapes, allow cross-axis ports that form valid L routing
    if (isLShape) {
        const isValidLSource =
            (sourcePos === Position.Right && dx > 0) ||
            (sourcePos === Position.Left && dx < 0) ||
            (sourcePos === Position.Bottom && dy > 0) ||
            (sourcePos === Position.Top && dy < 0);

        const isValidLTarget =
            (targetPos === Position.Left && dx > 0) ||
            (targetPos === Position.Right && dx < 0) ||
            (targetPos === Position.Top && dy > 0) ||
            (targetPos === Position.Bottom && dy < 0);

        // L-shape with correct orientation is always valid
        if (isValidLSource && isValidLTarget) return true;
    }

    // Reject only if both source is facing away AND target entry is awkward
    return !(sourceFacingAway && targetAwkward);
}

/**
 * Generate a quick probe path for cost estimation
 */
function generateProbePath(
    sourcePort: Point,
    targetPort: Point,
    sourcePos: Position,
    targetPos: Position,
    stubLength: number = 30
): Point[] {
    const dx = targetPort.x - sourcePort.x;
    const dy = targetPort.y - sourcePort.y;
    const directDist = Math.sqrt(dx * dx + dy * dy);

    // [FIX] Dynamic stub length for close nodes
    // If nodes are very close (< 80px), reduce stub to prevent overlap
    const dynamicStub = Math.max(10, Math.min(stubLength, directDist * 0.25));

    const sourceStub = getStubPoint(sourcePort, sourcePos, dynamicStub);
    const targetStub = getStubPoint(targetPort, targetPos, dynamicStub);

    const isSourceHorizontal = sourcePos === Position.Left || sourcePos === Position.Right;
    const isTargetHorizontal = targetPos === Position.Left || targetPos === Position.Right;

    if (sourcePos === targetPos) {
        if (sourcePos === Position.Right) {
            const outX = Math.max(sourceStub.x, targetStub.x) + 60;
            return [sourcePort, sourceStub, { x: outX, y: sourceStub.y }, { x: outX, y: targetStub.y }, targetStub, targetPort];
        }
        if (sourcePos === Position.Left) {
            const outX = Math.min(sourceStub.x, targetStub.x) - 60;
            return [sourcePort, sourceStub, { x: outX, y: sourceStub.y }, { x: outX, y: targetStub.y }, targetStub, targetPort];
        }
        if (sourcePos === Position.Bottom) {
            const outY = Math.max(sourceStub.y, targetStub.y) + 60;
            return [sourcePort, sourceStub, { x: sourceStub.x, y: outY }, { x: targetStub.x, y: outY }, targetStub, targetPort];
        }
        if (sourcePos === Position.Top) {
            const outY = Math.min(sourceStub.y, targetStub.y) - 60;
            return [sourcePort, sourceStub, { x: sourceStub.x, y: outY }, { x: targetStub.x, y: outY }, targetStub, targetPort];
        }
    }

    // Same axis type: Z-shape or U-shape
    if (isSourceHorizontal === isTargetHorizontal) {
        if (isSourceHorizontal) {
            // Both horizontal: use midpoint X (H-V-H Z-shape)
            // [FIX] Previously swapped with midY. A vertical connecting segment is located at midX.
            const midX = (sourceStub.x + targetStub.x) / 2;
            return [
                sourcePort,
                sourceStub,
                { x: midX, y: sourceStub.y },
                { x: midX, y: targetStub.y },
                targetStub,
                targetPort
            ];
        } else {
            // Both vertical: use midpoint Y (V-H-V Z-shape)
            const midY = (sourceStub.y + targetStub.y) / 2;
            return [
                sourcePort,
                sourceStub,
                { x: sourceStub.x, y: midY },
                { x: targetStub.x, y: midY },
                targetStub,
                targetPort
            ];
        }
    }

    // Different axis type: L-shape
    return [
        sourcePort,
        sourceStub,
        { x: isSourceHorizontal ? sourceStub.x : targetStub.x, y: isSourceHorizontal ? targetStub.y : sourceStub.y },
        targetStub,
        targetPort
    ];
}

/**
 * Calculate Manhattan distance of a path
 */
function calculatePathLength(path: Point[]): number {
    let length = 0;
    for (let i = 0; i < path.length - 1; i++) {
        length += Math.abs(path[i + 1].x - path[i].x) + Math.abs(path[i + 1].y - path[i].y);
    }
    return length;
}

/**
 * Check if path crosses any existing line obstacles
 */
function countLineCrossings(path: Point[], lineObstacles: LineObstacle[]): number {
    let crossings = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i + 1];
        for (const line of lineObstacles) {
            // Simple crossing check using CCW
            const ccw = (a: Point, b: Point, c: Point) =>
                (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
            if (ccw(p1, line.start, line.end) !== ccw(p2, line.start, line.end) &&
                ccw(p1, p2, line.start) !== ccw(p1, p2, line.end)) {
                crossings++;
            }
        }
    }
    return crossings;
}

/**
 * Evaluate a single port combination
 */
function evaluatePortCombination(
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
    // console.log(`[costAware] Evaluating ${sourcePos} -> ${targetPos}`);

    const sourceCenter = { x: sourceNode.x + sourceNode.width / 2, y: sourceNode.y + sourceNode.height / 2 };
    const targetCenter = { x: targetNode.x + targetNode.width / 2, y: targetNode.y + targetNode.height / 2 };
    const sourcePort = getPortPoint(sourceNode, sourcePos, targetCenter, config);
    const targetPort = getPortPoint(targetNode, targetPos, sourceCenter, config);

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

    // Filter Logic
    if ('query' in obstacles && typeof (obstacles as SpatialIndex).query === 'function') {
        // For SpatialIndex, we can't easily filter during query without modifying the tree.
        // Instead, we query and then filter the RESULTS.
        // NOTE: We don't have the full query range here easily without duplicating logic.
        // BUT, we are passing 'obstacles' to isPathBlocked which does the query internally.
        // So we cannot easily intervene unless we wrappers it.
        // ALTERNATIVE: Use a Custom Blocked Check here that ignores specific rects.
    }

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
    const geometry: GeometryType = analyzeGeometry(nodeCenterDx, nodeCenterDy);

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
    if (geometry === 'vertical-forward' || geometry === 'vertical-reverse') {
        // Vertical geometry: STRONGLY prefer vertical ports
        if (isSourceVerticalPort && isTargetVerticalPort) {
            estimatedCost += GEOMETRY_AXIS_BONUS; // Both ports are vertical
        } else if (isSourceVerticalPort || isTargetVerticalPort) {
            estimatedCost += GEOMETRY_AXIS_BONUS / 2; // One port is vertical
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
        // [FORCE] In TB layout, if it's clearly downward, FORCE applyHorizontalPenalty
        if (dy > 100) applyHorizontalPenalty = true;
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

    // [PORT USAGE PENALTY - Moved below layout bonus to maintain priority order]
    // If we have usage data, penalize overused ports to encourage distribution.
    if (config.portUsage) {
        const portKey = (pos: Position) => {
            switch (pos) {
                case Position.Top: return 'top';
                case Position.Bottom: return 'bottom';
                case Position.Left: return 'left';
                case Position.Right: return 'right';
            }
        };

        const sKey = config.sourceId ? `${config.sourceId}-${portKey(sourcePos)}` : portKey(sourcePos);
        const tKey = config.targetId ? `${config.targetId}-${portKey(targetPos)}` : portKey(targetPos);

        // Lookup usage (default to 0)
        // Note: usage keys should be verified to match what the worker sends.
        // The worker sends "sourceId_DIR" or similar?
        // Let's assume the worker sends generic direction usage for the NODE, or specific port usage.
        // The workerPortSelection.ts logic used "top", "bottom" etc.
        // We should check what the worker sends.
        // Assuming the worker maps strictly to "top", "bottom".

        // Actually, config.portUsage in PortSelectionConfig is Record<string, number>.
        // Detailed implementation implies we rely on the specific keys passed by caller.

        const sUsage = config.portUsage[sKey] || config.portUsage[portKey(sourcePos)] || 0;
        const tUsage = config.portUsage[tKey] || config.portUsage[portKey(targetPos)] || 0;

        // [INDUSTRY STANDARD] Scaled/Stepped Penalty for Port Crowding
        // We use a non-linear penalty to ensure hard-clustering is suppressed.
        // Penalty steps:
        // - 1st edge: 0 cost
        // - 2nd edge: 6000 cost (immediately overrides -5000 preferred bonus)
        // - 3rd+ edge: 10000+ cost (highly discourages further reuse)
        const getStepPenalty = (count: number) => {
            if (count === 0) return 0;
            return 6000 + (count - 1) * 4000;
        };

        const usagePenalty = getStepPenalty(sUsage) + getStepPenalty(tUsage);
        if (usagePenalty > 0) {
            estimatedCost += usagePenalty;
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
export function selectOptimalPorts(
    sourceNode: NodeRect,
    targetNode: NodeRect,
    obstacles: Rectangle[] | SpatialIndex,
    lineObstacles: LineObstacle[] = [],
    inputConfig: Partial<PortSelectionConfig> = {},
    dynamicObstacles: Rectangle[] = [], // [NEW]
    constraints?: EdgeConstraint
): { sourcePos: Position; targetPos: Position; confidence: number; estimatedCost: number; allCandidates?: PortCandidate[]; debugInfo?: unknown } {
    const mergedConfig = { ...DEFAULT_CONFIG, ...inputConfig } as PortSelectionConfig; // Cast to PortSelectionConfig

    if (constraints) {
        if (constraints.routingType === 'orthogonal') {
            mergedConfig.bendPenalty = (mergedConfig.bendPenalty || 50) * 2; // Penalize bends heavily
        } else if (constraints.routingType === 'direct') {
            mergedConfig.bendPenalty = 0; // No penalty for bends
        }

        if (constraints.priority < 0) {
            // Background edges: looser obstacle avoidance
            mergedConfig.obstaclePenalty = (mergedConfig.obstaclePenalty || 100) * 0.5;
        }
    }
    const positions = [Position.Top, Position.Bottom, Position.Left, Position.Right];
    const candidates: PortCandidate[] = [];

    // Evaluate all 16 combinations
    for (const sourcePos of positions) {
        for (const targetPos of positions) {
            const candidate = evaluatePortCombination(
                sourceNode,
                targetNode,
                sourcePos,
                targetPos,
                obstacles,
                lineObstacles,
                mergedConfig,
                dynamicObstacles
            );
            candidates.push(candidate);
        }
    }

    // Sort by cost (lowest first)
    candidates.sort((a, b) => a.estimatedCost - b.estimatedCost);

    // Best candidate
    const best = candidates[0];
    const secondBest = candidates[1];

    // Confidence: how much better is best compared to second best
    // Higher ratio = more confident in choice
    const confidence = secondBest
        ? Math.min(1, (secondBest.estimatedCost - best.estimatedCost) / (Math.abs(best.estimatedCost) + 1))
        : 1;




    return {
        sourcePos: best.sourcePos,
        targetPos: best.targetPos,
        confidence,
        estimatedCost: best.estimatedCost,
        allCandidates: mergedConfig.returnAllCandidates ? candidates : undefined,
        debugInfo: best.debugInfo
    };
}

/**
 * Quick port selection using geometric heuristics only
 * (No obstacle checking - faster for initial layout)
 */
export function selectQuickPorts(
    sourceNode: NodeRect,
    targetNode: NodeRect
): { sourcePos: Position; targetPos: Position } {
    const dx = (targetNode.x + targetNode.width / 2) - (sourceNode.x + sourceNode.width / 2);
    const dy = (targetNode.y + targetNode.height / 2) - (sourceNode.y + sourceNode.height / 2);
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Dominant axis determines primary port selection
    if (absDx > absDy * 1.5) {
        // Horizontal dominant
        if (dx > 0) {
            return { sourcePos: Position.Right, targetPos: Position.Left };
        } else {
            return { sourcePos: Position.Left, targetPos: Position.Right };
        }
    } else if (absDy > absDx * 1.5) {
        // Vertical dominant
        if (dy > 0) {
            return { sourcePos: Position.Bottom, targetPos: Position.Top };
        } else {
            return { sourcePos: Position.Top, targetPos: Position.Bottom };
        }
    } else {
        // Roughly diagonal - use L-shape
        if (dx > 0 && dy > 0) {
            return { sourcePos: Position.Bottom, targetPos: Position.Left };
        } else if (dx > 0 && dy < 0) {
            return { sourcePos: Position.Top, targetPos: Position.Left };
        } else if (dx < 0 && dy > 0) {
            return { sourcePos: Position.Bottom, targetPos: Position.Right };
        } else {
            return { sourcePos: Position.Top, targetPos: Position.Right };
        }
    }
}

export default selectOptimalPorts;
