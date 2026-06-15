import { useMemo, useCallback } from 'react';
import { Node as ReactFlowNode, Edge as ReactFlowEdge, Viewport } from '@xyflow/react';

/**
 * 虚拟化配置选项
 */
export interface UseVirtualizationOptions {
    enabled: boolean;           // 是否启用虚拟化
    threshold: number;          // 节点数阈值（默认50）
    padding: number;            // viewport外扩边界（默认200px）
    isDragging?: boolean;       // 是否正在拖动（拖动时禁用重新计算以避免抖动）
}

/**
 * 虚拟化结果
 */
export interface VirtualizationResult {
    virtualizedNodes: ReactFlowNode[];
    virtualizedEdges: ReactFlowEdge[];
    stats: {
        totalNodes: number;
        visibleNodes: number;
        hiddenNodes: number;
        optimizationRate: number;  // 优化率百分比
    };
}

/**
 * 可见边界
 */
interface VisibleBounds {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/**
 * 节点虚拟化Hook
 * 
 * 根据viewport动态设置节点hidden属性，仅渲染可见区域内的节点
 * 适用于100+节点的大规模图表性能优化
 * 
 * @param nodes - 节点数组
 * @param edges - 边数组
 * @param viewport - 当前viewport状态
 * @param options - 虚拟化配置选项
 * @returns 虚拟化后的节点、边和统计信息
 */
export const useVirtualization = (
    nodes: ReactFlowNode[],
    edges: ReactFlowEdge[],
    viewport: Viewport,
    options: Partial<UseVirtualizationOptions> = {}
): VirtualizationResult => {
    const {
        enabled = true,
        threshold = 50,
        padding = 200,
        isDragging = false  // 默认不在拖动中
    } = options;

    // 判断是否需要虚拟化
    const shouldVirtualize = useMemo(() => {
        return enabled && nodes.length > threshold;
    }, [enabled, nodes.length, threshold]);

    // 🚀 P7: 量化 viewport 值 — 减少亚像素级 pan/zoom 导致的频繁 bounds 重算
    const QUANT_POS = 50; // 50px 位置粒度
    const qX = Math.round(viewport.x / QUANT_POS) * QUANT_POS;
    const qY = Math.round(viewport.y / QUANT_POS) * QUANT_POS;
    const qZ = Math.round(viewport.zoom * 20) / 20; // zoom 精度 0.05

    // 计算可见边界（考虑缩放和padding）
    const visibleBounds = useMemo((): VisibleBounds | null => {
        if (!shouldVirtualize) return null;

        // padding需要根据缩放比例调整
        const paddingScaled = padding / qZ;

        // viewport坐标系转换
        const viewportLeft = -qX;
        const viewportTop = -qY;
        const viewportWidth = window.innerWidth / qZ;
        const viewportHeight = window.innerHeight / qZ;

        return {
            left: viewportLeft - paddingScaled,
            right: viewportLeft + viewportWidth + paddingScaled,
            top: viewportTop - paddingScaled,
            bottom: viewportTop + viewportHeight + paddingScaled
        };
    }, [shouldVirtualize, qX, qY, qZ, padding]);

    // 判断节点是否可见（AABB碰撞检测）
    const isNodeVisible = useCallback((node: ReactFlowNode): boolean => {
        if (!visibleBounds) return true;

        const nodeX = node.position.x;
        const nodeY = node.position.y;

        // 获取节点尺寸（优先使用measured，fallback到style或默认值）
        const nodeWidth = node.measured?.width ||
            (typeof node.style?.width === 'number' ? node.style.width : 0) ||
            150; // 默认宽度
        const nodeHeight = node.measured?.height ||
            (typeof node.style?.height === 'number' ? node.style.height : 0) ||
            60;  // 默认高度

        // AABB碰撞检测：节点矩形与可见区域矩形是否相交
        const noOverlap =
            nodeX + nodeWidth < visibleBounds.left ||   // 节点在左侧外
            nodeX > visibleBounds.right ||              // 节点在右侧外
            nodeY + nodeHeight < visibleBounds.top ||   // 节点在上方外
            nodeY > visibleBounds.bottom;               // 节点在下方外

        return !noOverlap;
    }, [visibleBounds]);

    // 创建节点ID到节点的映射（用于层级节点children查询）
    const nodesMap = useMemo(() => {
        return new Map<string, ReactFlowNode>(nodes.map(n => [n.id, n]));
    }, [nodes]);

    // 判断层级节点（SubGroup/TitleGroup）是否可见
    // 规则：自身可见 || 任一child可见
    const isGroupNodeVisible = useCallback((groupNode: ReactFlowNode): boolean => {
        // 首先检查自身
        if (isNodeVisible(groupNode)) return true;

        // 检查children
        const children = Array.isArray(groupNode.data?.children)
            ? groupNode.data.children as string[]
            : [];

        return children.some((childId: string) => {
            const child = nodesMap.get(childId);
            return child && isNodeVisible(child);
        });
    }, [isNodeVisible, nodesMap]);

    // 虚拟化节点
    const virtualizedNodes = useMemo(() => {
        if (!shouldVirtualize) return nodes;

        return nodes.map(node => {
            const isGroupType = node.type === 'subGroup' || node.type === 'titleGroup';
            const visible = isGroupType ? isGroupNodeVisible(node) : isNodeVisible(node);
            const shouldHide = isDragging ? (node.hidden || false) : !visible;

            // P9: 短路复用 — hidden 值未变时返回原引用，避免下游 memo 链失效
            return shouldHide === (node.hidden || false) ? node : { ...node, hidden: shouldHide };
        });
    }, [nodes, shouldVirtualize, isNodeVisible, isGroupNodeVisible, isDragging]);

    // 虚拟化边（隐藏两端节点都不可见的边）
    const virtualizedEdges = useMemo(() => {
        if (!shouldVirtualize) return edges;

        // 创建可见节点ID集合
        const visibleNodeIds = new Set(
            virtualizedNodes
                .filter(n => !n.hidden)
                .map(n => n.id)
        );

        return edges.map(edge => {
            const shouldHide = isDragging
                ? (edge.hidden || false)
                : !visibleNodeIds.has(edge.source) && !visibleNodeIds.has(edge.target);
            
            // P9: 短路复用 — 避免无意义的对象展开
            return shouldHide === (edge.hidden || false) ? edge : { ...edge, hidden: shouldHide };
        });
    }, [edges, virtualizedNodes, shouldVirtualize, isDragging]);

    // 统计信息
    const stats = useMemo(() => {
        const visibleCount = virtualizedNodes.filter(n => !n.hidden).length;
        const hiddenCount = nodes.length - visibleCount;
        const optimizationRate = nodes.length > 0
            ? Math.round((hiddenCount / nodes.length) * 100)
            : 0;

        return {
            totalNodes: nodes.length,
            visibleNodes: visibleCount,
            hiddenNodes: hiddenCount,
            optimizationRate
        };
    }, [nodes.length, virtualizedNodes]);

    return {
        virtualizedNodes,
        virtualizedEdges,
        stats
    };
};
