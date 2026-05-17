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
    buddyGroupKey?: string;
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
    const buddyGroupByEdgeId = new Map<string, string>();
    if (buddyGroups) {
        buddyGroups.forEach((group, index) => {
            const groupKey = `${group.type}:${index}`;
            for (const edgeId of group.edgeIds) {
                buddyEdgeIds.add(edgeId);
                buddyGroupByEdgeId.set(edgeId, groupKey);
            }
        });
    }

    // 1. 提取所有正交线段
    const GROUP_TOLERANCE = 6;  // 同通道聚类容差（px）
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
                    buddyGroupKey: buddyGroupByEdgeId.get(edgeId),
                    fixedVal: Math.round((p1.y + p2.y) / 2),
                    minVal: Math.min(p1.x, p2.x),
                    maxVal: Math.max(p1.x, p2.x),
                });
            } else if (isVert) {
                segments.push({
                    edgeId, segIdx: j, isHoriz: false, isBuddy,
                    buddyGroupKey: buddyGroupByEdgeId.get(edgeId),
                    fixedVal: Math.round((p1.x + p2.x) / 2),
                    minVal: Math.min(p1.y, p2.y),
                    maxVal: Math.max(p1.y, p2.y),
                });
            }
        }
    }

    // 2. 按 fixedVal 聚类 → Interval Coloring
    const assignTracks = (segs: Segment[]): Map<string, number> => {
        // 聚类
        const groups = new Map<number, Segment[]>();
        for (const s of segs) {
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

                // Same buddy group + same axis + overlapping interval represents one
                // shared trunk. Keep it on the same fixed track instead of counting
                // every contributing edge as a separate occupied lane.
                const sharedTrack = assignments.find(a => {
                    const other = a.seg;
                    if (!other.isBuddy) return false;
                    if (!seg.buddyGroupKey || other.buddyGroupKey !== seg.buddyGroupKey) return false;
                    if (other.isHoriz !== seg.isHoriz) return false;
                    if (Math.abs(other.fixedVal - seg.fixedVal) >= GROUP_TOLERANCE) return false;
                    const overlapLen = Math.min(other.maxVal, seg.maxVal) - Math.max(other.minVal, seg.minVal);
                    return overlapLen > 2;
                });
                if (sharedTrack) {
                    trackEnds[sharedTrack.trackIdx] = Math.max(trackEnds[sharedTrack.trackIdx], seg.maxVal);
                    assignments.push({ seg, trackIdx: sharedTrack.trackIdx });
                    continue;
                }

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
