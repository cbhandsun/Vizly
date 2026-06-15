import { Position } from '../types/flow';
import type { PortSelectionConfig } from '../types/routing';
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

/**
 * [NEW] trySimplify4PointCShape
 *
 * removeLargeBacktrack 要求 ≥5 个点才触发，无法处理 4 点 C 形路径。
 * 本函数专门检测 4 点路径是否形成 C 形绕路（side-trip），
 * 并尝试用 3 点 L 形路径替代，条件：直线区间不被障碍物阻挡。
 *
 * 典型 C 形场景（bottom→top，vertical-forward）：
 *   P0(src.bottom) → P1(left of src) → P2(left of tgt) → P3(tgt.top)
 * 期望简化为：
 *   P0 → corner{P0.x, P3.y} → P3   (L 形，两段)
 */
export function trySimplify4PointCShape(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex = [],
    _options?: { sourcePos?: Position; targetPos?: Position }
): Point[] {
    if (points.length !== 4) return points;

    const [P0, P1, P2, P3] = points;

    // 判断是否为 C 形：中间两点相对 src→dst 方向存在侧向偏移
    const totalDx = P3.x - P0.x;
    const totalDy = P3.y - P0.y;
    const isMainVertical = Math.abs(totalDy) >= Math.abs(totalDx);

    // 只处理有明确主方向的情况（≥1.5:1 比例）
    if (isMainVertical && Math.abs(totalDy) < Math.abs(totalDx) * 1.5) return points;
    if (!isMainVertical && Math.abs(totalDx) < Math.abs(totalDy) * 1.5) return points;

    const isBlocked = (a: Point, b: Point): boolean => {
        const rects = Array.isArray(obstacles) ? (obstacles as Rectangle[]) : [];
        const CLEAR = 6;
        const minX = Math.min(a.x, b.x) - CLEAR;
        const maxX = Math.max(a.x, b.x) + CLEAR;
        const minY = Math.min(a.y, b.y) - CLEAR;
        const maxY = Math.max(a.y, b.y) + CLEAR;
        return rects.some(obs =>
            obs.x < maxX && obs.x + obs.width > minX &&
            obs.y < maxY && obs.y + obs.height > minY
        );
    };

    // 尝试 L 形路径：P0 → corner → P3（两种转角方向）
    // corner1: 先水平后垂直 {P3.x, P0.y}
    // corner2: 先垂直后水平 {P0.x, P3.y}
    const corner1 = { x: P3.x, y: P0.y };
    const corner2 = { x: P0.x, y: P3.y };

    // 计算原始路径长度
    const origLen =
        Math.abs(P1.x - P0.x) + Math.abs(P1.y - P0.y) +
        Math.abs(P2.x - P1.x) + Math.abs(P2.y - P1.y) +
        Math.abs(P3.x - P2.x) + Math.abs(P3.y - P2.y);

    // 尝试 corner2 (先垂直) —— 对 bottom→top 的 vertical-forward 更自然
    const len2 = Math.abs(corner2.x - P0.x) + Math.abs(corner2.y - P0.y) +
                 Math.abs(P3.x - corner2.x) + Math.abs(P3.y - corner2.y);
    if (len2 < origLen - 5 && !isBlocked(P0, corner2) && !isBlocked(corner2, P3)) {
        return [P0, corner2, P3];
    }

    // 尝试 corner1 (先水平)
    const len1 = Math.abs(corner1.x - P0.x) + Math.abs(corner1.y - P0.y) +
                 Math.abs(P3.x - corner1.x) + Math.abs(P3.y - corner1.y);
    if (len1 < origLen - 5 && !isBlocked(P0, corner1) && !isBlocked(corner1, P3)) {
        return [P0, corner1, P3];
    }

    // 尝试直线（两点完全对齐时）
    const directLen = Math.abs(P3.x - P0.x) + Math.abs(P3.y - P0.y);
    if (directLen < origLen - 5 && !isBlocked(P0, P3)) {
        return [P0, P3];
    }

    return points;
}

/**
 * [NEW] removeCrossAxisDetour
 *
 * 检测并修复"交叉轴 C 形绕路"——路径在非主方向先偏向错误一侧再折回。
 *
 * 典型场景（loms→visibility）：
 *   (1064,652) → (1064,718) → (902,718) → (902,1416) → (1434,1416) → (1434,1540)
 *   整体 dx=+370（向右），但路径先向左(1064→902)再向右(902→1434)，多走了 1064px。
 *
 * 修复策略：找到交叉轴的反向偏移段 (A→B)，尝试镜像到目标侧 (A→B')。
 * 如果镜像路径不穿过障碍物，则替换。
 *
 * 条件约束：
 * - 仅对 ≥5 点的路径生效
 * - 反向偏移量须 > 50px (避免误触小调整)
 * - 替代路径须不穿过障碍物
 */
/**
 * straightenMicroOffset
 * 
 * 当路径的起点和终点在某一轴上"几乎对齐"时（偏移 < maxOffset），
 * 将路径拉直为两点直线。解决 wms→wcs 类型的渐变偏移 S 弯。
 * 
 * 例如：(191,930)→(191,1045)→(186,1050)→(181,1090)
 * dx=10, dy=160 → 几乎垂直对齐 → 拉直为 (186,930)→(186,1090)
 */
export function straightenMicroOffset(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex = [],
    maxOffset: number = 15
): Point[] {
    if (points.length < 3) return points;

    const src = points[0];
    const dst = points[points.length - 1];
    const dx = Math.abs(dst.x - src.x);
    const dy = Math.abs(dst.y - src.y);

    const rects = Array.isArray(obstacles) ? (obstacles as Rectangle[]) : [];
    const isBlocked = (a: Point, b: Point): boolean => {
        const CLEAR = 4;
        const minX = Math.min(a.x, b.x) - CLEAR;
        const maxX = Math.max(a.x, b.x) + CLEAR;
        const minY = Math.min(a.y, b.y) - CLEAR;
        const maxY = Math.max(a.y, b.y) + CLEAR;
        return rects.some(obs =>
            obs.x < maxX && obs.x + obs.width > minX &&
            obs.y < maxY && obs.y + obs.height > minY
        );
    };

    // Nearly vertical alignment: small dx, large dy
    if (dx < maxOffset && dy > dx * 3) {
        const midX = Math.round((src.x + dst.x) / 2);
        const a = { x: midX, y: src.y };
        const b = { x: midX, y: dst.y };
        if (!isBlocked(a, b)) {
            return [a, b];
        }
    }

    // Nearly horizontal alignment: small dy, large dx
    if (dy < maxOffset && dx > dy * 3) {
        const midY = Math.round((src.y + dst.y) / 2);
        const a = { x: src.x, y: midY };
        const b = { x: dst.x, y: midY };
        if (!isBlocked(a, b)) {
            return [a, b];
        }
    }

    return points;
}

export function straightenAlignedLocalDogleg(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex = [],
    options?: { sourcePos?: Position; targetPos?: Position },
    maxLateralSpread: number = 72
): Point[] {
    if (points.length < 4) return points;

    const src = points[0];
    const dst = points[points.length - 1];
    const nearlyVertical = Math.abs(src.x - dst.x) <= 1;
    const nearlyHorizontal = Math.abs(src.y - dst.y) <= 1;
    if (!nearlyVertical && !nearlyHorizontal) return points;

    if (nearlyVertical) {
        const sourceNeedsVertical = !options?.sourcePos || options.sourcePos === Position.Top || options.sourcePos === Position.Bottom;
        const targetNeedsVertical = !options?.targetPos || options.targetPos === Position.Top || options.targetPos === Position.Bottom;
        if (!sourceNeedsVertical || !targetNeedsVertical) return points;
    }
    if (nearlyHorizontal) {
        const sourceNeedsHorizontal = !options?.sourcePos || options.sourcePos === Position.Left || options.sourcePos === Position.Right;
        const targetNeedsHorizontal = !options?.targetPos || options.targetPos === Position.Left || options.targetPos === Position.Right;
        if (!sourceNeedsHorizontal || !targetNeedsHorizontal) return points;
    }

    const currentLength = points.slice(0, -1).reduce((sum, point, index) => {
        const next = points[index + 1];
        return sum + Math.abs(next.x - point.x) + Math.abs(next.y - point.y);
    }, 0);
    const directLength = Math.max(1, Math.abs(dst.x - src.x) + Math.abs(dst.y - src.y));
    const lateralSpread = nearlyVertical
        ? Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x))
        : Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y));
    if (lateralSpread < 16 || lateralSpread > maxLateralSpread) return points;
    if (currentLength / directLength < 1.15 || currentLength - directLength < 24) return points;

    const direct = nearlyVertical
        ? [{ ...src }, { x: src.x, y: dst.y }]
        : [{ ...src }, { x: dst.x, y: src.y }];

    const rects = Array.isArray(obstacles)
        ? obstacles.map(obs => ({ x: obs.x, y: obs.y, width: obs.width, height: obs.height }))
        : typeof (obstacles as any).getAll === 'function'
            ? (obstacles as any).getAll().map((obs: any) => ({ x: obs.x, y: obs.y, width: obs.width, height: obs.height }))
            : [];

    if (isPathBlocked(direct, rects, -1)) return points;
    return direct;
}

export function removeCrossAxisDetour(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex = [],
    _options?: { sourcePos?: Position; targetPos?: Position }
): Point[] {
    if (points.length < 5) return points;

    const src = points[0];
    const dst = points[points.length - 1];
    const totalDx = dst.x - src.x;
    const totalDy = dst.y - src.y;
    const isMainVertical = Math.abs(totalDy) >= Math.abs(totalDx);

    // 主方向上的 cross-axis
    const crossSign = isMainVertical
        ? (totalDx > 0 ? 1 : totalDx < 0 ? -1 : 0) // x 方向
        : (totalDy > 0 ? 1 : totalDy < 0 ? -1 : 0); // y 方向

    if (crossSign === 0) return points; // 交叉轴无偏移

    const crossCoord = (p: Point) => isMainVertical ? p.x : p.y;
    const mainCoord = (p: Point) => isMainVertical ? p.y : p.x;

    const rects = Array.isArray(obstacles)
        ? obstacles.map(obs => ({ x: obs.x, y: obs.y, width: obs.width, height: obs.height }))
        : typeof (obstacles as any).getAll === 'function' ? (obstacles as any).getAll().map((obs: any) => ({ x: obs.x, y: obs.y, width: obs.width, height: obs.height })) : [];

    const isBlocked = (a: Point, b: Point): boolean => {
        const CLEAR = 8;
        const minX = Math.min(a.x, b.x) - CLEAR;
        const maxX = Math.max(a.x, b.x) + CLEAR;
        const minY = Math.min(a.y, b.y) - CLEAR;
        const maxY = Math.max(a.y, b.y) + CLEAR;
        return rects.some((obs: any) =>
            obs.x < maxX && obs.x + obs.width > minX &&
            obs.y < maxY && obs.y + obs.height > minY
        );
    };

    // 扫描路径，找到第一个 cross-axis 反向偏移段
    for (let i = 0; i < points.length - 1; i++) {
        const segCross = crossCoord(points[i + 1]) - crossCoord(points[i]);
        // 检查是否反向（相对于整体 cross 方向）
        if (segCross * crossSign >= 0) continue; // 同向或零，跳过
        if (Math.abs(segCross) < 50) continue; // 太小，不处理

        // 找到反向偏移段 i→i+1
        // 找到这个偏移"恢复"的位置（路径回到起始 cross 位置的点）
        const startCross = crossCoord(points[i]);
        let returnIdx = -1;
        for (let j = i + 2; j < points.length; j++) {
            // 当路径回到或超过 startCross 时
            if ((crossCoord(points[j]) - startCross) * crossSign >= 0) {
                returnIdx = j;
                break;
            }
        }
        if (returnIdx < 0) continue;

        // 尝试 shortcut: 把 points[i]→...→points[returnIdx] 替换为直连
        const A = points[i];
        const B = points[returnIdx];

        // 生成正交 shortcut: A → corner → B
        const corner1 = { x: A.x, y: B.y };
        const corner2 = { x: B.x, y: A.y };

        // 优先选择不破坏正交性的拐角
        const prevIsH = i > 0 ? Math.abs(points[i - 1].y - A.y) < 2 : false;
        const prevIsV = i > 0 ? Math.abs(points[i - 1].x - A.x) < 2 : false;
        const nextIsH = returnIdx < points.length - 1 ? Math.abs(B.y - points[returnIdx + 1].y) < 2 : false;
        const nextIsV = returnIdx < points.length - 1 ? Math.abs(B.x - points[returnIdx + 1].x) < 2 : false;

        // corner1 {A.x, B.y}: A→corner1 竖直, corner1→B 水平
        // 需要 incoming 到 A 是水平 (prevIsH) 且 outgoing 从 B 是竖直 (nextIsV)
        const c1ok = prevIsV && nextIsH;
        const c2ok = prevIsH && nextIsV;

        // 计算 shortcut 长度
        const origLen = (() => {
            let len = 0;
            for (let k = i; k < returnIdx; k++) {
                len += Math.abs(points[k].x - points[k + 1].x) + Math.abs(points[k].y - points[k + 1].y);
            }
            return len;
        })();

        // 尝试 corner1
        if (c1ok || (!c1ok && !c2ok)) {
            const shortLen = Math.abs(A.x - corner1.x) + Math.abs(A.y - corner1.y) +
                             Math.abs(corner1.x - B.x) + Math.abs(corner1.y - B.y);
            if (shortLen < origLen - 20 && !isBlocked(A, corner1) && !isBlocked(corner1, B)) {
                return [
                    ...points.slice(0, i + 1),
                    corner1,
                    ...points.slice(returnIdx)
                ];
            }
        }

        // 尝试 corner2
        if (c2ok || (!c1ok && !c2ok)) {
            const shortLen = Math.abs(A.x - corner2.x) + Math.abs(A.y - corner2.y) +
                             Math.abs(corner2.x - B.x) + Math.abs(corner2.y - B.y);
            if (shortLen < origLen - 20 && !isBlocked(A, corner2) && !isBlocked(corner2, B)) {
                return [
                    ...points.slice(0, i + 1),
                    corner2,
                    ...points.slice(returnIdx)
                ];
            }
        }

        // Z-shape fallback: A → mid1 → mid2 → B
        // When both L-shape corners are blocked, try routing around the obstacle
        // by finding a clear channel in the cross-axis direction.
        // For isMainVertical (cross = x): try x values outside the blocking obstacle range
        // Path shape: A(Ax,Ay) → (clearX, Ay) → (clearX, By) → B(Bx, By)
        {
            const crossA = crossCoord(A);
            const crossB = crossCoord(B);
            const mainA = mainCoord(A);
            const mainB = mainCoord(B);

            // Determine which side to route around: prefer the side closer to the destination
            const PADDING = 50;
            const validCandidates: { clearCross: number; mid1: Point; mid2: Point; zLen: number }[] = [];
            // Try routing on the far side of destination (cross direction same as overall)
            const candidateChannels: number[] = [];
            // Side 1: beyond destination cross coordinate
            candidateChannels.push(Math.max(crossA, crossB) + PADDING);
            // Side 2: beyond source cross coordinate (opposite)
            candidateChannels.push(Math.min(crossA, crossB) - PADDING);

            // Also try scanning obstacle edges for a clear channel
            for (const obs of rects) {
                const obsMin = isMainVertical ? obs.x : obs.y;
                const obsMax = isMainVertical ? obs.x + obs.width : obs.y + obs.height;
                const obsCrossMin = obsMin;
                const obsCrossMax = obsMax;
                // Only consider obstacles that are in the main-axis range between A and B
                const obsMainMin = isMainVertical ? obs.y : obs.x;
                const obsMainMax = isMainVertical ? obs.y + obs.height : obs.x + obs.width;
                if (obsMainMax < Math.min(mainA, mainB) || obsMainMin > Math.max(mainA, mainB)) continue;
                
                candidateChannels.push(obsCrossMax + PADDING); // just past right/bottom edge
                candidateChannels.push(obsCrossMin - PADDING); // just past left/top edge
            }

            for (const clearCross of candidateChannels) {
                const mid1 = isMainVertical ? { x: clearCross, y: A.y } : { x: A.x, y: clearCross };
                const mid2 = isMainVertical ? { x: clearCross, y: B.y } : { x: B.x, y: clearCross };
                
                const zLen = Math.abs(crossCoord(A) - clearCross) + 
                             Math.abs(mainA - mainB) + 
                             Math.abs(clearCross - crossCoord(B));
                
                if (zLen >= origLen - 20) continue; // Must be shorter

                if (!isBlocked(A, mid1) && !isBlocked(mid1, mid2) && !isBlocked(mid2, B)) {
                    validCandidates.push({ clearCross, mid1, mid2, zLen });
                }
            }

            // Pick the shortest valid candidate
            if (validCandidates.length > 0) {
                validCandidates.sort((a, b) => a.zLen - b.zLen);
                const best = validCandidates[0];
                return [
                    ...points.slice(0, i + 1),
                    best.mid1, best.mid2,
                    ...points.slice(returnIdx)
                ];
            }
        }
    }

    return points;
}

/**
 * Remove main-axis overshoot: detects where the path goes past the destination
 * in a particular axis and then folds back. This is different from a U-turn 
 * (which goes backward from source) — this is an overshoot past the target.
 * 
 * Example: wms(898,871) → visibility(180,1540). Path goes to x=-32 (past dst x=180)
 * then folds back to x=180. The shortcut replaces the overshoot+foldback with
 * a simple L-shaped path.
 * 
 * Unlike removeLargeBacktrack, this function:
 * - Has no ratio check (works for near-diagonal paths)
 * - Uses relaxed orthogonality (10px) for trunk geometry precision errors
 * - Only looks for overshoot past the destination, not general backtracks
 */
export function removeMainAxisOvershoot(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex = []
): Point[] {
    if (points.length < 4) return points;

    const src = points[0];
    const dst = points[points.length - 1];

    const isBlocked = (a: Point, b: Point): boolean => {
        const rects = Array.isArray(obstacles) ? (obstacles as Rectangle[]) : [];
        const CLEAR = 4;
        const minX = Math.min(a.x, b.x) - CLEAR;
        const maxX = Math.max(a.x, b.x) + CLEAR;
        const minY = Math.min(a.y, b.y) - CLEAR;
        const maxY = Math.max(a.y, b.y) + CLEAR;
        return rects.some(obs =>
            obs.x < maxX && obs.x + obs.width > minX &&
            obs.y < maxY && obs.y + obs.height > minY
        );
    };

    // Relaxed orthogonality check (10px) for trunk geometry precision
    const isNearlyHoriz = (a: Point, b: Point) => Math.abs(a.y - b.y) < 10;
    const isNearlyVert  = (a: Point, b: Point) => Math.abs(a.x - b.x) < 10;

    // Try both axes: check if path overshoots in x or y direction
    for (const axis of ['x', 'y'] as const) {
        const coord = (p: Point) => p[axis];
        const dstCoord = coord(dst);
        const srcCoord = coord(src);
        const mainDir = dstCoord - srcCoord; // positive = increasing, negative = decreasing
        if (Math.abs(mainDir) < 50) continue; // too close, skip

        // Scan for overshoot: find point that goes past dst
        for (let i = 1; i < points.length - 1; i++) {
            const ptCoord = coord(points[i]);
            // "past dst" means further than dst in the main direction
            const overshoot = (ptCoord - dstCoord) * Math.sign(mainDir);
            if (overshoot <= 50) continue; // Not a significant overshoot

            // Found overshoot at point i. Find the foldback endpoint (closest to dst after i)
            let bestJ = -1;
            let bestDist = Infinity;
            for (let j = i + 1; j <= points.length - 1; j++) {
                const dist = Math.abs(coord(points[j]) - dstCoord);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestJ = j;
                }
            }
            if (bestJ < 0) continue;

            // Shortcut: A(before overshoot) → corner → B(after foldback)
            // Use i-1 as A if available, to skip the overshoot point entirely
            const aIdx = Math.max(0, i - 1);
            const A = points[aIdx];
            const B = points[bestJ];

            // Check incoming direction to A (relaxed)
            const inIsH = aIdx > 0 ? isNearlyHoriz(points[aIdx - 1], A) : true;
            const inIsV = aIdx > 0 ? isNearlyVert(points[aIdx - 1], A) : true;
            // Check outgoing from B (relaxed)
            const outIsH = bestJ < points.length - 1 ? isNearlyHoriz(B, points[bestJ + 1]) : true;
            const outIsV = bestJ < points.length - 1 ? isNearlyVert(B, points[bestJ + 1]) : true;

            // corner1 = {A.x, B.y}: A→corner1 is V, corner1→B is H
            const c1ok = inIsH && outIsV;
            // corner2 = {B.x, A.y}: A→corner2 is H, corner2→B is V
            const c2ok = inIsV && outIsH;

            if (!c1ok && !c2ok) continue;

            const corner = c1ok ? { x: A.x, y: B.y } : { x: B.x, y: A.y };

            if (isBlocked(A, corner) || isBlocked(corner, B)) continue;

            // Calculate lengths to ensure shortcut is actually shorter
            let origLen = 0;
            for (let k = aIdx; k < bestJ; k++) {
                origLen += Math.abs(points[k].x - points[k + 1].x) + Math.abs(points[k].y - points[k + 1].y);
            }
            const shortLen = Math.abs(A.x - corner.x) + Math.abs(A.y - corner.y) +
                             Math.abs(corner.x - B.x) + Math.abs(corner.y - B.y);
            if (shortLen >= origLen - 20) continue;

            // Apply shortcut
            return [
                ...points.slice(0, aIdx + 1),
                corner,
                ...points.slice(bestJ)
            ];
        }
    }

    return points;
}

export function removeLargeBacktrack(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex = [],
    options?: { sourcePos?: Position; targetPos?: Position },
    threshold = 60
): Point[] {
    if (points.length < 5) return points;  // Need ≥5: start, stub, backtrack, return, end

    const src = points[0];
    const dst = points[points.length - 1];

    const totalDx = dst.x - src.x;
    const totalDy = dst.y - src.y;
    // Require a clear dominant direction (≥1.2:1 ratio), abort otherwise
    // [FIX] Relaxed from 2:1 to 1.2:1 to handle near-diagonal paths like
    // tms→downstream (dx=646, dy=728) where U-turns still need removal.
    const isMainHorizontal = Math.abs(totalDx) >= Math.abs(totalDy);
    if (isMainHorizontal  && Math.abs(totalDx) < Math.abs(totalDy) * 1.2) return points;
    if (!isMainHorizontal && Math.abs(totalDy) < Math.abs(totalDx) * 1.2) return points;

    const mainSign = isMainHorizontal
        ? (totalDx > 0 ? 1 : -1)
        : (totalDy > 0 ? 1 : -1);

    const totalSpan = Math.abs(isMainHorizontal ? totalDx : totalDy);
    const minBacktrackDist = Math.max(threshold, totalSpan * 0.25);

    const mainCoord = (p: Point) => isMainHorizontal ? p.x : p.y;
    const isHoriz   = (a: Point, b: Point) => Math.abs(a.y - b.y) < 1;
    const isVert    = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1;

    const isBlocked = (a: Point, b: Point): boolean => {
        const rects = Array.isArray(obstacles) ? (obstacles as Rectangle[]) : [];
        const CLEAR = 4;
        const minX = Math.min(a.x, b.x) - CLEAR;
        const maxX = Math.max(a.x, b.x) + CLEAR;
        const minY = Math.min(a.y, b.y) - CLEAR;
        const maxY = Math.max(a.y, b.y) + CLEAR;
        return rects.some(obs =>
            obs.x < maxX && obs.x + obs.width > minX &&
            obs.y < maxY && obs.y + obs.height > minY
        );
    };

    let result = [...points];
    let changed = true;
    let maxIter = 3;

    while (changed && maxIter-- > 0) {
        changed = false;
        const pts = result;
        if (pts.length < 5) break;

        // Protect first stub (0→1) and last stub (n-2→n-1); scan interior only
        for (let i = 1; i <= pts.length - 4; i++) {
            const segDelta = mainCoord(pts[i + 1]) - mainCoord(pts[i]);
            if ((segDelta * mainSign) >= -minBacktrackDist) continue;

            const backtrackLevel = mainCoord(pts[i]);
            let returnIdx = -1;
            for (let j = i + 2; j <= Math.min(pts.length - 2, i + 8); j++) {
                if ((mainCoord(pts[j]) - backtrackLevel) * mainSign >= 0) {
                    returnIdx = j;
                    break;
                }
            }
            if (returnIdx < 0 || returnIdx >= pts.length - 1) continue;

            const A = pts[i];
            const B = pts[returnIdx];

            // ── ORTHOGONAL COMPATIBILITY ──────────────────────────────────────────
            // corner1 = {A.x, B.y}: A→corner1 is V (need incomingH), corner1→B is H (need outgoingV)
            // corner2 = {B.x, A.y}: A→corner2 is H (need incomingV), corner2→B is V (need outgoingH)
            const incomingIsH = isHoriz(pts[i - 1], A);
            const incomingIsV = isVert(pts[i - 1], A);
            const outgoingIsH = isHoriz(B, pts[returnIdx + 1]);
            const outgoingIsV = isVert(B, pts[returnIdx + 1]);

            const corner1ok = incomingIsH && outgoingIsV;
            const corner2ok = incomingIsV && outgoingIsH;
            if (!corner1ok && !corner2ok) continue;

            const corner = corner1ok
                ? { x: A.x, y: B.y }
                : { x: B.x, y: A.y };
            // ──────────────────────────────────────────────────────────────────────

            if (isBlocked(A, corner) || isBlocked(corner, B)) continue;

            const shortcutLen =
                Math.abs(A.x - corner.x) + Math.abs(A.y - corner.y) +
                Math.abs(corner.x - B.x) + Math.abs(corner.y - B.y);
            let originalLen = 0;
            for (let k = i; k < returnIdx; k++) {
                originalLen += Math.abs(pts[k].x - pts[k+1].x) + Math.abs(pts[k].y - pts[k+1].y);
            }
            if (shortcutLen >= originalLen - 10) continue;

            result = [
                ...pts.slice(0, i + 1),
                corner,
                ...pts.slice(returnIdx)
            ];
            changed = true;
            break;
        }
    }

    return result;
}


export function collapseCollinearBacktracks(points: Point[]) {

    if (points.length < 3) return points;
    const res: Point[] = [{ x: points[0].x, y: points[0].y }];
    for (let i = 1; i < points.length - 1; i++) {
        const prev = res[res.length - 1];
        const curr = points[i];
        const next = points[i + 1];

        const isHorizontal = Math.abs(prev.y - curr.y) < 1 && Math.abs(curr.y - next.y) < 1;
        const isVertical = Math.abs(prev.x - curr.x) < 1 && Math.abs(curr.x - next.x) < 1;

        if (isHorizontal || isVertical) {
            // [FIX] Skip ALL collinear points (both forward and backward).
            // Retaining forward collinear points causes createFilletedPath to generate 
            // impossible semicircular arcs (bulges) on straight lines.
            continue;
        }

        res.push({ x: curr.x, y: curr.y });
    }
    const last = points[points.length - 1];
    res.push({ x: last.x, y: last.y });
    return res;
}

export function removeSmallJogs(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex = [],
    options?: { sourcePos?: Position, targetPos?: Position }
) {
    if (points.length < 4) return points;
    const res = [...points];
    let changed = true;
    let maxIter = 5;

    while (changed && maxIter > 0) {
        changed = false;
        maxIter--;

        // We need at least 4 points for a jog: p0 -> p1 -> p2 -> p3
        for (let i = 0; i < res.length - 3; i++) {
            const p0 = res[i];
            const p1 = res[i + 1];
            const p2 = res[i + 2];
            const p3 = res[i + 3];

            const p0Fixed = (i === 0);
            const p3Fixed = (i + 3 === res.length - 1);

            // [NEW] Aggressive Endpoint Jog Removal
            // If p0 is start (Fixed), and p1 -> p2 is a tiny bridge (< 5px) that realigns to p0's axis
            // Snap p1, p2 to p0's axis.
            if (p0Fixed) {
                // Standard Z-jog:
                // H (p0-p1) -> V (p1-p2) -> H (p2-p3)
                const h1 = Math.abs(p0.y - p1.y) < 1;
                const vBridge = Math.abs(p1.x - p2.x) < 1;
                const h2 = Math.abs(p2.y - p3.y) < 1;

                if (h1 && vBridge && h2) {
                    const bridgeLen = Math.abs(p1.y - p2.y);
                    const misalignment = Math.abs(p0.y - p3.y);
                    // If bridge is small OR misalignment is small (< 1px), flatten it
                    if (bridgeLen < 3 || misalignment < 1.1) {
                        // [FIX] Check Source Port Direction
                        if (p0Fixed && options?.sourcePos) {
                            const isSourceVert = options.sourcePos === Position.Top || options.sourcePos === Position.Bottom;
                            // p1.y = p0.y makes p0->p1 Horizontal.
                            // If Source needs Vertical, this is invalid.
                            if (isSourceVert) continue;
                        }

                        // Align p1, p2, p3 to p0.y (Since p0 is fixed)
                        // But wait, p3 might be fixed too? No, p3 is i+3.
                        // If p3 is fixed (end), check if we can move p1/p2.

                        // Scenario: p0 (fixed) --(tiny jog)--> rest
                        // Just make p1 and p2 align with p0.y
                        p1.y = p0.y;
                        p2.y = p0.y;
                        // Now p0-p1-p2 are collinear. Next iteration cleans them up.
                        changed = true;
                        continue;
                    }
                }

                // V (p0-p1) -> H (p1-p2) -> V (p2-p3)
                const v1 = Math.abs(p0.x - p1.x) < 1;
                const hBridge = Math.abs(p1.y - p2.y) < 1;
                const v2 = Math.abs(p2.x - p3.x) < 1;

                if (v1 && hBridge && v2) {
                    const bridgeLen = Math.abs(p1.x - p2.x);
                    const misalignment = Math.abs(p0.x - p3.x);
                    if (bridgeLen < 5 || misalignment < 5) {
                        // [FIX] Check Source Port Direction
                        if (p0Fixed && options?.sourcePos) {
                            const isSourceHoriz = options.sourcePos === Position.Left || options.sourcePos === Position.Right;
                            // p1.x = p0.x makes p0->p1 Vertical.
                            // If Source needs Horizontal, this is invalid.
                            if (isSourceHoriz) continue;
                        }

                        p1.x = p0.x;
                        p2.x = p0.x;
                        changed = true;
                        continue;
                    }
                }
            }

            // [NEW] End-side Jog Removal (p3 is fixed)
            if (p3Fixed) {
                // H -> V -> H (Targeting p3)
                const h1 = Math.abs(p0.y - p1.y) < 1;
                const vBridge = Math.abs(p1.x - p2.x) < 1;
                const h2 = Math.abs(p2.y - p3.y) < 1;

                if (h1 && vBridge && h2) {
                    const bridgeLen = Math.abs(p1.y - p2.y);
                    const misalignment = Math.abs(p0.y - p3.y);
                    if (bridgeLen < 5 || misalignment < 5) {
                        // [FIX] Check Target Port Direction
                        if (p3Fixed && options?.targetPos) {
                            const isTargetVert = options.targetPos === Position.Top || options.targetPos === Position.Bottom;
                            // p1.y = p3.y makes p2->p3 Horizontal.
                            // If Target needs Vertical, this is invalid.
                            if (isTargetVert) continue;
                        }

                        // Align p1, p2 to p3.y
                        p1.y = p3.y;
                        p2.y = p3.y;
                        changed = true;
                        continue;
                    }
                }

                // V -> H -> V
                const v1 = Math.abs(p0.x - p1.x) < 1;
                const hBridge = Math.abs(p1.y - p2.y) < 1;
                const v2 = Math.abs(p2.x - p3.x) < 1;

                if (v1 && hBridge && v2) {
                    const bridgeLen = Math.abs(p1.x - p2.x);
                    const misalignment = Math.abs(p0.x - p3.x);
                    if (bridgeLen < 5 || misalignment < 5) {
                        // [FIX] Check Target Port Direction
                        if (p3Fixed && options?.targetPos) {
                            const isTargetHoriz = options.targetPos === Position.Left || options.targetPos === Position.Right;
                            // p1.x = p3.x makes p2->p3 Vertical.
                            // If Target needs Horizontal, this is invalid.
                            if (isTargetHoriz) continue;
                        }

                        p1.x = p3.x;
                        p2.x = p3.x;
                        changed = true;
                        continue;
                    }
                }
            }

            // Check for Z-Jog (Parallel Segments) - Logic from previous version
            // Case A: Vertical -> Horizontal -> Vertical
            const isV1 = Math.abs(p0.x - p1.x) < 1;
            const isV2 = Math.abs(p2.x - p3.x) < 1;
            const bridgeLen = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);

            if (isV1 && isV2) {
                // Bridge is Horizontal p1->p2 (Variation from p1.x..p2.x)
                // We want to align p1 and p2 to targetX.
                if (Math.abs(p1.y - p2.y) < 1 && bridgeLen < 80) {
                    let targetX: number;
                    if (p0Fixed && p3Fixed) {
                        if (Math.abs(p0.x - p3.x) > 1) continue;
                        targetX = p0.x;
                    } else if (p0Fixed) {
                        targetX = p0.x;
                    } else if (p3Fixed) {
                        targetX = p3.x;
                    } else {
                        targetX = p1.x;
                    }

                    // [FIX] Check orthogonality preservation for p0 and p3
                    // If we move p0.x, pPrev->p0 must be Horizontal.
                    if (!p0Fixed && Math.abs(p0.x - targetX) > 0.1) {
                        const pPrev = i > 0 ? res[i - 1] : null;
                        if (pPrev && Math.abs(pPrev.y - p0.y) > 1) continue; // Prev is Vert/Diag, moving X breaks it
                    }
                    // If we move p3.x, p3->pNext must be Horizontal.
                    if (!p3Fixed && Math.abs(p3.x - targetX) > 0.1) {
                        const pNext = i + 4 < res.length ? res[i + 4] : null;
                        if (pNext && Math.abs(p3.y - pNext.y) > 1) continue; // Next is Vert/Diag, moving X breaks it
                    }

                    if (!p0Fixed) p0.x = targetX;
                    // [SAFE CHECK]
                    // Validate if the horizontal consolidation hits any obstacles
                    // It's a vertical segment merge. Check if the vertical line at targetX is blocked.
                    // Range: min(p1.y, p2.y) to max(p1.y, p2.y) at x=targetX
                    // Actually, the new path is p0 -> p1(moved) -> p2(moved) -> p3
                    // We should check the key segments.
                    // For simplicity, check the full 4-point polyline proposal
                    const testPoints = [
                        { x: !p0Fixed ? targetX : p0.x, y: p0.y }, // Adjusted p0
                        { x: targetX, y: p1.y },
                        { x: targetX, y: p2.y },
                        { x: !p3Fixed ? targetX : p3.x, y: p3.y }
                    ];

                    if (!isPathBlocked(testPoints, obstacles, 20)) {
                        p1.x = targetX;
                        p2.x = targetX;
                        if (!p3Fixed) p3.x = targetX;
                        changed = true;
                    } else {
                        // Revert p0 if modified (local var in array)
                        // Actually we operate on `res` references directly (p0, p1...).
                        // So we must be careful.
                        // The code above: if (!p0Fixed) p0.x = targetX; was mutating BEFORE check.
                        // FIX: Do not mutate until check passes.
                        if (!p0Fixed) p0.x = res[i].x; // Revert
                    }
                }
            }

            // Case B: Horizontal -> Vertical -> Horizontal
            const isH1 = Math.abs(p0.y - p1.y) < 1;
            const isH2 = Math.abs(p2.y - p3.y) < 1;

            if (isH1 && isH2) {
                // Bridge is Vertical p1->p2
                if (Math.abs(p1.x - p2.x) < 1 && bridgeLen < 80) {
                    let targetY: number;
                    if (p0Fixed && p3Fixed) {
                        if (Math.abs(p0.y - p3.y) > 1) continue;
                        targetY = p0.y;
                    } else if (p0Fixed) {
                        targetY = p0.y;
                    } else if (p3Fixed) {
                        targetY = p3.y;
                    } else {
                        targetY = p1.y;
                    }

                    // [FIX] Check orthogonality preservation for p0 and p3
                    // If we move p0.y, pPrev->p0 must be Vertical.
                    if (!p0Fixed && Math.abs(p0.y - targetY) > 0.1) {
                        const pPrev = i > 0 ? res[i - 1] : null;
                        if (pPrev && Math.abs(pPrev.x - p0.x) > 1) continue; // Prev is Horiz/Diag, moving Y breaks it
                    }
                    // If we move p3.y, p3->pNext must be Vertical.
                    if (!p3Fixed && Math.abs(p3.y - targetY) > 0.1) {
                        const pNext = i + 4 < res.length ? res[i + 4] : null;
                        if (pNext && Math.abs(p3.x - pNext.x) > 1) continue; // Next is Horiz/Diag, moving Y breaks it
                    }

                    const originalP0Y = p0.y;
                    if (!p0Fixed) p0.y = targetY; // Propose change

                    // [SAFE CHECK]
                    const testPoints = [
                        { x: p0.x, y: !p0Fixed ? targetY : originalP0Y },
                        { x: p1.x, y: targetY },
                        { x: p2.x, y: targetY },
                        { x: p3.x, y: !p3Fixed ? targetY : p3.y }
                    ];

                    if (!isPathBlocked(testPoints, obstacles, 20)) {
                        // Commit
                        if (!p0Fixed) p0.y = targetY;
                        p1.y = targetY;
                        p2.y = targetY;
                        if (!p3Fixed) p3.y = targetY;
                        changed = true;
                    } else {
                        // Revert
                        if (!p0Fixed) p0.y = originalP0Y;
                    }
                }
            }
        }

        if (changed) {
            const clean = [res[0]];
            for (let k = 1; k < res.length; k++) {
                const prev = clean[clean.length - 1];
                const curr = res[k];
                if (Math.abs(curr.x - prev.x) > 1 || Math.abs(curr.y - prev.y) > 1) {
                    clean.push(curr);
                }
            }
            if (clean.length < res.length) {
                return clean;
            }
        }
    }
    return res;
}

/**
 * [NEW] Collapse redundant bends in orthogonal paths
 * Identifies U-shape and Z-shape patterns that can be simplified
 * when direct routing doesn't cross obstacles
 * 
 * @param points - Input path points
 * @param obstacles - Obstacle rectangles to check against
 * @param minBendLength - Minimum length to consider for bend collapsing (default: 40)
 * @returns Simplified path with redundant bends removed
 */
export function collapseRedundantBends(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex = [],
    minBendLength: number = 40,
    options?: { sourcePos?: Position, targetPos?: Position }
): Point[] {
    if (points.length < 4) return points;

    const result = [...points];
    let changed = true;
    let maxIterations = 3;

    while (changed && maxIterations > 0) {
        changed = false;
        maxIterations--;

        // Look for 3-segment patterns (4 points) that can be collapsed
        for (let i = 0; i < result.length - 3; i++) {
            const p0 = result[i];
            const p1 = result[i + 1];
            const p2 = result[i + 2];
            const p3 = result[i + 3];

            // Skip if endpoints are fixed (first or last)
            if (i === 0 || i + 3 === result.length - 1) continue;

            // Calculate segment directions
            const seg1Horiz = Math.abs(p1.y - p0.y) < 1;
            const seg2Horiz = Math.abs(p2.y - p1.y) < 1;
            const seg3Horiz = Math.abs(p3.y - p2.y) < 1;

            // Z-shape detection: H-V-H or V-H-V pattern
            const isZShape = (seg1Horiz && !seg2Horiz && seg3Horiz) ||
                (!seg1Horiz && seg2Horiz && !seg3Horiz);

            if (!isZShape) continue;

            // Calculate the "shortcut" path (p0 -> p3 with one bend)
            // For H-V-H: go p0 -> (p3.x, p0.y) -> p3 OR p0 -> (p0.x, p3.y) -> p3
            // For V-H-V: similar logic

            const mid1 = seg1Horiz ? { x: p3.x, y: p0.y } : { x: p0.x, y: p3.y };
            const shortcutPath1 = [p0, mid1, p3];

            const mid2 = seg1Horiz ? { x: p0.x, y: p3.y } : { x: p3.x, y: p0.y };
            const shortcutPath2 = [p0, mid2, p3];

            // Calculate path lengths
            const currentLength =
                Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y) +
                Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y) +
                Math.abs(p3.x - p2.x) + Math.abs(p3.y - p2.y);

            const shortcut1Length =
                Math.abs(mid1.x - p0.x) + Math.abs(mid1.y - p0.y) +
                Math.abs(p3.x - mid1.x) + Math.abs(p3.y - mid1.y);

            const shortcut2Length =
                Math.abs(mid2.x - p0.x) + Math.abs(mid2.y - p0.y) +
                Math.abs(p3.x - mid2.x) + Math.abs(p3.y - mid2.y);

            // Only consider shortcuts that are significantly shorter
            if (shortcut1Length >= currentLength - minBendLength &&
                shortcut2Length >= currentLength - minBendLength) {
                continue;
            }

            // Choose the better shortcut
            const useShortcut1 = shortcut1Length <= shortcut2Length;
            const bestShortcut = useShortcut1 ? shortcutPath1 : shortcutPath2;
            const bestLength = useShortcut1 ? shortcut1Length : shortcut2Length;

            // [FIX] Validate against Port Direction
            // If i == 0 (Source), the first segment is p0 -> newMid.
            // If i + 3 == result.length - 1 (Target), the last segment is newMid -> p3.

            const newMid = useShortcut1 ? mid1 : mid2;

            if (i === 0 && options?.sourcePos) {
                const isSourceVert = options.sourcePos === Position.Top || options.sourcePos === Position.Bottom;
                const isSourceHoriz = options.sourcePos === Position.Left || options.sourcePos === Position.Right;

                const firstSegHoriz = Math.abs(p0.y - newMid.y) < 0.1;
                const firstSegVert = Math.abs(p0.x - newMid.x) < 0.1;

                if (isSourceVert && firstSegHoriz) continue; // Invalid
                if (isSourceHoriz && firstSegVert) continue; // Invalid
            }

            if (i + 3 === result.length - 1 && options?.targetPos) {
                const isTargetVert = options.targetPos === Position.Top || options.targetPos === Position.Bottom;
                const isTargetHoriz = options.targetPos === Position.Left || options.targetPos === Position.Right;

                const lastSegHoriz = Math.abs(newMid.y - p3.y) < 0.1;
                const lastSegVert = Math.abs(newMid.x - p3.x) < 0.1;

                if (isTargetVert && lastSegHoriz) continue; // Invalid
                if (isTargetHoriz && lastSegVert) continue; // Invalid
            }

            // Check if shortcut is blocked
            // [FIX] Increased padding from 5 to 20 to prevent hugging obstacles after simplification
            if (!isPathBlocked(bestShortcut, obstacles, 20) && bestLength < currentLength - minBendLength) {
                // Apply the shortcut: replace p1, p2 with the new midpoint
                // newMid is already calculated above
                result.splice(i + 1, 2, newMid);
                changed = true;
                break; // Restart iteration after modification
            }
        }
    }

    // Clean up consecutive duplicate points
    const cleaned: Point[] = [result[0]];
    for (let i = 1; i < result.length; i++) {
        const prev = cleaned[cleaned.length - 1];
        const curr = result[i];
        if (Math.abs(curr.x - prev.x) > 1 || Math.abs(curr.y - prev.y) > 1) {
            cleaned.push(curr);
        }
    }

    return cleaned;
}

export function createRoundedPathWithJumps(
    points: Point[],
    borderRadius: number,
    jumpRadius: number,
    allOtherEdges: Edge[],
    nodes: Node[],
    currentEdgeId: string,
    config: { sourceOffset: number, targetOffset: number }
): string {
    // 去除相邻的重复点
    const dedupedPoints: Point[] = [];
    if (points.length > 0) {
        dedupedPoints.push(points[0]);
        for (let i = 1; i < points.length; i++) {
            const prev = dedupedPoints[dedupedPoints.length - 1];
            const curr = points[i];
            if (Math.abs(prev.x - curr.x) > 1 || Math.abs(prev.y - curr.y) > 1) {
                dedupedPoints.push(curr);
            }
        }
    }
    points = dedupedPoints;

    if (points.length < 2) return "";

    let path = "M " + points[0].x + " " + points[0].y;

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];

        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        let startRatio = 0;
        // [FIX] Don't apply radius offset to the first segment (i=1) to keep start point exact
        if (i > 1) startRatio = Math.min(borderRadius, len / 2) / len;

        let endRatio = 0;
        // [FIX] Don't apply radius offset to the last segment to keep end point exact
        if (i < points.length - 1) endRatio = Math.min(borderRadius, len / 2) / len;

        // [FIX] Also ensure the second segment starts correctly
        // If this is the second point and path has more, we should still draw from exact start
        if (startRatio + endRatio > 1) {
            startRatio = 0.5;
            endRatio = 0.5;
        }

        // [FIX] For segments connected to the endpoints, ensure orthogonal entry
        // The first point (i=1) should be drawn straight from point[0]
        // The drawStart for the FIRST segment should be exactly at points[0]
        const isFirstSegment = i === 1;
        const isLastSegment = i === points.length - 1;

        // [FIX] For first segment, drawStart should be exact start point (no corner adjustment)
        const drawStart = isFirstSegment ? { x: prev.x, y: prev.y } : {
            x: prev.x + dx * startRatio,
            y: prev.y + dy * startRatio
        };

        // [FIX] For last segment, drawEnd should be exact end point
        const drawEnd = isLastSegment ? { x: curr.x, y: curr.y } : {
            x: curr.x - dx * endRatio,
            y: curr.y - dy * endRatio
        };

        // [NEW] Line Jump Logic (Restored & Optimized)
        // 1. Calculate Jumps for this segment
        const jumps = getJumpPoints(drawStart, drawEnd, allOtherEdges, nodes, currentEdgeId, config);

        // 2. Draw segment with jumps
        if (jumps.length === 0) {
            path += " L " + drawEnd.x + " " + drawEnd.y;
        } else {
            const isHorizontal = Math.abs(drawEnd.y - drawStart.y) < 0.1;

            jumps.forEach(jump => {
                // Check if jump is within the drawn segment (accounting for radius)
                // We need space for the jump arc (jumpRadius * 2 width)
                const jr = jumpRadius;

                // Validate jump fit
                const distTotal = isHorizontal
                    ? Math.abs(drawEnd.x - drawStart.x)
                    : Math.abs(drawEnd.y - drawStart.y);
                const distToJump = isHorizontal
                    ? Math.abs(jump.x - drawStart.x)
                    : Math.abs(jump.y - drawStart.y);

                // Skip if jump is too close to start or end (clipping with corner)
                if (distToJump < jr || distToJump > distTotal - jr) return;

                // Calculate start/end of the arc
                let arcStart: Point;
                let arcEnd: Point;
                let control: Point;

                if (isHorizontal) {
                    const sign = drawEnd.x > drawStart.x ? 1 : -1;
                    arcStart = { x: jump.x - jr * sign, y: jump.y };
                    arcEnd = { x: jump.x + jr * sign, y: jump.y };
                    // Control point for semi-circle (up or down? usually up)
                    // If horizontal, jump goes "up" (y-axis)
                    control = { x: jump.x, y: jump.y - jr * 1.5 }; // 1.5 for slightly flatter/rounder arc
                } else {
                    const sign = drawEnd.y > drawStart.y ? 1 : -1;
                    arcStart = { x: jump.x, y: jump.y - jr * sign };
                    arcEnd = { x: jump.x, y: jump.y + jr * sign };
                    // If vertical, jump goes "left" or "right"? Usually "left" (-x)
                    control = { x: jump.x - jr * 1.5, y: jump.y };
                }

                // Line to arc start
                path += " L " + arcStart.x + " " + arcStart.y;
                // Arc
                path += " Q " + control.x + " " + control.y + " " + arcEnd.x + " " + arcEnd.y;
            });

            // Final line to segment end
            path += " L " + drawEnd.x + " " + drawEnd.y;
        }

        // 3. Draw Corner (unchanged)
        if (i < points.length - 1) {
            const next = points[i + 1];
            const dx2 = next.x - curr.x;
            const dy2 = next.y - curr.y;
            const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            const radius = Math.min(borderRadius, len / 2, len2 / 2);

            const arcEndRatio = radius / len2;
            const arcEnd = {
                x: curr.x + dx2 * arcEndRatio,
                y: curr.y + dy2 * arcEndRatio
            };
            path += " Q " + curr.x + " " + curr.y + " " + arcEnd.x + " " + arcEnd.y;
        }
    }

    return path;
}

// [NEW] 智能标签位置计算 - 优化版
// 策略：优先选择"最长线段"的中心，而不是整个路径的几何中心。
// 原因：路径几何中心往往落在转角或短连接线上，导致标签位置尴尬。
export function getSmartLabelPosition(points: Point[]): { x: number, y: number } {
    if (!points || points.length < 2) return { x: 0, y: 0 };

    // 0. Calculate Visual Center (Bounding Box Center)
    // This is often more "central" to the shape than the path-length center.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    const visualCenter = {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2
    };

    // 1. Analyze Segments
    let maxLen = -1;
    const segments: { index: number, len: number, mid: Point, isHorizontal: boolean }[] = [];

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        if (len > maxLen) maxLen = len;

        segments.push({
            index: i,
            len: len,
            mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
            isHorizontal: Math.abs(dy) < 1 // Simple horizontal check
        });
    }

    if (maxLen <= 0) return points[0];

    // 2. Filter & Score Candidates
    // We consider segments that are "significant" enough to hold a label.
    // Threshold: At least 50% of the longest segment OR explicitly long (>60px)
    const candidates = segments.filter(s => s.len >= maxLen * 0.5 || s.len > 60);

    let bestCandidate = candidates.length > 0 ? candidates[0] : segments.reduce((prev, curr) => (prev.len > curr.len) ? prev : curr); // Fallback to max len if no candidates
    let bestScore = -Infinity;

    for (const seg of candidates) {
        // Score Components:
        // A. Visual Centrality (Secondary factor)
        // [FIX] Reduced weight (1000 -> 500). We prefer structural alignment (backbone) over pure geometric center.
        const distToVisualCenter = Math.sqrt(
            Math.pow(seg.mid.x - visualCenter.x, 2) +
            Math.pow(seg.mid.y - visualCenter.y, 2)
        );
        const centralityScore = 500 / (1 + distToVisualCenter);

        // B. Length Bonus (Longer is better)
        // [FIX] Increased cap (200 -> 1000) to properly reward very long backbones over medium segments.
        const lengthScore = Math.min(seg.len, 500) * 2;

        // C. Orientation Bonus (Horizontal is better for reading)
        // [FIX] Increased to 250. Horizontal segments are significantly better for standard horizontal text.
        const orientationBonus = seg.isHorizontal ? 250 : 0;

        // D. Edge Penalty (Avoid first/last segments)
        // Keep high penalty to clear the ports.
        const isTerminal = (seg.index === 0 || seg.index === points.length - 2);
        const terminalPenalty = isTerminal ? -500 : 0;

        // E. Max Length Bonus
        // [FIX] Increased to 1000. The "Backbone" should almost always win.
        const maxLenBonus = (seg.len === maxLen) ? 1000 : 0;

        // Final Score
        const totalScore = centralityScore + lengthScore + orientationBonus + terminalPenalty + maxLenBonus;

        if (totalScore > bestScore) {
            bestScore = totalScore;
            bestCandidate = seg;
        }
    }

    return { x: bestCandidate.mid.x, y: bestCandidate.mid.y };
}

/**
 * [NEW] Remove Short Diagonal Segments
 * Detects and fixes diagonal segments (non-orthogonal) in the path.
 * Converts them to orthogonal paths by inserting appropriate corner points.
 * 
 * @param points Path points
 * @param threshold Minimum segment length to consider (default 0 - process all)
 * @returns Path with all segments being strictly orthogonal
 */
export function removeShortDiagonals(points: Point[], threshold: number = 0): Point[] {
    if (points.length < 2) return points;

    const result: Point[] = [points[0]];

    for (let i = 0; i < points.length - 1; i++) {
        const curr = result[result.length - 1];
        const next = points[i + 1];

        const dx = Math.abs(curr.x - next.x);
        const dy = Math.abs(curr.y - next.y);

        // Check if segment is diagonal (both dx and dy > tolerance)
        const TOLERANCE = 0.5; // Stricter tolerance for diagonal detection

        if (dx > TOLERANCE && dy > TOLERANCE) {
            // This is a diagonal segment - need to fix it
            const segmentLength = Math.sqrt(dx * dx + dy * dy);

            if (segmentLength < threshold) {
                // Very short diagonal - snap to nearest orthogonal point
                // Strategy: snap to the axis with smaller delta
                if (dx < dy) {
                    // Snap X to current X (make it vertical)
                    result.push({ x: curr.x, y: next.y });
                } else {
                    // Snap Y to current Y (make it horizontal)
                    result.push({ x: next.x, y: curr.y });
                }
            }
            // [FIX] For longer diagonals, do NOT blindly insert corners.
            // Leave them for makePathOrthogonal which has proper obstacle awareness.
        }

        result.push(next);
    }

    // Clean up consecutive duplicate points
    const cleaned: Point[] = [result[0]];
    for (let i = 1; i < result.length; i++) {
        const prev = cleaned[cleaned.length - 1];
        const curr = result[i];
        if (Math.abs(curr.x - prev.x) > 0.5 || Math.abs(curr.y - prev.y) > 0.5) {
            cleaned.push(curr);
        }
    }

    return cleaned;
}

/**
 * [P15] Gap Centering / Nudge Algorithm
 * "Unsticks" lines from the rigid A* grid by moving them to the visual center of available space.
 * 
 * @param points Path points
 * @param obstacles Obstacles list
 * @param searchLimit Max distance to search for gap boundaries (default 200px)
 * @param offset Perpendicular offset to apply from the center (for separating overlapping lines)
 * @param extraObstacles Additional obstacles to check (e.g. container walls)
 */
export function nudgeSegments(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex,
    searchLimit: number = 200,
    offset: number = 0,
    extraObstacles: Rectangle[] = [],
    options: { lockStart?: boolean; lockEnd?: boolean; trunkShift?: number } = {}
): Point[] {
    if (points.length < 4) return points;

    // Helper to check for SpatialIndex
    const isSpatialIndex = (obs: unknown): obs is SpatialIndex => typeof (obs as SpatialIndex).query === 'function';

    // Clone to avoid mutation
    const nudged = points.map(p => ({ ...p }));

    // Loop iterates over segments [i, i+1]
    for (let i = 0; i < nudged.length - 1; i++) {
        const p1 = nudged[i];
        const p2 = nudged[i + 1];

        // Determine orientation
        const isHoriz = Math.abs(p1.y - p2.y) < 2; // Increased tolerance
        const isVert = Math.abs(p1.x - p2.x) < 2;

        // Skip segments that are too short
        const len = Math.abs(isHoriz ? p1.x - p2.x : p1.y - p2.y);
        if (len < 5) continue;

        // [NEW] Shared Trunk Logic
        // If this segment is part of the trunk (Start or End), we force it to the Center (offset 0).
        // If it is a branch, we apply the full offset.
        // This effectively "snaps" the trunk segments to a single shared line, 
        // while allowing branches to be separated.
        const isStartTrunk = options.lockStart && i === 0;
        const isEndTrunk = options.lockEnd && i === nudged.length - 2;
        const isTrunk = isStartTrunk || isEndTrunk;

        // Effective offset: Trunk uses trunkShift (Group Separation), Branches use offset (Fan-out)
        const effectiveOffset = isTrunk ? (options.trunkShift ?? 0) : offset;

        if (isHoriz) {
            const y = p1.y;
            const xMin = Math.min(p1.x, p2.x);
            const xMax = Math.max(p1.x, p2.x);

            // Find nearest obs above/below
            let nearestTop = -Infinity;
            let nearestBottom = Infinity;

            let candidates: Rectangle[] = isSpatialIndex(obstacles) ? (() => {
                const range = {
                    x: xMin,
                    y: y - searchLimit,
                    width: xMax - xMin,
                    height: searchLimit * 2
                };
                return obstacles.query(range);
            })() : obstacles;

            if (extraObstacles.length > 0) {
                candidates = candidates.concat(extraObstacles);
            }

            for (const obs of candidates) {
                // Check X overlap
                const startX = Math.max(xMin, obs.x);
                const endX = Math.min(xMax, obs.x + obs.width);

                if (startX < endX) {
                    const obsBottom = obs.y + obs.height;
                    const obsTop = obs.y;

                    if (obsBottom <= y + 0.1 && obsBottom > nearestTop) {
                        nearestTop = obsBottom;
                    }
                    if (obsTop >= y - 0.1 && obsTop < nearestBottom) {
                        nearestBottom = obsTop;
                    }
                }
            }

            // Heuristic limits
            if (nearestTop === -Infinity) nearestTop = y - searchLimit;
            if (nearestBottom === Infinity) nearestBottom = y + searchLimit;
            nearestTop = Math.max(nearestTop, y - searchLimit);
            nearestBottom = Math.min(nearestBottom, y + searchLimit);

            // Calculate Center with Offset
            const gap = nearestBottom - nearestTop;
            const safeOffset = Math.max(-gap / 2 + 5, Math.min(gap / 2 - 5, effectiveOffset));
            const center = (nearestTop + nearestBottom) / 2 + safeOffset;

            // Apply if significant difference
            if (Math.abs(y - center) > 0.5) {
                const isStartPoint = (i === 0);
                const isEndPoint = (i + 1 === nudged.length - 1);

                // For Trunk logic, we MUST modify the terminal points to snap them to center.
                // However, we still respect the rule: don't move "Source/Target" anchors 
                // UNLESS we are explicitly in "Shared Trunk" mode (which implies overriding port distribution).
                // Actually, if we move the terminal point, we change the port position.
                // This is desired for "Shared Trunk" to merge visually.

                if (isStartPoint) {
                    if (isStartTrunk) {
                        // Move both p0 and p1 to center (Trunk Snap)
                        nudged[i].y = center;
                        nudged[i + 1].y = center;
                    } else {
                        // Skip nudging first segment if not trunk (keep anchor fixed)
                        continue;
                    }
                } else if (isEndPoint) {
                    if (isEndTrunk) {
                        // Move both pn-2 and pn-1 to center (Trunk Snap)
                        nudged[i].y = center;
                        nudged[i + 1].y = center;
                    } else {
                        // Skip nudging last segment if not trunk
                        continue;
                    }
                } else {
                    // Mid segment: move both
                    nudged[i].y = center;
                    nudged[i + 1].y = center;
                }
            }

        } else if (isVert) {
            const x = p1.x;
            const yMin = Math.min(p1.y, p2.y);
            const yMax = Math.max(p1.y, p2.y);

            let nearestLeft = -Infinity;
            let nearestRight = Infinity;

            let candidates: Rectangle[] = isSpatialIndex(obstacles) ? (() => {
                const range = {
                    x: x - searchLimit,
                    y: yMin,
                    width: searchLimit * 2,
                    height: yMax - yMin
                };
                return obstacles.query(range);
            })() : obstacles;

            if (extraObstacles.length > 0) {
                candidates = candidates.concat(extraObstacles);
            }

            for (const obs of candidates) {
                const startY = Math.max(yMin, obs.y);
                const endY = Math.min(yMax, obs.y + obs.height);

                if (startY < endY) {
                    const obsRight = obs.x + obs.width;
                    const obsLeft = obs.x;

                    if (obsRight <= x + 0.1 && obsRight > nearestLeft) {
                        nearestLeft = obsRight;
                    }
                    if (obsLeft >= x - 0.1 && obsLeft < nearestRight) {
                        nearestRight = obsLeft;
                    }
                }
            }

            if (nearestLeft === -Infinity) nearestLeft = x - searchLimit;
            if (nearestRight === Infinity) nearestRight = x + searchLimit;
            nearestLeft = Math.max(nearestLeft, x - searchLimit);
            nearestRight = Math.min(nearestRight, x + searchLimit);

            const gap = nearestRight - nearestLeft;
            const safeOffset = Math.max(-gap / 2 + 5, Math.min(gap / 2 - 5, effectiveOffset));
            const center = (nearestLeft + nearestRight) / 2 + safeOffset;

            if (Math.abs(x - center) > 0.5) {
                const isStartPoint = (i === 0);
                const isEndPoint = (i + 1 === nudged.length - 1);

                if (isStartPoint) {
                    if (isStartTrunk) {
                        nudged[i].x = center;
                        nudged[i + 1].x = center;
                    } else {
                        continue;
                    }
                } else if (isEndPoint) {
                    if (isEndTrunk) {
                        nudged[i].x = center;
                        nudged[i + 1].x = center;
                    } else {
                        continue;
                    }
                } else {
                    nudged[i].x = center;
                    nudged[i + 1].x = center;
                }
            }
        }
    }

    return nudged;
}

/**
 * Calculates the minimum distance from a point to a polyline path.
 */
export function getClosestDistanceToPath(point: Point, pathPoints: Point[]): number {
    if (!pathPoints || pathPoints.length < 2) return Infinity;

    let minDist = Infinity;

    for (let i = 0; i < pathPoints.length - 1; i++) {
        const p1 = pathPoints[i];
        const p2 = pathPoints[i + 1];

        // Point to Segment distance
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;

        if (dx === 0 && dy === 0) {
            const d = Math.sqrt(Math.pow(point.x - p1.x, 2) + Math.pow(point.y - p1.y, 2));
            if (d < minDist) minDist = d;
            continue;
        }

        const t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / (dx * dx + dy * dy);

        const clampedT = Math.max(0, Math.min(1, t));

        const closeX = p1.x + clampedT * dx;
        const closeY = p1.y + clampedT * dy;

        const d = Math.sqrt(Math.pow(point.x - closeX, 2) + Math.pow(point.y - closeY, 2));
        if (d < minDist) minDist = d;
    }

    return minDist;
}

export interface OrthoOptions {
    sourcePos?: Position;
    targetPos?: Position;
    strictOrthogonal?: boolean; // When true, return null if safe orthogonalization is impossible
    sourceMinLength?: number;
    targetMinLength?: number;
}
/**
 * Ensure all segments in the path are orthogonal.
 * If a segment is diagonal, insert a turning point.
 */
export function makePathOrthogonal(
    points: Point[],
    options?: OrthoOptions,
    obstacles: Rectangle[] | SpatialIndex = []
): Point[] | null {
    if (points.length < 2) return points;

    const isPointBlocked = (p: Point): boolean => {
        const PAD = 10;
        const isSpatialIndex = (obs: unknown): obs is SpatialIndex => typeof (obs as SpatialIndex).query === 'function';

        if (isSpatialIndex(obstacles)) {
            const range = { x: p.x - PAD, y: p.y - PAD, width: PAD * 2, height: PAD * 2 };
            const candidates = obstacles.query(range);
            return candidates.some(obs =>
                p.x > obs.x - PAD && p.x < obs.x + obs.width + PAD &&
                p.y > obs.y - PAD && p.y < obs.y + obs.height + PAD
            );
        } else {
            return obstacles.some(obs =>
                p.x > obs.x - PAD && p.x < obs.x + obs.width + PAD &&
                p.y > obs.y - PAD && p.y < obs.y + obs.height + PAD
            );
        }
    };

    // [FIX] Enforce strict entry/exit stubs based on ports
    // Use configured offsets or default to 20
    const sourceStubLen = options?.sourceMinLength ?? 30;
    const targetStubLen = options?.targetMinLength ?? 30;

    let newStartStub: Point | null = null;
    let newEndStub: Point | null = null;

    if (options?.sourcePos && points.length >= 1) {
        const start = points[0];
        const next = points.length > 1 ? points[1] : null;

        // Calculate ideal stub position
        let stubX = start.x;
        let stubY = start.y;

        switch (options.sourcePos) {
            case Position.Top: stubY = start.y - sourceStubLen; break;
            case Position.Bottom: stubY = start.y + sourceStubLen; break;
            case Position.Left: stubX = start.x - sourceStubLen; break;
            case Position.Right: stubX = start.x + sourceStubLen; break;
        }

        // Check if 'next' is already a valid stub (aligned and far enough)
        let needInsert = true;
        if (next) {
            const isVertical = options.sourcePos === Position.Top || options.sourcePos === Position.Bottom;
            const isHorizontal = options.sourcePos === Position.Left || options.sourcePos === Position.Right;

            if (isVertical) {
                // Must be aligned on X, and Y must be at least sourceStubLen away in correct direction
                const alignedX = Math.abs(next.x - start.x) < 1;
                const correctDir = options.sourcePos === Position.Top ? (next.y <= start.y) : (next.y >= start.y);
                const validY = options.sourcePos === Position.Top ? (next.y <= start.y - sourceStubLen) : (next.y >= start.y + sourceStubLen);
                if (alignedX && validY) {
                    needInsert = false;
                } else if (alignedX && correctDir && !validY) {
                    // [FIX] Extend existing stub instead of inserting a new point.
                    // The next point is on the correct axis and direction, just too close.
                    // Move it outward to meet the minimum stub length.
                    next.y = options.sourcePos === Position.Top
                        ? start.y - sourceStubLen
                        : start.y + sourceStubLen;
                    needInsert = false;
                }
            } else if (isHorizontal) {
                // Must be aligned on Y, and X must be at least sourceStubLen away in correct direction
                const alignedY = Math.abs(next.y - start.y) < 1;
                const correctDir = options.sourcePos === Position.Left ? (next.x <= start.x) : (next.x >= start.x);
                const validX = options.sourcePos === Position.Left ? (next.x <= start.x - sourceStubLen) : (next.x >= start.x + sourceStubLen);
                if (alignedY && validX) {
                    needInsert = false;
                } else if (alignedY && correctDir && !validX) {
                    // [FIX] Extend existing stub instead of inserting a new point.
                    next.x = options.sourcePos === Position.Left
                        ? start.x - sourceStubLen
                        : start.x + sourceStubLen;
                    needInsert = false;
                }
            }
        }

        if (needInsert) {
            newStartStub = { x: stubX, y: stubY };
        }
    }

    if (options?.targetPos && points.length >= 1) {
        const end = points[points.length - 1];
        const prev = points.length > 1 ? points[points.length - 2] : null;

        // Calculate ideal stub position
        let stubX = end.x;
        let stubY = end.y;

        switch (options.targetPos) {
            case Position.Top: stubY = end.y - targetStubLen; break;
            case Position.Bottom: stubY = end.y + targetStubLen; break;
            case Position.Left: stubX = end.x - targetStubLen; break;
            case Position.Right: stubX = end.x + targetStubLen; break;
        }

        // Check if 'prev' is already a valid stub
        let needInsert = true;
        if (prev) {
            const isVertical = options.targetPos === Position.Top || options.targetPos === Position.Bottom;
            const isHorizontal = options.targetPos === Position.Left || options.targetPos === Position.Right;

            if (isVertical) {
                const alignedX = Math.abs(prev.x - end.x) < 1;
                const correctDir = options.targetPos === Position.Top ? (prev.y <= end.y) : (prev.y >= end.y);
                const validY = options.targetPos === Position.Top ? (prev.y <= end.y - targetStubLen) : (prev.y >= end.y + targetStubLen);
                if (alignedX && validY) {
                    needInsert = false;
                } else if (alignedX && correctDir && !validY) {
                    // [FIX] Extend existing stub instead of inserting a new point.
                    prev.y = options.targetPos === Position.Top
                        ? end.y - targetStubLen
                        : end.y + targetStubLen;
                    needInsert = false;
                }
            } else if (isHorizontal) {
                const alignedY = Math.abs(prev.y - end.y) < 1;
                const correctDir = options.targetPos === Position.Left ? (prev.x <= end.x) : (prev.x >= end.x);
                const validX = options.targetPos === Position.Left ? (prev.x <= end.x - targetStubLen) : (prev.x >= end.x + targetStubLen);
                if (alignedY && validX) {
                    needInsert = false;
                } else if (alignedY && correctDir && !validX) {
                    // [FIX] Extend existing stub instead of inserting a new point.
                    prev.x = options.targetPos === Position.Left
                        ? end.x - targetStubLen
                        : end.x + targetStubLen;
                    needInsert = false;
                }
            }
        }

        if (needInsert) {
            newEndStub = { x: stubX, y: stubY };
        }
    }

    const workPoints = [...points];
    // Insert end stub first (to not mess up start index if we used indices, but here we push/splice)
    // Actually, splice from end is safer if we splice start too.
    if (newEndStub) {
        workPoints.splice(workPoints.length - 1, 0, newEndStub);
    }
    if (newStartStub) {
        workPoints.splice(1, 0, newStartStub);
    }

    const orthoPoints: Point[] = [workPoints[0]];

    for (let i = 0; i < workPoints.length - 1; i++) {
        const curr = orthoPoints[orthoPoints.length - 1]; // Use the last added point
        const next = workPoints[i + 1];

        // Check if diagonal (tolerance 1px)
        const dx = Math.abs(curr.x - next.x);
        const dy = Math.abs(curr.y - next.y);

        if (dx > 1 && dy > 1) {
            // [FIX] Increased from 2.5 to 15. Values like dx=12, dy=419 are "almost vertical"
            // and must be snapped to orthogonal. The old 2.5 threshold only caught sub-pixel jitter;
            // 15px catches real layout coordinate misalignment (handle offset vs node center).
            const smallDiagonal = Math.min(dx, dy) < 15;
            if (smallDiagonal) {
                let corner: Point;
                if (options?.sourcePos && i === 0 && !newStartStub) {
                    const verticalFirst = !(options.sourcePos === Position.Left || options.sourcePos === Position.Right);
                    corner = verticalFirst ? { x: curr.x, y: next.y } : { x: next.x, y: curr.y };
                } else {
                    corner = dx < dy ? { x: curr.x, y: next.y } : { x: next.x, y: curr.y };
                }
                orthoPoints.push(corner);
                orthoPoints.push(next);
                continue;
            }

            // Diagonal! Insert corner.
            // Heuristic: Choose the corner that creates longer segments (less sharp/tiny turns)
            // Option A: Horizontal first (curr.x -> next.x, then curr.y)  => Corner: (next.x, curr.y)
            // Option B: Vertical first (curr.y -> next.y, then curr.x)    => Corner: (curr.x, next.y)

            const cornerA = { x: next.x, y: curr.y };
            const cornerB = { x: curr.x, y: next.y };

            // [FIX] Checking just the POINT is insufficient. We must check the SEGMENTS.
            // Path A: curr -> cornerA -> next
            // Path B: curr -> cornerB -> next
            const pathA = [curr, cornerA, next];
            const pathB = [curr, cornerB, next];

            // [FIX] Use 15px padding first, but if both fail (because VG endpoints are ~5px from obstacles), fallback to 2px
            let blockedA = isPathBlocked(pathA, obstacles, 15);
            let blockedB = isPathBlocked(pathB, obstacles, 15);

            if (blockedA && blockedB) {
                blockedA = isPathBlocked(pathA, obstacles, 2);
                blockedB = isPathBlocked(pathB, obstacles, 2);
            }

            // [DEBUG] Log decision for e10-like coordinates
            // if (Math.abs(curr.x - 2276) < 100 || Math.abs(next.x - 1225) < 100) {
            //            //            // }

            let preferHorizontal = true; // Default

            if (!blockedA && blockedB) {
                preferHorizontal = true;
            } else if (blockedA && !blockedB) {
                preferHorizontal = false;
            } else if (blockedA && blockedB) {
                // Both blocked! This means a simple L-shape collision.
                // Attempt to solve using Z-shape (staircase) by splitting the segment.
                // We try multiple split ratios because the obstacle might cover the center.

                const ratios = [0.5, 0.25, 0.75, 0.33, 0.66, 0.1, 0.9];
                let foundZ = false;

                // Pass 1: Standard Padding (10px)
                for (const r of ratios) {
                    const midX = curr.x + (next.x - curr.x) * r;
                    const pathC = [curr, { x: midX, y: curr.y }, { x: midX, y: next.y }, next];

                    // [FIX] Ensure first segment respects Source Port Direction
                    let validC = true;
                    if (options?.sourcePos && i === 0 && !newStartStub) {
                        if (options.sourcePos === Position.Top || options.sourcePos === Position.Bottom) {
                            validC = false;
                        }
                    }

                    if (validC && !isPathBlocked(pathC, obstacles, 10)) {
                        orthoPoints.push({ x: midX, y: curr.y });
                        orthoPoints.push({ x: midX, y: next.y });
                        foundZ = true;
                        break;
                    }

                    const midY = curr.y + (next.y - curr.y) * r;
                    const pathD = [curr, { x: curr.x, y: midY }, { x: next.x, y: midY }, next];

                    // [FIX] Ensure first segment respects Source Port Direction
                    let validD = true;
                    if (options?.sourcePos && i === 0 && !newStartStub) {
                        if (options.sourcePos === Position.Left || options.sourcePos === Position.Right) {
                            validD = false;
                        }
                    }

                    if (validD && !isPathBlocked(pathD, obstacles, 10)) {
                        orthoPoints.push({ x: curr.x, y: midY });
                        orthoPoints.push({ x: next.x, y: midY });
                        foundZ = true;
                        break;
                    }
                }

                // Pass 2: Reduced Padding (2px) - if standard fails, try to squeeze through cleanly
                if (!foundZ) {
                    for (const r of ratios) {
                        const midX = curr.x + (next.x - curr.x) * r;
                        const pathC = [curr, { x: midX, y: curr.y }, { x: midX, y: next.y }, next];

                        // [FIX] Ensure first segment respects Source Port Direction
                        let validC = true;
                        if (options?.sourcePos && i === 0 && !newStartStub) {
                            // This is the first segment directly from Source
                            if (options.sourcePos === Position.Top || options.sourcePos === Position.Bottom) {
                                // Must leave Vertically. PathC is Horiz first. INVALID.
                                validC = false;
                            }
                        }

                        if (validC && !isPathBlocked(pathC, obstacles, 2)) {
                            orthoPoints.push({ x: midX, y: curr.y });
                            orthoPoints.push({ x: midX, y: next.y });
                            foundZ = true;
                            break;
                        }

                        const midY = curr.y + (next.y - curr.y) * r;
                        const pathD = [curr, { x: curr.x, y: midY }, { x: next.x, y: midY }, next];

                        // [FIX] Ensure first segment respects Source Port Direction
                        let validD = true;
                        if (options?.sourcePos && i === 0 && !newStartStub) {
                            // This is the first segment directly from Source
                            if (options.sourcePos === Position.Left || options.sourcePos === Position.Right) {
                                // Must leave Horizontally. PathD is Vertical first. INVALID.
                                validD = false;
                            }
                        }

                        if (validD && !isPathBlocked(pathD, obstacles, 2)) {
                            orthoPoints.push({ x: curr.x, y: midY });
                            orthoPoints.push({ x: next.x, y: midY });
                            foundZ = true;
                            break;
                        }
                    }
                }

                if (foundZ) {
                    // [FIX] Z-shape logic must NOT skip the next point.
                    // The Z-shape replaces the path from `curr` to `next`.
                    // But `next` itself is the destination point of this segment.
                    // If we `continue` without pushing `next`, we create a gap in `orthoPoints`.
                    // In the next iteration, `curr` will be the last Z-point, but `next` will be `workPoints[i+2]`.
                    // The original `next` (workPoints[i+1]) is lost.
                    orthoPoints.push(next);
                    continue;
                }

                // All simple options blocked. 
                if (options?.strictOrthogonal) {
                    return null; // Signal that safe orthogonalization is mathematically impossible
                }

                // Fallback to geometry heuristic.
                const dx = Math.abs(curr.x - next.x);
                const dy = Math.abs(curr.y - next.y);
                preferHorizontal = dx > dy;
            } else {
                // Both free. Use geometry heuristic.
                // Check previous segment direction if possible
                const prev = orthoPoints.length > 1 ? orthoPoints[orthoPoints.length - 2] : null;

                if (prev) {
                    // If we were moving Horizontally, keep moving Horizontally (Option A)
                    if (Math.abs(prev.y - curr.y) < 1) preferHorizontal = true;
                    // If we were moving Vertically, keep moving Vertically (Option B)
                    else if (Math.abs(prev.x - curr.x) < 1) preferHorizontal = false;
                } else {
                    // No history, choose larger movement
                    const dx = Math.abs(curr.x - next.x);
                    const dy = Math.abs(curr.y - next.y);
                    preferHorizontal = dx > dy;
                }
            }

            if (preferHorizontal) {
                orthoPoints.push(cornerA);
            } else {
                orthoPoints.push(cornerB);
            }
        }
        orthoPoints.push(next);
    }

    // [FIX] Final validation: ensure first and last segments are truly orthogonal
    // This catches any edge cases where the earlier logic didn't work correctly
    if (orthoPoints.length >= 2) {
        const first = orthoPoints[0];
        const second = orthoPoints[1];
        // If first segment is still diagonal, force orthogonal by inserting corner
        if (Math.abs(first.x - second.x) > 1 && Math.abs(first.y - second.y) > 1) {
            // Use port direction if available
            let verticalFirst = true; // Default to vertical first

            if (options?.sourcePos) {
                if (options.sourcePos === Position.Left || options.sourcePos === Position.Right) {
                    verticalFirst = false; // Horizontal first for side ports
                } else {
                    verticalFirst = true; // Vertical first for top/bottom ports
                }
            }

            // [CHECK] Check if corner is blocked
            const cornerV = { x: first.x, y: second.y }; // Vertical first
            const cornerH = { x: second.x, y: first.y }; // Horizontal first

            const blockedV = isPointBlocked(cornerV);
            const blockedH = isPointBlocked(cornerH);

            if (!blockedV && blockedH) verticalFirst = true;
            else if (blockedV && !blockedH) verticalFirst = false;

            if (verticalFirst) {
                orthoPoints.splice(1, 0, cornerV);
            } else {
                orthoPoints.splice(1, 0, cornerH);
            }
        }
    }

    if (orthoPoints.length >= 2) {
        const last = orthoPoints[orthoPoints.length - 1];
        const secondLast = orthoPoints[orthoPoints.length - 2];
        // If last segment is still diagonal, force orthogonal
        if (Math.abs(last.x - secondLast.x) > 1 && Math.abs(last.y - secondLast.y) > 1) {
            // Use port direction if available
            let verticalForLast = true;

            if (options?.targetPos) {
                if (options.targetPos === Position.Left || options.targetPos === Position.Right) {
                    verticalForLast = false; // Horizontal approach for side ports
                } else {
                    verticalForLast = true; // Vertical approach for top/bottom ports
                }
            }

            // [CHECK] Check if corner is blocked
            const cornerV = { x: last.x, y: secondLast.y }; // Vertical approach
            const cornerH = { x: secondLast.x, y: last.y }; // Horizontal approach

            const blockedV = isPointBlocked(cornerV);
            const blockedH = isPointBlocked(cornerH);

            if (!blockedV && blockedH) verticalForLast = true;
            else if (blockedV && !blockedH) verticalForLast = false;

            if (verticalForLast) {
                orthoPoints.splice(orthoPoints.length - 1, 0, cornerV);
            } else {
                orthoPoints.splice(orthoPoints.length - 1, 0, cornerH);
            }
        }
    }

    return orthoPoints;
}

// ---------- Port Selection Utilities ----------

/**
 * Generate candidate ports for a node.
 * Returns an array of {pos: Position, point: Point} for each side.
 */
export function getCandidatePorts(node: NodeLike): { pos: Position; point: Point }[] {
    // [FIX] Support both ReactFlow Node (measured, position) and our Simplified Node (width, height, x, y)
    const w = (node.width ?? node.measured?.width ?? 150) as number;
    const h = (node.height ?? node.measured?.height ?? 80) as number;

    // Check for top-level x,y (Simplified) or use helper (ReactFlow)
    let x = node.x;
    let y = node.y;
    if (x === undefined || y === undefined) {
        const p = getNodePosition(node);
        x = p.x;
        y = p.y;
    }

    const cx = x + w / 2;
    const cy = y + h / 2;
    return [
        { pos: Position.Top, point: { x: cx, y: y } },
        { pos: Position.Bottom, point: { x: cx, y: y + h } },
        { pos: Position.Left, point: { x: x, y: cy } },
        { pos: Position.Right, point: { x: x + w, y: cy } },
    ];
}

import { selectOptimalPorts } from './costAwarePorts';

/**
 * Choose the best combination of source/target ports based on Cost-Aware logic.
 * Wraps the new selectOptimalPorts for backward compatibility.
 */
export function selectBestPortCombination(
    sourceNode: NodeLike,
    targetNode: NodeLike,
    obstacles: Rectangle[],
    config: Partial<PortSelectionConfig> = {}
): { sourcePos: Position; targetPos: Position } {
    const sPos = getNodePosition(sourceNode);
    const tPos = getNodePosition(targetNode);

    const sourceRect = {
        x: sPos.x,
        y: sPos.y,
        width: sourceNode.width ?? sourceNode.measured?.width ?? 150,
        height: sourceNode.height ?? sourceNode.measured?.height ?? 80,
    };
    const targetRect = {
        x: tPos.x,
        y: tPos.y,
        width: targetNode.width ?? targetNode.measured?.width ?? 150,
        height: targetNode.height ?? targetNode.measured?.height ?? 80,
    };

    const result = selectOptimalPorts(
        sourceRect,
        targetRect,
        obstacles,
        [],
        config
    );
    return { sourcePos: result.sourcePos, targetPos: result.targetPos };
}

/**
 * Placeholder for A* routing on a grid.
 * Returns a list of points or null if not implemented.
 */
export function routeWithAStar(
    _source: Point,
    _target: Point,
    _obstacles: Rectangle[],
    _config: unknown = {}
): Point[] | null {
    return null;
}
export function enforcePortSpacing(points: Point[], minSpacing: number = 12): Point[] {
    if (points.length < 2) return points;
    const result: Point[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const prev = result[result.length - 1];
        const curr = points[i];
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= minSpacing) {
            result.push(curr);
        } else {
            // Insert a small offset point to enforce spacing
            let offsetX = 0, offsetY = 0;
            if (Math.abs(dx) > Math.abs(dy)) {
                // primarily horizontal, offset vertically
                offsetY = minSpacing / 2;
            } else {
                // primarily vertical, offset horizontally
                offsetX = minSpacing / 2;
            }
            const midX = (prev.x + curr.x) / 2 + offsetX;
            const midY = (prev.y + curr.y) / 2 + offsetY;
            result.push({ x: midX, y: midY });
            result.push(curr);
        }
    }
    return result;
}

/**
 * [NEW] Aggressively remove tiny orthogonal jogs (Z-shapes) that are smaller than the corner radius.
 * This prevents "hard turns" caused by micro-segments.
 * Safe to run on main thread (no obstacle check).
 */
export function removeTinyOrthogonalJogs(
    points: Point[],
    threshold: number = 20,
    obstacles: Rectangle[] | SpatialIndex = [],
    options: { sourcePos?: Position, targetPos?: Position } = {} // [NEW] Safe options
): Point[] {
    if (points.length < 4) return points;
    const res = points.map(p => ({ ...p })); // Clone
    let changed = true;
    let maxIter = 3;

    // Helper to check obstacles
    const isBlocked = (pts: Point[]) => {
        // [FIX] Use -1 padding. Since pts start/end EXACTLY on the bounding boxes of source/target nodes,
        // any positive padding or 0 padding will cause isHLineIntersectingRect/isVLineIntersectingRect to
        // falsely report an intersection. A padding of -1 ensures that lines touching the exterior boundary 
        // but routing outwards are considered safe, allowing stair-steps near nodes to be correctly flattened.
        
        // We must also strip any dynamic padding on obstacles for this strict check
        const strictObstacles = Array.isArray(obstacles) 
            ? obstacles.map(obs => ({ x: obs.x, y: obs.y, width: obs.width, height: obs.height }))
            : typeof obstacles.getAll === 'function' ? obstacles.getAll().map(obs => ({ x: obs.x, y: obs.y, width: obs.width, height: obs.height })) : [];
            
        return isPathBlocked(pts, strictObstacles, -1);
    };

    const canUseCandidate = (candidate: Point[], windowStart: number): boolean => {
        const first = candidate[0];
        const second = candidate[1];
        const beforeLast = candidate[candidate.length - 2];
        const last = candidate[candidate.length - 1];

        if (windowStart === 0 && options.sourcePos) {
            const firstIsVertical = Math.abs(first.x - second.x) < 2;
            const firstIsHorizontal = Math.abs(first.y - second.y) < 2;
            const sourceNeedsVertical = options.sourcePos === Position.Top || options.sourcePos === Position.Bottom;
            const sourceNeedsHorizontal = options.sourcePos === Position.Left || options.sourcePos === Position.Right;
            if ((sourceNeedsVertical && !firstIsVertical) || (sourceNeedsHorizontal && !firstIsHorizontal)) {
                return false;
            }
        }

        if (windowStart === res.length - 4 && options.targetPos) {
            const lastIsVertical = Math.abs(beforeLast.x - last.x) < 2;
            const lastIsHorizontal = Math.abs(beforeLast.y - last.y) < 2;
            const targetNeedsVertical = options.targetPos === Position.Top || options.targetPos === Position.Bottom;
            const targetNeedsHorizontal = options.targetPos === Position.Left || options.targetPos === Position.Right;
            if ((targetNeedsVertical && !lastIsVertical) || (targetNeedsHorizontal && !lastIsHorizontal)) {
                return false;
            }
        }

        return !isBlocked(candidate);
    };

    const replaceWindow = (start: number, candidate: Point[]) => {
        for (let offset = 0; offset < 4; offset++) {
            res[start + offset].x = candidate[offset].x;
            res[start + offset].y = candidate[offset].y;
        }
    };

    while (changed && maxIter > 0) {
        changed = false;
        maxIter--;

        for (let i = 0; i < res.length - 3; i++) {
            const p0 = res[i];
            const p1 = res[i + 1];
            const p2 = res[i + 2];
            const p3 = res[i + 3];

            // Detect Z-Shape: H-V-H or V-H-V
            // [FIX] Increased tolerance to 2.0px to handle sub-pixel noise
            const isH1 = Math.abs(p0.y - p1.y) < 2;
            const isV2 = Math.abs(p1.x - p2.x) < 2;
            const isH3 = Math.abs(p2.y - p3.y) < 2;

            if (isH1 && isV2 && isH3) {
                // H-V-H. Bridge is V (p1->p2).
                const bridgeLen = Math.abs(p1.y - p2.y);
                if (bridgeLen < threshold) {
                    // [FIX] Stub Protection: If p0 is start point, Ensure p0->p1 is long enough and correct direction
                    const isStart = (i === 0);
                    const isEnd = (i === res.length - 4);

                    // Strategy 1: Flatten to p0.y (Forward Align)
                    const newP1 = { x: p1.x, y: p0.y };
                    const newP2 = { x: p2.x, y: p0.y };
                    const newP3 = { x: p3.x, y: p0.y };

                    // [FIX] When isEnd=true, default to allowing alignment if target port is horizontal
                    // (flattening Y doesn't break horizontal port connections).
                    let canAlign1 = true;
                    if (isEnd && options.targetPos) {
                        const isTargetHoriz = options.targetPos === Position.Left || options.targetPos === Position.Right;
                        if (isTargetHoriz) {
                            // Horizontal target port: Y-flatten is safe, check min segment
                            const lastLen = Math.abs(newP3.x - newP2.x);
                            if (lastLen < 5) canAlign1 = false;
                        } else {
                            // Vertical target port: must preserve Y, flattening to p0.y may break it
                            const lastLen = Math.abs(newP3.y - newP2.y);
                            if (lastLen < 30) canAlign1 = false;
                        }
                    }

                    if (canAlign1 && !isBlocked([p0, newP1, newP2, newP3])) {
                        p1.y = p0.y;
                        p2.y = p0.y;
                        p3.y = p0.y;
                        changed = true;
                        continue;
                    }

                    // Strategy 2: Flatten to p3.y (Backward Align)
                    const newP0b = { x: p0.x, y: p3.y };
                    const newP1b = { x: p1.x, y: p3.y };
                    const newP2b = { x: p2.x, y: p3.y };

                    // [FIX] When isStart=true, default to allowing alignment if source port is horizontal
                    let canAlign2 = true;
                    if (isStart && options.sourcePos) {
                        const isSourceHoriz = options.sourcePos === Position.Left || options.sourcePos === Position.Right;
                        if (isSourceHoriz) {
                            const firstLen = Math.abs(newP1b.x - newP0b.x);
                            if (firstLen < 5) canAlign2 = false;
                        } else {
                            const firstLen = Math.abs(newP1b.y - newP0b.y);
                            if (firstLen < 30) canAlign2 = false;
                        }
                    }

                    if (canAlign2 && !isBlocked([newP0b, newP1b, newP2b, p3])) {
                        p0.y = p3.y;
                        p1.y = p3.y;
                        p2.y = p3.y;
                        changed = true;
                        continue;
                    }

                    // Strategy 3: move the local bridge onto a shared middle lane.
                    // This removes tiny mid-route notches when both original axes are
                    // too close to an obstacle, while keeping the path orthogonal.
                    const midY = Math.round((p0.y + p3.y) / 2);
                    if (Math.abs(midY - p0.y) > 1 && Math.abs(midY - p3.y) > 1) {
                        const midCandidate = [
                            p0,
                            { x: p0.x, y: midY },
                            { x: p3.x, y: midY },
                            p3,
                        ];
                        if (canUseCandidate(midCandidate, i)) {
                            replaceWindow(i, midCandidate);
                            changed = true;
                            continue;
                        }
                    }
                }
            }

            const isV1 = Math.abs(p0.x - p1.x) < 2;
            const isH2 = Math.abs(p1.y - p2.y) < 2;
            const isV3 = Math.abs(p2.x - p3.x) < 2;

            if (isV1 && isH2 && isV3) {
                // V-H-V. Bridge is H (p1->p2).
                const bridgeLen = Math.abs(p1.x - p2.x);
                if (bridgeLen < threshold) {
                    const isStart = (i === 0);
                    const isEnd = (i === res.length - 4);

                    // Strategy 1: Flatten to p0.x
                    const newP1 = { x: p0.x, y: p1.y };
                    const newP2 = { x: p0.x, y: p2.y };
                    const newP3 = { x: p0.x, y: p3.y };

                    // [FIX] When isEnd=true, default to allowing alignment if target port is vertical
                    // (flattening X doesn't break vertical port connections).
                    // Only block if target is horizontal AND the last segment would be too short.
                    let canAlign1 = true;
                    if (isEnd && options.targetPos) {
                        const isTargetVert = options.targetPos === Position.Top || options.targetPos === Position.Bottom;
                        if (isTargetVert) {
                            // Vertical target port: X-flatten is safe, just check min segment length
                            const lastLen = Math.abs(newP3.y - newP2.y);
                            if (lastLen < 5) canAlign1 = false;
                        } else {
                            // Horizontal target port: must preserve X, so flattening to p0.x may break it
                            const lastLen = Math.abs(newP3.x - newP2.x);
                            if (lastLen < 30) canAlign1 = false;
                        }
                    }

                    if (canAlign1 && !isBlocked([p0, newP1, newP2, newP3])) {
                        p1.x = p0.x;
                        p2.x = p0.x;
                        p3.x = p0.x;
                        changed = true;
                        continue;
                    }

                    // Strategy 2: Flatten to p3.x
                    const newP0b = { x: p3.x, y: p0.y };
                    const newP1b = { x: p3.x, y: p1.y };
                    const newP2b = { x: p3.x, y: p2.y };

                    // [FIX] When isStart=true, default to allowing alignment if source port is vertical
                    let canAlign2 = true;
                    if (isStart && options.sourcePos) {
                        const isSourceVert = options.sourcePos === Position.Top || options.sourcePos === Position.Bottom;
                        if (isSourceVert) {
                            const firstLen = Math.abs(newP1b.y - newP0b.y);
                            if (firstLen < 5) canAlign2 = false;
                        } else {
                            const firstLen = Math.abs(newP1b.x - newP0b.x);
                            if (firstLen < 30) canAlign2 = false;
                        }
                    }

                    if (canAlign2 && !isBlocked([newP0b, newP1b, newP2b, p3])) {
                        p0.x = p3.x;
                        p1.x = p3.x;
                        p2.x = p3.x;
                        changed = true;
                        continue;
                    }

                    // Strategy 3: move the local bridge onto a shared middle lane.
                    // This turns a small V-H-V side-step into one clean detour when
                    // either original vertical axis would collide.
                    const midX = Math.round((p0.x + p3.x) / 2);
                    if (Math.abs(midX - p0.x) > 1 && Math.abs(midX - p3.x) > 1) {
                        const midCandidate = [
                            p0,
                            { x: midX, y: p0.y },
                            { x: midX, y: p3.y },
                            p3,
                        ];
                        if (canUseCandidate(midCandidate, i)) {
                            replaceWindow(i, midCandidate);
                            changed = true;
                            continue;
                        }
                    }
                }
            }
        }

        // Cleanup collinear points after flattening
        if (changed) {
            const clean: Point[] = [res[0]];
            for (let k = 1; k < res.length; k++) {
                const prev = clean[clean.length - 1];
                const curr = res[k];
                if (Math.abs(curr.x - prev.x) > 1 || Math.abs(curr.y - prev.y) > 1) {
                    clean.push(curr);
                }
            }
            // Replace res content logic
            if (clean.length !== res.length) {
                res.length = 0;
                res.push(...clean);
            }
        }
    }
    return res;
}

/**
 * Aggressively smooths short segments by converting them into diagonal shortcuts.
 * Solves "Hard Corner" issues where orthogonal segments are too short for fillet.
 */
export function smoothShortSegments(
    points: Point[],
    threshold: number = 30,
    obstacles: Rectangle[] | SpatialIndex = []
): Point[] {
    if (points.length < 3) return points;
    const res = points.map(p => ({ ...p }));
    let changed = true;
    let maxIter = 3;

    const isBlocked = (pts: Point[]) => isPathBlocked(pts, obstacles, 10);

    while (changed && maxIter > 0) {
        changed = false;
        maxIter--;

        // Check for short segments
        for (let i = 0; i < res.length - 1; i++) {
            const pStart = res[i];
            const pEnd = res[i + 1];
            const dist = Math.abs(pStart.x - pEnd.x) + Math.abs(pStart.y - pEnd.y);

            if (dist < threshold && dist > 0.1) {
                // Short segment detected!

                // [FIX] NEVER smooth the first or last segments directly if it changes start/end angle.
                // We want to preserve Orthogonal Port connections.

                // Case 1: Start Segment (i=0)
                // P0 -> P1 is short. P0 is fixed source.
                // If we remove P1, we get P0 -> P2.
                // Unless P0->P2 is also orthogonal, this creates a diagonal exit.
                if (i === 0) {
                    // Skip smoothing start segment to preserve orthogonal exit
                    continue;
                }

                // Case 2: End Segment (i = len-2)
                // P(n-1) -> P(n) is short. P(n) is fixed target.
                // If we remove P(n-1), we get P(n-2) -> P(n).
                // Unless P(n-2)->P(n) is also orthogonal, this creates a diagonal entry.
                else if (i === res.length - 2) {
                    // Skip smoothing end segment to preserve orthogonal entry
                    continue;
                }

                // Case 3: Middle Segment
                // P(i) -> P(i+1) is short.
                // Try to replace with Midpoint?
                // Or try P(i-1) -> P(i+1) (removing P(i))
                // Or try P(i) -> P(i+2) (removing P(i+1))
                else if (i > 0 && i < res.length - 2) {
                    const pPrev = res[i - 1];
                    const pNext = res[i + 2];

                    // Try bridging P(i-1) -> P(i+1) (Cutting corner at P(i))
                    if (!isBlocked([pPrev, pEnd])) {
                        res.splice(i, 1); // Remove P(i)
                        changed = true;
                        i--;
                        continue;
                    }

                    // Try bridging P(i) -> P(i+2) (Cutting corner at P(i+1))
                    if (!isBlocked([pStart, pNext])) {
                        res.splice(i + 1, 1); // Remove P(i+1)
                        changed = true;
                        i--;
                        continue;
                    }
                }
            }
        }
    }
    return res;
}

// [NEW] Industry Standard Corner Filleting
// Uses Quadratic Bezier curves for smooth transitions between orthogonal segments.
export function createFilletedPath(
    points: Point[],
    cornerRadius: number = 12
): string {
    if (!points || points.length < 2) return '';

    // 1. Remove consecutive duplicate points (Tolerance: 0.5px)
    // Duplicate points cause zero-length segments which force radius to 0
    const cleanPoints: Point[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const prev = cleanPoints[cleanPoints.length - 1];
        const curr = points[i];
        const dist = Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y);
        if (dist > 0.5) {
            cleanPoints.push(curr);
        }
    }

    if (cleanPoints.length < 2) return '';

    const normalizedPoints = collapseCollinearBacktracks(cleanPoints);
    if (normalizedPoints.length < 2) return '';

    // [FIX] Snap near-orthogonal segments to perfect orthogonal BEFORE generating arcs.
    // Eliminates diagonal artifacts caused by fractional handle/port coordinate misalignment (e.g. dx=9, dy=36).
    // This is the final defense layer — all SVG rendering paths (Worker, hydration, channel) converge here.
    const microAxisSnap = 1;
    for (let i = 0; i < normalizedPoints.length - 1; i++) {
        const a = normalizedPoints[i];
        const b = normalizedPoints[i + 1];
        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);
        if (dx <= microAxisSnap && dy > microAxisSnap) {
            b.x = a.x;
            continue;
        }
        if (dy <= microAxisSnap && dx > microAxisSnap) {
            b.y = a.y;
            continue;
        }
        if (dx > microAxisSnap && dy > microAxisSnap) {
            // Use proportional threshold: if the minor-axis is <15% of major-axis
            // AND the minor-axis is <25px (safety cap), snap to orthogonal.
            // This handles A* grid quantization artifacts (~20px) on long segments
            // while preserving intentional diagonal routing on short ones.
            const ratio = Math.min(dx, dy) / Math.max(dx, dy);
            const minorAxis = Math.min(dx, dy);
            if (ratio < 0.16 && minorAxis < 25) {
                if (dx < dy) {
                    // Almost vertical — snap x
                    b.x = a.x;
                } else {
                    // Almost horizontal — snap y
                    b.y = a.y;
                }
            }
        }
    }

    // [FIX] Micro-jog elimination: remove S-shaped deviations ≤ 3px offset.
    // Pattern: two consecutive turns with tiny lateral offset (e.g., x shifts from 2531 to 2533).
    // These create visually meaningless bends and sub-pixel arc artifacts.
    // Strategy: scan for 3-point windows A→B→C where one axis drifts ≤3px total,
    // then snap B to align with A on that axis, effectively straightening the path.
    for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < normalizedPoints.length - 2; i++) {
            const a = normalizedPoints[i];
            const b = normalizedPoints[i + 1];
            const c = normalizedPoints[i + 2];

            // Check for vertical micro-jog: A.x ≈ C.x but B.x is slightly off
            const xDriftAC = Math.abs(a.x - c.x);
            const xDriftAB = Math.abs(a.x - b.x);
            const xDriftBC = Math.abs(b.x - c.x);
            if (xDriftAC <= 3 && (xDriftAB > 0.3 || xDriftBC > 0.3) && xDriftAB <= 3 && xDriftBC <= 3) {
                // All three points are within 3px on X — snap to a single X
                const avgX = a.x; // anchor to first point
                b.x = avgX;
                c.x = avgX;
            }

            // Check for horizontal micro-jog: A.y ≈ C.y but B.y is slightly off
            const yDriftAC = Math.abs(a.y - c.y);
            const yDriftAB = Math.abs(a.y - b.y);
            const yDriftBC = Math.abs(b.y - c.y);
            if (yDriftAC <= 3 && (yDriftAB > 0.3 || yDriftBC > 0.3) && yDriftAB <= 3 && yDriftBC <= 3) {
                const avgY = a.y;
                b.y = avgY;
                c.y = avgY;
            }
        }
    }

    // [FIX] Second collinear cleanup: the micro-jog pass above may have created
    // new collinear sequences (e.g., three points now on the same vertical line).
    // Re-run collapse to eliminate them before arc generation.
    const finalPoints = collapseCollinearBacktracks(normalizedPoints);
    if (finalPoints.length < 2) return '';

    const shortThreshold = cornerRadius * 2;
    let shortChanged = false;

    for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i + 3 < finalPoints.length; i++) {
            const a = finalPoints[i];
            const b = finalPoints[i + 1];
            const c = finalPoints[i + 2];
            const d = finalPoints[i + 3];
            const canMoveWindowEnd = i + 3 < finalPoints.length - 1;

            const firstVertical = Math.abs(a.x - b.x) < 1;
            const bridgeHorizontal = Math.abs(b.y - c.y) < 1;
            const secondVertical = Math.abs(c.x - d.x) < 1;
            if (firstVertical && bridgeHorizontal && secondVertical) {
                const bridgeLength = Math.abs(b.x - c.x);
                const sameDirection = Math.sign(b.y - a.y) === Math.sign(d.y - c.y);
                if (canMoveWindowEnd && sameDirection && bridgeLength > 0.5 && bridgeLength < shortThreshold) {
                    finalPoints.splice(i + 1, 3, { x: a.x, y: d.y });
                    shortChanged = true;
                    i = Math.max(-1, i - 2);
                    continue;
                }
            }

            const firstHorizontal = Math.abs(a.y - b.y) < 1;
            const bridgeVertical = Math.abs(b.x - c.x) < 1;
            const secondHorizontal = Math.abs(c.y - d.y) < 1;
            if (firstHorizontal && bridgeVertical && secondHorizontal) {
                const bridgeLength = Math.abs(b.y - c.y);
                const sameDirection = Math.sign(b.x - a.x) === Math.sign(d.x - c.x);
                if (canMoveWindowEnd && sameDirection && bridgeLength > 0.5 && bridgeLength < shortThreshold) {
                    finalPoints.splice(i + 1, 3, { x: d.x, y: a.y });
                    shortChanged = true;
                    i = Math.max(-1, i - 2);
                }
            }
        }
    }

    // [FIX-orthogonal] Short-segment elimination: remove S/Z-jog segments shorter than 2*cornerRadius.
    // When A* grid-snapping produces a tiny lateral offset (e.g. 9.75px), the resulting
    // micro-segment forces cornerRadius to compress (e.g. 8→4.875), visually creating
    // a diagonal "kink" instead of a clean orthogonal corner.
    // Strategy: scan for 3-point A→B→C where seg AB or BC is very short AND the
    // surrounding segments form an S-shape (same direction before and after the bridge).
    // Snap B to eliminate the jog, then re-collapse collinear points.
    for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < finalPoints.length - 1; i++) {
            const prev = finalPoints[i - 1];
            const curr = finalPoints[i];
            const next = finalPoints[i + 1];

            const segPrev = Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y);
            const segNext = Math.abs(next.x - curr.x) + Math.abs(next.y - curr.y);

            // Check if current point creates a short bridge
            const shortSeg = Math.min(segPrev, segNext);
            if (shortSeg >= shortThreshold) continue;

            // Determine if this is an S-jog: prev-curr and curr-next are in the same axis
            const prevHoriz = Math.abs(prev.y - curr.y) < 1;
            const nextHoriz = Math.abs(curr.y - next.y) < 1;
            const prevVert = Math.abs(prev.x - curr.x) < 1;
            const nextVert = Math.abs(curr.x - next.x) < 1;

            // S-jog: H→V→H or V→H→V where the bridge (middle) segment is short
            if (prevVert && nextVert && segPrev < shortThreshold) {
                // Short horizontal bridge between two vertical segments
                // Snap curr.x and next.x to prev.x to straighten
                curr.x = prev.x;
                // If next is a corner, snap its x too
                if (i + 2 < finalPoints.length) {
                    // Only snap next if it keeps the path valid
                    const afterNext = finalPoints[i + 2];
                    if (Math.abs(afterNext.y - next.y) < 1) {
                        // afterNext→next is horizontal, safe to move next.x
                        next.x = prev.x;
                    }
                }
                shortChanged = true;
            } else if (prevHoriz && nextHoriz && segPrev < shortThreshold) {
                // Short vertical bridge between two horizontal segments
                curr.y = prev.y;
                if (i + 2 < finalPoints.length) {
                    const afterNext = finalPoints[i + 2];
                    if (Math.abs(afterNext.x - next.x) < 1) {
                        next.y = prev.y;
                    }
                }
                shortChanged = true;
            }
        }
    }
    // Re-collapse if we straightened any jogs
    const renderPoints = shortChanged
        ? collapseCollinearBacktracks(finalPoints)
        : finalPoints;

    if (renderPoints.length < 2) return '';

    // [FIX] Final strict orthogonality pass: any remaining diagonal segment
    // (both dx>1 AND dy>1) means an intermediate waypoint was lost upstream.
    // Insert an L-turn to restore proper right-angle routing.
    // Rule: dominant-axis-first — if mostly vertical (dy>dx), go horizontal first
    // (insert the x-target at current y), so the path arrives at the target vertically.
    // This is the "final defense" — createFilletedPath guarantees orthogonal SVG output.
    let diagFixed = false;
    const orthoList: Point[] = [renderPoints[0]];
    for (let i = 0; i < renderPoints.length - 1; i++) {
        const pa = renderPoints[i];
        const pb = renderPoints[i + 1];
        const ddx = Math.abs(pa.x - pb.x);
        const ddy = Math.abs(pa.y - pb.y);
        if (ddx > 1 && ddy > 1) {
            // Insert L-turn: dominant-axis first
            const lturn = ddy >= ddx
                ? { x: pb.x, y: pa.y }  // horizontal first → vertical approach to target
                : { x: pa.x, y: pb.y }; // vertical first   → horizontal approach to target
            orthoList.push(lturn);
            diagFixed = true;
        }
        orthoList.push({ x: pb.x, y: pb.y });
    }
    const finalRenderPoints = diagFixed
        ? collapseCollinearBacktracks(orthoList)
        : renderPoints;

    if (finalRenderPoints.length < 2) return '';

    if (cornerRadius <= 0) {
        return "M " + finalRenderPoints.map(p => `${p.x} ${p.y}`).join(" L ");
    }

    let path = `M ${finalRenderPoints[0].x} ${finalRenderPoints[0].y}`;

    for (let i = 1; i < finalRenderPoints.length - 1; i++) {
        const pPrev = finalRenderPoints[i - 1];
        const pCurr = finalRenderPoints[i];
        const pNext = finalRenderPoints[i + 1];

        // 1. Calculate vectors
        const v1 = { x: pCurr.x - pPrev.x, y: pCurr.y - pPrev.y };
        const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };

        const l1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const l2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

        // 2. Determine safe radius
        // Cannot exceed half the length of the shortest entering/exiting segment
        const r = Math.min(cornerRadius, l1 / 2, l2 / 2);

        // 3. Identify Start/End of Curve
        // Start: Move back 'r' from pCurr along v1
        // End: Move forward 'r' from pCurr along v2

        // Normalize vectors handled implicitly by ratio
        const r1Ratio = (l1 > 0) ? (r / l1) : 0;
        const r2Ratio = (l2 > 0) ? (r / l2) : 0;

        const startCurve = {
            x: pCurr.x - v1.x * r1Ratio,
            y: pCurr.y - v1.y * r1Ratio
        };

        const endCurve = {
            x: pCurr.x + v2.x * r2Ratio,
            y: pCurr.y + v2.y * r2Ratio
        };

        // 4. Draw Line to Start of Curve
        path += ` L ${startCurve.x} ${startCurve.y}`;

        // 5. Draw Curve (Circular Arc instead of Quadratic Bezier)
        // Cross product to determine turn direction (clockwise vs counter-clockwise)
        const cross = v1.x * v2.y - v1.y * v2.x;
        // sweep-flag: 1 if positive cross product (clockwise turn), 0 otherwise
        const sweepFlag = cross > 0 ? 1 : 0;
        
        // For 90 degree corners (orthogonal routing), distance to corner `r` equals the circular radius.
        // For non-90, we compute the actual radius required for a tangent arc, though most are 90.
        // Using `r` as the distance to corner is standard. The actual circle radius R = r * tan(theta/2).
        // For orthogonal lines, R = r. To handle non-orthogonal gracefully without complex math,
        // we can still use Q for non-orthogonal, or just compute R.
        // Let's use the actual angle:
        const dot = v1.x * v2.x + v1.y * v2.y;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot / (l1 * l2))));
        // If angle is close to 0 or 180, it's straight, handled by skipping or small r.
        const actualRadius = r * Math.abs(Math.tan(angle / 2));
        
        // Ensure we don't have NaN or Infinite radius.
        // Minimum 2px to avoid visually imperceptible micro-arcs that add SVG complexity.
        const safeRadius = Math.max(2, Number.isFinite(actualRadius) ? actualRadius : r);

        // A rx ry x-axis-rotation large-arc-flag sweep-flag x y
        path += ` A ${safeRadius} ${safeRadius} 0 0 ${sweepFlag} ${endCurve.x} ${endCurve.y}`;
    }

    // Final segment to last point
    const last = finalRenderPoints[finalRenderPoints.length - 1];
    path += ` L ${last.x} ${last.y}`;

    return path;

}

// [NEW] Offsets path segments by a fixed amount perpendicular to their direction
// Used for "Nudging" shared segments to separate them visualy.
export function offsetPathSegments(points: Point[], offset: number): Point[] {
    if (points.length < 2 || offset === 0) return points;

    const result: Point[] = [];
    // We offset the segments, which means we need to recalculate the intersection points (corners).
    // Simple approach for orthogonal paths:
    // If horizontal centered at Y, new Y = Y + offset.
    // If vertical centered at X, new X = X + offset.

    // BUT: The offset direction depends on the "flow" usually?
    // Or just absolute offset?
    // If we want to separate A and B, A gets +5, B gets -5.
    // Vertical: A's X += 5. Horizontal: A's Y += 5?
    // This works if we assume "Right/Down" is positive.

    // Corner handling:
    // p0(x, y) -> p1(x+100, y) -> p2(x+100, y+50)
    // Offset +5:
    // Seg1: y += 5.
    // Seg2: x += 5.
    // New Corner: (x+100+5, y+5)

    // Algorithm:
    // 1. Calculate offset line for each segment.
    // 2. Intersect adjacent offset lines to find new corner points.

    // For orthogonal paths, this is trivial.
    // p[i] is the start of segment i. p[i+1] is end.

    // We treat the points as defining a sequence of segments.
    // We shift each segment.
    // Then we reconnect them.

    const segments: { p1: Point, p2: Point, isHorz: boolean }[] = [];

    for (let i = 0; i < points.length - 1; i++) {
        segments.push({
            p1: points[i],
            p2: points[i + 1],
            isHorz: Math.abs(points[i].y - points[i + 1].y) < 1
        });
    }

    // Verify orthogonality (if not orthogonal, this simple logic fails, but we assume orthogonal from previous steps)

    // Shift segments
    const shiftedSegments = segments.map(seg => {
        if (seg.isHorz) {
            return {
                start: { x: seg.p1.x, y: seg.p1.y + offset },
                end: { x: seg.p2.x, y: seg.p2.y + offset },
                isHorz: true
            };
        } else {
            return {
                start: { x: seg.p1.x + offset, y: seg.p1.y },
                end: { x: seg.p2.x + offset, y: seg.p2.y },
                isHorz: false
            };
        }
    });

    // Rebuild points
    // First point
    result.push(shiftedSegments[0].start);

    for (let i = 0; i < shiftedSegments.length - 1; i++) {
        const curr = shiftedSegments[i];
        const next = shiftedSegments[i + 1];

        // Find intersection of curr and next
        // Since they are orthogonal and connected, the intersection is simply:
        // If curr is Horz, next is Vert: (next.x, curr.y)
        // If curr is Vert, next is Horz: (curr.x, next.y)

        // Wait, shifted lines intersection:
        // Curr (shifted): Y = Cy
        // Next (shifted): X = Nx
        // Intersection: (Nx, Cy)

        if (curr.isHorz && !next.isHorz) {
            result.push({ x: next.start.x, y: curr.start.y });
        } else if (!curr.isHorz && next.isHorz) {
            result.push({ x: curr.start.x, y: next.start.y });
        } else {
            // Parallel segments? (Should be collapsed by simplify, but if not...)
            // Just use the midpoint or continue
            result.push(curr.end);
        }
    }

    // Last point
    result.push(shiftedSegments[shiftedSegments.length - 1].end);

    return result;
}

// [NEW] Optimized Path with Jumps using Line Obstacles
// Replaces createRoundedPathWithJumps with a version that uses pre-computed line obstacles
// instead of re-calculating other paths.
export function createPathWithJumpsFromObstacles(
    points: Point[],
    borderRadius: number,
    jumpRadius: number,
    lineObstacles: { start: Point, end: Point }[]
): string {
    if (!points || points.length < 2) return '';

    // De-dupe
    const cleanPoints: Point[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const last = cleanPoints[cleanPoints.length - 1];
        const curr = points[i];
        if (Math.abs(last.x - curr.x) > 0.1 || Math.abs(last.y - curr.y) > 0.1) {
            cleanPoints.push(curr);
        }
    }
    points = cleanPoints;
    if (points.length < 2) return '';

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];

        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        // Corner Radius Logic
        let startRatio = 0;
        if (i > 1) startRatio = Math.min(borderRadius, len / 2) / len;

        let endRatio = 0;
        if (i < points.length - 1) endRatio = Math.min(borderRadius, len / 2) / len;

        if (startRatio + endRatio > 1) {
            startRatio = 0.5;
            endRatio = 0.5;
        }

        const isFirstSegment = i === 1;
        const isLastSegment = i === points.length - 1;

        const drawStart = isFirstSegment ? { x: prev.x, y: prev.y } : {
            x: prev.x + dx * startRatio,
            y: prev.y + dy * startRatio
        };

        const drawEnd = isLastSegment ? { x: curr.x, y: curr.y } : {
            x: curr.x - dx * endRatio,
            y: curr.y - dy * endRatio
        };

        // Detect Jumps
        // Check intersection of (drawStart -> drawEnd) with all lineObstacles
        const jumps: Point[] = [];
        const isSegHoriz = Math.abs(drawStart.y - drawEnd.y) < 0.1;
        const isSegVert = Math.abs(drawStart.x - drawEnd.x) < 0.1;

        for (const obs of lineObstacles) {
            // Skip tiny obstacles or self? (Caller must ensure lineObstacles doesn't contain self)
            // Intersect strict (drawStart, drawEnd) with (obs.start, obs.end)
            const intersection = getIntersection(drawStart, drawEnd, obs.start, obs.end);
            if (intersection) {
                // Determine if 'obs' is perpendicular to us (we only jump perpendicular lines usually)
                const obsDx = obs.end.x - obs.start.x;
                const obsDy = obs.end.y - obs.start.y;
                const isObsHoriz = Math.abs(obsDy) < 0.1;
                const isObsVert = Math.abs(obsDx) < 0.1;

                if ((isSegHoriz && isObsVert) || (isSegVert && isObsHoriz)) {
                    jumps.push(intersection);
                }
            }
        }

        // Sort jumps along the segment
        jumps.sort((a, b) => {
            if (isSegHoriz) {
                return drawEnd.x > drawStart.x ? (a.x - b.x) : (b.x - a.x);
            } else {
                return drawEnd.y > drawStart.y ? (a.y - b.y) : (b.y - a.y);
            }
        });

        // Filter duplicate jumps (close proximity)
        const uniqueJumps: Point[] = [];
        if (jumps.length > 0) {
            uniqueJumps.push(jumps[0]);
            for (let k = 1; k < jumps.length; k++) {
                const lastJ = uniqueJumps[uniqueJumps.length - 1];
                const currJ = jumps[k];
                const dist = Math.sqrt(Math.pow(currJ.x - lastJ.x, 2) + Math.pow(currJ.y - lastJ.y, 2));
                if (dist > jumpRadius * 2) { // Ensure clear separation
                    uniqueJumps.push(currJ);
                }
            }
        }

        // Draw Segment with Jumps
        // const currentPos = { x: drawStart.x, y: drawStart.y };

        for (const jump of uniqueJumps) {
            const jr = jumpRadius;

            // Distance validation
            // let distToJump = 0;
            // let segmentLen = 0;
            // if (isSegHoriz) {
            //    distToJump = Math.abs(jump.x - currentPos.x); // Distance from CURRENT pos
            //    segmentLen = Math.abs(drawEnd.x - currentPos.x);
            // } else {
            //    distToJump = Math.abs(jump.y - currentPos.y);
            //    segmentLen = Math.abs(drawEnd.y - currentPos.y);
            // }

            // If jump is right at start, or too close for arc?
            // Actually we just draw!

            // Calculate Arc Start
            let arcStart: Point;
            let arcEnd: Point;
            let control: Point;

            if (isSegHoriz) {
                const sign = (drawEnd.x > drawStart.x) ? 1 : -1;
                arcStart = { x: jump.x - jr * sign, y: jump.y };
                arcEnd = { x: jump.x + jr * sign, y: jump.y };
                control = { x: jump.x, y: jump.y - jr * 1.5 }; // Up/Down? Default Up (-y)
                // If we want consistency, maybe always -y? 
                // Or direction dependent? Drawing 'Up' bridge usually means negative Y offset.
            } else {
                const sign = (drawEnd.y > drawStart.y) ? 1 : -1;
                arcStart = { x: jump.x, y: jump.y - jr * sign };
                arcEnd = { x: jump.x, y: jump.y + jr * sign };
                control = { x: jump.x - jr * 1.5, y: jump.y }; // Left/Right? Default Left (-x)
            }

            path += ` L ${arcStart.x} ${arcStart.y}`;
            path += ` Q ${control.x} ${control.y} ${arcEnd.x} ${arcEnd.y}`;
        }

        path += ` L ${drawEnd.x} ${drawEnd.y}`;

        // Draw Corner to next segment
        if (i < points.length - 1) {
            const next = points[i + 1];
            const dx2 = next.x - curr.x;
            const dy2 = next.y - curr.y;
            const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            const radius = Math.min(borderRadius, len / 2, len2 / 2);

            const arcEndRatio = (len2 > 0) ? (radius / len2) : 0;
            const arcEndCor = {
                x: curr.x + dx2 * arcEndRatio,
                y: curr.y + dy2 * arcEndRatio
            };

            path += ` Q ${curr.x} ${curr.y} ${arcEndCor.x} ${arcEndCor.y}`;
        }
    }

    return path;
}

/**
 * [NEW] Greedy Orthogonal Path Generator
 * A lightweight heuristic-based router for real-time interactions (dragging).
 * It attempts to find a reasonable orthogonal path without the full cost of A*.
 *
 * Strategy:
 * 1. Start from Source Stub
 * 2. Try to align X or Y with Target Stub
 * 3. If aligned, go straight to Target Stub
 * 4. Ensure we don't cut through Source/Target Nodes (basic check)
 */
export function generateGreedyOrthogonalPath(
    source: Point,
    target: Point,
    sourcePos: Position,
    targetPos: Position,
    offset: number = 20
): Point[] {
    const points: Point[] = [];

    // 1. Calculate Stubs (Start/End Segments)
    const getStub = (p: Point, pos: Position, dist: number): Point => {
        switch (pos) {
            case Position.Top: return { x: p.x, y: p.y - dist };
            case Position.Bottom: return { x: p.x, y: p.y + dist };
            case Position.Left: return { x: p.x - dist, y: p.y };
            case Position.Right: return { x: p.x + dist, y: p.y };
        }
    };

    const startStub = getStub(source, sourcePos, offset);
    const endStub = getStub(target, targetPos, offset);

    points.push(source);
    points.push(startStub);

    // 2. Middle Routing Logic
    // Decide intermediate points based on relative positions

    const midPoints: Point[] = [];

    // Direction vectors
    const isSourceVert = sourcePos === Position.Top || sourcePos === Position.Bottom;
    const isTargetVert = targetPos === Position.Top || targetPos === Position.Bottom;

    if (isSourceVert && isTargetVert) {
        // Vertical -> Vertical
        // Need a horizontal bridge
        const midY = (startStub.y + endStub.y) / 2;
        midPoints.push({ x: startStub.x, y: midY });
        midPoints.push({ x: endStub.x, y: midY });
    } else if (!isSourceVert && !isTargetVert) {
        // Horizontal -> Horizontal
        // Need a vertical bridge
        const midX = (startStub.x + endStub.x) / 2;
        midPoints.push({ x: midX, y: startStub.y });
        midPoints.push({ x: midX, y: endStub.y });
    } else if (isSourceVert && !isTargetVert) {
        // Vertical -> Horizontal
        // One corner intersection
        // Check two possibilities: (start.x, end.y) or (end.x, start.y)
        midPoints.push({ x: startStub.x, y: endStub.y });
    } else {
        // Horizontal -> Vertical
        midPoints.push({ x: endStub.x, y: startStub.y });
    }

    // 3. Simple Node Collision Avoidance (Heuristic)
    // If midPoints cut through source/target rects, try the alternative route?
    // For MVP, we stick to the simple midline approach. 
    // It's much better than a straight diagonal line.

    points.push(...midPoints);
    points.push(endStub);
    points.push(target);

    // Optimize: Remove collinear redundant points
    return removeCollinearPoints(points);
}

function removeCollinearPoints(points: Point[]): Point[] {
    if (points.length < 3) return points;
    const result = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        const prev = result[result.length - 1];
        const curr = points[i];
        const next = points[i + 1];

        // Check collinearity
        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;

        const isHorizontal = Math.abs(dy1) < 0.1 && Math.abs(dy2) < 0.1;
        const isVertical = Math.abs(dx1) < 0.1 && Math.abs(dx2) < 0.1;

        if (!isHorizontal && !isVertical) {
            result.push(curr);
        }
    }
    result.push(points[points.length - 1]);
    return result;
}

/**
 * [NEW] Aligns path segments to obstacle borders (Hanan-lite)
 * This fixes the "Grid Misalignment" issue where paths run slightly off-center from obstacles
 * because the A* grid (e.g. 20px) doesn't match the obstacle dimensions perfectly.
 */
export function alignSegmentsToObstacles(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex,
    snapDistance: number = 20 // Max distance to snap
): Point[] {
    if (points.length < 4) return points; // Need at least start->p1->p2->end

    const newPoints = points.map(p => ({ ...p }));
    const isSpatial = (obs: unknown): obs is SpatialIndex => typeof (obs as SpatialIndex).query === 'function';

    // We skip the first and last segments as they are connected to ports
    for (let i = 1; i < newPoints.length - 2; i++) {
        const p1 = newPoints[i];
        const p2 = newPoints[i + 1];

        const isHorizontal = Math.abs(p1.y - p2.y) < 0.1;
        const isVertical = Math.abs(p1.x - p2.x) < 0.1;

        if (!isHorizontal && !isVertical) continue; // Skip diagonals

        // Define search area
        const searchRect = {
            x: Math.min(p1.x, p2.x) - (isVertical ? snapDistance : 0),
            y: Math.min(p1.y, p2.y) - (isHorizontal ? snapDistance : 0),
            width: Math.abs(p1.x - p2.x) + (isVertical ? snapDistance * 2 : 0),
            height: Math.abs(p1.y - p2.y) + (isHorizontal ? snapDistance * 2 : 0)
        };

        const candidates = isSpatial(obstacles)
            ? obstacles.query(searchRect)
            : obstacles; // Linear scan fallback (slow for many obstacles)

        let bestSnap: number | null = null;
        let minDiff = Infinity;

        // Try to find a border to snap to
        for (const obs of candidates) {
            // Target clearance (e.g. 15px away from border)
            const CLEARANCE = 15;

            if (isHorizontal) {
                // Check Top Border (obstacle is below path)
                // We want path to be at obs.y - CLEARANCE
                const targetY_Top = obs.y - CLEARANCE;
                const diffTop = Math.abs(p1.y - targetY_Top);

                // Check Bottom Border (obstacle is above path)
                // We want path to be at obs.y + h + CLEARANCE
                const targetY_Bottom = obs.y + obs.height + CLEARANCE;
                const diffBottom = Math.abs(p1.y - targetY_Bottom);

                if (diffTop < snapDistance && diffTop < minDiff) {
                    minDiff = diffTop;
                    bestSnap = targetY_Top;
                }
                if (diffBottom < snapDistance && diffBottom < minDiff) {
                    minDiff = diffBottom;
                    bestSnap = targetY_Bottom;
                }
            } else {
                // Vertical
                // Check Left Border
                const targetX_Left = obs.x - CLEARANCE;
                const diffLeft = Math.abs(p1.x - targetX_Left);

                // Check Right Border
                const targetX_Right = obs.x + obs.width + CLEARANCE;
                const diffRight = Math.abs(p1.x - targetX_Right);

                if (diffLeft < snapDistance && diffLeft < minDiff) {
                    minDiff = diffLeft;
                    bestSnap = targetX_Left;
                }
                if (diffRight < snapDistance && diffRight < minDiff) {
                    minDiff = diffRight;
                    bestSnap = targetX_Right;
                }
            }
        }

        // Apply Snap if found and valid
        if (bestSnap !== null) {
            const originalX1 = p1.x, originalY1 = p1.y;
            const originalX2 = p2.x, originalY2 = p2.y;

            if (isHorizontal) {
                p1.y = bestSnap;
                p2.y = bestSnap;
            } else {
                p1.x = bestSnap;
                p2.x = bestSnap;
            }

            // Validation: Check if the new segment + connections are blocked
            // Previous point
            const prev = newPoints[i - 1];
            // Next point
            const next = newPoints[i + 2];

            // Check 3 segments: prev->p1, p1->p2, p2->next
            const pathToCheck = [prev, p1, p2, next];

            // If blocked, revert
            if (isPathBlocked(pathToCheck, obstacles, 5)) { // Use small padding for check
                p1.x = originalX1; p1.y = originalY1;
                p2.x = originalX2; p2.y = originalY2;
            }
        }
    }

    return newPoints;
}


/**
 * [NEW] High-level Orthogonal Path Optimizer
 * 1. Minimizes Bends (Z -> L conversion)
 * 2. Balances Segments (Midpoint Routing for Z-shapes)
 * 
 * @param points Input orthogonal points
 * @param obstacles Obstacles to avoid
 * @returns Optimized points
 */
export function optimizeOrthogonalPath(
    points: Point[],
    obstacles: Rectangle[] | SpatialIndex = [],
    options: { sourcePos?: Position, targetPos?: Position } = {} // [NEW] Port safety options
): Point[] {
    if (points.length < 4) return points;

    const res = [...points];

    // Helper to check blocking
    const isBlocked = (pts: Point[]) => isPathBlocked(pts, obstacles, 15); // Use moderate padding

    // Helper: Check if a proposed segment direction is valid for the port
    const isDirectionValid = (pStart: Point, pEnd: Point, pos?: Position): boolean => {
        if (!pos) return true;
        const dx = Math.abs(pEnd.x - pStart.x);
        const dy = Math.abs(pEnd.y - pStart.y);

        if (pos === Position.Top || pos === Position.Bottom) {
            // Must be Vertical (dx ~ 0)
            return dx < 1;
        } else if (pos === Position.Left || pos === Position.Right) {
            // Must be Horizontal (dy ~ 0)
            return dy < 1;
        }
        return true;
    };

    // Pass 1: Bend Reduction (Z -> L)
    // pattern: p0 -> p1 -> p2 -> p3
    // If p0 and p3 can form a single corner L-shape, do it.
    for (let i = 0; i < res.length - 3; i++) {
        const p0 = res[i];
        const p3 = res[i + 3];

        // Try Corner A: (p3.x, p0.y)
        const cornerA = { x: p3.x, y: p0.y };
        const pathA = [p0, cornerA, p3];

        // Try Corner B: (p0.x, p3.y)
        const cornerB = { x: p0.x, y: p3.y };
        const pathB = [p0, cornerB, p3];

        let success = false;

        // [SAFETY] If i=0 (Start), p0->corner must match sourcePos
        // If i=res.length-4 (End), corner->p3 must match targetPos

        const safeA =
            (i !== 0 || isDirectionValid(p0, cornerA, options.sourcePos)) &&
            (i !== res.length - 4 || isDirectionValid(cornerA, p3, options.targetPos));

        const safeB =
            (i !== 0 || isDirectionValid(p0, cornerB, options.sourcePos)) &&
            (i !== res.length - 4 || isDirectionValid(cornerB, p3, options.targetPos));

        if (safeA && !isBlocked(pathA)) {
            // Replace p1, p2 with cornerA
            res.splice(i + 1, 2, cornerA);
            success = true;
        } else if (safeB && !isBlocked(pathB)) {
            res.splice(i + 1, 2, cornerB);
            success = true;
        }

        if (success) {
            i--; // Retry from previous index to cascade
        }
    }

    // Pass 2: Midpoint Balancing (Symmetry)
    // Pattern: Z-shape (p0 -> p1 -> p2 -> p3)
    // If we have a Z-shape that is necessary (can't be L), try to center the bridge (p1-p2).
    for (let i = 0; i < res.length - 3; i++) {
        const p0 = res[i];
        const p1 = res[i + 1];
        const p2 = res[i + 2];
        const p3 = res[i + 3];

        // Check if Z-shape:
        const seg1Horiz = Math.abs(p0.y - p1.y) < 1;
        const bridgeVert = Math.abs(p1.x - p2.x) < 1;
        const seg3Horiz = Math.abs(p2.y - p3.y) < 1;

        if (seg1Horiz && bridgeVert && seg3Horiz) {
            // Horizontal Z-shape: bridge is Vertical (x constant)
            // Check if p0 and p3 encompass the bridge
            const minX = Math.min(p0.x, p3.x);
            const maxX = Math.max(p0.x, p3.x);

            if (p1.x > minX && p1.x < maxX) {
                // Bridge is overlapping X range.
                // Calculate idealized center X
                const midX = (p0.x + p3.x) / 2;

                // If moving to midX is significant
                if (Math.abs(p1.x - midX) > 10) {
                    const newP1 = { x: midX, y: p1.y };
                    const newP2 = { x: midX, y: p2.y };

                    // [SAFETY] Check Valid Direction for Start/End segments
                    // Here we modify p0->newP1 and newP2->p3.
                    // p0->newP1 is Horizontal (y unchanged).
                    // newP2->p3 is Horizontal (y unchanged).
                    // This preserves orig direction (Horizontal Z).
                    // BUT: we should check just in case.

                    if (i === 0 && !isDirectionValid(p0, newP1, options.sourcePos)) continue;
                    if (i === res.length - 4 && !isDirectionValid(newP2, p3, options.targetPos)) continue;

                    // Verify Path
                    const newPath = [p0, newP1, newP2, p3];
                    if (!isBlocked(newPath)) {
                        res[i + 1] = newP1;
                        res[i + 2] = newP2;
                    }
                }
            }
        } else {
            // Check Vertical Z-shape
            const seg1Vert = Math.abs(p0.x - p1.x) < 1;
            const bridgeHoriz = Math.abs(p1.y - p2.y) < 1;
            const seg3Vert = Math.abs(p2.x - p3.x) < 1;

            if (seg1Vert && bridgeHoriz && seg3Vert) {
                // Vertical Z-shape: bridge is Horizontal (y constant)
                // We want to center Y between p0.y and p3.y

                const minY = Math.min(p0.y, p3.y);
                const maxY = Math.max(p0.y, p3.y);

                if (p1.y > minY && p1.y < maxY) {
                    const midY = (p0.y + p3.y) / 2;

                    if (Math.abs(p1.y - midY) > 10) {
                        const newP1 = { x: p1.x, y: midY };
                        const newP2 = { x: p2.x, y: midY };

                        // [SAFETY] Check Valid Direction
                        if (i === 0 && !isDirectionValid(p0, newP1, options.sourcePos)) continue;
                        if (i === res.length - 4 && !isDirectionValid(newP2, p3, options.targetPos)) continue;

                        const newPath = [p0, newP1, newP2, p3];
                        if (!isBlocked(newPath)) {
                            res[i + 1] = newP1;
                            res[i + 2] = newP2;
                        }
                    }
                }
            }
        }
    }

    return res;
}
