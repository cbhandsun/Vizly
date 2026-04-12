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

    /** 清理 */
    cleanup(): void {
        this.edgePoints.clear();
        this.invalidateCache();
        LineJumpEngine.instance = null;
    }

    private invalidateCache(): void {
        this.segmentsCache = null;
        this.intersectionsCache = null;
        this.version++;
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
    radius: number = JUMP_RADIUS
): string {
    if (!points || points.length < 2 || jumps.length === 0) {
        return '';  // 调用方应使用原始路径
    }

    const parts: string[] = [];
    parts.push(`M ${points[0].x} ${points[0].y}`);

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const isHorizontal = Math.abs(p1.y - p2.y) < 0.5;

        if (!isHorizontal) {
            // 非水平段直接画线
            parts.push(`L ${p2.x} ${p2.y}`);
            continue;
        }

        // 水平段：查找落在此段上的交叉点
        const segMinX = Math.min(p1.x, p2.x);
        const segMaxX = Math.max(p1.x, p2.x);
        const goingRight = p2.x > p1.x;

        const segJumps = jumps
            .filter(j => {
                const jx = j.point.x;
                return Math.abs(j.point.y - p1.y) < 1 && 
                       jx > segMinX + radius && jx < segMaxX - radius;
            })
            .sort((a, b) => goingRight ? a.point.x - b.point.x : b.point.x - a.point.x);

        if (segJumps.length === 0) {
            parts.push(`L ${p2.x} ${p2.y}`);
            continue;
        }

        // 沿行进方向依次画弧
        let currentX = p1.x;
        const y = p1.y;

        for (const jump of segJumps) {
            const jx = jump.point.x;

            // 画线到弧起点
            const arcStartX = jx - (goingRight ? radius : -radius);
            parts.push(`L ${arcStartX} ${y}`);

            // 画半圆弧（向上跨越）
            // A rx ry x-axis-rotation large-arc-flag sweep-flag x y
            const arcEndX = jx + (goingRight ? radius : -radius);
            // sweep-flag: 1 = 顺时针（向上弧）
            const sweepFlag = goingRight ? 1 : 0;
            parts.push(`A ${radius} ${radius} 0 0 ${sweepFlag} ${arcEndX} ${y}`);

            currentX = arcEndX;
        }

        // 画线到段终点
        parts.push(`L ${p2.x} ${p2.y}`);
    }

    return parts.join(' ');
}
