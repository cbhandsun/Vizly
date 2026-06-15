/**
 * P4: 增量边路由钩子
 * 
 * 提供 React 集成，用于在节点拖拽时增量更新边路由
 */

import { useCallback, useRef, useMemo } from 'react';
import type { Node, Edge, NodeChange } from '@xyflow/react';
import { applyNodeChanges } from '@xyflow/react';
import {
    incrementalEdgeRouting,
    clearEdgeRoutingCache,
    getEdgeRoutingCacheStats,
    separateParallelEdges,
    distributePortConnections
} from './HandlePicker';

export interface UseIncrementalEdgeRoutingOptions {
    /**
     * 布局方向
     */
    layoutDirection?: 'LR' | 'RL' | 'TB' | 'BT';
    /**
     * 方向策略
     */
    directionalHandlePolicy?: 'prefer' | 'force' | 'off';
    /**
     * 是否启用并行边分离 (P0)
     */
    enableParallelSeparation?: boolean;
    /**
     * 并行边间距
     */
    parallelSpacing?: number;
    /**
     * 是否启用多端口分布 (P3)
     */
    enableMultiPort?: boolean;
    /**
     * 多端口间距
     */
    portSpacing?: number;
    /**
     * 拖拽节流时间（毫秒）
     */
    throttleMs?: number;
    /**
     * 调试模式
     */
    debug?: boolean;
}

export interface UseIncrementalEdgeRoutingResult {
    /**
     * 处理节点变化并增量更新边
     */
    handleNodesChangeWithRouting: (
        changes: NodeChange[],
        currentNodes: Node[],
        currentEdges: Edge[],
        setNodes: (nodes: Node[]) => void,
        setEdges: (edges: Edge[]) => void
    ) => void;
    /**
     * 手动触发完全重新路由
     */
    forceFullReroute: (nodes: Node[], edges: Edge[]) => Edge[];
    /**
     * 清空缓存
     */
    clearCache: () => void;
    /**
     * 获取缓存统计
     */
    getCacheStats: () => { cachedEdges: number; trackedNodes: number };
}

/**
 * P4: 增量边路由 React Hook
 * 
 * 使用方式:
 * ```tsx
 * const { handleNodesChangeWithRouting, clearCache } = useIncrementalEdgeRouting({
 *   layoutDirection: 'LR',
 *   enableParallelSeparation: true
 * });
 * 
 * // 在 onNodesChange 中使用
 * const onNodesChange = useCallback((changes) => {
 *   handleNodesChangeWithRouting(changes, nodes, edges, setNodes, setEdges);
 * }, [nodes, edges]);
 * ```
 */
export function useIncrementalEdgeRouting(
    options: UseIncrementalEdgeRoutingOptions = {}
): UseIncrementalEdgeRoutingResult {
    const {
        layoutDirection = 'LR',
        directionalHandlePolicy = 'force',
        enableParallelSeparation = true,
        parallelSpacing = 12,
        enableMultiPort = true,
        portSpacing = 16,
        throttleMs = 16,  // ~60fps
        debug: _debug = false
    } = options;

    const lastUpdateRef = useRef<number>(0);
    // [FIX C-3] Trailing call 相关引用
    const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const trailingArgsRef = useRef<{
        changes: NodeChange[];
        currentNodes: Node[];
        currentEdges: Edge[];
        setNodes: (nodes: Node[]) => void;
        setEdges: (edges: Edge[]) => void;
    } | null>(null);

    const cfg = useMemo(() => ({
        mode: 'advanced-smart' as const,
        layoutDirection,
        directionalHandlePolicy
    }), [layoutDirection, directionalHandlePolicy]);

    /**
     * 执行实际的增量路由（抽成独立函数以便 trailing call 复用）
     */
    const applyRouting = useCallback((
        newNodes: Node[],
        currentEdges: Edge[],
        setEdges: (edges: Edge[]) => void
    ) => {
        let routedEdges = incrementalEdgeRouting(currentEdges, newNodes, cfg, false);

        if (enableParallelSeparation) {
            routedEdges = separateParallelEdges(routedEdges, parallelSpacing);
        }

        if (enableMultiPort) {
            routedEdges = distributePortConnections(routedEdges, newNodes, portSpacing);
        }

        setEdges(routedEdges);
    }, [cfg, enableParallelSeparation, parallelSpacing, enableMultiPort, portSpacing]);

    /**
     * 处理节点变化并增量更新边
     */
    const handleNodesChangeWithRouting = useCallback((
        changes: NodeChange[],
        currentNodes: Node[],
        currentEdges: Edge[],
        setNodes: (nodes: Node[]) => void,
        setEdges: (edges: Edge[]) => void
    ) => {
        // 节流检查
        const now = Date.now();
        const shouldThrottle = now - lastUpdateRef.current < throttleMs;

        // 检查是否有位置变化
        const hasPositionChange = changes.some(c => c.type === 'position' && (c as any).position);

        // 应用节点变化
        const newNodes = applyNodeChanges(changes, currentNodes);
        setNodes(newNodes);

        if (!hasPositionChange) return;

        if (!shouldThrottle) {
            // 不在节流期，立即计算
            lastUpdateRef.current = now;

            // [FIX C-3] 清除 trailing timer，因为本次直接执行
            if (trailingTimerRef.current) {
                clearTimeout(trailingTimerRef.current);
                trailingTimerRef.current = null;
                trailingArgsRef.current = null;
            }

            applyRouting(newNodes, currentEdges, setEdges);
        } else {
            // [FIX C-3] 在节流期内，保存最新参数并设置 trailing timer
            // 节流结束后执行一次，确保停止位置的路径被计算
            trailingArgsRef.current = { changes, currentNodes: newNodes, currentEdges, setNodes, setEdges };

            if (trailingTimerRef.current) {
                clearTimeout(trailingTimerRef.current);
            }
            const remaining = throttleMs - (now - lastUpdateRef.current);
            trailingTimerRef.current = setTimeout(() => {
                trailingTimerRef.current = null;
                const args = trailingArgsRef.current;
                if (!args) return;
                trailingArgsRef.current = null;
                lastUpdateRef.current = Date.now();
                applyRouting(args.currentNodes, args.currentEdges, args.setEdges);
            }, Math.max(0, remaining));
        }
    }, [applyRouting, throttleMs]);

    /**
     * 强制完全重新路由
     */
    const forceFullReroute = useCallback((nodes: Node[], edges: Edge[]): Edge[] => {
        let routedEdges = incrementalEdgeRouting(edges, nodes, cfg, true);

        if (enableParallelSeparation) {
            routedEdges = separateParallelEdges(routedEdges, parallelSpacing);
        }

        if (enableMultiPort) {
            routedEdges = distributePortConnections(routedEdges, nodes, portSpacing);
        }

        return routedEdges;
    }, [cfg, enableParallelSeparation, parallelSpacing, enableMultiPort, portSpacing]);

    /**
     * 清空缓存
     */
    const clearCache = useCallback(() => {
        clearEdgeRoutingCache();
    }, []);

    /**
     * 获取缓存统计
     */
    const getCacheStats = useCallback(() => {
        return getEdgeRoutingCacheStats();
    }, []);

    return {
        handleNodesChangeWithRouting,
        forceFullReroute,
        clearCache,
        getCacheStats
    };
}

export default useIncrementalEdgeRouting;
