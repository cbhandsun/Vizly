/**
 * 全局通道分配 (Global Channel Routing)
 * 
 * 使用 Interval Coloring 算法，将重合或极度接近的平行正交线段
 * 分离到不同的轨道（Track）上，解决非 bus 线的重叠问题。
 * 
 * 核心原则（KISS）：
 * - Bus/Trunk 边（buddyGroups 中的边）路径保持原样不动，
 *   但其线段参与碰撞检测，作为"已占用轨道"。
 * - 只有非 bus 的独立边才会被偏移。
 * - 偏移保守：只分离真正重叠的段，避免引入新的交叉。
 * 
 * [Edge Bundling] 方向感知的吸附/分离：
 * - 同方向段（flow 一致）且近距离 → 吸附到同一轨道（视觉合并）
 * - 反方向段（flow 相反）且近距离 → 推开到两侧（保持可读性）
 * - 反方向推开**也适用于 buddy 边**（如 O2M 的正向主干 vs M2O 的回流主干）
 */

export interface Point {
    x: number;
    y: number;
}

interface Segment {
    edgeId: string;
    segIdx: number;
    isHoriz: boolean;
    fixedVal: number;
    minVal: number;
    maxVal: number;
    isBuddy: boolean;
    /** 段在变化轴上的流向：+1=正向(右/下)，-1=反向(左/上)，0=无法判断 */
    flowDir: number;
}

/**
 * Buddy group — bus/trunk 边的分组。
 * 组内的边路径不被修改，但其线段会参与碰撞检测。
 */
export interface BuddyGroup {
    edgeIds: Set<string>;
    type: 'o2m' | 'm2o';
}

/**
 * 对一组 edges 的路径进行全局通道分配。
 * buddy 边作为固定占用参与碰撞检测，只偏移非 buddy 段。
 */
export function globalChannelRouting(
    edgePaths: Map<string, Point[]>,
    spacing: number = 12,
    buddyGroups?: BuddyGroup[]
): Map<string, Point[]> {
    const buddyEdgeIds = new Set<string>();
    // 为每个 buddy 边记录所属组，以区分不同 buddy 组（O2M vs M2O 组）
    const buddyGroupOf = new Map<string, number>();
    if (buddyGroups) {
        buddyGroups.forEach((group, gIdx) => {
            for (const edgeId of group.edgeIds) {
                buddyEdgeIds.add(edgeId);
                buddyGroupOf.set(edgeId, gIdx);
            }
        });
    }

    // 1. 提取所有正交线段
    const GROUP_TOLERANCE = 6;   // 同通道聚类容差（px）
    const SNAP_TOLERANCE = 16;   // 同方向段吸附容差
    const SNAP_OVERLAP_RATIO = 0.3; // 吸附要求：重叠长度占短段比例 > 30%
    const COUNTER_MIN_SEPARATION = spacing; // 反方向段最小分离距离
    const segments: Segment[] = [];

    // 辅助：推断段在路径上的整体流向
    const edgeFlowDirs = new Map<string, { primaryX: number; primaryY: number }>();
    for (const [edgeId, pts] of edgePaths) {
        if (pts.length < 2) continue;
        const first = pts[0];
        const last = pts[pts.length - 1];
        edgeFlowDirs.set(edgeId, {
            primaryX: Math.sign(last.x - first.x) || 0,
            primaryY: Math.sign(last.y - first.y) || 0,
        });
    }

    for (const [edgeId, pts] of edgePaths) {
        if (pts.length < 2) continue;
        const isBuddy = buddyEdgeIds.has(edgeId);
        const edgeFlow = edgeFlowDirs.get(edgeId);

        for (let j = 0; j < pts.length - 1; j++) {
            const p1 = pts[j];
            const p2 = pts[j + 1];
            const isHoriz = Math.abs(p1.y - p2.y) < 1.5;
            const isVert = Math.abs(p1.x - p2.x) < 1.5;
            const len = isHoriz ? Math.abs(p1.x - p2.x) : Math.abs(p1.y - p2.y);
            if (len < 8) continue;

            let flowDir = 0;
            if (edgeFlow) {
                flowDir = isHoriz ? edgeFlow.primaryX : edgeFlow.primaryY;
            }

            if (isHoriz) {
                segments.push({
                    edgeId, segIdx: j, isHoriz: true, isBuddy, flowDir,
                    fixedVal: Math.round((p1.y + p2.y) / 2),
                    minVal: Math.min(p1.x, p2.x),
                    maxVal: Math.max(p1.x, p2.x),
                });
            } else if (isVert) {
                segments.push({
                    edgeId, segIdx: j, isHoriz: false, isBuddy, flowDir,
                    fixedVal: Math.round((p1.x + p2.x) / 2),
                    minVal: Math.min(p1.y, p2.y),
                    maxVal: Math.max(p1.y, p2.y),
                });
            }
        }
    }

    // [Edge Bundling] Phase 0: 方向感知的吸附与分离
    const snapShifts = new Map<string, number>();      // 同方向吸附偏移
    const counterShifts = new Map<string, number>();    // 反方向分离偏移
    const buddyCounterShifts = new Map<string, number>(); // buddy 边的反方向推开（特殊通道）

    // 辅助函数：检测两段是否需要处理（方向判断 + 重叠计算）
    const detectAndApply = (segA: Segment, segB: Segment, onlyCounter: boolean) => {
        if (segA.isHoriz !== segB.isHoriz) return;
        if (segA.edgeId === segB.edgeId) return;

        const dist = segA.fixedVal - segB.fixedVal;
        const absDist = Math.abs(dist);

        const overlapLen = Math.min(segA.maxVal, segB.maxVal) - Math.max(segA.minVal, segB.minVal);
        const shortLen = Math.min(segA.maxVal - segA.minVal, segB.maxVal - segB.minVal);
        if (overlapLen <= 0 || shortLen <= 0) return;
        const overlapRatio = overlapLen / shortLen;
        if (overlapRatio <= SNAP_OVERLAP_RATIO) return;

        const sameDirection = segA.flowDir !== 0 && segB.flowDir !== 0 && segA.flowDir === segB.flowDir;
        const counterDirection = segA.flowDir !== 0 && segB.flowDir !== 0 && segA.flowDir !== segB.flowDir;

        // 完全重合的同方向段 → 不需要处理（已完美对齐）
        if (absDist < 0.5 && !counterDirection) return;

        const keyA = `${segA.edgeId}:${segA.segIdx}`;

        if (!onlyCounter && sameDirection && absDist <= SNAP_TOLERANCE) {
            // ✅ 同方向 + 近距离 → 吸附到 segB 的轨道
            if (!segA.isBuddy) {
                const snapOffset = segB.fixedVal - segA.fixedVal;
                const existing = snapShifts.get(keyA);
                if (existing === undefined || Math.abs(snapOffset) < Math.abs(existing)) {
                    snapShifts.set(keyA, snapOffset);
                }
                counterShifts.delete(keyA);
            }
        } else if (counterDirection && absDist < COUNTER_MIN_SEPARATION) {
            // ❌ 反方向 + 太近（包括完全重合） → 推开
            if (!snapShifts.has(keyA)) {
                let pushOffset: number;
                if (absDist < 0.5) {
                    // 完全重合的反方向段：segA 往正方向推半个间距
                    pushOffset = COUNTER_MIN_SEPARATION / 2;
                } else {
                    pushOffset = dist > 0
                        ? (COUNTER_MIN_SEPARATION - absDist)
                        : -(COUNTER_MIN_SEPARATION - absDist);
                }

                if (segA.isBuddy) {
                    const existing = buddyCounterShifts.get(keyA);
                    if (existing === undefined || Math.abs(pushOffset) > Math.abs(existing)) {
                        buddyCounterShifts.set(keyA, pushOffset);
                    }
                } else {
                    const existing = counterShifts.get(keyA);
                    if (existing === undefined || Math.abs(pushOffset) > Math.abs(existing)) {
                        counterShifts.set(keyA, pushOffset);
                    }
                }
            }
        }
    };

    // Phase 0a: 非 buddy 段 vs buddy 段
    const buddySegs = segments.filter(s => s.isBuddy);
    const nonBuddySegs = segments.filter(s => !s.isBuddy);

    for (const nb of nonBuddySegs) {
        for (const bs of buddySegs) {
            detectAndApply(nb, bs, false);
        }
    }

    // Phase 0b: buddy 段 vs buddy 段（不同 buddy 组之间）
    // 检测反方向的 buddy 对（如 O2M 向下走 vs M2O 向上走）
    for (let i = 0; i < buddySegs.length; i++) {
        for (let j = i + 1; j < buddySegs.length; j++) {
            const a = buddySegs[i];
            const b = buddySegs[j];
            // 只处理不同 buddy 组之间的反方向推开
            const groupA = buddyGroupOf.get(a.edgeId);
            const groupB = buddyGroupOf.get(b.edgeId);
            if (groupA === groupB) continue; // 同组不推开

            detectAndApply(a, b, true); // onlyCounter=true, 只做反方向推开
            detectAndApply(b, a, true);
        }
    }

    // Phase 0c: 非 buddy 段之间
    for (let i = 0; i < nonBuddySegs.length; i++) {
        for (let j = i + 1; j < nonBuddySegs.length; j++) {
            const a = nonBuddySegs[i];
            const b = nonBuddySegs[j];
            detectAndApply(a, b, false);
            detectAndApply(b, a, false);
        }
    }

    // 2. Interval Coloring（跳过已吸附/已推开的段）
    const assignTracks = (segs: Segment[]): Map<string, number> => {
        const groups = new Map<number, Segment[]>();
        for (const s of segs) {
            const snapKey = `${s.edgeId}:${s.segIdx}`;
            if (snapShifts.has(snapKey) || counterShifts.has(snapKey) || buddyCounterShifts.has(snapKey)) continue;

            let foundKey: number | null = null;
            for (const key of groups.keys()) {
                if (Math.abs(key - s.fixedVal) < GROUP_TOLERANCE) {
                    foundKey = key;
                    break;
                }
            }
            const gKey = foundKey ?? s.fixedVal;
            if (!groups.has(gKey)) groups.set(gKey, []);
            groups.get(gKey)!.push(s);
        }

        const shifts = new Map<string, number>();

        for (const [, group] of groups) {
            if (group.length < 2) continue;

            let hasOverlap = false;
            outer: for (let i = 0; i < group.length; i++) {
                for (let j = i + 1; j < group.length; j++) {
                    if (group[i].edgeId === group[j].edgeId) continue;
                    const overlapLen = Math.min(group[i].maxVal, group[j].maxVal) - Math.max(group[i].minVal, group[j].minVal);
                    if (overlapLen > 2) {
                        hasOverlap = true;
                        break outer;
                    }
                }
            }
            if (!hasOverlap) continue;

            group.sort((a, b) => a.minVal - b.minVal);

            const trackEnds: number[] = [];
            const assignments: { seg: Segment; trackIdx: number }[] = [];

            for (const seg of group) {
                if (!seg.isBuddy) continue;
                let placed = false;
                for (let t = 0; t < trackEnds.length; t++) {
                    if (seg.minVal > trackEnds[t] + 2) {
                        trackEnds[t] = seg.maxVal;
                        assignments.push({ seg, trackIdx: t });
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    trackEnds.push(seg.maxVal);
                    assignments.push({ seg, trackIdx: trackEnds.length - 1 });
                }
            }

            const buddyTrackCount = trackEnds.length;

            for (const seg of group) {
                if (seg.isBuddy) continue;
                let placed = false;

                for (let t = buddyTrackCount; t < trackEnds.length; t++) {
                    if (seg.minVal > trackEnds[t] + 2) {
                        trackEnds[t] = seg.maxVal;
                        assignments.push({ seg, trackIdx: t });
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    for (let t = 0; t < buddyTrackCount; t++) {
                        if (seg.minVal > trackEnds[t] + 2) {
                            trackEnds[t] = seg.maxVal;
                            assignments.push({ seg, trackIdx: t });
                            placed = true;
                            break;
                        }
                    }
                }
                if (!placed) {
                    trackEnds.push(seg.maxVal);
                    assignments.push({ seg, trackIdx: trackEnds.length - 1 });
                }
            }

            const numTracks = trackEnds.length;
            if (numTracks <= 1) continue;

            const center = buddyTrackCount > 0
                ? (buddyTrackCount - 1) / 2
                : (numTracks - 1) / 2;

            for (const { seg, trackIdx } of assignments) {
                if (seg.isBuddy) continue;
                const offset = (trackIdx - center) * spacing;
                if (Math.abs(offset) > 0.5) {
                    shifts.set(`${seg.edgeId}:${seg.segIdx}`, offset);
                }
            }
        }

        return shifts;
    };

    const hShifts = assignTracks(segments.filter(s => s.isHoriz));
    const vShifts = assignTracks(segments.filter(s => !s.isHoriz));

    // 合并所有偏移（非 buddy 的吸附/推开 + buddy 的反方向推开）
    const mergeIntoShifts = (shifts: Map<string, number>, key: string, offset: number, seg: Segment) => {
        if (seg.isHoriz) {
            hShifts.set(key, offset);
        } else {
            vShifts.set(key, offset);
        }
    };

    for (const [key, offset] of snapShifts) {
        const [edgeId, segIdxStr] = key.split(':');
        const seg = segments.find(s => s.edgeId === edgeId && s.segIdx === parseInt(segIdxStr, 10));
        if (seg) mergeIntoShifts(hShifts, key, offset, seg);
    }
    for (const [key, offset] of counterShifts) {
        if (snapShifts.has(key)) continue;
        const [edgeId, segIdxStr] = key.split(':');
        const seg = segments.find(s => s.edgeId === edgeId && s.segIdx === parseInt(segIdxStr, 10));
        if (seg) mergeIntoShifts(hShifts, key, offset, seg);
    }
    for (const [key, offset] of buddyCounterShifts) {
        const [edgeId, segIdxStr] = key.split(':');
        const seg = segments.find(s => s.edgeId === edgeId && s.segIdx === parseInt(segIdxStr, 10));
        if (seg) mergeIntoShifts(hShifts, key, offset, seg);
    }

    if (hShifts.size === 0 && vShifts.size === 0) {
        return edgePaths;
    }

    // 3. 重建路径
    // [关键变化] buddy 边如果有 buddyCounterShift 也需要偏移中间点
    const buddyEdgesWithShifts = new Set<string>();
    for (const key of buddyCounterShifts.keys()) {
        const edgeId = key.split(':')[0];
        buddyEdgesWithShifts.add(edgeId);
    }

    const result = new Map<string, Point[]>();

    for (const [edgeId, pts] of edgePaths) {
        // Buddy 边：只有当它需要反方向推开时才修改路径
        if (buddyEdgeIds.has(edgeId) && !buddyEdgesWithShifts.has(edgeId)) {
            result.set(edgeId, pts);
            continue;
        }

        if (pts.length < 2) {
            result.set(edgeId, pts);
            continue;
        }

        const newPts = pts.map(p => ({ x: p.x, y: p.y }));

        for (let j = 1; j < pts.length - 1; j++) {
            const prevKey = `${edgeId}:${j - 1}`;
            const nextKey = `${edgeId}:${j}`;

            const hPrev = hShifts.get(prevKey) || 0;
            const hNext = hShifts.get(nextKey) || 0;
            newPts[j].y += Math.abs(hPrev) >= Math.abs(hNext) ? hPrev : hNext;

            const vPrev = vShifts.get(prevKey) || 0;
            const vNext = vShifts.get(nextKey) || 0;
            newPts[j].x += Math.abs(vPrev) >= Math.abs(vNext) ? vPrev : vNext;
        }

        result.set(edgeId, newPts);
    }

    return result;
}
