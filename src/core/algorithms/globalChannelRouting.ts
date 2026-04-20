/**
 * 全局通道分配 (Global Channel Routing)
 * 
 * 使用 Interval Coloring 算法，将重合或极度接近的平行正交线段
 * 分离到不同的轨道（Track）上，彻底解决多线重叠问题。
 * 
 * 移植自 DiagramView-SVG/routing/AdvancedRouting.ts → globalChannelRouting
 * 
 * 与 RF 版现有 Nudge 的差异：
 * - Nudge：逐边逐段搜索式推移，依赖搜索顺序
 * - Channel：全局所有边统一分配，Interval Coloring 确定性结果
 */

export interface Point {
    x: number;
    y: number;
}

interface Segment {
    edgeId: string;
    segIdx: number;
    isHoriz: boolean;
    /** 固定轴的值（水平段→Y，垂直段→X） */
    fixedVal: number;
    /** 可变轴的最小值 */
    minVal: number;
    /** 可变轴的最大值 */
    maxVal: number;
}

/**
 * 对一组 edges 的路径进行全局通道分配。
 * 
 * @param edgePaths Map<edgeId, Point[]> — 每条边的原始路径点
 * @param spacing 轨道间距（像素），默认 12
 * @returns Map<edgeId, Point[]> — 调整后的路径点
 */
export function globalChannelRouting(
    edgePaths: Map<string, Point[]>,
    spacing: number = 12
): Map<string, Point[]> {
    // 1. 提取所有内部正交线段（跳过首末端口段）
    const segments: Segment[] = [];

    for (const [edgeId, pts] of edgePaths) {
        // [FIX T-5] 与 Sprint D N-5 保持一致，改为 < 2
        // 原来 < 4 使得 3 点 L 形边全部被跳过，导致 useChannelRouting N-5 修复效果被内部抵消
        if (pts.length < 2) continue;

        for (let j = 1; j < pts.length - 2; j++) {
            const p1 = pts[j];
            const p2 = pts[j + 1];

            const isHoriz = Math.abs(p1.y - p2.y) < 1;
            const isVert = Math.abs(p1.x - p2.x) < 1;

            if (isHoriz) {
                segments.push({
                    edgeId,
                    segIdx: j,
                    isHoriz: true,
                    fixedVal: Math.round(p1.y),
                    minVal: Math.min(p1.x, p2.x),
                    maxVal: Math.max(p1.x, p2.x),
                });
            } else if (isVert) {
                segments.push({
                    edgeId,
                    segIdx: j,
                    isHoriz: false,
                    fixedVal: Math.round(p1.x),
                    minVal: Math.min(p1.y, p2.y),
                    maxVal: Math.max(p1.y, p2.y),
                });
            }
        }
    }

    // 2. 按方向分组 + Interval Coloring 分配 track
    const groupAndAssignTracks = (segs: Segment[]): Map<string, number> => {
        // 按 fixedVal 聚类（容差 5px）
        const groups = new Map<number, Segment[]>();
        for (const s of segs) {
            let foundKey = s.fixedVal;
            for (const key of groups.keys()) {
                if (Math.abs(key - s.fixedVal) < 5) {
                    foundKey = key;
                    break;
                }
            }
            if (!groups.has(foundKey)) groups.set(foundKey, []);
            groups.get(foundKey)!.push(s);
        }

        const shifts = new Map<string, number>();

        for (const [, group] of groups) {
            if (group.length < 2) continue;

            // Interval Coloring：按起点排序，贪心分配到 track
            group.sort((a, b) => a.minVal - b.minVal);

            const tracks: number[] = []; // tracks[i] = 该 track 当前的最大结束值
            const assignments: { seg: Segment; trackIdx: number }[] = [];

            for (const seg of group) {
                let placed = false;
                for (let t = 0; t < tracks.length; t++) {
                    if (seg.minVal > tracks[t] + spacing) {
                        tracks[t] = seg.maxVal;
                        assignments.push({ seg, trackIdx: t });
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    tracks.push(seg.maxVal);
                    assignments.push({ seg, trackIdx: tracks.length - 1 });
                }
            }

            const numTracks = tracks.length;
            if (numTracks > 1) {
                for (const { seg, trackIdx } of assignments) {
                    const offset = (trackIdx - (numTracks - 1) / 2) * spacing;
                    shifts.set(`${seg.edgeId}:${seg.segIdx}`, offset);
                }
            }
        }

        return shifts;
    };

    const horizSegs = segments.filter(s => s.isHoriz);
    const vertSegs = segments.filter(s => !s.isHoriz);

    const hShifts = groupAndAssignTracks(horizSegs);
    const vShifts = groupAndAssignTracks(vertSegs);

    // 3. 如果没有任何偏移，直接返回原始路径
    if (hShifts.size === 0 && vShifts.size === 0) {
        return edgePaths;
    }

    // 4. 重建路径点：将 shift 应用到中间点（跳过首末点保持端口连接）
    const result = new Map<string, Point[]>();

    for (const [edgeId, pts] of edgePaths) {
        // [FIX T-5] 同上。路径重建阶段也需要放宽到 2 点
        if (pts.length < 2) {
            result.set(edgeId, pts);
            continue;
        }

        const newPts = pts.map(p => ({ x: p.x, y: p.y }));

        for (let j = 1; j < pts.length - 1; j++) {
            const prevSegIdx = j - 1;
            const nextSegIdx = j;

            // 水平段偏移 → 移动 Y
            const shiftYPrev = hShifts.get(`${edgeId}:${prevSegIdx}`) || 0;
            const shiftYNext = hShifts.get(`${edgeId}:${nextSegIdx}`) || 0;

            // 垂直段偏移 → 移动 X
            const shiftXPrev = vShifts.get(`${edgeId}:${prevSegIdx}`) || 0;
            const shiftXNext = vShifts.get(`${edgeId}:${nextSegIdx}`) || 0;

            // 角点受相邻两段的偏移影响
            newPts[j].x += shiftXPrev + shiftXNext;
            newPts[j].y += shiftYPrev + shiftYNext;
        }

        result.set(edgeId, newPts);
    }

    return result;
}
