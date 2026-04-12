import { useCallback } from 'react';
import { Connection, Node, Edge } from '@xyflow/react';
import { PluginContext, DiagramTypePlugin } from '../../../types/plugin';

/**
 * 连接验证规则 Hook
 *
 * 提供 isValidConnection 回调，React Flow 在拖拽连线时实时调用，
 * 决定目标 handle 是否允许连接。不合法的连接会被视觉上拒绝（handle 不高亮）。
 *
 * 验证规则：
 * 0. 插件拦截器回调优先验证
 * 1. 自环禁止 — 不能连接到自身
 * 2. 重复连接禁止 — 同一对 source→target 不允许多条边
 * 3. 终止节点出口禁止 — shape=pill 的 "End" 节点不允许从 source handle 发出连接
 * 4. 最大连接数限制 — 单个 handle 最大入/出连接数
 */
export function useConnectionValidation(
    nodes: Node[],
    edges: Edge[],
    pluginCtx?: PluginContext,
    activePlugin?: DiagramTypePlugin | null,
    options?: {
        /** 每个 source handle 最大出连接数，默认不限 */
        maxSourceConnections?: number;
        /** 每个 target handle 最大入连接数，默认不限 */
        maxTargetConnections?: number;
    }
) {
    const maxSrc = options?.maxSourceConnections;
    const maxTgt = options?.maxTargetConnections;

    const isValidConnection = useCallback((connection: Connection | Edge): boolean => {
        // Rule 0: Plugin Interceptor 优先
        if (activePlugin?.onValidateConnection && pluginCtx) {
            const isValid = activePlugin.onValidateConnection(connection as Connection, pluginCtx);
            if (!isValid) return false;
        }

        const { source, target, sourceHandle, targetHandle } = connection as Connection;

        // Rule 1: 自环禁止
        if (source === target) return false;

        // Rule 2: 重复连接禁止（source→target 同对不允许多条）
        const duplicate = edges.some(
            e => e.source === source && e.target === target
        );
        if (duplicate) return false;

        // Rule 3: 终止节点出口禁止
        // "pill" 形状(Start/End) 作为 source 时需要检查是否有 label 暗示是 End
        const sourceNode = nodes.find(n => n.id === source);
        if (sourceNode) {
            const shape = (sourceNode.data as any)?.shape;
            const label = String((sourceNode.data as any)?.label || '').toLowerCase();
            // pill 形状 + label 包含 end/stop/结束 视为终止节点
            if (shape === 'pill' && /end|stop|结束|终止/.test(label)) {
                return false;
            }
        }

        // Rule 4: 最大连接数限制
        if (maxSrc != null && sourceHandle) {
            const count = edges.filter(e => e.source === source && e.sourceHandle === sourceHandle).length;
            if (count >= maxSrc) return false;
        }
        if (maxTgt != null && targetHandle) {
            const count = edges.filter(e => e.target === target && e.targetHandle === targetHandle).length;
            if (count >= maxTgt) return false;
        }

        return true;
    }, [nodes, edges, maxSrc, maxTgt, pluginCtx, activePlugin]);

    return { isValidConnection };
}
