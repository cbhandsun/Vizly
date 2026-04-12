/**
 * 几何工具函数库
 * 用于可见性图算法的几何计算
 */

export interface Point {
    x: number;
    y: number;
}

export interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface LineSegment {
    start: Point;
    end: Point;
}

/**
 * 计算两点之间的欧几里得距离
 */
export function distance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 计算两点之间的曼哈顿距离
 */
export function manhattanDistance(p1: Point, p2: Point): number {
    return Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
}

/**
 * 判断点是否在矩形内（包含边界）
 */
export function pointInRect(point: Point, rect: Rectangle, padding = 0): boolean {
    return (
        point.x >= rect.x - padding &&
        point.x <= rect.x + rect.width + padding &&
        point.y >= rect.y - padding &&
        point.y <= rect.y + rect.height + padding
    );
}

/**
 * 判断点是否在矩形内（不包含边界）
 */
export function pointStrictlyInRect(point: Point, rect: Rectangle): boolean {
    return (
        point.x > rect.x &&
        point.x < rect.x + rect.width &&
        point.y > rect.y &&
        point.y < rect.y + rect.height
    );
}

/**
 * 叉积 - 用于判断点的相对位置
 * 结果 > 0: p3 在 p1->p2 的左侧
 * 结果 < 0: p3 在 p1->p2 的右侧
 * 结果 = 0: p3 在 p1->p2 的直线上
 */
function crossProduct(p1: Point, p2: Point, p3: Point): number {
    return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
}

/**
 * 判断点p是否在线段seg上（已知共线的情况）
 */
function pointOnSegment(p: Point, seg: LineSegment): boolean {
    return (
        p.x >= Math.min(seg.start.x, seg.end.x) &&
        p.x <= Math.max(seg.start.x, seg.end.x) &&
        p.y >= Math.min(seg.start.y, seg.end.y) &&
        p.y <= Math.max(seg.start.y, seg.end.y)
    );
}

/**
 * 判断两条线段是否相交
 * 使用方向判断算法（Orientation-based method）
 * 
 * @param seg1 线段1
 * @param seg2 线段2
 * @param includeEndpoints 是否包含端点相交 (默认true)
 * @returns 是否相交
 */
export function lineSegmentsIntersect(
    seg1: LineSegment,
    seg2: LineSegment,
    includeEndpoints = true
): boolean {
    const p1 = seg1.start;
    const q1 = seg1.end;
    const p2 = seg2.start;
    const q2 = seg2.end;

    // 计算方向
    const d1 = crossProduct(p2, q2, p1);
    const d2 = crossProduct(p2, q2, q1);
    const d3 = crossProduct(p1, q1, p2);
    const d4 = crossProduct(p1, q1, q2);

    // 一般情况：跨立检测
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        return true;
    }

    if (!includeEndpoints) {
        return false;
    }

    // 特殊情况：共线且重叠
    if (d1 === 0 && pointOnSegment(p1, seg2)) return true;
    if (d2 === 0 && pointOnSegment(q1, seg2)) return true;
    if (d3 === 0 && pointOnSegment(p2, seg1)) return true;
    if (d4 === 0 && pointOnSegment(q2, seg1)) return true;

    return false;
}

/**
 * 判断线段是否与矩形相交（包括穿越和包含）
 * 
 * @param seg 线段
 * @param rect 矩形
 * @param allowEdgeTouch 是否允许边界接触（默认 false，仅真正穿越才算相交）
 * @returns 是否相交
 */
export function lineIntersectsRect(
    seg: LineSegment,
    rect: Rectangle,
    allowEdgeTouch = false
): boolean {
    const { start: p1, end: p2 } = seg;

    // 1. 检查两个端点是否都在矩形内部（严格内部）
    const p1Inside = pointStrictlyInRect(p1, rect);
    const p2Inside = pointStrictlyInRect(p2, rect);

    if (p1Inside && p2Inside) {
        // 两个端点都在内部，认为穿越
        return true;
    }

    // 2. 如果不允许边界接触，检查端点是否在边界上
    if (!allowEdgeTouch) {
        const p1OnBoundary = pointInRect(p1, rect) && !p1Inside;
        const p2OnBoundary = pointInRect(p2, rect) && !p2Inside;

        // 如果只是端点在边界上（不是真正穿越），不算相交
        if ((p1OnBoundary || p2OnBoundary) && !p1Inside && !p2Inside) {
            // 进一步检查是否真正穿越
            // 继续后面的逻辑
        }
    }

    // 3. 核心穿透测试 (Interior Pierce Test)
    // 如果一条线段真正穿过了矩形的内部（而不是仅仅贴边或相切），
    // 那么矩形的4个角点必然**严格分布在线段所在直线的两侧**。
    // 即：针对线段组成的无限长直线，必然至少有一个角点在其严格左侧(>0)，且至少有一个角点在其严格右侧(<0)。
    const corners = getRectCorners(rect);
    let hasStrictLeft = false;
    let hasStrictRight = false;

    for (const corner of corners) {
        const cp = crossProduct(p1, p2, corner);
        // 使用一个微小的 epsilon 防止浮点误差
        if (cp > 0.01) hasStrictLeft = true;
        if (cp < -0.01) hasStrictRight = true;
    }

    // 如果角点没有分居两侧，说明这条线段所在的直线最多只是从矩形外部擦过、或者贴着某条边。
    // 这种情况下，如果 allowEdgeTouch 为 false，我们直接判定为不相交！
    if (!allowEdgeTouch && (!hasStrictLeft || !hasStrictRight)) {
        return false;
    }

    // 4. 构建矩形的四条边并检查线段重叠情况 (当 allowEdgeTouch = true 或需要精确过滤其在外侧的线段时)
    const rectEdges: LineSegment[] = [
        { start: corners[0], end: corners[1] }, // 上边
        { start: corners[1], end: corners[2] }, // 右边
        { start: corners[2], end: corners[3] }, // 下边
        { start: corners[3], end: corners[0] }  // 左边
    ];

    // 5. 检查线段与矩形四条边是否相交
    // 注意：在这里我们始终使用 includeEndpoints = true，因为我们上面已经通过 `hasStrictLeft` 
    // 排除了纯贴边且不穿透的情况。如果现在这根线段还能在线段相交检测中命中，那它就是真正撞上去了。
    for (const edge of rectEdges) {
        if (lineSegmentsIntersect(seg, edge, true)) {
            return true;
        }
    }

    return false;
}

/**
 * 获取矩形的四个角点
 */
export function getRectCorners(rect: Rectangle): Point[] {
    return [
        { x: rect.x, y: rect.y },                                      // 左上
        { x: rect.x + rect.width, y: rect.y },                         // 右上
        { x: rect.x + rect.width, y: rect.y + rect.height },          // 右下
        { x: rect.x, y: rect.y + rect.height }                        // 左下
    ];
}

/**
 * 获取矩形的扩展角点（带小偏移，避免贴边）
 * 
 * @param rect 矩形
 * @param offset 偏移量（像素）
 * @returns 扩展后的8个候选点
 */
export function getExpandedRectCorners(rect: Rectangle, offset = 2): Point[] {
    const corners: Point[] = [];

    // 原始四个角
    const baseCorners = getRectCorners(rect);
    corners.push(...baseCorners);

    // 添加边中点（可选，用于更精细的可见性检测）
    corners.push(
        { x: rect.x + rect.width / 2, y: rect.y - offset },           // 上中
        { x: rect.x + rect.width + offset, y: rect.y + rect.height / 2 }, // 右中
        { x: rect.x + rect.width / 2, y: rect.y + rect.height + offset }, // 下中
        { x: rect.x - offset, y: rect.y + rect.height / 2 }           // 左中
    );

    return corners;
}

/**
 * 计算AABB包围盒的交集
 * 用于快速裁剪优化
 */
export function rectIntersects(rect1: Rectangle, rect2: Rectangle): boolean {
    return !(
        rect1.x + rect1.width < rect2.x ||
        rect2.x + rect2.width < rect1.x ||
        rect1.y + rect1.height < rect2.y ||
        rect2.y + rect2.height < rect1.y
    );
}

/**
 * 计算点到线段的最短距离
 */
export function pointToSegmentDistance(p: Point, seg: LineSegment): number {
    const { start: a, end: b } = seg;

    // 向量 AB 和 AP
    const ABx = b.x - a.x;
    const ABy = b.y - a.y;
    const APx = p.x - a.x;
    const APy = p.y - a.y;

    // AB · AP
    const dotProduct = ABx * APx + ABy * APy;

    // |AB|²
    const abLengthSq = ABx * ABx + ABy * ABy;

    if (abLengthSq === 0) {
        // A 和 B 是同一个点
        return distance(p, a);
    }

    // 投影参数 t
    const t = Math.max(0, Math.min(1, dotProduct / abLengthSq));

    // 投影点
    const projection: Point = {
        x: a.x + t * ABx,
        y: a.y + t * ABy
    };

    return distance(p, projection);
}
