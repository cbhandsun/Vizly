/**
 * 简单回退路径生成器
 * 用途：在主线程提供即时路径渲染，无障碍检测，牺牲精度换取速度
 */

export type Direction = 'left' | 'right' | 'top' | 'bottom';

export interface Point {
    x: number;
    y: number;
}

/**
 * 根据方向获取偏移量
 */
function getDirectionOffset(dir: Direction, distance: number = 50): Point {
    switch (dir) {
        case 'right': return { x: distance, y: 0 };
        case 'left': return { x: -distance, y: 0 };
        case 'bottom': return { x: 0, y: distance };
        case 'top': return { x: 0, y: -distance };
    }
}

/**
 * 判断是否为水平方向
 */
function isHorizontal(dir: Direction): boolean {
    return dir === 'left' || dir === 'right';
}

/**
 * 计算曼哈顿风格的简单路径
 * 特点：
 * - 固定3个转折点，O(1)复杂度
 * - 无障碍检测
 * - 支持所有16种端口组合
 * 
 * @param start 起点坐标
 * @param end 终点坐标
 * @param startDir 起点方向
 * @param endDir 终点方向
 * @returns SVG path 字符串
 */
export function computeManhattanPath(
    start: Point,
    end: Point,
    startDir: Direction,
    endDir: Direction
): string {
    const startOffset = getDirectionOffset(startDir, 30);
    const endOffset = getDirectionOffset(endDir, 30);

    // P1: 起点延伸
    const p1 = {
        x: start.x + startOffset.x,
        y: start.y + startOffset.y
    };

    // P4: 终点延伸（反向）
    const p4 = {
        x: end.x + endOffset.x,
        y: end.y + endOffset.y
    };

    // 计算中间转折点
    const startIsHorizontal = isHorizontal(startDir);
    const endIsHorizontal = isHorizontal(endDir);

    let p2: Point, p3: Point;

    if (startIsHorizontal && endIsHorizontal) {
        // 两个水平方向：在中间垂直转折
        const midY = (p1.y + p4.y) / 2;
        p2 = { x: p1.x, y: midY };
        p3 = { x: p4.x, y: midY };
    } else if (!startIsHorizontal && !endIsHorizontal) {
        // 两个垂直方向：在中间水平转折
        const midX = (p1.x + p4.x) / 2;
        p2 = { x: midX, y: p1.y };
        p3 = { x: midX, y: p4.y };
    } else if (startIsHorizontal && !endIsHorizontal) {
        // 起点水平，终点垂直
        p2 = { x: p1.x, y: p4.y };
        p3 = p2; // 合并转折点
    } else {
        // 起点垂直，终点水平
        p2 = { x: p4.x, y: p1.y };
        p3 = p2; // 合并转折点
    }

    // 构建SVG路径
    return `M ${start.x},${start.y} L ${p1.x},${p1.y} L ${p2.x},${p2.y} L ${p3.x},${p3.y} L ${p4.x},${p4.y} L ${end.x},${end.y}`;
}

/**
 * 计算简化的正交路径（直角）
 * 用于快速预览，仅2个转折点
 */
export function computeSimpleOrthogonalPath(
    start: Point,
    end: Point,
    startDir: Direction,
    endDir: Direction
): string {
    const startIsHorizontal = isHorizontal(startDir);
    const endIsHorizontal = isHorizontal(endDir);

    if (startIsHorizontal === endIsHorizontal) {
        // 同向：使用中间转折
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;

        if (startIsHorizontal) {
            return `M ${start.x},${start.y} L ${midX},${start.y} L ${midX},${end.y} L ${end.x},${end.y}`;
        } else {
            return `M ${start.x},${start.y} L ${start.x},${midY} L ${end.x},${midY} L ${end.x},${end.y}`;
        }
    } else {
        // 异向：L形转折
        if (startIsHorizontal) {
            return `M ${start.x},${start.y} L ${end.x},${start.y} L ${end.x},${end.y}`;
        } else {
            return `M ${start.x},${start.y} L ${start.x},${end.y} L ${end.x},${end.y}`;
        }
    }
}

/**
 * 解析 handle ID 到方向
 * 支持格式: 't', 'b', 'l', 'r', 'top', 'bottom', 'left', 'right'
 */
export function parseHandleDirection(handleId?: string | null): Direction {
    if (!handleId) return 'right';

    const id = String(handleId).toLowerCase().trim();

    if (id.startsWith('t')) return 'top';
    if (id.startsWith('b')) return 'bottom';
    if (id.startsWith('l')) return 'left';
    if (id.startsWith('r')) return 'right';

    // 默认右侧
    return 'right';
}
