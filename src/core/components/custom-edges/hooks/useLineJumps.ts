import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { LineJumpEngine, injectLineJumps } from '../../../services/LineJumpEngine';
import type { Point, IntersectionInfo } from '../../../services/LineJumpEngine';
// [FIX-FILLET] Updated to pass cornerRadius for unified jump+fillet path rendering

interface UseLineJumpsOptions {
    edgeId: string;
    sourceId?: string | null;
    targetId?: string | null;
    /** 原始路径点（未 filleted） */
    points: Point[] | null | undefined;
    /** 是否启用跳线弧 */
    enabled?: boolean;
    /** 是否为当前边渲染跳线弧。关闭时仍注册路径，供其他边避让/跳线。 */
    renderJumps?: boolean;
    /** 圆角半径（默认16），用于在跳线路径中保持圆角效果 */
    cornerRadius?: number;
}

interface UseLineJumpsResult {
    /** 该边的交叉点列表 */
    jumps: IntersectionInfo[];
    /** 含跳线弧的 d-path（如果有交叉），否则为 null */
    jumpPath: string | null;
}

export function useLineJumps({ edgeId, sourceId, targetId, points, enabled = true, renderJumps = enabled, cornerRadius = 16 }: UseLineJumpsOptions): UseLineJumpsResult {
    const subscribe = useCallback((callback: () => void) => {
        if (!enabled) return () => undefined;
        return LineJumpEngine.getInstance().subscribe(callback);
    }, [enabled]);
    const getSnapshot = useCallback(
        () => enabled ? LineJumpEngine.getInstance().getVersion() : 0,
        [enabled],
    );
    const engineVersion = useSyncExternalStore(
        subscribe,
        getSnapshot,
        () => 0,
    );

    // 注册/更新路径点
    useEffect(() => {
        if (!enabled || !points || points.length < 2) return undefined;
        const engine = LineJumpEngine.getInstance();
        engine.registerEdge(edgeId, points, { source: sourceId, target: targetId });

        return () => {
            engine.unregisterEdge(edgeId);
        };
    }, [edgeId, sourceId, targetId, points, enabled]);

    // 查询交叉点
    const result = useMemo(() => {
        void engineVersion;

        if (!enabled || !renderJumps || !points || points.length < 2) {
            return { jumps: [], jumpPath: null };
        }

        const engine = LineJumpEngine.getInstance();
        const jumps = engine.getJumpsForEdge(edgeId);
        if (jumps.length === 0) {
            return { jumps: [], jumpPath: null };
        }

        const jumpPath = injectLineJumps(points, jumps, engine.getJumpRadius(), cornerRadius);
        return { jumps, jumpPath: jumpPath || null };
    // engineVersion 作为依赖，useSyncExternalStore 保证它在引擎变化时更新
    }, [edgeId, points, enabled, renderJumps, engineVersion, cornerRadius]);

    return result;
}

