/**
 * GeometryUtils — 几何分析工具库
 *
 * 从 DiagramView-SVG GeometryAnalyzer 提取的独立纯函数工具集。
 * 无外部依赖，可在任何路径规划/端口选择/布局场景使用。
 *
 * 功能：
 * 1. classifyGeometry8Dir  — 8 方向几何分类（距离自适应角度门限）
 * 2. isBackwardsEdge       — 反向边检测
 * 3. getPortRules          — 端口组合规则表
 * 4. analyzeAlignment      — 节点对齐检测
 */

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

// ─── 8 方向几何分类 ───

export type GeometryType =
    | 'horizontal-forward' | 'horizontal-reverse'
    | 'vertical-forward' | 'vertical-reverse'
    | 'diagonal-ne' | 'diagonal-nw' | 'diagonal-se' | 'diagonal-sw'
    | 'collocated';

/**
 * 基于 dx/dy 的 8 方向分类（参考 yFiles/mxGraph 行业标准）
 *
 * 特点：
 * - 距离自适应角度门限（近距离宽容，远距离严格）
 * - 1.5x 主导比率 → 强制正交
 * - 极近距离 → collocated
 */
export function classifyGeometry8Dir(dx: number, dy: number): GeometryType {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // 极近距离
    if (absDx < 30 && absDy < 30) return 'collocated';

    // 1.5x 主导比率 → 强制正交
    const dominantRatio = Math.max(absDx, absDy) / (Math.min(absDx, absDy) + 0.1);
    if (dominantRatio > 1.5) {
        if (absDx > absDy) return dx > 0 ? 'horizontal-forward' : 'horizontal-reverse';
        return dy > 0 ? 'vertical-forward' : 'vertical-reverse';
    }

    // 角度分类（距离自适应门限）
    const dist = Math.sqrt(dx * dx + dy * dy);
    const isClose = dist < 200;
    const isFar = dist > 500;
    const hRange = isClose ? 35 : (isFar ? 25 : 30);
    const vStart = isClose ? 40 : (isFar ? 50 : 45);
    const vEnd = isClose ? 140 : (isFar ? 130 : 135);

    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    if (angle >= -hRange && angle < hRange) return 'horizontal-forward';
    if (angle >= hRange && angle < vStart) return 'diagonal-se';
    if (angle >= vStart && angle < vEnd) return 'vertical-forward';
    if (angle >= vEnd && angle < 180 - hRange) return 'diagonal-sw';
    if (angle >= 180 - hRange || angle < -(180 - hRange)) return 'horizontal-reverse';
    if (angle >= -(180 - hRange) && angle < -(180 - vStart)) return 'diagonal-nw';
    if (angle >= -vEnd && angle < -vStart) return 'vertical-reverse';
    if (angle >= -vStart && angle < -hRange) return 'diagonal-ne';

    return 'collocated';
}

// ─── 反向边检测 ───

/**
 * 检查边是否为反向边（逆布局方向流动）
 */
export function isBackwardsEdge(layoutDir: string, dx: number, dy: number, threshold = 5): boolean {
    return (
        (layoutDir.includes('TB') && dy < -threshold) ||
        (layoutDir.includes('BT') && dy > threshold) ||
        (layoutDir.includes('LR') && dx < -threshold) ||
        (layoutDir.includes('RL') && dx > threshold)
    );
}

// ─── 端口组合规则 ───

export interface PortRules {
    preferred: string[];
    forbidden: string[];
    neutral: string[];
}

/**
 * 端口方向对字符串 (如 "B->T")
 */
export function portComboStr(sDir: string, tDir: string): string {
    const m: Record<string, string> = { t: 'T', b: 'B', l: 'L', r: 'R' };
    return `${m[sDir] || '?'}->${m[tDir] || '?'}`;
}

/**
 * 获取指定几何类型的端口组合规则
 * 用于端口选择时评估各端口组合的合理性
 */
export function getPortRules(type: GeometryType): PortRules {
    const R: Record<GeometryType, PortRules> = {
        'horizontal-forward': {
            preferred: ['R->L', 'B->T', 'T->B'],
            forbidden: ['L->R', 'L->L', 'R->R'],
            neutral: [],
        },
        'horizontal-reverse': {
            preferred: ['L->R', 'T->T', 'B->B', 'R->L'],
            forbidden: ['R->R', 'L->L', 'T->B', 'B->T'],
            neutral: [],
        },
        'vertical-forward': {
            preferred: ['B->T', 'L->R', 'R->L'],
            forbidden: ['T->B', 'T->T', 'B->B'],
            neutral: [],
        },
        'vertical-reverse': {
            preferred: ['L->L', 'R->R'],
            forbidden: ['T->L', 'T->R', 'T->T', 'T->B', 'B->T', 'B->B'],
            neutral: [],
        },
        'diagonal-ne': {
            preferred: ['R->L', 'T->B', 'R->B', 'T->L'],
            forbidden: ['R->R', 'L->L', 'B->T'],
            neutral: [],
        },
        'diagonal-nw': {
            preferred: ['L->R', 'T->B', 'L->B', 'T->R'],
            forbidden: ['L->L', 'R->R', 'B->T'],
            neutral: [],
        },
        'diagonal-se': {
            preferred: ['B->T', 'R->L', 'B->L', 'R->T'],
            forbidden: ['L->R', 'R->R', 'T->B', 'B->B', 'T->T'],
            neutral: [],
        },
        'diagonal-sw': {
            preferred: ['B->T', 'L->R', 'B->R', 'L->T'],
            forbidden: ['R->L', 'L->L', 'T->B', 'B->B', 'T->T'],
            neutral: [],
        },
        'collocated': {
            preferred: [],
            forbidden: [],
            neutral: ['R->L', 'L->R', 'T->B', 'B->T', 'L->L', 'R->R', 'T->T', 'B->B',
                'R->T', 'R->B', 'L->T', 'L->B', 'T->L', 'T->R', 'B->L', 'B->R'],
        },
    };
    return R[type];
}

// ─── 对齐检测 ───

export interface AlignmentInfo {
    isAligned: boolean;
    alignAxis: 'horizontal' | 'vertical' | 'none';
    offset: number;
}

/**
 * 检测两个矩形的中心对齐情况
 */
export function analyzeAlignment(
    rect1: Rect,
    rect2: Rect,
    threshold = 10,
): AlignmentInfo {
    const c1 = { x: rect1.x + rect1.width / 2, y: rect1.y + rect1.height / 2 };
    const c2 = { x: rect2.x + rect2.width / 2, y: rect2.y + rect2.height / 2 };

    const dx = Math.abs(c2.x - c1.x);
    const dy = Math.abs(c2.y - c1.y);

    if (dx < threshold) return { isAligned: true, alignAxis: 'vertical', offset: dx };
    if (dy < threshold) return { isAligned: true, alignAxis: 'horizontal', offset: dy };
    return { isAligned: false, alignAxis: 'none', offset: Math.min(dx, dy) };
}

// ─── 基础几何工具 ───

/** 欧氏距离 */
export function euclideanDistance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/** 曼哈顿距离 */
export function manhattanDistance(p1: Point, p2: Point): number {
    return Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);
}

/** 点是否在矩形内 */
export function isPointInRect(point: Point, rect: Rect, padding = 0): boolean {
    return (
        point.x >= rect.x - padding &&
        point.x <= rect.x + rect.width + padding &&
        point.y >= rect.y - padding &&
        point.y <= rect.y + rect.height + padding
    );
}

/** 线段-矩形相交检测 (AABB for orthogonal segments) */
export function segmentIntersectsRect(p1: Point, p2: Point, rect: Rect): boolean {
    const minX = rect.x;
    const maxX = rect.x + rect.width;
    const minY = rect.y;
    const maxY = rect.y + rect.height;

    if (Math.max(p1.x, p2.x) < minX || Math.min(p1.x, p2.x) > maxX) return false;
    if (Math.max(p1.y, p2.y) < minY || Math.min(p1.y, p2.y) > maxY) return false;

    return true;
}
