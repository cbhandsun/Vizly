/**
 * 共享障碍物计算上下文 (性能优化)
 * 
 * 目的：
 * - 将障碍物过滤计算从每条边独立计算提升到父组件共享
 * - 100 条边场景可减少 99% 重复计算
 * 
 * 使用方式：
 * 1. 在 React Flow 容器外层包裹 <ObstacleProvider>
 * 2. 边组件内使用 useSharedObstacles() 获取已计算的障碍物
 */

import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { useStore } from '@xyflow/react';
import { diagramConfigManager } from '../config/DiagramConfig';
import { layoutOptimizer } from '../layout/LayoutOptimizer';

// ==================== 类型定义 ====================

interface NodeBBox {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type?: string;
}

interface ObstacleContextValue {
    /** 所有业务节点的边界框（已过滤容器节点） */
    businessNodes: NodeBBox[];
    /** 节点 ID -> 节点的快速查找 Map */
    nodeMap: Map<string, any>;
    /** 原始签名（djb2 哈希数字），用于检测变化 */
    signature: number;
    /** 上下文是否就绪 */
    ready: boolean;
}

const ObstacleContext = createContext<ObstacleContextValue>({
    businessNodes: [],
    nodeMap: new Map(),
    signature: 0,
    ready: false,
});

// ==================== 工具函数 ====================

const CONTAINER_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'swimlane', 'domain']);
const BUSINESS_TYPES = new Set(['custom', 'default', 'input', 'output', 'flowchart']);
const IGNORE_TYPES = new Set(['annotation', 'background']);

/**
 * 获取节点边界框
 */
const getAbsolutePosition = (n: any, nodeMap: Map<string, any>, visited?: Set<string>): { x: number; y: number } => {
    const abs = n?.computed?.positionAbsolute ?? n?.positionAbsolute;
    if (abs) return abs;
    const base = n?.position || { x: n?.x ?? 0, y: n?.y ?? 0 };
    const parentId = n?.parentId || n?.parentNode;
    if (!parentId) return base;
    const v = visited || new Set<string>();
    const id = String(n?.id ?? '');
    if (id && v.has(id)) return base;
    if (id) v.add(id);
    const parent = nodeMap.get(String(parentId));
    if (!parent) return base;
    const pAbs = getAbsolutePosition(parent, nodeMap, v);
    return { x: pAbs.x + (base.x ?? 0), y: pAbs.y + (base.y ?? 0) };
};

const getNodeBBox = (n: any, nodeMap: Map<string, any>): NodeBBox => {
    const pos = getAbsolutePosition(n, nodeMap);
    const x = pos?.x ?? 0;
    const y = pos?.y ?? 0;
    const width = typeof n?.width === 'number' ? n.width : (n?.measured?.width ?? n?.style?.width ?? 0);
    const height = typeof n?.height === 'number' ? n.height : (n?.measured?.height ?? n?.style?.height ?? 0);
    return { id: n?.id ?? '', x, y, width: Number(width) || 0, height: Number(height) || 0, type: n?.type };
};

/**
 * [P1-1] 生成业务节点签名（检测位置/尺寸变化）
 * 原写法：sort() + join() = O(N log N) + 大字符串分配，拖拽期间 GC 压力高。
 * 新写法：djb2 滚动哈希 = O(N)，无中间字符串，与 edgeTopologySig 同一模式。
 * 坐标量化到 4px 单元，过滤 sub-pixel 噪声，减少不必要的 debounce 触发。
 */
const makeSignature = (nodes: any[]): number => {
    try {
        const nodeMap = new Map<string, any>();
        for (const n of nodes || []) {
            if (!n) continue;
            if (n?.id != null) nodeMap.set(String(n.id), n);
        }
        let h = 5381;
        for (const n of nodes || []) {
            if (!n) continue;
            const t = String(n?.type || '');
            if (IGNORE_TYPES.has(t)) continue;
            const hidden = !!((n?.data || {}) as any)?.hidden;
            if (hidden) continue;
            const bb = getNodeBBox(n, nodeMap);
            // 量化到 4px 单元，消除 sub-pixel 噪声
            const x = Math.round(bb.x / 4);
            const y = Math.round(bb.y / 4);
            const w = Math.round(bb.width / 4);
            const hh = Math.round(bb.height / 4);
            // djb2 哈希：散列 id + 位置 + 尺寸
            for (let i = 0; i < (n.id?.length ?? 0); i++) {
                h = ((h * 33) ^ (n.id as string).charCodeAt(i)) >>> 0;
            }
            h = ((h * 33) ^ x) >>> 0;
            h = ((h * 33) ^ y) >>> 0;
            h = ((h * 33) ^ w) >>> 0;
            h = ((h * 33) ^ hh) >>> 0;
        }
        return h;
    } catch {
        return (nodes || []).length;
    }
};

// [FIX N-3] Pool/Lane 类型通过 type 字段识别，不应通过字符串匹配 ID/label
// 用字符串 includes 会误杀 'carpool-node'、'pool-service' 等合法业务节点
const POOL_CONTAINER_TYPES = new Set([
    'pool', 'lane', 'bpmnPool', 'bpmnLane',
    'horizontal-pool', 'vertical-pool',
]);

/**
 * 过滤出业务节点（排除容器）
 */
const filterBusinessNodes = (nodes: any[]): NodeBBox[] => {
    const result: NodeBBox[] = [];
    const nodeMap = new Map<string, any>();
    for (const n of nodes || []) {
        if (!n) continue;
        if (n?.id != null) nodeMap.set(String(n.id), n);
    }

    for (const n of nodes || []) {
        if (!n) continue;

        const t = String(n?.type || '');
        const hidden = !!((n?.data || {}) as any)?.hidden;
        if (hidden) continue;

        // [FIX N-3] 通过 type 集合识别 Pool/Lane 容器，不再用字符串匹配
        if (POOL_CONTAINER_TYPES.has(t)) {
            continue;
        }

        // 显式控制优先
        const isObstacle = n?.data?.isObstacle;
        if (typeof isObstacle === 'boolean') {
            if (isObstacle) result.push(getNodeBBox(n, nodeMap));
            continue;
        }

        // 容器节点处理: 仅当收起(collapsed)时视为障碍物
        if (CONTAINER_TYPES.has(t)) {
            const isCollapsed = n?.data?.collapsed === true || n?.data?.expanded === false;
            // 如果容器已收起，它就是一个实心障碍物
            if (isCollapsed) {
                result.push(getNodeBBox(n, nodeMap));
            }
            continue;
        }

        // 排除明确忽略的类型 (黑名单模式)
        if (IGNORE_TYPES.has(t)) {
            continue;
        }

        // 默认所有剩余业务节点参与避障 (除非被明确禁用或 zIndex < 0)
        const z = typeof n?.zIndex === 'number' ? n.zIndex : (typeof n?.style?.zIndex === 'number' ? n.style.zIndex : 0);
        if (typeof z === 'number' && z < 0) continue;

        result.push(getNodeBBox(n, nodeMap));
    }

    return result;
};


// ==================== Provider 组件 ====================

interface ObstacleProviderProps {
    children: React.ReactNode;
    /** 防抖延迟（毫秒） */
    debounceMs?: number;
}

export const ObstacleProvider: React.FC<ObstacleProviderProps> = ({
    children,
    debounceMs
}) => {
    const nodes = useStore((s: any) => s.nodes || []);

    // 计算原始签名
    const rawSignature = useMemo(() => makeSignature(nodes), [nodes]);

    // 防抖签名
    const [stableSignature, setStableSignature] = useState(rawSignature);

    // ⭐ 监听 'obstacle-flush' 事件：布局切换时立即刷新（跳过 debounce）
    const rawSignatureRef = React.useRef(rawSignature);
    rawSignatureRef.current = rawSignature;
    useEffect(() => {
        const handler = () => {
            setStableSignature(rawSignatureRef.current);
        };
        window.addEventListener('obstacle-flush', handler);
        return () => window.removeEventListener('obstacle-flush', handler);
    }, []);

    useEffect(() => {
        // 常规拖拽等：走 debounce 路径保持性能
        let ms = debounceMs;
        if (typeof ms !== 'number') {
            try {
                ms = Number((diagramConfigManager.getConfig() as any)?.performance?.debounceMs ?? 100);
            } catch {
                ms = 100;
            }
        }
        // [FIX] 30ms ≈ 2 frames at 60fps. Reduces perceived latency during drag.
        // 80ms (5 frames) was too slow — edges visibly lagged behind node movement.
        const delay = Math.max(30, ms);
        const timer = setTimeout(() => setStableSignature(rawSignature), delay);
        return () => clearTimeout(timer);
    }, [rawSignature, debounceMs]);

    // [FIX] Cache nodes in ref — the useMemo below must NOT depend on `nodes`
    // because `nodes` reference changes on every selection change (React Flow
    // creates a new array). We only need to recompute when `stableSignature`
    // changes (i.e., node positions/sizes actually changed).
    const nodesRef = React.useRef(nodes);
    nodesRef.current = nodes;

    // 基于稳定签名计算共享数据
    const value = useMemo<ObstacleContextValue>(() => {
        // Read from ref to get latest nodes without adding as dependency
        const currentNodes = nodesRef.current;

        // 构建节点 Map (O(1) 查找)
        const nodeMap = new Map<string, any>();
        for (const n of currentNodes) {
            if (n?.id) nodeMap.set(n.id, n);
        }

        // 过滤业务节点
        const businessNodes = filterBusinessNodes(currentNodes);

        return {
            businessNodes,
            nodeMap,
            signature: stableSignature,
            ready: true,
        };
    // [FIX] Only depend on stableSignature — NOT on nodes.
    // nodes reference changes on every selection, but stableSignature only
    // changes when node positions/sizes actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stableSignature]);

    return (
        <ObstacleContext.Provider value={value}>
            {children}
        </ObstacleContext.Provider>
    );
};

// ==================== Hook ====================

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
    const { businessNodes, nodeMap } = useSharedObstacles();

    return useMemo(() => {
        const ignoreIds = new Set([sourceId, targetId, ...(options?.ignoreNodeIds || [])]);

        let filtered = businessNodes.filter(n => !ignoreIds.has(n.id));

        // 可选：走廊过滤（仅保留源-目标通道内的障碍物）
        if (
            typeof options?.corridorPadding === 'number' &&
            typeof options?.sourceX === 'number' &&
            typeof options?.targetX === 'number'
        ) {
            const pad = options.corridorPadding;
            const sx = options.sourceX;
            const sy = options.sourceY ?? 0;
            const tx = options.targetX;
            const ty = options.targetY ?? 0;

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
    }, [businessNodes, sourceId, targetId, options?.ignoreNodeIds, options?.corridorPadding, options?.sourceX, options?.sourceY, options?.targetX, options?.targetY]);
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

export default ObstacleContext;
