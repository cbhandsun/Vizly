/**
 * 高性能节点查找 Hook (性能优化)
 * 
 * 目的：
 * - 将 nodes.find() 的 O(n) 查找优化为 O(1)
 * - 供 Worker 和边缘组件使用
 * 
 * @example
 * const nodeMap = useNodeMap();
 * const sourceNode = nodeMap.get(sourceId); // O(1)
 */

import { useMemo } from 'react';
import { useStore } from '@xyflow/react';
import type { Node, XYPosition } from '@xyflow/react';

type RuntimeNode = Node & {
    positionAbsolute?: XYPosition;
    computed?: { positionAbsolute?: XYPosition };
    parentNode?: string;
};

/**
 * 创建节点 ID -> Node 的 Map 用于 O(1) 查找
 * 
 * @returns Map<string, Node> 节点映射表
 */
export const useNodeMap = (): Map<string, Node> => {
    const nodes = useStore(s => s.nodes);

    return useMemo(() => {
        const map = new Map<string, Node>();
        for (const node of nodes) {
            if (node?.id) {
                map.set(node.id, node);
            }
        }
        return map;
    }, [nodes]);
};

/**
 * 获取简化的节点位置映射（用于 Worker 通信）
 * 只包含必要字段，减少序列化开销
 */
export interface SimpleNodeData {
    id: string;
    type?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    position: { x: number; y: number };
    measured: { width: number; height: number };
}

const MAX_PARENT_DEPTH = 256;

export const createSimpleNodeMap = (nodes: readonly Node[]): Map<string, SimpleNodeData> => {
    const map = new Map<string, SimpleNodeData>();
    const rawNodesMap = new Map<string, RuntimeNode>();

    for (const node of nodes) {
        if (node?.id) rawNodesMap.set(node.id, node as RuntimeNode);
    }

    const getAbsolutePosition = (node: RuntimeNode): { x: number; y: number } => {
        const direct = node.computed?.positionAbsolute ?? node.positionAbsolute;
        if (direct) return direct;

        let x = node.position?.x ?? 0;
        let y = node.position?.y ?? 0;
        let current = node;
        const visited = new Set<string>(node.id ? [node.id] : []);
        let depth = 0;

        while (depth < MAX_PARENT_DEPTH) {
            const parentId = current.parentId || current.parentNode;
            if (!parentId || visited.has(parentId)) break;
            visited.add(parentId);
            const parent = rawNodesMap.get(parentId);
            if (!parent) break;
            const parentAbsolute = parent.computed?.positionAbsolute ?? parent.positionAbsolute;
            if (parentAbsolute) {
                return {
                    x: parentAbsolute.x + x,
                    y: parentAbsolute.y + y,
                };
            }
            x += parent.position?.x ?? 0;
            y += parent.position?.y ?? 0;
            current = parent;
            depth += 1;
        }
        return { x, y };
    };

    for (const node of nodes) {
        if (!node?.id) continue;
        const absPos = getAbsolutePosition(node as RuntimeNode);
        const width = node.measured?.width ?? (typeof node.style?.width === 'number' ? node.style.width : 150);
        const height = node.measured?.height ?? (typeof node.style?.height === 'number' ? node.style.height : 80);

        map.set(node.id, {
            id: node.id,
            type: node.type,
            x: absPos.x,
            y: absPos.y,
            width,
            height,
            position: { x: absPos.x, y: absPos.y },
            measured: { width, height },
        });
    }
    return map;
};

export const useSimpleNodeMap = (): Map<string, SimpleNodeData> => {
    const nodes = useStore(s => s.nodes);
    return useMemo(() => createSimpleNodeMap(nodes), [nodes]);
};

/**
 * 批量获取多个节点
 * 
 * @param nodeIds 节点 ID 数组
 * @returns 节点数组（不包含未找到的节点）
 */
export const useNodesByIds = (nodeIds: string[]): Node[] => {
    const nodeMap = useNodeMap();

    return useMemo(() => {
        const result: Node[] = [];
        for (const id of nodeIds) {
            const node = nodeMap.get(id);
            if (node) result.push(node);
        }
        return result;
    }, [nodeMap, nodeIds]);
};

export default useNodeMap;
