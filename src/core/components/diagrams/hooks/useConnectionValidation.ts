import { useCallback } from 'react';
import type { Connection, Node, Edge } from '@xyflow/react';
import type { PluginContext, DiagramTypePlugin } from '../../../types/plugin';
import {
    validateConnectionDetailed,
} from './connectionValidationPolicy';

export interface ConnectionValidationRuntimeOptions {
    ignoredEdgeIds?: ReadonlySet<string>;
}

/**
 * 连接验证规则 Hook
 *
 * 提供 isValidConnection 回调，React Flow 在拖拽连线时实时调用，
 * 决定目标 handle 是否允许连接。不合法的连接会被视觉上拒绝（handle 不高亮）。
 *
 * 验证规则：
 * 0. 插件拦截器回调优先验证
 * 1. 自环按图类型策略控制 — 默认禁止
 * 2. 重复连接禁止 — 同一对 source/sourceHandle→target/targetHandle/relationKey 不允许重复
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
        /** 允许自环；未设置时使用插件策略，仍未设置则默认禁止 */
        allowSelfLoop?: boolean;
    }
) {
    const maxSrc = options?.maxSourceConnections;
    const maxTgt = options?.maxTargetConnections;
    const allowSelfLoop = options?.allowSelfLoop ?? activePlugin?.connectionPolicy?.allowSelfLoop === true;

    const validateConnection = useCallback((
        connection: Connection | Edge,
        runtimeOptions?: ConnectionValidationRuntimeOptions,
    ) => {
        // Rule 0: Plugin Interceptor 优先
        let pluginAccepted = true;
        if (activePlugin?.onValidateConnection && pluginCtx) {
            const isValid = activePlugin.onValidateConnection(connection as Connection, pluginCtx);
            pluginAccepted = isValid !== false;
        }

        return validateConnectionDetailed({
            nodes,
            edges,
            connection,
            connectionPolicy: {
                ...activePlugin?.connectionPolicy,
                allowSelfLoop,
            },
            maxSourceConnections: maxSrc,
            maxTargetConnections: maxTgt,
            pluginAccepted,
            ignoredEdgeIds: runtimeOptions?.ignoredEdgeIds,
        });
    }, [nodes, edges, maxSrc, maxTgt, pluginCtx, activePlugin, allowSelfLoop]);

    const isValidConnection = useCallback((connection: Connection | Edge): boolean => (
        validateConnection(connection).valid
    ), [validateConnection]);

    return { isValidConnection, validateConnection };
}
