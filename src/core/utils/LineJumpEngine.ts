/**
 * LineJumpEngine — 线段交叉跳线引擎
 *
 * 从 DiagramView-SVG 移植 + 增强。
 *
 * 功能：
 * 1. extractSegments  — 从 SVG 路径点序列提取正交线段
 * 2. findIntersections — 检测所有水平/垂直线段的十字交点
 * 3. applyLineJumps   — 为水平线段在交叉点插入弧线跳线 (arc jump)
 */

export type Point = { x: number; y: number };

export type LineSegment = {
    p1: Point;
    p2: Point;
    edgeId: string;
    isHorizontal: boolean;
};

export type IntersectionInfo = {
    point: Point;
    /** 交点归属的水平边 ID（这条边在交点处绘制跳线弧） */
    horizontalEdgeId: string;
    /** 交点归属的垂直边 ID */
    verticalEdgeId: string;
};

/** 跳线弧半径（像素） */
const JUMP_RADIUS = 6;

/**
 * 提取一组点构成的所有正交线段
 */
export function extractSegments(points: Point[], edgeId: string): LineSegment[] {
    const segments: LineSegment[] = [];
    if (points.length < 2) return segments;

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];

        // 只提取长于 JUMP_RADIUS*2 的正交段
        const isHorizontal = Math.abs(p1.y - p2.y) < 0.5;
        const isVertical = Math.abs(p1.x - p2.x) < 0.5;

        if (isHorizontal) {
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
 * 计算线段集的所有水平-垂直十字交点
 * 仅计算不同边之间的交叉（同一条边内部不生成跳线）
 */
export function findIntersections(segments: LineSegment[]): IntersectionInfo[] {
    const hSegments = segments.filter(s => s.isHorizontal);
    const vSegments = segments.filter(s => !s.isHorizontal);
    const intersections: IntersectionInfo[] = [];

    for (const h of hSegments) {
        const hMinX = Math.min(h.p1.x, h.p2.x);
        const hMaxX = Math.max(h.p1.x, h.p2.x);
        const hY = h.p1.y;

        for (const v of vSegments) {
            // 同一条边自身的段不生成跳线
            if (h.edgeId === v.edgeId) continue;

            const vMinY = Math.min(v.p1.y, v.p2.y);
            const vMaxY = Math.max(v.p1.y, v.p2.y);
            const vX = v.p1.x;

            // 检测正交相交（严格内部交叉，不含端点）
            if (vX > hMinX && vX < hMaxX && hY > vMinY && hY < vMaxY) {
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
 * 为 SVG 路径字符串中的水平线段插入跳线弧
 *
 * 工作原理：
 * - 从 SVG path 的直线命令 (M/L) 中提取点序列
 * - 检测水平线段上的交叉点
 * - 在交叉点处将直线替换为弧线 (semicircular arc)
 *
 * @param svgPath  原始 SVG path 字符串
 * @param edgeId   当前边 ID
 * @param allIntersections 所有交叉点信息
 * @returns  带跳线的新 SVG path
 */
export function applyLineJumps(
    svgPath: string,
    edgeId: string,
    allIntersections: IntersectionInfo[],
): string {
    // 筛选出属于当前边（作为水平边）的交叉点
    const myJumps = allIntersections.filter(
        info => info.horizontalEdgeId === edgeId
    );

    if (myJumps.length === 0) return svgPath;

    // 解析 SVG path 提取关键点（仅处理 M/L 命令的简单正交路径）
    const points = parseSvgPathPoints(svgPath);
    if (points.length < 2) return svgPath;

    // 重建路径，在水平段的交叉点处插入跳线弧
    const parts: string[] = [`M ${points[0].x} ${points[0].y}`];

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const isH = Math.abs(p1.y - p2.y) < 0.5;

        if (!isH) {
            // 非水平段，直接 lineTo
            parts.push(`L ${p2.x} ${p2.y}`);
            continue;
        }

        // 收集这条水平线段上的跳线点
        const hMinX = Math.min(p1.x, p2.x);
        const hMaxX = Math.max(p1.x, p2.x);
        const goingRight = p2.x > p1.x;

        const jumpPoints = myJumps
            .filter(j => {
                const jx = j.point.x;
                return jx > hMinX + JUMP_RADIUS && jx < hMaxX - JUMP_RADIUS;
            })
            .map(j => j.point.x)
            .sort((a, b) => goingRight ? a - b : b - a);

        if (jumpPoints.length === 0) {
            parts.push(`L ${p2.x} ${p2.y}`);
            continue;
        }

        // 在每个交叉点处插入半圆弧跳线
        let currentX = p1.x;
        const y = p1.y;
        const r = JUMP_RADIUS;

        for (const jx of jumpPoints) {
            const arcStartX = jx - (goingRight ? r : -r);
            const arcEndX = jx + (goingRight ? r : -r);

            // 从当前位置画到弧起点
            parts.push(`L ${arcStartX} ${y}`);
            // 半圆弧跳线（向上凸起）
            // sweep-flag 取决于方向：向右走 sweep=1, 向左走 sweep=0
            parts.push(`A ${r} ${r} 0 0 ${goingRight ? 1 : 0} ${arcEndX} ${y}`);
            currentX = arcEndX;
        }

        // 补全到线段终点
        parts.push(`L ${p2.x} ${p2.y}`);
    }

    return parts.join(' ');
}

/**
 * 从 SVG path 字符串解析出路径点序列
 * 支持 M, L, H, V 命令（正交路径最常用的命令）
 */
function parseSvgPathPoints(d: string): Point[] {
    const points: Point[] = [];
    const commands = d.replace(/([a-zA-Z])/g, '|$1').split('|').filter(c => c.trim());

    let cx = 0, cy = 0; // 当前画笔位置

    for (const cmdStr of commands) {
        const parts = cmdStr.trim().split(/[\s,]+/).filter(p => p !== '');
        if (parts.length === 0) continue;

        const type = parts[0];
        const nums = parts.slice(1).map(Number);

        switch (type) {
            case 'M':
                if (nums.length >= 2) {
                    cx = nums[0]; cy = nums[1];
                    points.push({ x: cx, y: cy });
                }
                break;
            case 'L':
                if (nums.length >= 2) {
                    cx = nums[0]; cy = nums[1];
                    points.push({ x: cx, y: cy });
                }
                break;
            case 'H':
                if (nums.length >= 1) {
                    cx = nums[0];
                    points.push({ x: cx, y: cy });
                }
                break;
            case 'V':
                if (nums.length >= 1) {
                    cy = nums[0];
                    points.push({ x: cx, y: cy });
                }
                break;
            case 'Q':
                // 二次贝塞尔 — 取终点
                if (nums.length >= 4) {
                    cx = nums[2]; cy = nums[3];
                    points.push({ x: cx, y: cy });
                }
                break;
            case 'C':
                // 三次贝塞尔 — 取终点
                if (nums.length >= 6) {
                    cx = nums[4]; cy = nums[5];
                    points.push({ x: cx, y: cy });
                }
                break;
            // A (arc) 命令在输入路径中不太常见，跳过
        }
    }

    return points;
}

/**
 * 方便的一站式 API：给定所有边的路径点，计算并返回每条边的跳线版本路径
 *
 * @param edgePaths  Map<edgeId, SVG path string>
 * @param edgePoints Map<edgeId, Point[]>  (每条边的路径点序列)
 * @returns  Map<edgeId, 带跳线的 SVG path string>
 */
export function computeLineJumps(
    edgePaths: Map<string, string>,
    edgePoints: Map<string, Point[]>,
): Map<string, string> {
    // Step 1: 提取所有线段
    const allSegments: LineSegment[] = [];
    edgePoints.forEach((points, edgeId) => {
        const segs = extractSegments(points, edgeId);
        for (let i = 0; i < segs.length; i++) {
            allSegments.push(segs[i]);
        }
    });

    // Step 2: 计算交叉点
    const intersections = findIntersections(allSegments);

    if (intersections.length === 0) return edgePaths;

    // Step 3: 为每条边应用跳线
    const result = new Map<string, string>();
    edgePaths.forEach((path, edgeId) => {
        result.set(edgeId, applyLineJumps(path, edgeId, intersections));
    });
    return result;
}
