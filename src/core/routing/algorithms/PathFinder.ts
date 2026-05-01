/**
 * A* Path Finding Algorithm
 *
 * 移植自原 HandlePicker.ts
 * 提供基于网格的 A* 寻路，支持障碍物回避、成本加权和已有路径回避。
 *
 * [OPT-P0②] Open List 由 array.sort()+shift（O(N log N) 每步）换为 MinHeap（O(log N) 每步）。
 */

import type { Point, Rectangle } from '../types/routing';

// 扩展 Rect 类型以包含 padding，保持与原逻辑兼容
type ObstacleRect = Rectangle & { padding?: number; isSoftZone?: boolean };

// ---------------------------------------------------------------------------
// MinHeap — A* open list 最优数据结构
// push O(log N) / pop O(log N) / size O(1)
// ---------------------------------------------------------------------------
interface AStarNode {
    p: Point;
    g: number;
    f: number;
    parent: AStarNode | null;
}

class MinHeap {
    private data: AStarNode[] = [];

    get size(): number { return this.data.length; }

    push(node: AStarNode): void {
        this.data.push(node);
        this.bubbleUp(this.data.length - 1);
    }

    pop(): AStarNode | undefined {
        if (this.data.length === 0) return undefined;
        const top = this.data[0];
        const last = this.data.pop()!;
        if (this.data.length > 0) {
            this.data[0] = last;
            this.sinkDown(0);
        }
        return top;
    }

    private bubbleUp(i: number): void {
        while (i > 0) {
            const parent = (i - 1) >>> 1;
            if (this.data[parent].f <= this.data[i].f) break;
            const tmp = this.data[parent];
            this.data[parent] = this.data[i];
            this.data[i] = tmp;
            i = parent;
        }
    }

    private sinkDown(i: number): void {
        const n = this.data.length;
        while (true) {
            let min = i;
            const l = 2 * i + 1;
            const r = 2 * i + 2;
            if (l < n && this.data[l].f < this.data[min].f) min = l;
            if (r < n && this.data[r].f < this.data[min].f) min = r;
            if (min === i) break;
            const tmp = this.data[min];
            this.data[min] = this.data[i];
            this.data[i] = tmp;
            i = min;
        }
    }
}
// ---------------------------------------------------------------------------

export class PathFinder {
    /**
     * 规划正交路径 (A*)
     */
    findPath(
        bbox: { minX: number; minY: number; maxX: number; maxY: number },
        start: Point,
        goal: Point,
        gridSize: number,
        maxExpansions: number,
        obstacles: ObstacleRect[],
        routedPaths?: Point[][]
    ): Point[] | null {
        const gs = Math.max(8, gridSize);
        // Snap start/goal
        const s = { x: Math.round(start.x / gs) * gs, y: Math.round(start.y / gs) * gs };
        const g = { x: Math.round(goal.x / gs) * gs, y: Math.round(goal.y / gs) * gs };

        // 直线距离，用于绕路限制
        const directDist = this.dist(start, goal);

        // [OPT-P0②] MinHeap open list — O(log N) push/pop vs O(N log N) sort+shift
        const open = new MinHeap();
        open.push({ p: s, g: 0, f: this.dist(s, g), parent: null });
        const closed = new Set<string>();
        const gScoreMap = new Map<string, number>();
        gScoreMap.set(`${s.x}:${s.y}`, 0);
        let expansions = 0;

        while (open.size > 0 && expansions < maxExpansions) {
            const cur = open.pop();
            if (!cur) break;
            expansions++;

            if (this.dist(cur.p, g) < gs) { // Reached goal
                const path: Point[] = [];
                let node: AStarNode | null = cur;
                while (node) { path.push(node.p); node = node.parent; }
                return [start, ...path.reverse(), goal];
            }

            const key = `${cur.p.x}:${cur.p.y}`;
            if (closed.has(key)) continue;
            closed.add(key);

            const nbrs = [
                { x: cur.p.x + gs, y: cur.p.y },
                { x: cur.p.x - gs, y: cur.p.y },
                { x: cur.p.x, y: cur.p.y + gs },
                { x: cur.p.x, y: cur.p.y - gs },
            ];

            for (const nb of nbrs) {
                if (nb.x < bbox.minX || nb.x > bbox.maxX || nb.y < bbox.minY || nb.y > bbox.maxY) continue;
                if (this.isBlocked(nb, obstacles, gs)) continue;

                const nbKey = `${nb.x}:${nb.y}`;
                if (closed.has(nbKey)) continue;

                // 加权成本计算
                const moveCost = gs + this.getCellCost(nb, obstacles, routedPaths || [], gs);
                const tentativeG = cur.g + moveCost;

                // 检查是否已有更好的路径到达此点
                const existingG = gScoreMap.get(nbKey);
                if (existingG !== undefined && tentativeG >= existingG) continue;

                gScoreMap.set(nbKey, tentativeG);

                // 绕路惩罚：当路径长度超过直线距离 1.8 倍时开始惩罚
                const detourRatio = tentativeG / Math.max(directDist, gs);
                const detourPenalty = detourRatio > 1.8 ? (detourRatio - 1.8) * gs * 2 : 0;

                const fScore = tentativeG + this.dist(nb, g) + detourPenalty;
                open.push({ p: nb, g: tentativeG, f: fScore, parent: cur });
            }
        }
        return null;
    }

    private dist(a: Point, b: Point) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

    private isBlocked(p: Point, obstacles: ObstacleRect[], gs: number) {
        const r = { x: p.x, y: p.y, width: gs, height: gs };
        for (const o of obstacles) {
            // [FIX] Soft zones are high-cost areas, not hard blocks — skip them in isBlocked.
            // They only affect routing cost in getCellCost, making A* prefer to go around.
            if (o.isSoftZone) continue;
            const pad = o.padding || 0;
            const ox = o.x - pad;
            const oy = o.y - pad;
            const ow = o.width + pad * 2;
            const oh = o.height + pad * 2;
            if (r.x < ox + ow && r.x + r.width > ox && r.y < oy + oh && r.y + r.height > oy) return true;
        }
        return false;
    }

    private getCellCost(
        p: Point,
        obstacles: ObstacleRect[],
        routedPaths: Point[][],
        gs: number
    ): number {
        let cost = 0;

        // 1. 节点接近惩罚（梯度，非二元）
        const bufferZone = gs * 2.5;
        for (const o of obstacles) {
            if (o.isSoftZone) {
                // [FIX] Soft zone (e.g. target group container): apply a heavy penalty for
                // cells INSIDE the zone, making A* strongly prefer routes that go AROUND it.
                // The penalty drops to zero outside the zone, so external routing is free.
                const pad = o.padding || 0;
                const inside = p.x >= o.x - pad && p.x <= o.x + o.width + pad &&
                               p.y >= o.y - pad && p.y <= o.y + o.height + pad;
                if (inside) {
                    cost += gs * 15; // Increased cost to strongly discourage entering the group
                } else {
                    // Add a gradient penalty OUTSIDE the soft zone to keep the path further away
                    const d = this.pointToRectDistance(p, o);
                    const softBufferZone = gs * 5; // 50px buffer zone outside the soft zone
                    if (d < softBufferZone && d > 0) {
                        cost += ((softBufferZone - d) / softBufferZone) * gs * 4;
                    }
                }
                continue;
            }
            const d = this.pointToRectDistance(p, o);
            if (d < bufferZone && d > 0) {
                cost += ((bufferZone - d) / bufferZone) * gs * 0.8;
            }
        }

        // 2. 路径密集度惩罚
        const pathBufferZone = gs * 2;
        for (const path of routedPaths) {
            if (!path || path.length < 2) continue;
            for (let i = 0; i < path.length - 1; i++) {
                const segDist = this.pointToSegmentDistance(p, path[i], path[i + 1]);
                if (segDist < pathBufferZone) {
                    cost += ((pathBufferZone - segDist) / pathBufferZone) * gs * 1.5;
                    break;
                }
            }
        }

        return cost;
    }

    private pointToRectDistance(p: Point, r: ObstacleRect): number {
        const pad = r.padding || 0;
        const rx = r.x - pad;
        const ry = r.y - pad;
        const rw = r.width + pad * 2;
        const rh = r.height + pad * 2;

        const cx = Math.max(rx, Math.min(p.x, rx + rw));
        const cy = Math.max(ry, Math.min(p.y, ry + rh));

        return Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
    }

    private pointToSegmentDistance(p: Point, a: Point, b: Point): number {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;

        if (lenSq === 0) {
            return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
        }

        let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const nearestX = a.x + t * dx;
        const nearestY = a.y + t * dy;

        return Math.sqrt((p.x - nearestX) ** 2 + (p.y - nearestY) ** 2);
    }
}

export const pathFinder = new PathFinder();
