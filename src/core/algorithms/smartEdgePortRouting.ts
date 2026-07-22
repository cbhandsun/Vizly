import { Position } from '../types/flow';
import type { PortSelectionConfig } from '../types/routing';
import type { Rectangle, Point } from './pathfinding';
import { isPathBlocked } from './pathfinding';
import type { SpatialIndex } from './SpatialIndex';
import type { NodeLike } from './smartEdgeGeometryCore';
import { getNodePosition } from './smartEdgeGeometryCore';


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
