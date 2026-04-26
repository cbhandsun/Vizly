/**
 * LineJumpEngine — 交叉跳线弧引擎
 * 
 * 检测所有正交连线的 H×V 交叉点，为水平线段在交叉处插入半圆弧（Jump Arc）。
 * 
 * 设计：
 * - 全局单例，各边注册/注销自己的正交线段
 * - 查询时返回某条边的所有交叉点（按 X 排序）
 * - 渲染侧在 d-path 中将交叉点替换为半圆弧
 * 
 * 移植自 DiagramView-SVG/routing/LineJumpEngine.ts，适配 React Flow 架构。
 */

export interface Point {
    x: number;
    y: number;
}

export interface LineSegment {
    p1: Point;
    p2: Point;
    edgeId: string;
    isHorizontal: boolean;
}

export interface IntersectionInfo {
    point: Point;
    /** 水平线边 ID（此边需要画弧） */
    horizontalEdgeId: string;
    /** 垂直线边 ID（被跨越的边） */
    verticalEdgeId: string;
}

const JUMP_RADIUS = 6;

/**
 * 从 Point[] 提取所有正交线段
 */
function extractSegments(points: Point[], edgeId: string): LineSegment[] {
    const segments: LineSegment[] = [];
    if (points.length < 2) return segments;

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];

        const isHorizontal = Math.abs(p1.y - p2.y) < 0.5;
        const isVertical = Math.abs(p1.x - p2.x) < 0.5;

        if (isHorizontal) {
            // 只提取长于 2*JUMP_RADIUS 的段（太短的段无法画弧）
            if (Math.abs(p1.x - p2.x) > JUMP_RADIUS * 2) {
                segments.push({ p1, p2, edgeId, isHorizontal: true });
            }
        } else if (isVertical) {
            if (Math.abs(p1.y - p2.y) > JUMP_RADIUS * 2) {
                segments.push({ p1, p2, edgeId, isHorizontal: false });
            }
        }
    }
    return segments;
}

/**
 * 计算所有 H×V 交叉点
 */
function findIntersections(segments: LineSegment[]): IntersectionInfo[] {
    const hSegments = segments.filter(s => s.isHorizontal);
    const vSegments = segments.filter(s => !s.isHorizontal);
    const intersections: IntersectionInfo[] = [];

    for (const h of hSegments) {
        const hMinX = Math.min(h.p1.x, h.p2.x);
        const hMaxX = Math.max(h.p1.x, h.p2.x);
        const hY = h.p1.y;

        for (const v of vSegments) {
            // 同一条边不生成跳线
            if (h.edgeId === v.edgeId) continue;

            const vMinY = Math.min(v.p1.y, v.p2.y);
            const vMaxY = Math.max(v.p1.y, v.p2.y);
            const vX = v.p1.x;

            // 严格交叉（不含端点共享）
            if (vX > hMinX + JUMP_RADIUS && vX < hMaxX - JUMP_RADIUS &&
                hY > vMinY + JUMP_RADIUS && hY < vMaxY - JUMP_RADIUS) {
                intersections.push({
                    point: { x: vX, y: hY },
                    horizontalEdgeId: h.edgeId,
                    verticalEdgeId: v.edgeId,
                });
            }
        }
    }

    return intersections;
}

/**
 * LineJumpEngine 单例
 * 
 * 使用方式：
 * 1. 每条边路径计算完成后调用 registerEdge(edgeId, points)
 * 2. 渲染时调用 getJumpsForEdge(edgeId) 获取交叉点
 * 3. 用 injectLineJumps(points, jumps) 生成含弧线的 d-path
 * 4. 边销毁时调用 unregisterEdge(edgeId)
 */
class LineJumpEngine {
    private static instance: LineJumpEngine | null = null;
    
    /** 每条边的 Point[] */
    private edgePoints: Map<string, Point[]> = new Map();
    /** 缓存的全局线段 */
    private segmentsCache: LineSegment[] | null = null;
    /** 缓存的全局交叉点 */
    private intersectionsCache: IntersectionInfo[] | null = null;
    /** 版本号（每次注册/注销递增，供外部检测变化） */
    private version: number = 0;
    // [FIX N-6] 订阅者集合，供 useSyncExternalStore 使用
    private subscribers: Set<() => void> = new Set();
    // [P2-3] globalChannelRouting 结果缓存：
    // 原问题：31 条边各自调用 globalChannelRouting(allPaths) = 31 次 O(E²) 计算。
    // 修复：将结果缓存在单例内，engineVersion 不变时直接复用。
    private channelRoutingCache: Map<string, Point[]> | null = null;
    private channelRoutingCacheVersion: number = -1;

    static getInstance(): LineJumpEngine {
        if (!LineJumpEngine.instance) {
            LineJumpEngine.instance = new LineJumpEngine();
        }
        return LineJumpEngine.instance;
    }

    /** 注册一条边的路径点 */
    registerEdge(edgeId: string, points: Point[]): void {
        const existing = this.edgePoints.get(edgeId);
        // 浅比较避免无效刷新
        if (existing && existing.length === points.length) {
            let same = true;
            for (let i = 0; i < points.length; i++) {
                if (Math.abs(existing[i].x - points[i].x) > 0.5 || 
                    Math.abs(existing[i].y - points[i].y) > 0.5) {
                    same = false;
                    break;
                }
            }
            if (same) return;
        }
        this.edgePoints.set(edgeId, points);
        this.invalidateCache();
    }

    /** 注销一条边 */
    unregisterEdge(edgeId: string): void {
        if (this.edgePoints.delete(edgeId)) {
            this.invalidateCache();
        }
    }

    /** 获取当前版本号 */
    getVersion(): number {
        return this.version;
    }

    // [FIX N-6] 订阅接口：供 useSyncExternalStore 注册回调
    subscribe(callback: () => void): () => void {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    /** 获取某条边需要画弧的交叉点（按 X 坐标排序） */
    getJumpsForEdge(edgeId: string): IntersectionInfo[] {
        const intersections = this.computeIntersections();
        return intersections
            .filter(i => i.horizontalEdgeId === edgeId)
            .sort((a, b) => a.point.x - b.point.x);
    }

    /** 获取跳线弧的半径 */
    getJumpRadius(): number {
        return JUMP_RADIUS;
    }

    /** 获取所有已注册的路径（只读快照，供全局通道分配使用） */
    getAllEdgePaths(): Map<string, Point[]> {
        return this.edgePoints;
    }

    /**
     * [P2-3] 获取全局通道分配结果（带缓存）。
     * 所有边共享同一次 globalChannelRouting 计算结果，
     * 引擎版本未变则直接复用，无需每条边各自重算。
     */
    getCachedChannelRouting(routingFn: (paths: Map<string, Point[]>, spacing: number) => Map<string, Point[]>, spacing: number): Map<string, Point[]> {
        if (this.channelRoutingCache && this.channelRoutingCacheVersion === this.version) {
            return this.channelRoutingCache;
        }
        const result = routingFn(this.edgePoints, spacing);
        this.channelRoutingCache = result;
        this.channelRoutingCacheVersion = this.version;
        return result;
    }

    /** 清理 */
    cleanup(): void {
        this.edgePoints.clear();
        this.invalidateCache();
        LineJumpEngine.instance = null;
    }

    private invalidateCache(): void {
        this.segmentsCache = null;
        this.intersectionsCache = null;
        this.channelRoutingCache = null; // [P2-3] 同步清空通道分配缓存
        this.version++;
        // [FIX N-6] 通知所有订阅者版本已变化
        this.subscribers.forEach(cb => cb());
    }

    private computeIntersections(): IntersectionInfo[] {
        if (this.intersectionsCache) return this.intersectionsCache;

        // 构建全局线段
        const segments: LineSegment[] = [];
        for (const [edgeId, points] of this.edgePoints) {
            segments.push(...extractSegments(points, edgeId));
        }
        this.segmentsCache = segments;

        // 计算交叉
        this.intersectionsCache = findIntersections(segments);
        return this.intersectionsCache;
    }
}

export { LineJumpEngine, JUMP_RADIUS };

/**
 * 将交叉点注入到 Point[] 路径中，生成含半圆弧的 SVG d-path。
 * 
 * 仅处理水平线段上的交叉：在交叉点处画半圆弧跨过垂直线。
 * 弧线方向：始终向上跨越（y - radius），视觉上更清晰。
 * 
 * @param points 原始路径点
 * @param jumps 该边的交叉点列表
 * @param radius 弧半径
 * @param filletRadius 倒角半径（用于重新生成 filleted path）
 * @returns SVG d-path 字符串
 */
export function injectLineJumps(
    points: Point[], 
    jumps: IntersectionInfo[], 
    radius: number = JUMP_RADIUS,
    cornerRadius: number = 16
): string {
    if (!points || points.length < 2 || jumps.length === 0) {
        return '';  // 调用方应使用原始路径
    }

    // [FIX] 去除连续重复点（容差 0.5px），防止零长段导致同一跳弧被处理两次
    const cleanPoints: Point[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const prev = cleanPoints[cleanPoints.length - 1];
        const curr = points[i];
        if (Math.abs(curr.x - prev.x) + Math.abs(curr.y - prev.y) > 0.5) {
            cleanPoints.push(curr);
        }
    }

    if (cleanPoints.length < 2) return '';

    // [FIX-FILLET] 同时注入跳线弧和圆角曲线
    // 策略：与 createFilletedPath 完全对齐——
    // 1. 遍历每个中间点 (i=1..N-2)，计算圆角的 filletStart / filletEnd
    // 2. 在 filletStart 前面的线段中（从上一个 cursor 到 filletStart），检测跳线弧
    // 3. 画圆角 Q 曲线
    // 4. 最后一段也检测跳线弧

    // Helper: 在水平线段 (fromX, y) -> (toX, y) 上注入跳线弧
    const emitHorizontalWithJumps = (parts: string[], fromX: number, toX: number, y: number) => {
        const segMinX = Math.min(fromX, toX);
        const segMaxX = Math.max(fromX, toX);
        const goingRight = toX > fromX;

        // 查找落在此段上的交叉点
        const rawJumps = jumps
            .filter(j => {
                const jx = j.point.x;
                return Math.abs(j.point.y - y) < 1 &&
                       jx > segMinX + radius && jx < segMaxX - radius;
            })
            .sort((a, b) => goingRight ? a.point.x - b.point.x : b.point.x - a.point.x);

        // 过滤掉间距 < 2×radius 的重叠跳弧
        const segJumps: IntersectionInfo[] = [];
        let lastJumpX = -Infinity;
        for (const j of rawJumps) {
            const jx = j.point.x;
            if (Math.abs(jx - lastJumpX) >= radius * 2 + 1) {
                segJumps.push(j);
                lastJumpX = jx;
            }
        }

        for (const jump of segJumps) {
            const jx = jump.point.x;
            const arcStartX = jx - (goingRight ? radius : -radius);
            parts.push(`L ${arcStartX} ${y}`);
            const arcEndX = jx + (goingRight ? radius : -radius);
            const sweepFlag = goingRight ? 1 : 0;
            parts.push(`A ${radius} ${radius} 0 0 ${sweepFlag} ${arcEndX} ${y}`);
        }
        // 画到终点
        parts.push(`L ${toX} ${y}`);
    };

    // Helper: 在线段上（可能非水平）画线，如果水平则注入跳线弧
    const emitSegmentWithJumps = (parts: string[], from: Point, to: Point) => {
        const isHoriz = Math.abs(from.y - to.y) < 0.5;
        if (isHoriz && Math.abs(from.x - to.x) > 1) {
            // 水平段：可能有跳线弧
            emitHorizontalWithJumps(parts, from.x, to.x, from.y);
        } else {
            parts.push(`L ${to.x} ${to.y}`);
        }
    };

    const parts: string[] = [];
    parts.push(`M ${cleanPoints[0].x} ${cleanPoints[0].y}`);

    if (cleanPoints.length === 2) {
        // 只有两点，直线
        emitSegmentWithJumps(parts, cleanPoints[0], cleanPoints[1]);
        return parts.join(' ');
    }

    // 与 createFilletedPath 完全一致的圆角遍历
    // cursor 跟踪"当前已经画到的位置"
    let cursor: Point = { x: cleanPoints[0].x, y: cleanPoints[0].y };

    for (let i = 1; i < cleanPoints.length - 1; i++) {
        const pPrev = cleanPoints[i - 1];
        const pCurr = cleanPoints[i];
        const pNext = cleanPoints[i + 1];

        // 计算向量
        const v1 = { x: pCurr.x - pPrev.x, y: pCurr.y - pPrev.y };
        const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };
        const l1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const l2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

        // 安全圆角半径
        const r = cornerRadius > 0 ? Math.min(cornerRadius, l1 / 2, l2 / 2) : 0;

        if (r < 0.5 || l1 < 0.5 || l2 < 0.5) {
            // 圆角太小，直接画到 pCurr
            emitSegmentWithJumps(parts, cursor, pCurr);
            cursor = { x: pCurr.x, y: pCurr.y };
            continue;
        }

        const r1Ratio = r / l1;
        const r2Ratio = r / l2;

        const filletStart = {
            x: pCurr.x - v1.x * r1Ratio,
            y: pCurr.y - v1.y * r1Ratio
        };
        const filletEnd = {
            x: pCurr.x + v2.x * r2Ratio,
            y: pCurr.y + v2.y * r2Ratio
        };

        // 画从 cursor 到 filletStart（可能有跳线弧）
        emitSegmentWithJumps(parts, cursor, filletStart);

        // 画圆角 Q 曲线
        parts.push(`Q ${pCurr.x} ${pCurr.y} ${filletEnd.x} ${filletEnd.y}`);

        cursor = { x: filletEnd.x, y: filletEnd.y };
    }

    // 最后一段：cursor -> lastPoint（可能有跳线弧）
    const last = cleanPoints[cleanPoints.length - 1];
    emitSegmentWithJumps(parts, cursor, last);

    return parts.join(' ');
}
