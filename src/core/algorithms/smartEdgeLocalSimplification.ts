import { Position } from '../types/flow';
import type { Rectangle, Point } from './pathfinding';
import { isPathBlocked } from './pathfinding';
import type { SpatialIndex } from './SpatialIndex';


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
