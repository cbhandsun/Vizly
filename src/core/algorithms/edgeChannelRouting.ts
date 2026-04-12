/**
 * Edge Channel Routing - 边通道路由和分离
 * 
 * 提供多边并行计算时的冲突处理和路径分离功能：
 * - Channel Routing: 预定义通道，边按顺序分配
 * - Edge Bundling: 相似路径的边共享主干
 * - Parallel Separation: 自动分离平行边
 */

import { Position } from '@xyflow/react';
import { Point, LineObstacle, Rectangle, isPathBlocked } from './pathfinding';
import { SpatialIndex } from './SpatialIndex';

export interface EdgeChannelConfig {
    /** 通道间距（像素） */
    channelSpacing: number;
    /** 边间最小距离 */
    minEdgeSeparation: number;
    /** 是否启用通道路由 */
    enableChannelRouting: boolean;
    /** 是否启用边绑定 */
    enableEdgeBundling: boolean;
    /** 绑定强度（0-1） */
    bundleStrength: number;
}

export const DEFAULT_CHANNEL_CONFIG: EdgeChannelConfig = {
    channelSpacing: 15,
    minEdgeSeparation: 10,
    enableChannelRouting: true,
    enableEdgeBundling: true,
    bundleStrength: 0.6,
};

/** 通道定义 */
interface Channel {
    id: string;
    type: 'horizontal' | 'vertical';
    position: number;  // X for vertical, Y for horizontal
    occupiedRanges: Array<{ start: number; end: number; edgeId: string }>;
}

/** 通道管理器 */
export class ChannelManager {
    private horizontalChannels: Map<number, Channel> = new Map();
    private verticalChannels: Map<number, Channel> = new Map();
    private config: EdgeChannelConfig;

    constructor(config: Partial<EdgeChannelConfig> = {}) {
        this.config = { ...DEFAULT_CHANNEL_CONFIG, ...config };
    }

    /**
     * 为边段分配通道
     */
    assignChannel(
        start: Point,
        end: Point,
        edgeId: string,
        preferredPosition?: number
    ): number {
        const isHorizontal = Math.abs(start.y - end.y) < 1;
        const channels = isHorizontal ? this.horizontalChannels : this.verticalChannels;

        const segmentMin = isHorizontal ? Math.min(start.x, end.x) : Math.min(start.y, end.y);
        const segmentMax = isHorizontal ? Math.max(start.x, end.x) : Math.max(start.y, end.y);
        const basePosition = isHorizontal ? start.y : start.x;

        // 查找可用通道
        let bestChannel: Channel | null = null;
        let bestOffset = Infinity;

        // 搜索附近的通道
        for (let offset = 0; offset <= 100; offset += this.config.channelSpacing) {
            for (const sign of [1, -1]) {
                const position = basePosition + offset * sign;
                const posKey = Math.round(position / this.config.channelSpacing);

                let channel = channels.get(posKey);
                if (!channel) {
                    // 创建新通道
                    channel = {
                        id: `${isHorizontal ? 'h' : 'v'}_${posKey}`,
                        type: isHorizontal ? 'horizontal' : 'vertical',
                        position,
                        occupiedRanges: []
                    };
                    channels.set(posKey, channel);
                }

                // 检查是否有冲突
                const hasConflict = channel.occupiedRanges.some(range =>
                    !(segmentMax < range.start - this.config.minEdgeSeparation ||
                        segmentMin > range.end + this.config.minEdgeSeparation)
                );

                if (!hasConflict) {
                    if (Math.abs(offset) < bestOffset) {
                        bestChannel = channel;
                        bestOffset = Math.abs(offset);
                    }
                    break;
                }
            }
            if (bestChannel && bestOffset <= this.config.channelSpacing) break;
        }

        if (bestChannel) {
            // 标记占用
            bestChannel.occupiedRanges.push({
                start: segmentMin,
                end: segmentMax,
                edgeId
            });
            return bestChannel.position;
        }

        return basePosition;
    }

    /**
     * 清除边的通道占用
     */
    releaseChannels(edgeId: string): void {
        for (const channel of this.horizontalChannels.values()) {
            channel.occupiedRanges = channel.occupiedRanges.filter(r => r.edgeId !== edgeId);
        }
        for (const channel of this.verticalChannels.values()) {
            channel.occupiedRanges = channel.occupiedRanges.filter(r => r.edgeId !== edgeId);
        }
    }

    /**
     * 重置所有通道
     */
    reset(): void {
        this.horizontalChannels.clear();
        this.verticalChannels.clear();
    }
}

/**
 * 从已路由的边提取线段障碍物
 * 改进版本：使用实际路径点而非节点中心近似
 */
export function extractLineObstaclesFromPaths(
    routedEdges: Array<{
        id: string;
        data?: {
            computedPath?: Point[];
            pathPoints?: Point[];
        };
    }>,
    excludeEdgeId?: string
): LineObstacle[] {
    const obstacles: LineObstacle[] = [];

    for (const edge of routedEdges) {
        if (edge.id === excludeEdgeId) continue;

        // 优先使用computedPath，其次是pathPoints
        const pathPoints = edge.data?.computedPath || edge.data?.pathPoints;
        if (!pathPoints || pathPoints.length < 2) continue;

        // 将路径分解为线段障碍物
        for (let i = 0; i < pathPoints.length - 1; i++) {
            const start = pathPoints[i];
            const end = pathPoints[i + 1];

            // 只添加有效长度的线段（避免点重合）
            const length = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
            if (length > 5) {
                obstacles.push({ start, end });
            }
        }
    }

    return obstacles;
}

/**
 * 分离平行边
 * 当多条边共享相同或相近的路径段时，自动分开它们
 */
export function separateParallelPaths(
    paths: Array<{ edgeId: string; points: Point[] }>,
    spacing: number = 10,
    obstacles: Rectangle[] | SpatialIndex = []
): Array<{ edgeId: string; points: Point[] }> {
    if (paths.length <= 1) return paths;

    // 按起点和终点分组
    const groups = new Map<string, typeof paths>();

    for (const path of paths) {
        if (path.points.length < 2) continue;
        const first = path.points[0];
        const last = path.points[path.points.length - 1];
        const key = `${Math.round(first.x / 50)},${Math.round(first.y / 50)}_${Math.round(last.x / 50)},${Math.round(last.y / 50)}`;

        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(path);
    }

    const result: typeof paths = [];

    for (const [_key, group] of groups) {
        if (group.length <= 1) {
            result.push(...group);
            continue;
        }

        // 对组内路径应用偏移
        const midIndex = (group.length - 1) / 2;

        group.forEach((path, index) => {
            const offset = (index - midIndex) * spacing;
            const offsetPath = offsetPathPoints(path.points, offset);

            // [FIX] Obstacle Awareness for Separation
            // Ensure the offset doesn't push the path into an obstacle
            if (Math.abs(offset) > 0.1 && isPathBlocked(offsetPath, obstacles, 5)) {
                // Try half offset
                const halfPath = offsetPathPoints(path.points, offset / 2);
                if (!isPathBlocked(halfPath, obstacles, 5)) {
                    result.push({ edgeId: path.edgeId, points: halfPath });
                } else {
                    // Fallback: Use original path (overlap is better than collision)
                    result.push({ edgeId: path.edgeId, points: path.points });
                }
            } else {
                result.push({ edgeId: path.edgeId, points: offsetPath });
            }
        });
    }

    return result;
}

/**
 * 对路径点应用垂直偏移
 */
function offsetPathPoints(points: Point[], offset: number): Point[] {
    if (points.length < 2 || Math.abs(offset) < 0.1) return points;

    return points.map((point, index) => {
        if (index === 0 || index === points.length - 1) {
            // 保持端点不变
            return { ...point };
        }

        // 计算该点前后线段的方向
        const prev = points[index - 1];
        const next = points[index + 1];

        const dx1 = point.x - prev.x;
        const dy1 = point.y - prev.y;
        const dx2 = next.x - point.x;
        const dy2 = next.y - point.y;

        // 确定主要方向并垂直偏移
        const isHorizontal1 = Math.abs(dx1) > Math.abs(dy1);
        const isHorizontal2 = Math.abs(dx2) > Math.abs(dy2);

        // 角点：两边方向不同
        if (isHorizontal1 !== isHorizontal2) {
            return {
                x: point.x + (isHorizontal1 ? 0 : offset),
                y: point.y + (isHorizontal1 ? offset : 0)
            };
        }

        // 直线段中点
        return {
            x: point.x + (isHorizontal1 ? 0 : offset),
            y: point.y + (isHorizontal1 ? offset : 0)
        };
    });
}

/**
 * 边绑定：将相似路径的边合并成束
 */
/**
 * 边绑定：将相似路径的边合并成束 (Collision Aware & Slotting)
 */
export function bundleEdges(
    paths: Array<{ edgeId: string; points: Point[] }>,
    bundleStrength: number = 0.6,
    obstacles: Rectangle[] | SpatialIndex = []
): Array<{ edgeId: string; points: Point[] }> {
    if (paths.length <= 1 || bundleStrength <= 0) return paths;

    // Helper to check for collisions


    // Group paths
    const groups = new Map<string, typeof paths>();

    for (const path of paths) {
        if (path.points.length < 3) continue;
        const first = path.points[0];
        const last = path.points[path.points.length - 1];
        // Use strict geometric grouping to avoid merging edges from different nodes
        // Use 5px bucket (effectively same port/node)
        const bucketSize = 5;
        const key = `${Math.round(first.x / bucketSize)},${Math.round(first.y / bucketSize)}_${Math.round(last.x / bucketSize)},${Math.round(last.y / bucketSize)}`;

        // if (path.edgeId === 'e7' || path.edgeId === 'e8') {
        //     console.log(`[EdgeBundler] Key for ${path.edgeId}: ${key} (Start: ${first.x},${first.y} End: ${last.x},${last.y})`);
        // }

        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(path);
    }

    const result: typeof paths = [];

    for (const [_key, group] of groups) {
        if (group.length <= 1) {
            result.push(...group);
            continue;
        }

        // Calculate Trunk (Centroid)
        const maxLen = Math.max(...group.map(p => p.points.length));
        const avgPoints: Point[] = [];

        for (let i = 0; i < maxLen; i++) {
            let sumX = 0, sumY = 0, count = 0;
            for (const path of group) {
                const idx = Math.floor(i * (path.points.length - 1) / (maxLen - 1));
                if (path.points[idx]) {
                    sumX += path.points[idx].x;
                    sumY += path.points[idx].y;
                    count++;
                }
            }
            if (count > 0) {
                avgPoints.push({ x: sumX / count, y: sumY / count });
            }
        }

        // Slotting: Assign offset to each edge to prevent total overlap
        const BUNDLE_WIDTH = 12; // Gap between bundled lines
        const midIndex = (group.length - 1) / 2;

        for (let gIdx = 0; gIdx < group.length; gIdx++) {
            const path = group[gIdx];
            const slotOffset = (gIdx - midIndex) * BUNDLE_WIDTH; // Perpendicular offset

            const bundledPoints = path.points.map((point, index) => {
                // Keep endpoints fixed
                if (index === 0 || index === path.points.length - 1) {
                    return { ...point };
                }

                // Interpolate towards trunk
                const avgIdx = Math.floor(index * (avgPoints.length - 1) / (path.points.length - 1));
                const avg = avgPoints[avgIdx] || point;

                // Calculate perpendicular direction for slotting
                // Simple approx: use segment direction or just offset X/Y based on dominance?
                // Better: just add the offset to the target position directly? 
                // Wait, averaging pulls them to a line. We want them to form a "ribbon".

                // Let's modify the target 'avg' point by the slotOffset.
                // We need the normal vector of the trunk at this point.
                let nx = 0, ny = 0;
                if (avgPoints.length > 1) {
                    const prevTrunk = avgPoints[Math.max(0, avgIdx - 1)];
                    const nextTrunk = avgPoints[Math.min(avgPoints.length - 1, avgIdx + 1)];
                    const dx = nextTrunk.x - prevTrunk.x;
                    const dy = nextTrunk.y - prevTrunk.y;
                    const len = Math.sqrt(dx * dx + dy * dy) || 1;
                    nx = -dy / len;
                    ny = dx / len;
                }

                // Apply bunching strength
                const baselineX = point.x + (avg.x - point.x) * bundleStrength;
                const baselineY = point.y + (avg.y - point.y) * bundleStrength;

                // Apply slotting offset (scaled by bundleStrength to blend in)
                // If strength is 1, they are exactly on trunk+slot.
                const finalX = baselineX + nx * slotOffset * bundleStrength;
                const finalY = baselineY + ny * slotOffset * bundleStrength;

                return { x: finalX, y: finalY };
            });

            // [FIX] Obstacle Check
            // If the bundled path hits an obstacle, revert to original path (or reduce strength)
            // We use a loose check (padding 5) because bundling often grazes nodes.
            // If original path was valid and bundled is invalid, use original.
            // We assume original 'path.points' is valid (it came from A*).

            // Check bundled validity
            if (isPathBlocked(bundledPoints, obstacles, 10)) {
                // Collision detected! Revert to original.
                // Maybe try weaker bundle? For now, just skip bundling for this edge.
                result.push({ edgeId: path.edgeId, points: path.points });
            } else {
                result.push({ edgeId: path.edgeId, points: bundledPoints });
            }
        }
    }

    return result;
}

export default {
    ChannelManager,
    extractLineObstaclesFromPaths,
    separateParallelPaths,
    bundleEdges,
    DEFAULT_CHANNEL_CONFIG
};
