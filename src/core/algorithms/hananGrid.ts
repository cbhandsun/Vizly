/**
 * Hanan Grid 构建器
 * 
 * 将障碍物边界坐标 + padding 收集为 X/Y 坐标集，
 * 加密间距过大的区间中点，生成 Hanan Grid 节点。
 * 
 * 相比均匀网格：
 * - 节点数大幅减少（仅在边界 + 中点处）
 * - A* 搜索空间更小 → 性能提升
 * - 路径质量更高（自然沿边界行走）
 * 
 * 移植自 DiagramView-SVG/routing/PathFinder.ts L147-199
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
    padding?: number;
}

export interface HananGrid {
    /** 有序 X 坐标集 */
    X: number[];
    /** 有序 Y 坐标集 */
    Y: number[];
    /** 快速查找：X 值 → 索引 */
    xIndex: Map<number, number>;
    /** 快速查找：Y 值 → 索引 */
    yIndex: Map<number, number>;
}

/**
 * 构建 Hanan Grid
 * 
 * @param source 起点
 * @param target 终点
 * @param obstacles 障碍物列表
 * @param gridSize 加密阈值（间距超过 gridSize*2 时插入中点）
 * @param extraPadding 额外 padding（在障碍物边界外加的间距）
 */
export function buildHananGrid(
    source: Point,
    target: Point,
    obstacles: Rectangle[],
    gridSize: number = 15,
    extraPadding: number = 0
): HananGrid {
    const xSet = new Set<number>();
    const ySet = new Set<number>();

    // 1. 添加起终点
    const sx = Math.round(source.x);
    const sy = Math.round(source.y);
    const gx = Math.round(target.x);
    const gy = Math.round(target.y);
    xSet.add(sx); ySet.add(sy);
    xSet.add(gx); ySet.add(gy);

    // 2. 添加全局边界
    let minX = Math.min(sx, gx) - gridSize * 4;
    let minY = Math.min(sy, gy) - gridSize * 4;
    let maxX = Math.max(sx, gx) + gridSize * 4;
    let maxY = Math.max(sy, gy) + gridSize * 4;

    // 3. 添加障碍物边界 + 间距线
    for (const o of obstacles) {
        const pad = (o.padding || 0) + extraPadding;

        // 扩展全局边界
        minX = Math.min(minX, o.x - pad - gridSize * 4);
        minY = Math.min(minY, o.y - pad - gridSize * 4);
        maxX = Math.max(maxX, o.x + o.width + pad + gridSize * 4);
        maxY = Math.max(maxY, o.y + o.height + pad + gridSize * 4);

        // 障碍物边界线
        const l = Math.round(o.x - pad);
        const r = Math.round(o.x + o.width + pad);
        const t = Math.round(o.y - pad);
        const b = Math.round(o.y + o.height + pad);
        xSet.add(l); xSet.add(r);
        ySet.add(t); ySet.add(b);

        // 间距线（在边界外一个 gridSize）
        xSet.add(l - gridSize); xSet.add(r + gridSize);
        ySet.add(t - gridSize); ySet.add(b + gridSize);
    }

    // 全局边界
    xSet.add(Math.round(minX)); xSet.add(Math.round(maxX));
    ySet.add(Math.round(minY)); ySet.add(Math.round(maxY));

    // 4. 中点加密 — 大间距区间插入中点，消除粗糙搜索
    const densify = (arr: number[]): number[] => {
        const result: number[] = [arr[0]];
        for (let i = 1; i < arr.length; i++) {
            const gap = arr[i] - arr[i - 1];
            if (gap > gridSize * 2) {
                result.push(Math.round((arr[i - 1] + arr[i]) / 2));
            }
            result.push(arr[i]);
        }
        return result;
    };

    const X = densify(Array.from(xSet).sort((a, b) => a - b));
    const Y = densify(Array.from(ySet).sort((a, b) => a - b));

    // 5. 构建索引 Map
    const xIndex = new Map<number, number>();
    const yIndex = new Map<number, number>();
    X.forEach((v, i) => xIndex.set(v, i));
    Y.forEach((v, i) => yIndex.set(v, i));

    return { X, Y, xIndex, yIndex };
}

/**
 * 检查 Hanan Grid 中某点是否被障碍物阻塞
 */
export function isBlockedInGrid(
    x: number,
    y: number,
    obstacles: Rectangle[],
    extraPadding: number = 0
): boolean {
    for (const o of obstacles) {
        const pad = (o.padding || 0) + extraPadding;
        if (x > o.x - pad && x < o.x + o.width + pad &&
            y > o.y - pad && y < o.y + o.height + pad) {
            return true;
        }
    }
    return false;
}

/**
 * 检查 Hanan Grid 中两点间的线段是否穿越障碍物
 */
export function isSegmentBlockedInGrid(
    p1: Point,
    p2: Point,
    obstacles: Rectangle[],
    extraPadding: number = 0
): boolean {
    // 只检测正交线段
    const isHorizontal = Math.abs(p1.y - p2.y) < 0.5;
    const isVertical = Math.abs(p1.x - p2.x) < 0.5;

    if (!isHorizontal && !isVertical) return false; // 非正交段不检查

    for (const o of obstacles) {
        const pad = (o.padding || 0) + extraPadding;
        const oLeft = o.x - pad;
        const oRight = o.x + o.width + pad;
        const oTop = o.y - pad;
        const oBottom = o.y + o.height + pad;

        if (isHorizontal) {
            const y = p1.y;
            const minX = Math.min(p1.x, p2.x);
            const maxX = Math.max(p1.x, p2.x);
            // 水平线穿越矩形：Y 在范围内，且 X 范围与矩形 X 范围重叠
            if (y > oTop && y < oBottom && maxX > oLeft && minX < oRight) {
                return true;
            }
        } else {
            const x = p1.x;
            const minY = Math.min(p1.y, p2.y);
            const maxY = Math.max(p1.y, p2.y);
            if (x > oLeft && x < oRight && maxY > oTop && minY < oBottom) {
                return true;
            }
        }
    }
    return false;
}
