import { Position } from '../types/flow';
import type { Node, Edge } from '@xyflow/react';
import type { Rectangle, Point } from './pathfinding';
import { generateSimplePath, isPathBlocked } from './pathfinding';
import type { SpatialIndex } from './SpatialIndex';


// 辅助: 获取节点绝对坐标以及统一的节点形状
export type NodeLike = {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    measured?: { width?: number; height?: number };
    position?: { x: number; y: number };
    positionAbsolute?: { x: number; y: number };
    computed?: { positionAbsolute?: { x: number; y: number } };
};

export function getNodePosition(node: NodeLike | null | undefined): { x: number, y: number } {
    if (!node) return { x: 0, y: 0 };
    const pos = node.computed?.positionAbsolute || node.positionAbsolute || node.position;
    return {
        x: (pos && typeof pos.x === 'number' && Number.isFinite(pos.x)) ? pos.x : 0,
        y: (pos && typeof pos.y === 'number' && Number.isFinite(pos.y)) ? pos.y : 0
    };
}

export function getCenterFromHandle(x: number, y: number, pos: Position, w: number, h: number): Point {
    switch (pos) {
        case Position.Top: return { x: x, y: y + h / 2 };
        case Position.Bottom: return { x: x, y: y - h / 2 };
        case Position.Left: return { x: x + w / 2, y: y };
        case Position.Right: return { x: x - w / 2, y: y };
        default: return { x: x, y: y };
    }
}

export function getHandleFromCenter(cx: number, cy: number, pos: Position, w: number, h: number): Point {
    switch (pos) {
        case Position.Top: return { x: cx, y: cy - h / 2 };
        case Position.Bottom: return { x: cx, y: cy + h / 2 };
        case Position.Left: return { x: cx - w / 2, y: cy };
        case Position.Right: return { x: cx + w / 2, y: cy };
        default: return { x: cx, y: cy };
    }
}

export function calculateOptimalPositions(
    sourceCenter: Point,
    targetCenter: Point
): { sourcePos: Position, targetPos: Position } {
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    if (angle >= -45 && angle < 45) return { sourcePos: Position.Right, targetPos: Position.Left };
    if (angle >= 45 && angle < 135) return { sourcePos: Position.Bottom, targetPos: Position.Top };
    if (angle >= 135 || angle < -135) return { sourcePos: Position.Left, targetPos: Position.Right };
    return { sourcePos: Position.Top, targetPos: Position.Bottom };
}

export function getPortOffsetPoint(
    portX: number,
    portY: number,
    position: Position,
    offset: number
): Point {
    // [FIX] Ensure minimum offset to prevent inner penetration and guarantee a visible first segment.
    // 40px = 2 grid cells at 20px grid, creating a clean straight stub before any turn.
    const SAFE_MIN_OFFSET = Math.max(offset, 40);

    switch (position) {
        case Position.Top:
            return { x: portX, y: portY - SAFE_MIN_OFFSET };
        case Position.Bottom:
            return { x: portX, y: portY + SAFE_MIN_OFFSET };
        case Position.Left:
            return { x: portX - SAFE_MIN_OFFSET, y: portY };
        case Position.Right:
            return { x: portX + SAFE_MIN_OFFSET, y: portY };
        default:
            return { x: portX, y: portY };
    }
}

export function ensureMinLastSegment(
    points: Point[],
    minLength: number,
    targetPos?: Position // [NEW] Optional target position
): Point[] {
    if (points.length < 2) return points;

    const last = points[points.length - 1]; // Target
    const prev = points[points.length - 2];  // Previous point

    // 1. Determine Ideal Stub Start Point (points BACKWARDS from Target)
    let idealPrev = { ...prev };
    let enforced = false;

    if (targetPos) {
        if (targetPos === Position.Top) {
            idealPrev = { x: last.x, y: last.y - minLength };
            enforced = true;
        } else if (targetPos === Position.Bottom) {
            idealPrev = { x: last.x, y: last.y + minLength };
            enforced = true;
        } else if (targetPos === Position.Left) {
            idealPrev = { x: last.x - minLength, y: last.y };
            enforced = true;
        } else if (targetPos === Position.Right) {
            idealPrev = { x: last.x + minLength, y: last.y };
            enforced = true;
        }
    }

    if (!enforced) {
        const dx = last.x - prev.x;
        const dy = last.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < minLength && len > 0) {
            const ratio = minLength / len;
            idealPrev = { x: last.x - dx * ratio, y: last.y - dy * ratio };
            enforced = true;
        }
    }

    if (enforced) {
        const isIdealVertical = Math.abs(idealPrev.x - last.x) < 0.1;
        const isIdealHorizontal = Math.abs(idealPrev.y - last.y) < 0.1;

        const isCurrentVertical = Math.abs(prev.x - last.x) < 1;
        const isCurrentHorizontal = Math.abs(prev.y - last.y) < 1;

        const directionMismatch = (isIdealVertical && !isCurrentVertical) || (isIdealHorizontal && !isCurrentHorizontal);

        if (directionMismatch) {
            // [STRICT INJECTION]
            return [...points.slice(0, points.length - 1), idealPrev, last];
        } else {
            const currentDist = Math.abs(prev.x - last.x) + Math.abs(prev.y - last.y);
            const idealDist = minLength;

            if (currentDist < idealDist) {
                if (points.length >= 3) {
                    const pp = points[points.length - 3];
                    const newPrev = idealPrev;

                    const isHorizontalBefore = Math.abs(pp.y - prev.y) < 1;
                    const isVerticalBefore = Math.abs(pp.x - prev.x) < 1;

                    const matchesY = Math.abs(pp.y - newPrev.y) < 1;
                    const matchesX = Math.abs(pp.x - newPrev.x) < 1;

                    if ((isHorizontalBefore && matchesY) || (isVerticalBefore && matchesX)) {
                        const newPoints = points.slice(0, points.length - 1);
                        newPoints[newPoints.length - 1] = newPrev;
                        newPoints.push(last);
                        return newPoints;
                    } else {
                        return [...points.slice(0, points.length - 1), idealPrev, last];
                    }
                } else {
                    return [points[0], idealPrev, last];
                }
            }
        }
    }

    return points;
}

/**
 * [NEW] Ensure the first segment (Source Stub) meets a minimum length requirement.
 * This prevents ugly "immediate turns" after exiting a node.
 */
/**
 * [NEW] Ensure the first segment (Source Stub) meets a minimum length requirement.
 * This prevents ugly "immediate turns" after exiting a node.
 * [FIX] Now strictly enforces orthogonality based on Source Port Position.
 */
export function ensureMinFirstSegment(
    points: Point[],
    minLength: number,
    sourcePos?: Position // [NEW] Optional source position
): Point[] {
    if (points.length < 2) return points;

    const p0 = points[0];
    const p1 = points[1];

    // 1. Determine Ideal Stub Point based on Position
    let idealP1 = { ...p1 };
    let enforced = false;

    if (sourcePos) {
        if (sourcePos === Position.Top) {
            idealP1 = { x: p0.x, y: p0.y - minLength };
            enforced = true;
        } else if (sourcePos === Position.Bottom) {
            idealP1 = { x: p0.x, y: p0.y + minLength };
            enforced = true;
        } else if (sourcePos === Position.Left) {
            idealP1 = { x: p0.x - minLength, y: p0.y };
            enforced = true;
        } else if (sourcePos === Position.Right) {
            idealP1 = { x: p0.x + minLength, y: p0.y };
            enforced = true;
        }
    }

    if (!enforced) {
        // Fallback to existing logic: extend current vector
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < minLength && len > 0) {
            const ratio = minLength / len;
            idealP1 = { x: p0.x + dx * ratio, y: p0.y + dy * ratio };
            enforced = true;
        }
    }

    if (enforced) {
        // Check if current p1 respects the ideal direction
        // "Respects" means it is on the ray from p0 through idealP1.
        // Simplified: Check if p1 aligns with idealP1's axis.

        const isIdealVertical = Math.abs(idealP1.x - p0.x) < 0.1;
        const isIdealHorizontal = Math.abs(idealP1.y - p0.y) < 0.1;

        const isCurrentVertical = Math.abs(p1.x - p0.x) < 1;
        const isCurrentHorizontal = Math.abs(p1.y - p0.y) < 1;

        // If direction is MISMATCH (e.g. ideal is Vert, current is Horiz), we MUST insert idealP1.
        const directionMismatch = (isIdealVertical && !isCurrentVertical) || (isIdealHorizontal && !isCurrentHorizontal);

        // Also check if p1 is "behind" the stub (too short).
        // If aligned, we just move p1. If mismatch, we insert.

        if (directionMismatch) {
            // [STRICT INJECTION]
            // The line is going the wrong way!
            // Force it to go to idealP1 first, then to p1.
            // p0 -> idealP1 -> p1 ...
            return [p0, idealP1, ...points.slice(1)];
        } else {
            // Directions align. Check length.
            // If p1 is closer than idealP1, extend it.
            // Dist checks:
            const currentDist = Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y); // Manhattan is fine since aligned
            const idealDist = minLength; // approximate

            if (currentDist < idealDist) {
                // Extend p1 to idealP1
                // BUT: Check orthogonality with p2.
                if (points.length >= 3) {
                    const p2 = points[2];
                    const newP1 = idealP1;

                    const isHorizontalNext = Math.abs(p1.y - p2.y) < 1;
                    const isVerticalNext = Math.abs(p1.x - p2.x) < 1;
                    const matchesY = Math.abs(newP1.y - p2.y) < 1;
                    const matchesX = Math.abs(newP1.x - p2.x) < 1;

                    if ((isHorizontalNext && matchesY) || (isVerticalNext && matchesX)) {
                        // Safe to slide
                        const newPoints = [...points];
                        newPoints[1] = newP1;
                        return newPoints;
                    } else {
                        // Extension breaks next segment alignment. Insert Jog?
                        // Or simply Insert idealP1?
                        // If we insert idealP1, we get p0->idealP1->p1->p2
                        // where p1 aligns with idealP1 now? No, p1 was short.
                        // Effectively we are sliding p1 to idealP1.
                        // If that breaks p1->p2, we need intermediate points.

                        // Simpler: Just INSERT idealP1.
                        // p0 (start) -> idealP1 (stub end) -> p1 (old short point) -> ...
                        // If p1 was on the line, this is just p0 -> idealP1 -> p2 (if p1==idealP1)
                        // But p1 might be p2.

                        // To avoid complexity: Always INSERT if extend is unsafe.
                        return [p0, idealP1, ...points.slice(1)];
                    }
                } else {
                    return [p0, idealP1, p1];
                }
            }
        }
    }

    return points;
}

/**
 * Convert points array to SVG Path string
 */
export function getSVGPath(points: Point[]): string {
    if (!points || points.length === 0) return "";
    return "M " + points.map(p => `${p.x} ${p.y}`).join(" L ");
}

/**
 * [NEW] 路径简化：消除"阶梯"形状 (Collision Aware)
 * 1. 移除共线点
 * 2. 合并短段
 * 3. 确保合并后的线段不穿过障碍物
 */
export function simplifyPath(
    points: Point[],
    minSegment: number = 20,
    obstacles: Rectangle[] | SpatialIndex = [],
    options?: { sourcePos?: Position, targetPos?: Position }
): Point[] {
    if (points.length < 3) return points;

    // 第一步：移除共线点 (Safe)
    const removeCollinear = (pts: Point[]): Point[] => {
        if (pts.length < 3) return pts;
        const result: Point[] = [pts[0]];

        for (let i = 1; i < pts.length - 1; i++) {
            const prev = result[result.length - 1];
            const curr = pts[i];
            const next = pts[i + 1];

            // 检查是否共线
            const dx1 = curr.x - prev.x;
            const dy1 = curr.y - prev.y;
            const dx2 = next.x - curr.x;
            const dy2 = next.y - curr.y;

            const bothHorizontal = Math.abs(dy1) < 1 && Math.abs(dy2) < 1;
            const bothVertical = Math.abs(dx1) < 1 && Math.abs(dx2) < 1;

            if (!bothHorizontal && !bothVertical) {
                result.push(curr);
            }
            // 如果共线，理论上可以直接跳过 curr。
            // 但如果这是 "Endpoint - Stub - Next" 的情况，跳过 Stub 可能会导致斜线？
            // 不，如果 prev-curr-next 共线，跳过 curr 仍然是直线的。
        }
        result.push(pts[pts.length - 1]);
        return result;
    };

    // 第二步：合并短段 (Obstacle Aware)
    const mergeShortSegments = (pts: Point[]): Point[] => {
        if (pts.length < 4) return pts;
        const result: Point[] = [pts[0]];

        for (let i = 1; i < pts.length - 1; i++) {
            const prev = result[result.length - 1];
            const curr = pts[i];
            const next = pts[i + 1];

            const dx = curr.x - prev.x;
            const dy = curr.y - prev.y;
            const segLen = Math.sqrt(dx * dx + dy * dy);

            // 如果当前段很短，尝试跳过这个点
            if (segLen < minSegment && i < pts.length - 2) {
                const canMergeHorizontally = Math.abs(prev.y - next.y) < 1;
                const canMergeVertically = Math.abs(prev.x - next.x) < 1;

                let isPortViolation = false;

                // [FIX] Ensure we don't violate Source Port Direction
                if (i === 1 && options?.sourcePos) {
                    const isSourceVert = options.sourcePos === Position.Top || options.sourcePos === Position.Bottom;
                    const isSourceHoriz = options.sourcePos === Position.Left || options.sourcePos === Position.Right;

                    if (isSourceVert && canMergeHorizontally) {
                        isPortViolation = true;
                    } else if (isSourceHoriz && canMergeVertically) {
                        isPortViolation = true;
                    }
                }

                // [FIX] Ensure we don't violate Target Port Direction
                // Target is affected when i is the second to last point (pts.length - 3 before pushing, but wait)
                if (!isPortViolation && (i >= pts.length - 3) && options?.targetPos) {
                    const isTargetVert = options.targetPos === Position.Top || options.targetPos === Position.Bottom;
                    const isTargetHoriz = options.targetPos === Position.Left || options.targetPos === Position.Right;

                    if (isTargetVert && canMergeHorizontally) {
                        isPortViolation = true;
                    } else if (isTargetHoriz && canMergeVertically) {
                        isPortViolation = true;
                    }
                }

                if (!isPortViolation && (canMergeHorizontally || canMergeVertically)) {
                    // We must check if the extension hits an obstacle.
                    if (!isPathBlocked([prev, next], obstacles, 20)) {
                        continue; // Safe to merge (skip curr)
                    }
                }
            }
            result.push(curr);
        }
        result.push(pts[pts.length - 1]);
        return result;
    };

    let simplified = removeCollinear(points);
    // [FIX] Pass obstacles to mergeShortSegments
    simplified = mergeShortSegments(simplified);
    simplified = removeCollinear(simplified);

    return simplified;
}

export function getIntersection(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
    const isHorizontal1 = Math.abs(p1.y - p2.y) < 0.1;
    const isVertical1 = Math.abs(p1.x - p2.x) < 0.1;
    const isHorizontal2 = Math.abs(p3.y - p4.y) < 0.1;
    const isVertical2 = Math.abs(p3.x - p4.x) < 0.1;

    if (isHorizontal1 && isVertical2) {
        const x = p3.x;
        const y = p1.y;
        if (x > Math.min(p1.x, p2.x) && x < Math.max(p1.x, p2.x) &&
            y > Math.min(p3.y, p4.y) && y < Math.max(p3.y, p4.y)) {
            return { x, y };
        }
    } else if (isVertical1 && isHorizontal2) {
        const x = p1.x;
        const y = p3.y;
        if (y > Math.min(p1.y, p2.y) && y < Math.max(p1.y, p2.y) &&
            x > Math.min(p3.x, p4.x) && x < Math.max(p3.x, p4.x)) {
            return { x, y };
        }
    }

    return null;
}

// 获取当前路径上所有的线跳点
export function getJumpPoints(
    p1: Point,
    p2: Point,
    allOtherEdges: Edge[],
    nodes: Node[],
    currentEdgeId: string,
    config: { sourceOffset: number, targetOffset: number }
): Point[] {
    const jumps: Point[] = [];

    if (Math.abs(p1.x - p2.x) < 0.1) {
        for (const edge of allOtherEdges) {
            if (edge.id === currentEdgeId) continue;

            const sNode = nodes.find(n => n.id === edge.source);
            const tNode = nodes.find(n => n.id === edge.target);
            if (!sNode || !tNode) continue;

            const sw = sNode.measured?.width || 150;
            const sh = sNode.measured?.height || 80;
            const tw = tNode.measured?.width || 150;
            const th = tNode.measured?.height || 80;

            const sPos = getNodePosition(sNode);
            const tPos = getNodePosition(tNode);

            const sCenterRobust = { x: sPos.x + sw / 2, y: sPos.y + sh / 2 };
            const tCenterRobust = { x: tPos.x + tw / 2, y: tPos.y + th / 2 };

            const optimal = calculateOptimalPositions(sCenterRobust, tCenterRobust);

            const start = getHandleFromCenter(sCenterRobust.x, sCenterRobust.y, optimal.sourcePos, sw, sh);
            const end = getHandleFromCenter(tCenterRobust.x, tCenterRobust.y, optimal.targetPos, tw, th);

            const startWithOffset = getPortOffsetPoint(start.x, start.y, optimal.sourcePos, config.sourceOffset);
            const endWithOffset = getPortOffsetPoint(end.x, end.y, optimal.targetPos, config.targetOffset);

            const padding = 10;
            const specificObstacles = nodes
                .filter(n => n.id !== edge.source && n.id !== edge.target)
                .map(n => {
                    const pos = getNodePosition(n);
                    return {
                        x: pos.x - padding,
                        y: pos.y - padding,
                        width: (n.measured?.width || 150) + padding * 2,
                        height: (n.measured?.height || 80) + padding * 2
                    };
                });

            const otherPath = generateSimplePath(startWithOffset, endWithOffset, specificObstacles);

            if (otherPath) {
                const fullPoints = [start, startWithOffset, ...otherPath, endWithOffset, end];

                for (let i = 0; i < fullPoints.length - 1; i++) {
                    const op1 = fullPoints[i];
                    const op2 = fullPoints[i + 1];
                    if (Math.abs(op1.y - op2.y) < 0.1) {
                        const intersection = getIntersection(p1, p2, op1, op2);
                        if (intersection) {
                            jumps.push(intersection);
                        }
                    }
                }
            }
        }
    }

    jumps.sort((a, b) => {
        if (p1.y < p2.y) return a.y - b.y;
        return b.y - a.y;
    });

    const uniqueJumps: Point[] = [];
    if (jumps.length > 0) {
        uniqueJumps.push(jumps[0]);
        for (let i = 1; i < jumps.length; i++) {
            if (Math.abs(jumps[i].y - jumps[i - 1].y) > 2) {
                uniqueJumps.push(jumps[i]);
            }
        }
    }

    return uniqueJumps;
}

export function preventEndpointCollinearBacktrack(points: Point[]) {
    if (points.length < 3) return points;
    const res = points.map(p => ({ x: p.x, y: p.y }));

    // Fix Source Backtrack: s0 -> s1 -> s2
    // If s1 is going the wrong way, snap it to s0 to eliminate the segment
    const s0 = res[0];
    const s1 = res[1];
    const s2 = res[2];

    const sHoriz = Math.abs(s0.y - s1.y) < 1 && Math.abs(s1.y - s2.y) < 1;
    const sVert = Math.abs(s0.x - s1.x) < 1 && Math.abs(s1.x - s2.x) < 1;

    if (sHoriz) {
        const dx1 = s1.x - s0.x;
        const dx2 = s2.x - s1.x;
        if (dx1 * dx2 < -0.1) {
            // s1 is a overshoot. Move s1 to s0 or s2?
            // Better to move s1 to s0 to keep the path starting at s0.
            s1.x = s0.x;
        }
    } else if (sVert) {
        const dy1 = s1.y - s0.y;
        const dy2 = s2.y - s1.y;
        if (dy1 * dy2 < -0.1) {
            s1.y = s0.y;
        }
    }

    // Fix Target Backtrack: t2 -> t1 -> t0
    const n = res.length;
    const t0 = res[n - 1];
    const t1 = res[n - 2];
    const t2 = res[n - 3];

    const tHoriz = Math.abs(t0.y - t1.y) < 1 && Math.abs(t1.y - t2.y) < 1;
    const tVert = Math.abs(t0.x - t1.x) < 1 && Math.abs(t1.x - t2.x) < 1;

    if (tHoriz) {
        const dx1 = t0.x - t1.x; // segment t1 -> t0
        const dx2 = t1.x - t2.x; // segment t2 -> t1
        if (dx1 * dx2 < -0.1) {
            // t1 is overshoot. Snap t1 to t0.
            t1.x = t0.x;
        }
    } else if (tVert) {
        const dy1 = t0.y - t1.y;
        const dy2 = t1.y - t2.y;
        if (dy1 * dy2 < -0.1) {
            t1.y = t0.y;
        }
    }

    return res;
}

/**
 * [VISUAL] Remove Large Directional Backtracks
 *
 * Detects and eliminates "先走错方向再折回" patterns in orthogonal paths.
 * Example: Source(right) → goes LEFT → turns → goes RIGHT/DOWN → Target
 *
 * ORTHOGONAL SAFETY: Only applies a shortcut when the generated corner is
 * provably compatible with the incoming and outgoing segment directions.
 *
 *   If pts[i-1]→A is H → A→corner must be V → use corner {A.x, B.y}  (corner1)
 *   If pts[i-1]→A is V → A→corner must be H → use corner {B.x, A.y}  (corner2)
 *   AND corner→B must also be perpendicular to B→pts[returnIdx+1].
 *
 * If no corner satisfies both constraints, the backtrack is left unchanged.
 *
 * @param threshold  Minimum backward distance to trigger (default 60px)
 */
