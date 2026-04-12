/**
 * useChannelRouting — 全局通道分配 hook
 * 
 * 利用 LineJumpEngine 已注册的全局路径信息进行通道分配，
 * 返回调整后的路径点。
 * 
 * 设计原理：
 * - 各边通过 useLineJumps 自动注册路径到 LineJumpEngine
 * - 本 hook 读取全局路径，运行 Interval Coloring，返回当前边的调整路径
 * - 调整路径用于替代原始 workerSmartPoints 进行 filleting
 */

import { useMemo } from 'react';
import { LineJumpEngine } from '../../../services/LineJumpEngine';
import { globalChannelRouting } from '../../../algorithms/globalChannelRouting';
import type { Point } from '../../../services/LineJumpEngine';

interface UseChannelRoutingOptions {
    edgeId: string;
    /** 原始路径点 */
    points: Point[] | null | undefined;
    /** 是否启用 */
    enabled?: boolean;
}

/**
 * 返回经过全局通道分配调整后的路径点。
 * 如果无需调整或禁用，返回 null。
 */
export function useChannelRouting({ edgeId, points, enabled = true }: UseChannelRoutingOptions): Point[] | null {
    const engine = LineJumpEngine.getInstance();

    return useMemo(() => {
        if (!enabled || !points || points.length < 4) {
            return null;
        }

        // 从 LineJumpEngine 获取所有已注册的路径
        const allPaths = engine.getAllEdgePaths();
        if (allPaths.size < 2) {
            return null; // 只有一条边，无需分配
        }

        // 运行全局通道分配
        const adjusted = globalChannelRouting(allPaths, 12);

        // 获取当前边的调整结果
        const myAdjusted = adjusted.get(edgeId);
        if (!myAdjusted) return null;

        // 检查是否有实际变化
        let changed = false;
        for (let i = 0; i < myAdjusted.length && i < points.length; i++) {
            if (Math.abs(myAdjusted[i].x - points[i].x) > 0.5 ||
                Math.abs(myAdjusted[i].y - points[i].y) > 0.5) {
                changed = true;
                break;
            }
        }

        return changed ? myAdjusted : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [edgeId, points, enabled, engine.getVersion()]);
}
