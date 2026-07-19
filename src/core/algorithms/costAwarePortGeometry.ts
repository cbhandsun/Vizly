import { Position } from '../types/flow';
import type { PortSelectionConfig } from '../types/routing';
import type { LineObstacle, Point } from './pathfinding';
import type { NodeRect } from './costAwarePortTypes';

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function getPortPoint(node: NodeRect, pos: Position, targetCenter?: Point, config?: Partial<PortSelectionConfig>): Point {
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
export function estimateBendCount(sourcePort: Point, targetPort: Point, sourcePos: Position, targetPos: Position): number {
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

    // Same-side ports (C/U-shape): always 3 bends regardless of direction.
    // e.g. Bottom→Bottom, Top→Top, Left→Left, Right→Right
    // These require: exit stub → side bypass → re-entry stub → final approach
    if (sourcePos === targetPos) return 3;

    // Z-shape or backward-flow: 2+ bends
    if (sameAxisType) {
        if (!isSourceHorizontal) {
            // Bottom → Top but target is ABOVE source: U-turn, 3 bends
            if (sourcePos === Position.Bottom && targetPos === Position.Top && targetPort.y < sourcePort.y) return 3;
            // Top → Bottom but target is BELOW source: U-turn, 3 bends
            if (sourcePos === Position.Top && targetPos === Position.Bottom && targetPort.y > sourcePort.y) return 3;
        } else {
            // Right → Left but target is to the LEFT of source: U-turn, 3 bends
            if (sourcePos === Position.Right && targetPos === Position.Left && targetPort.x < sourcePort.x) return 3;
            // Left → Right but target is to the RIGHT of source: U-turn, 3 bends
            if (sourcePos === Position.Left && targetPos === Position.Right && targetPort.x > sourcePort.x) return 3;
        }
    }

    return 2;
}


/**
 * Check if the port direction is geometrically valid
 * Uses dynamic threshold based on distance rather than fixed 50px
 * (i.e., doesn't point away from target in a way that causes excessive detour)
 */
export function isPortDirectionValid(sourcePort: Point, targetPort: Point, sourcePos: Position, targetPos: Position): boolean {
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
export function generateProbePath(
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
export function calculatePathLength(path: Point[]): number {
    let length = 0;
    for (let i = 0; i < path.length - 1; i++) {
        length += Math.abs(path[i + 1].x - path[i].x) + Math.abs(path[i + 1].y - path[i].y);
    }
    return length;
}

/**
 * Check if path crosses any existing line obstacles
 */
export function countLineCrossings(path: Point[], lineObstacles: LineObstacle[]): number {
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
