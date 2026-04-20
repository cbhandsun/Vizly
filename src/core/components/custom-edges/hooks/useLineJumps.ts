import { useEffect, useMemo, useSyncExternalStore } from 'react';
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

    // [FIX N-6] 用 useSyncExternalStore 订阅 engine 的版本变化
    // 原来 engine.getVersion() 作为 useMemo deps 无法响应式更新：
    // React 只在渲染时读取该值，engine 内部变化不触发重渲染。
    // useSyncExternalStore 注册回调，当 invalidateCache 触发时自动通知 React。
    const engineVersion = useSyncExternalStore(
        (cb) => engine.subscribe(cb),
        () => engine.getVersion(),
        () => 0
    );

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
    // engineVersion 作为依赖，useSyncExternalStore 保证它在引擎变化时更新
    }, [edgeId, points, enabled, engine, engineVersion]);

    return result;
}

