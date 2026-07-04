/**
 * LP-based Nudge 优化器
 * 
 * 使用线性规划方法求解全局最优边间距分配，替代传统的搜索式nudge算法。
 * 
 * 问题建模：
 * - 变量：每条边段的偏移量 offset[i]
 * - 目标：最小化总偏移量 Σ|offset[i]|
 * - 约束：边段间距 >= minSpacing
 * 
 * 简化实现：
 * 使用贪心式启发算法而非完整LP求解器，在性能和质量间取得平衡。
 * 
 * @module LPNudge
 */

import type { Point } from '../types/routing';
import { safeLog } from '../utils/consoleCleanup';
import { logLPNudgeOptimizeFailure } from '../utils/routingLogging';

/**
 * 边段表示
 */
export interface EdgeSegment {
    id: string;
    points: Point[];
    direction: 'horizontal' | 'vertical';
    /** 主坐标（水平段的y坐标或垂直段的x坐标） */
    coordinate: number;
    /** 起始位置 */
    start: number;
    /** 结束位置 */
    end: number;
    /** 优先级（用于决定谁应该先调整） */
    priority?: number;
    /** [NEW] 是否锁定不可平移（首尾直连端口的线段需锁定以保证绝对正交对齐） */
    locked?: boolean;
}

/**
 * Nudge配置
 */
export interface LPNudgeConfig {
    /** 最小间距（默认12） */
    minSpacing?: number;
    /** 最大偏移量（默认50） */
    maxOffset?: number;
    /** 是否启用调试日志 */
    debug?: boolean;
}

const DEFAULT_CONFIG: Required<LPNudgeConfig> = {
    minSpacing: 12,
    maxOffset: 50,
    debug: false
};

/**
 * Nudge结果
 */
export interface NudgeResult {
    /** 调整后的边段 */
    segments: EdgeSegment[];
    /** 总偏移量 */
    totalOffset: number;
    /** 冲突解决次数 */
    conflictsResolved: number;
}

/**
 * 边段组（相同方向、重叠的边段）
 */
interface SegmentGroup {
    direction: 'horizontal' | 'vertical';
    segments: EdgeSegment[];
}

/**
 * LP-based Nudge优化器
 */
export class LPNudge {
    private config: Required<LPNudgeConfig>;

    constructor(config: LPNudgeConfig = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * 优化边段间距
     * 
     * @param segments 边段列表
     * @returns Nudge结果
     */
    optimize(segments: EdgeSegment[]): NudgeResult {
        this.log(`开始优化，共${segments.length}条边段`);

        // Step 1: 按方向分组
        const groups = this.groupSegments(segments);
        this.log(`分组完成，共${groups.length}组`);

        let totalOffset = 0;
        let conflictsResolved = 0;
        const adjustedSegments: EdgeSegment[] = [];

        // Step 2: 对每组应用LP优化
        for (const group of groups) {
            const result = this.optimizeGroup(group);
            adjustedSegments.push(...result.segments);
            totalOffset += result.totalOffset;
            conflictsResolved += result.conflicts;
        }

        this.log(`优化完成，总偏移: ${totalOffset.toFixed(2)}, 解决冲突: ${conflictsResolved}`);

        return {
            segments: adjustedSegments,
            totalOffset,
            conflictsResolved
        };
    }

    /**
     * 按方向和重叠分组
     */
    private groupSegments(segments: EdgeSegment[]): SegmentGroup[] {
        const groups: SegmentGroup[] = [];

        // 按方向分组
        const horizontal = segments.filter(s => s.direction === 'horizontal');
        const vertical = segments.filter(s => s.direction === 'vertical');

        // 进一步按重叠分组
        if (horizontal.length > 0) {
            groups.push(...this.groupByOverlap(horizontal, 'horizontal'));
        }
        if (vertical.length > 0) {
            groups.push(...this.groupByOverlap(vertical, 'vertical'));
        }

        return groups;
    }

    /**
     * 按空间重叠分组（Union-Find 算法）
     * 
     * 只有满足以下两个条件的线段才会被分到同一组：
     * 1. 固定轴坐标差 < COORD_TOLERANCE（即"几乎在同一条线上"）
     * 2. 可变轴范围有交集（即"在空间上实际重叠"）
     * 
     * 类比：两条公路只有"平行且有一段路程并排"时才需要分道行驶
     */
    private groupByOverlap(
        segments: EdgeSegment[],
        direction: 'horizontal' | 'vertical'
    ): SegmentGroup[] {
        if (segments.length < 2) return [];

        const COORD_TOLERANCE = 5; // px: 固定轴坐标容差

        // 1. 按固定轴坐标排序，使后续 O(n²) 扫描可以提前终止
        const sorted = segments.slice().sort((a, b) => a.coordinate - b.coordinate);

        // 2. Union-Find 数据结构
        const parent = sorted.map((_, i) => i);
        const find = (i: number): number => {
            while (parent[i] !== i) {
                parent[i] = parent[parent[i]]; // 路径压缩
                i = parent[i];
            }
            return i;
        };
        const union = (a: number, b: number) => {
            const ra = find(a), rb = find(b);
            if (ra !== rb) parent[ra] = rb;
        };

        // 3. 扫描配对：坐标接近 + 范围交叠 → 合并
        for (let i = 0; i < sorted.length; i++) {
            for (let j = i + 1; j < sorted.length; j++) {
                // 固定轴坐标差超过容差 → 后续更不可能匹配，break
                if (sorted[j].coordinate - sorted[i].coordinate > COORD_TOLERANCE) break;

                // 检查可变轴范围是否有交集
                if (sorted[i].end >= sorted[j].start && sorted[j].end >= sorted[i].start) {
                    union(i, j);
                }
            }
        }

        // 4. 按根节点聚合分组
        const groupMap = new Map<number, EdgeSegment[]>();
        sorted.forEach((seg, i) => {
            const root = find(i);
            if (!groupMap.has(root)) groupMap.set(root, []);
            groupMap.get(root)!.push(seg);
        });

        // 5. 只返回有 2+ 成员的组（单线段无需 nudge）
        return [...groupMap.values()]
            .filter(g => g.length > 1)
            .map(g => ({ direction, segments: g }));
    }

    /**
     * 优化单个组
     * 
     * 使用贪心式LP启发算法：
     * 1. 按坐标排序
     * 2. 从上到下（或从左到右）分配位置
     * 3. 每个边段尽量保持原位置，但确保最小间距
     */
    private optimizeGroup(group: SegmentGroup): {
        segments: EdgeSegment[];
        totalOffset: number;
        conflicts: number;
    } {
        const { segments } = group;

        // 按coordinate排序
        const sorted = segments.slice().sort((a, b) => a.coordinate - b.coordinate);

        let totalOffset = 0;
        let conflicts = 0;
        const adjusted: EdgeSegment[] = [];

        // 逐个分配位置
        for (let i = 0; i < sorted.length; i++) {
            const current = sorted[i];
            let newCoordinate = current.coordinate;

            if (current.locked) {
                // 如果锁定了，强制保持原坐标不动
                newCoordinate = current.coordinate;
            } else {
                // 检查与前一个边段的间距
                if (i > 0) {
                    const previous = adjusted[i - 1];
                    const minRequired = previous.coordinate + this.config.minSpacing;

                    if (newCoordinate < minRequired) {
                        // 需要调整
                        newCoordinate = minRequired;
                        conflicts++;
                    }
                }

                // 计算偏移量
                const offset = Math.abs(newCoordinate - current.coordinate);
                totalOffset += offset;

                // 限制最大偏移
                if (offset > this.config.maxOffset) {
                    this.log(`警告: 边段${current.id}偏移量${offset}超过最大值${this.config.maxOffset}`);
                    newCoordinate = current.coordinate + Math.sign(newCoordinate - current.coordinate) * this.config.maxOffset;
                }
            }

            // 创建调整后的边段
            adjusted.push({
                ...current,
                coordinate: newCoordinate,
                points: this.adjustPoints(current, newCoordinate)
            });
        }

        return {
            segments: adjusted,
            totalOffset,
            conflicts
        };
    }

    /**
     * 调整边段点坐标
     */
    private adjustPoints(segment: EdgeSegment, newCoordinate: number): Point[] {
        const diff = newCoordinate - segment.coordinate;

        return segment.points.map(point => {
            if (segment.direction === 'horizontal') {
                return { x: point.x, y: point.y + diff };
            } else {
                return { x: point.x + diff, y: point.y };
            }
        });
    }

    /**
     * 调试日志
     */
    private log(message: string, ...args: unknown[]): void {
        if (this.config.debug) {
            safeLog.debug(`[LPNudge] ${message}`, ...args);
        }
    }


    /**
     * 更新配置
     */
    updateConfig(config: Partial<LPNudgeConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * 获取当前配置
     */
    getConfig(): Readonly<Required<LPNudgeConfig>> {
        return { ...this.config };
    }
}

/**
 * 便捷函数：从路径提取边段
 */
export function extractSegments(
    paths: Point[][],
    edgeIds?: string[]
): EdgeSegment[] {
    const segments: EdgeSegment[] = [];

    paths.forEach((path, pathIndex) => {
        const edgeId = edgeIds?.[pathIndex] || `edge-${pathIndex}`;

        // 遍历路径的每个线段
        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i + 1];

            // 判断方向
            const isHorizontal = Math.abs(p1.y - p2.y) < 1;
            const isVertical = Math.abs(p1.x - p2.x) < 1;
            
            // 是否为首个或最后一个线段（直连端口段，必须锁定不平移以保证对齐）
            const isLocked = (i === 0 || i === path.length - 2);

            if (isHorizontal) {
                segments.push({
                    id: `${edgeId}-seg${i}`,
                    points: [p1, p2],
                    direction: 'horizontal',
                    coordinate: p1.y,
                    start: Math.min(p1.x, p2.x),
                    end: Math.max(p1.x, p2.x),
                    locked: isLocked
                });
            } else if (isVertical) {
                segments.push({
                    id: `${edgeId}-seg${i}`,
                    points: [p1, p2],
                    direction: 'vertical',
                    coordinate: p1.x,
                    start: Math.min(p1.y, p2.y),
                    end: Math.max(p1.y, p2.y),
                    locked: isLocked
                });
            }
        }
    });

    return segments;
}

/**
 * 便捷函数：将优化后的边段转回路径，并保持正交折线拓扑连贯性
 */
export function reconstructPathWithTopology(
    originalPath: Point[],
    segments: EdgeSegment[],
    edgeId: string
): Point[] {
    const edgeSegments = segments.filter(s => s.id.startsWith(edgeId));
    if (edgeSegments.length === 0 || originalPath.length < 2) return originalPath;

    const newPath: Point[] = [];
    
    // 首尾点保持原样（锚点）
    const firstPoint = originalPath[0];
    const lastPoint = originalPath[originalPath.length - 1];

    newPath.push({ ...firstPoint });

    // 遍历原始路径的每个线段，通过交点重建角点
    for (let i = 0; i < originalPath.length - 1; i++) {
        const segId = `${edgeId}-seg${i}`;
        const prevSegId = i > 0 ? `${edgeId}-seg${i-1}` : null;
        
        const currentSeg = edgeSegments.find(s => s.id === segId);
        const prevSeg = prevSegId ? edgeSegments.find(s => s.id === prevSegId) : null;

        if (currentSeg && prevSeg) {
            // 计算两段优化后线段的交点，作为拐角点
            const corner = { x: 0, y: 0 };
            if (currentSeg.direction === 'horizontal' && prevSeg.direction === 'vertical') {
                corner.y = currentSeg.coordinate;
                corner.x = prevSeg.coordinate;
            } else if (currentSeg.direction === 'vertical' && prevSeg.direction === 'horizontal') {
                corner.x = currentSeg.coordinate;
                corner.y = prevSeg.coordinate;
            } else {
                // 退化情况（理论上不会出现同向相邻）
                corner.x = currentSeg.points[0].x;
                corner.y = currentSeg.points[0].y;
            }
            newPath.push(corner);
        } else if (i > 0) {
            // 如果某段线不是水平或垂直的（极其罕见），尽量保留原本的拐点
            newPath.push({ ...originalPath[i] });
        }
    }

    newPath.push({ ...lastPoint });
    
    // 清理可能的极微小冗余重叠节点（同一坐标）
    const cleanPath: Point[] = [newPath[0]];
    for (let i = 1; i < newPath.length; i++) {
        const last = cleanPath[cleanPath.length - 1];
        const curr = newPath[i];
        if (Math.abs(last.x - curr.x) > 0.1 || Math.abs(last.y - curr.y) > 0.1) {
            cleanPath.push(curr);
        }
    }

    return cleanPath;
}

/**
 * 便捷函数：优化路径集合
 */
export function optimizePaths(
    paths: Point[][],
    config?: LPNudgeConfig
): Point[][] {
    const edgeIds = paths.map((_, i) => `edge-${i}`);
    const segments = extractSegments(paths, edgeIds);

    const nudge = new LPNudge(config);
    let result;
    try {
        result = nudge.optimize(segments);
    } catch(e) {
        logLPNudgeOptimizeFailure(e);
        return paths;
    }

    return paths.map((originalPath, i) => 
        reconstructPathWithTopology(originalPath, result.segments, edgeIds[i])
    );
}
