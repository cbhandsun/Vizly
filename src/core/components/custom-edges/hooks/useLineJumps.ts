/**
 * useLineJumps — 为边注册路径并获取跳线弧信息
 * 
 * 使用 LineJumpEngine 全局单例：
 * 1. 当 points 变化时注册到引擎
 * 2. 组件卸载时注销
 * 3. 返回该边的交叉点（供渲染使用）
 */

import { useEffect, useMemo, useRef } from 'react';
import { LineJumpEngine, injectLineJumps } from '../../../services/LineJumpEngine';
import type { Point, IntersectionInfo } from '../../../services/LineJumpEngine';

interface UseLineJumpsOptions {
    edgeId: string;
    /** 原始路径点（未 filleted） */
    points: Point[] | null | undefined;
    /** 是否启用跳线弧 */
    enabled?: boolean;
}

interface UseLineJumpsResult {
    /** 该边的交叉点列表 */
    jumps: IntersectionInfo[];
    /** 含跳线弧的 d-path（如果有交叉），否则为 null */
    jumpPath: string | null;
}

export function useLineJumps({ edgeId, points, enabled = true }: UseLineJumpsOptions): UseLineJumpsResult {
    const engine = LineJumpEngine.getInstance();
    const prevVersionRef = useRef(-1);

    // 注册/更新路径点
    useEffect(() => {
        if (!enabled || !points || points.length < 2) {
            engine.unregisterEdge(edgeId);
            return;
        }
        engine.registerEdge(edgeId, points);

        return () => {
            engine.unregisterEdge(edgeId);
        };
    }, [edgeId, points, enabled, engine]);

    // 查询交叉点
    const result = useMemo(() => {
        if (!enabled || !points || points.length < 2) {
            return { jumps: [], jumpPath: null };
        }

        const jumps = engine.getJumpsForEdge(edgeId);
        if (jumps.length === 0) {
            return { jumps: [], jumpPath: null };
        }

        const jumpPath = injectLineJumps(points, jumps, engine.getJumpRadius());
        return { jumps, jumpPath: jumpPath || null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [edgeId, points, enabled, engine.getVersion()]);

    return result;
}
