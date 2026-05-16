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
 * [Edge Bundling] 吸附模式：
 * - 当非 buddy 段与 buddy 段极度接近（SNAP_TOLERANCE 内）且重叠长度充分时，
 *   将非 buddy 段**吸附**到 buddy 轨道上，而非推开。
 * - 视觉效果：多条近距离平行线合并成共享主干，减少视觉密度。
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
    if (buddyGroups) {
        for (const group of buddyGroups) {
            for (const edgeId of group.edgeIds) {
                buddyEdgeIds.add(edgeId);
            }
        }
    }

    // 1. 提取所有正交线段
    const GROUP_TOLERANCE = 6;  // 同通道聚类容差（px）
    const SNAP_TOLERANCE = 16;  // 吸附容差：非 buddy 段与 buddy 段距离 < 此值时吸附合并
    const SNAP_OVERLAP_RATIO = 0.3; // 吸附要求：重叠长度占短段比例 > 30%
    const segments: Segment[] = [];

    for (const [edgeId, pts] of edgePaths) {
        if (pts.length < 2) continue;
        const isBuddy = buddyEdgeIds.has(edgeId);

        for (let j = 0; j < pts.length - 1; j++) {
            const p1 = pts[j];
            const p2 = pts[j + 1];
            const isHoriz = Math.abs(p1.y - p2.y) < 1.5;
            const isVert = Math.abs(p1.x - p2.x) < 1.5;
            const len = isHoriz ? Math.abs(p1.x - p2.x) : Math.abs(p1.y - p2.y);
            if (len < 8) continue; // 太短的段跳过

            if (isHoriz) {
                segments.push({
                    edgeId, segIdx: j, isHoriz: true, isBuddy,
                    fixedVal: Math.round((p1.y + p2.y) / 2),
                    minVal: Math.min(p1.x, p2.x),
                    maxVal: Math.max(p1.x, p2.x),
                });
            } else if (isVert) {
                segments.push({
                    edgeId, segIdx: j, isHoriz: false, isBuddy,
                    fixedVal: Math.round((p1.x + p2.x) / 2),
                    minVal: Math.min(p1.y, p2.y),
                    maxVal: Math.max(p1.y, p2.y),
                });
            }
        }
    }

    // [Edge Bundling] Phase 0: 吸附检测
    // 找出与 buddy 段极度接近且有足够重叠的非 buddy 段，将它们标记为"吸附目标"
    // snapShifts: 记录需要吸附的段及其偏移量（偏移到 buddy 的 fixedVal）
    const snapShifts = new Map<string, number>();
    
    const buddySegs = segments.filter(s => s.isBuddy);
    const nonBuddySegs = segments.filter(s => !s.isBuddy);
    
    for (const nb of nonBuddySegs) {
        for (const bs of buddySegs) {
            if (nb.isHoriz !== bs.isHoriz) continue; // 方向不同跳过
            
            const dist = Math.abs(nb.fixedVal - bs.fixedVal);
            if (dist < 0.5 || dist > SNAP_TOLERANCE) continue; // 完全重合或太远都跳过
            
            // 计算重叠长度
            const overlapLen = Math.min(nb.maxVal, bs.maxVal) - Math.max(nb.minVal, bs.minVal);
            const shortLen = Math.min(nb.maxVal - nb.minVal, bs.maxVal - bs.minVal);
            
            if (overlapLen > 0 && shortLen > 0 && overlapLen / shortLen > SNAP_OVERLAP_RATIO) {
                // 吸附！将非 buddy 段偏移到 buddy 段的 fixedVal
                const snapOffset = bs.fixedVal - nb.fixedVal;
                const key = `${nb.edgeId}:${nb.segIdx}`;
                
                // 如果已有吸附记录，选距离最近的
                const existing = snapShifts.get(key);
                if (existing === undefined || Math.abs(snapOffset) < Math.abs(existing)) {
                    snapShifts.set(key, snapOffset);
                }
            }
        }
    }

    // 2. 按 fixedVal 聚类 → Interval Coloring（只处理需要分离的段，不处理已吸附的段）
    const assignTracks = (segs: Segment[]): Map<string, number> => {
        // 聚类
        const groups = new Map<number, Segment[]>();
        for (const s of segs) {
            // 跳过已被吸附的段（它们不需要分离，而是要对齐）
            const snapKey = `${s.edgeId}:${s.segIdx}`;
            if (snapShifts.has(snapKey)) continue;
            
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

            // 检查是否有跨边的实际重叠
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

            // Interval Coloring: buddy 段优先占用 track 0
            const trackEnds: number[] = [];
            const assignments: { seg: Segment; trackIdx: number }[] = [];

            // Phase 1: 放置所有 buddy 段（它们是固定的）
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

            // 记住 buddy 段占用的轨道数
            const buddyTrackCount = trackEnds.length;

            // Phase 2: 放置非 buddy 段，避开 buddy 占用的轨道
            for (const seg of group) {
                if (seg.isBuddy) continue;
                let placed = false;
                
                // 优先找 buddy 轨道外的空闲轨道
                for (let t = buddyTrackCount; t < trackEnds.length; t++) {
                    if (seg.minVal > trackEnds[t] + 2) {
                        trackEnds[t] = seg.maxVal;
                        assignments.push({ seg, trackIdx: t });
                        placed = true;
                        break;
                    }
                }
                // 尝试 buddy 轨道中没冲突的
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
                // 开新轨道
                if (!placed) {
                    trackEnds.push(seg.maxVal);
                    assignments.push({ seg, trackIdx: trackEnds.length - 1 });
                }
            }

            const numTracks = trackEnds.length;
            if (numTracks <= 1) continue;

            // 计算偏移：以 buddy 轨道为中心参考
            // 如果没有 buddy 轨道，以全部轨道的中点为中心
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

    // 将吸附偏移量按方向分入对应的 shift map
    for (const [key, offset] of snapShifts) {
        // 找到该段是水平还是垂直
        const [edgeId, segIdxStr] = key.split(':');
        const segIdx = parseInt(segIdxStr, 10);
        const seg = segments.find(s => s.edgeId === edgeId && s.segIdx === segIdx);
        if (!seg) continue;
        
        if (seg.isHoriz) {
            hShifts.set(key, offset);
        } else {
            vShifts.set(key, offset);
        }
    }

    if (hShifts.size === 0 && vShifts.size === 0) {
        return edgePaths;
    }

    // 3. 重建路径
    const result = new Map<string, Point[]>();

    for (const [edgeId, pts] of edgePaths) {
        if (buddyEdgeIds.has(edgeId)) {
            result.set(edgeId, pts);
            continue;
        }

        if (pts.length < 2) {
            result.set(edgeId, pts);
            continue;
        }

        const newPts = pts.map(p => ({ x: p.x, y: p.y }));

        // 对每个中间点，根据其前后段的偏移移动
        // 规则：取前段和后段中绝对值较大的偏移（不累加，避免过度偏移导致新交叉）
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
