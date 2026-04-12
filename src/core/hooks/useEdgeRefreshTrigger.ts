/**
 * useEdgeRefreshTrigger — 事件驱动的边路由刷新
 * 
 * SVG 版使用发布-订阅模式（EventBus）在特定事件后批量刷新边：
 * - layout-change: 布局方向改变
 * - node-resize: 节点大小改变
 * - node-add/delete: 节点增删
 * - edge-add/delete: 边增删
 * 
 * RF 版已有 EdgeRoutingCoordinator 负责 debounce 刷新，
 * 但缺少事件分类和优先级机制。本 hook 补充该能力：
 * - 高优事件（drag-end, layout-change）→ 立即刷新
 * - 低优事件（theme-change, zoom）→ 延迟刷新
 * - 批量事件合并（多个 node-add）→ 仅触发一次
 */

import { useCallback, useRef, useEffect } from 'react';

export type RefreshPriority = 'immediate' | 'normal' | 'deferred';

export interface RefreshEvent {
    type: string;
    priority: RefreshPriority;
    /** 可选 edgeIds：仅刷新这些边。为空则全部刷新 */
    affectedEdgeIds?: string[];
}

interface RefreshTriggerOptions {
    /** 处理刷新的回调 */
    onRefresh: (edgeIds?: string[]) => void;
    /** normal 优先级的 debounce 延迟 (ms) */
    normalDelay?: number;
    /** deferred 优先级的 debounce 延迟 (ms) */
    deferredDelay?: number;
}

/**
 * 事件驱动的边刷新 hook。
 * 
 * 返回 `trigger(event)` 函数，各组件在适当时机调用：
 * ```ts
 * const trigger = useEdgeRefreshTrigger({ onRefresh: coordinator.refreshAll });
 * // 布局改变时
 * trigger({ type: 'layout-change', priority: 'immediate' });
 * // 主题改变时
 * trigger({ type: 'theme-change', priority: 'deferred' });
 * ```
 */
export function useEdgeRefreshTrigger(options: RefreshTriggerOptions) {
    const { onRefresh, normalDelay = 100, deferredDelay = 300 } = options;
    const normalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const deferredTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingEdgeIds = useRef<Set<string>>(new Set());
    const onRefreshRef = useRef(onRefresh);
    onRefreshRef.current = onRefresh;

    // 清理
    useEffect(() => {
        return () => {
            if (normalTimer.current) clearTimeout(normalTimer.current);
            if (deferredTimer.current) clearTimeout(deferredTimer.current);
        };
    }, []);

    const flushPending = useCallback(() => {
        const ids = pendingEdgeIds.current.size > 0
            ? Array.from(pendingEdgeIds.current)
            : undefined;
        pendingEdgeIds.current.clear();
        onRefreshRef.current(ids);
    }, []);

    const trigger = useCallback((event: RefreshEvent) => {
        // 收集受影响的 edgeIds
        if (event.affectedEdgeIds) {
            for (const id of event.affectedEdgeIds) {
                pendingEdgeIds.current.add(id);
            }
        }

        switch (event.priority) {
            case 'immediate':
                // 取消所有待处理的定时器，立即刷新
                if (normalTimer.current) {
                    clearTimeout(normalTimer.current);
                    normalTimer.current = null;
                }
                if (deferredTimer.current) {
                    clearTimeout(deferredTimer.current);
                    deferredTimer.current = null;
                }
                flushPending();
                break;

            case 'normal':
                // 取消已有 normal 定时器，重置
                if (normalTimer.current) clearTimeout(normalTimer.current);
                normalTimer.current = setTimeout(() => {
                    normalTimer.current = null;
                    flushPending();
                }, normalDelay);
                break;

            case 'deferred':
                // 仅在没有更高优先级待处理时设置
                if (!normalTimer.current) {
                    if (deferredTimer.current) clearTimeout(deferredTimer.current);
                    deferredTimer.current = setTimeout(() => {
                        deferredTimer.current = null;
                        flushPending();
                    }, deferredDelay);
                }
                break;
        }
    }, [normalDelay, deferredDelay, flushPending]);

    return trigger;
}

/**
 * 预定义事件工厂，方便各组件使用
 */
export const RefreshEvents = {
    layoutChange: (): RefreshEvent => ({
        type: 'layout-change',
        priority: 'immediate',
    }),
    dragEnd: (edgeIds?: string[]): RefreshEvent => ({
        type: 'drag-end',
        priority: 'immediate',
        affectedEdgeIds: edgeIds,
    }),
    nodeResize: (edgeIds?: string[]): RefreshEvent => ({
        type: 'node-resize',
        priority: 'normal',
        affectedEdgeIds: edgeIds,
    }),
    nodeAddDelete: (): RefreshEvent => ({
        type: 'node-add-delete',
        priority: 'normal',
    }),
    edgeAddDelete: (edgeIds?: string[]): RefreshEvent => ({
        type: 'edge-add-delete',
        priority: 'normal',
        affectedEdgeIds: edgeIds,
    }),
    themeChange: (): RefreshEvent => ({
        type: 'theme-change',
        priority: 'deferred',
    }),
    viewportChange: (): RefreshEvent => ({
        type: 'viewport-change',
        priority: 'deferred',
    }),
};
