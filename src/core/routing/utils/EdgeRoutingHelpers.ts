/**
 * Edge Routing Helpers
 * 
 * 包含从 HandlePicker 迁移过来的实用工具函数，用于边路由的后处理和优化。
 */
import { expandHandle } from './handleUtils';
import type { RoutingConfig } from '../types/routing';

export interface RoutingNodeLike {
    id: string;
    width?: number;
    height?: number;
    measured?: { width?: number; height?: number };
    position?: { x: number; y: number };
    positionAbsolute?: { x: number; y: number };
}

export type CompatibleRoutingConfig = Partial<RoutingConfig> & {
    smoothFallback?: 'bezier' | 'straight' | 'step' | 'native';
};

interface RoutingEdgeLike {
    source: string;
    target: string;
    data?: Record<string, unknown>;
}

const finiteNumber = (value: unknown, fallback = 0): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export interface EdgeRoutingDecision {
    (
        sourceNode: RoutingNodeLike,
        targetNode: RoutingNodeLike,
        allNodes: RoutingNodeLike[],
        config: CompatibleRoutingConfig,
    ): {
        sourceHandle: string;
        targetHandle: string;
        type: string;
    };
}

let edgeRoutingDecision: EdgeRoutingDecision | null = null;

/**
 * Registers the legacy routing decision adapter without coupling this utility
 * module back to the compatibility facade that re-exports it.
 */
export function configureEdgeRoutingDecision(decision: EdgeRoutingDecision): void {
    edgeRoutingDecision = decision;
}

const getEdgeRoutingDecision = (): EdgeRoutingDecision => {
    if (!edgeRoutingDecision) {
        throw new Error('Edge routing decision adapter has not been configured.');
    }
    return edgeRoutingDecision;
};

// Types
interface EdgeRoutingCacheEntry {
    sourceHandle: string;
    targetHandle: string;
    type: string;
    sourceNodeId: string;
    targetNodeId: string;
    timestamp: number;
}

interface NodeSnapshot {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export class EdgeRoutingCache {
    private cache = new Map<string, EdgeRoutingCacheEntry>();
    private nodeSnapshots = new Map<string, NodeSnapshot>();
    private edgesByNode = new Map<string, Set<string>>();

    clear(): void {
        this.cache.clear();
        this.nodeSnapshots.clear();
        this.edgesByNode.clear();
    }

    updateNodeSnapshots(nodes: RoutingNodeLike[]): Set<string> {
        const changedNodeIds = new Set<string>();
        for (const node of nodes) {
            const pos = node.positionAbsolute ?? node.position ?? { x: 0, y: 0 };
            const w = node?.measured?.width ?? 100;
            const h = node?.measured?.height ?? 50;

            const newSnapshot: NodeSnapshot = {
                id: node.id,
                x: finiteNumber(pos.x),
                y: finiteNumber(pos.y),
                width: finiteNumber(w, 100),
                height: finiteNumber(h, 50)
            };

            const oldSnapshot = this.nodeSnapshots.get(node.id);

            if (!oldSnapshot ||
                Math.abs(oldSnapshot.x - newSnapshot.x) > 0.5 ||
                Math.abs(oldSnapshot.y - newSnapshot.y) > 0.5 ||
                Math.abs(oldSnapshot.width - newSnapshot.width) > 0.5 ||
                Math.abs(oldSnapshot.height - newSnapshot.height) > 0.5) {
                changedNodeIds.add(node.id);
            }

            this.nodeSnapshots.set(node.id, newSnapshot);
        }
        return changedNodeIds;
    }

    registerEdgeNodeRelation(edgeId: string, sourceId: string, targetId: string): void {
        if (!this.edgesByNode.has(sourceId)) {
            this.edgesByNode.set(sourceId, new Set());
        }
        this.edgesByNode.get(sourceId)?.add(edgeId);

        if (!this.edgesByNode.has(targetId)) {
            this.edgesByNode.set(targetId, new Set());
        }
        this.edgesByNode.get(targetId)?.add(edgeId);
    }

    getAffectedEdgeIds(changedNodeIds: Set<string>): Set<string> {
        const affectedEdgeIds = new Set<string>();
        for (const nodeId of changedNodeIds) {
            const edgeIds = this.edgesByNode.get(nodeId);
            if (edgeIds) {
                for (const edgeId of edgeIds) {
                    affectedEdgeIds.add(edgeId);
                }
            }
        }
        return affectedEdgeIds;
    }

    setCache(edgeId: string, entry: Omit<EdgeRoutingCacheEntry, 'edgeId' | 'timestamp'>): void {
        this.cache.set(edgeId, {
            ...entry,
            sourceNodeId: entry.sourceNodeId,
            targetNodeId: entry.targetNodeId,
            timestamp: Date.now()
        });
        this.registerEdgeNodeRelation(edgeId, entry.sourceNodeId, entry.targetNodeId);
    }

    getCache(edgeId: string): EdgeRoutingCacheEntry | undefined {
        return this.cache.get(edgeId);
    }

    hasValidCache(edgeId: string, affectedEdgeIds: Set<string>): boolean {
        if (affectedEdgeIds.has(edgeId)) return false;
        return this.cache.has(edgeId);
    }

    getStats(): { cachedEdges: number; trackedNodes: number } {
        return {
            cachedEdges: this.cache.size,
            trackedNodes: this.nodeSnapshots.size
        };
    }
}

export const edgeRoutingCache = new EdgeRoutingCache();

/**
 * 增量边路由
 */
export function incrementalEdgeRouting<T extends {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    type?: string;
    data?: Record<string, unknown>
}>(
    edges: T[],
    nodes: RoutingNodeLike[],
    cfg: CompatibleRoutingConfig,
    forceFullRecalc: boolean = false
): T[] {
    if (edges.length === 0) return edges;

    const changedNodeIds = forceFullRecalc
        ? new Set(nodes.map(n => n.id))
        : edgeRoutingCache.updateNodeSnapshots(nodes);

    const affectedEdgeIds = edgeRoutingCache.getAffectedEdgeIds(changedNodeIds);
    const idMap = new Map(nodes.map(n => [n.id, n]));

    return edges.map(edge => {
        if (!forceFullRecalc && edgeRoutingCache.hasValidCache(edge.id, affectedEdgeIds)) {
            const cached = edgeRoutingCache.getCache(edge.id);
            if (cached) {
                return {
                    ...edge,
                    sourceHandle: cached.sourceHandle ? expandHandle(String(cached.sourceHandle)) : cached.sourceHandle,
                    targetHandle: cached.targetHandle ? expandHandle(String(cached.targetHandle)) : cached.targetHandle,
                    type: cached.type,
                    data: {
                        ...(edge.data || {}),
                        fromCache: true
                    }
                };
            }
        }

        const srcNode = idMap.get(edge.source);
        const tgtNode = idMap.get(edge.target);
        if (!srcNode || !tgtNode) return edge;

        const routingResult = getEdgeRoutingDecision()(srcNode, tgtNode, nodes, cfg);

        edgeRoutingCache.setCache(edge.id, {
            sourceHandle: routingResult.sourceHandle,
            targetHandle: routingResult.targetHandle,
            type: routingResult.type as string,
            sourceNodeId: edge.source,
            targetNodeId: edge.target
        });

        return {
            ...edge,
            sourceHandle: routingResult.sourceHandle ? expandHandle(String(routingResult.sourceHandle)) : routingResult.sourceHandle,
            targetHandle: routingResult.targetHandle ? expandHandle(String(routingResult.targetHandle)) : routingResult.targetHandle,
            type: routingResult.type as string,
            data: {
                ...(edge.data || {}),
                fromCache: false
            }
        };
    });
}

export function clearEdgeRoutingCache(): void {
    edgeRoutingCache.clear();
}

export function getEdgeRoutingCacheStats() {
    return edgeRoutingCache.getStats();
}

/**
 * 并行边分离
 */
export function separateParallelEdges<T extends RoutingEdgeLike>(
    edges: T[],
    spacing: number = 12,
    ..._args: unknown[]
): T[] {
    const groups = new Map<string, T[]>();

    for (const edge of edges) {
        const a = edge.source < edge.target ? edge.source : edge.target;
        const b = edge.source < edge.target ? edge.target : edge.source;
        const key = `${a}::${b}`;

        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)?.push(edge);
    }

    const result: T[] = [];

    for (const [_key, group] of groups) {
        const n = group.length;

        if (n === 1) {
            result.push({
                ...group[0],
                data: {
                    ...(group[0].data || {}),
                    parallelOffset: 0,
                    parallelIndex: 0,
                    parallelTotal: 1
                }
            });
        } else {
            const maxOffset = 30;
            const actualSpacing = Math.min(spacing, (maxOffset * 2) / Math.max(n - 1, 1));

            for (let i = 0; i < n; i++) {
                const rawOffset = (i - (n - 1) / 2) * actualSpacing;
                const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, rawOffset));
                result.push({
                    ...group[i],
                    data: {
                        ...(group[i].data || {}),
                        parallelOffset: Math.round(clampedOffset),
                        parallelIndex: i,
                        parallelTotal: n
                    }
                });
            }
        }
    }

    return result;
}

// ===============================================
// Legacy Compat Helpers
// ===============================================

/**
 * 兼容旧API：纯几何把手选择
 */
export function pickHandlesByGeometry(
    sNode: Pick<RoutingNodeLike, 'position' | 'positionAbsolute'>,
    tNode: Pick<RoutingNodeLike, 'position' | 'positionAbsolute'>,
) {
    const s = sNode.positionAbsolute || sNode.position || { x: 0, y: 0 };
    const t = tNode.positionAbsolute || tNode.position || { x: 0, y: 0 };
    const dx = t.x - s.x;
    const dy = t.y - s.y;

    if (Math.abs(dx) > Math.abs(dy)) {
        return { source: dx > 0 ? 'r' : 'l', target: dx > 0 ? 'l' : 'r' };
    } else {
        return { source: dy > 0 ? 'b' : 't', target: dy > 0 ? 't' : 'b' };
    }
}

/**
 * 应用并行偏移到边路径点
 */
export function applyParallelOffset(
    points: Array<{ x: number; y: number }>,
    offset: number,
    direction: 'horizontal' | 'vertical' = 'horizontal'
): Array<{ x: number; y: number }> {
    if (!offset || !points.length) return points;

    return points.map(p => ({
        x: direction === 'vertical' ? p.x + offset : p.x,
        y: direction === 'horizontal' ? p.y + offset : p.y
    }));
}

/**
 * 分布端口连接（Hub Edge Ordering / Port Spreading）
 * 行业最佳实践：对于 Hub 节点（1-to-N），应根据连接对象的几何位置对连线进行排序。
 * 例如：如果 Source 的下方连接了 A, B, C，且 A 在左，B 在中，C 在右。
 * 则连线 Source->A 应分配在端口的最左侧，Source->C 在最右侧。
 * 这能显著减少出端口时的交叉。
 */
export function distributePortConnections<T extends RoutingEdgeLike>(
    edges: T[],
    nodes: RoutingNodeLike[],
    ..._args: unknown[]
): T[] {
    if (!edges || !nodes) return edges;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // 1. Group edges by Source and Target
    const sourceGroups = new Map<string, T[]>();
    const targetGroups = new Map<string, T[]>();

    for (const edge of edges) {
        if (!sourceGroups.has(edge.source)) sourceGroups.set(edge.source, []);
        sourceGroups.get(edge.source)!.push(edge);

        if (!targetGroups.has(edge.target)) targetGroups.set(edge.target, []);
        targetGroups.get(edge.target)!.push(edge);
    }

    // 2. Sort Edges at Source (Hub -> N)
    for (const [sourceId, group] of sourceGroups) {
        if (group.length <= 1) continue;
        const srcNode = nodeMap.get(sourceId);
        if (!srcNode) continue;

        // 获取 Source 的中心
        const sx = (srcNode.position?.x ?? 0) + (srcNode.width ?? 0) / 2;
        const sy = (srcNode.position?.y ?? 0) + (srcNode.height ?? 0) / 2;

        // 对这一组边进行排序
        // 排序依据：Target 节点的相对角度或坐标
        // 简单策略：根据 Target 节点的重心坐标投影进行排序
        // 如果主要是上下连接，按 Target X 排序；如果主要是左右连接，按 Target Y 排序。

        // 自动检测 "主轴"
        let sumDx = 0, sumDy = 0;
        for (const e of group) {
            const t = nodeMap.get(e.target);
            if (t) {
                sumDx += Math.abs((t.position?.x ?? 0) - sx);
                sumDy += Math.abs((t.position?.y ?? 0) - sy);
            }
        }

        const isVerticalDominant = sumDy > sumDx;

        group.sort((a, b) => {
            const tA = nodeMap.get(a.target);
            const tB = nodeMap.get(b.target);
            if (!tA || !tB) return 0;

            if (isVerticalDominant) {
                // 垂直主导，按 X 排序 (从左到右)
                return (tA.position?.x ?? 0) - (tB.position?.x ?? 0);
            } else {
                // 水平主导，按 Y 排序 (从上到下)
                return (tA.position?.y ?? 0) - (tB.position?.y ?? 0);
            }
        });

        // 3. 将排序信息写入 Edge Data (供后续 Routing 消费)
        group.forEach((edge, index) => {
            Object.assign(edge, {
                data: {
                    ...(edge.data ?? {}),
                    _orderIndexSource: index,
                    _orderTotalSource: group.length,
                },
            });
            // 可选：写入 explicit port offset 提示
            // edge.data.portOffsetSource = ...
        });
    }

    // 4. Sort Edges at Target (N -> Hub)
    for (const [targetId, group] of targetGroups) {
        if (group.length <= 1) continue;
        const tgtNode = nodeMap.get(targetId);
        if (!tgtNode) continue;

        const tx = (tgtNode.position?.x ?? 0) + (tgtNode.width ?? 0) / 2;
        const ty = (tgtNode.position?.y ?? 0) + (tgtNode.height ?? 0) / 2;

        let sumDx = 0, sumDy = 0;
        for (const e of group) {
            const s = nodeMap.get(e.source);
            if (s) {
                sumDx += Math.abs((s.position?.x ?? 0) - tx);
                sumDy += Math.abs((s.position?.y ?? 0) - ty);
            }
        }
        const isVerticalDominant = sumDy > sumDx;

        group.sort((a, b) => {
            const sA = nodeMap.get(a.source);
            const sB = nodeMap.get(b.source);
            if (!sA || !sB) return 0;

            if (isVerticalDominant) {
                return (sA.position?.x ?? 0) - (sB.position?.x ?? 0);
            } else {
                return (sA.position?.y ?? 0) - (sB.position?.y ?? 0);
            }
        });

        group.forEach((edge, index) => {
            Object.assign(edge, {
                data: {
                    ...(edge.data ?? {}),
                    _orderIndexTarget: index,
                    _orderTotalTarget: group.length,
                },
            });
        });
    }

    // 返回打好标签的边（引用修改，其实不返回也没事，但为了链式调用）
    return edges;
}
