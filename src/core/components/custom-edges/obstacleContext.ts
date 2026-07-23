import { createContext, useContext, useMemo } from 'react';
import type { Node, XYPosition } from '@xyflow/react';

export type ObstacleNode = Node & {
    x?: number;
    y?: number;
    parentNode?: string;
    positionAbsolute?: XYPosition;
    computed?: { positionAbsolute?: XYPosition };
    internals?: { positionAbsolute?: XYPosition };
};

export interface NodeBBox {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type?: string;
}

export interface ObstacleContextValue {
    /** 所有业务节点的边界框（已过滤容器节点） */
    businessNodes: NodeBBox[];
    /** 节点 ID -> 节点的快速查找 Map */
    nodeMap: Map<string, ObstacleNode>;
    /** 原始签名（djb2 哈希数字），用于检测变化 */
    signature: number;
    /** 上下文是否就绪 */
    ready: boolean;
}

export const ObstacleContext = createContext<ObstacleContextValue>({
    businessNodes: [],
    nodeMap: new Map(),
    signature: 0,
    ready: false,
});

/**
 * 获取共享障碍物数据
 *
 * @returns 包含业务节点边界框、节点 Map 和签名的对象
 *
 * @example
 * const { businessNodes, nodeMap } = useSharedObstacles();
 * const sourceNode = nodeMap.get(sourceId); // O(1) 查找
 */
export const useSharedObstacles = (): ObstacleContextValue => {
    return useContext(ObstacleContext);
};

/**
 * 获取特定边的障碍物列表（排除源节点和目标节点）
 *
 * @param sourceId 源节点 ID
 * @param targetId 目标节点 ID
 * @param options 可选配置
 * @returns 障碍物边界框数组
 */
export const useObstaclesForEdge = (
    sourceId: string,
    targetId: string,
    options?: {
        ignoreNodeIds?: string[];
        corridorPadding?: number;
        sourceX?: number;
        sourceY?: number;
        targetX?: number;
        targetY?: number;
    }
): NodeBBox[] => {
    const { businessNodes } = useSharedObstacles();
    const ignoreNodeIds = options?.ignoreNodeIds;
    const corridorPadding = options?.corridorPadding;
    const sourceX = options?.sourceX;
    const sourceY = options?.sourceY;
    const targetX = options?.targetX;
    const targetY = options?.targetY;

    return useMemo(() => {
        const ignoreIds = new Set([sourceId, targetId, ...(ignoreNodeIds || [])]);

        let filtered = businessNodes.filter(n => !ignoreIds.has(n.id));

        // 可选：走廊过滤（仅保留源-目标通道内的障碍物）
        if (
            typeof corridorPadding === 'number' &&
            typeof sourceX === 'number' &&
            typeof targetX === 'number'
        ) {
            const pad = corridorPadding;
            const sx = sourceX;
            const sy = sourceY ?? 0;
            const tx = targetX;
            const ty = targetY ?? 0;

            const minX = Math.min(sx, tx) - pad;
            const maxX = Math.max(sx, tx) + pad;
            const minY = Math.min(sy, ty) - pad;
            const maxY = Math.max(sy, ty) + pad;

            filtered = filtered.filter(n => {
                const nx2 = n.x + n.width;
                const ny2 = n.y + n.height;
                return !(nx2 < minX || n.x > maxX || ny2 < minY || n.y > maxY);
            });
        }

        return filtered;
    }, [businessNodes, sourceId, targetId, ignoreNodeIds, corridorPadding, sourceX, sourceY, targetX, targetY]);
};

/**
 * 立即刷新障碍物计算，跳过 debounce。
 * 在布局切换后调用，确保边路径立即基于最新节点位置重新计算。
 *
 * @example
 * // 在布局完成后调用
 * setNodes(layoutedNodes);
 * flushObstacles();
 */
export const flushObstacles = (): void => {
    window.dispatchEvent(new CustomEvent('obstacle-flush'));
};
