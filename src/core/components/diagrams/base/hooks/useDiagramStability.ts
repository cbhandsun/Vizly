import { useState, useRef, useEffect, useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { EdgeRoutingCoordinator } from '../../../../services/EdgeRoutingCoordinator';
import { LayeredConfigManager } from '../../../../config/LayeredConfigManager';

/**
 * 计算节点集合的轻量签名
 * 目的：替代深度 JSON 比较，降低大图场景下的阻塞开销。
 * 组成：按 id 排序后组合 id 与几何摘要（x,y,width,height 的整数值）。
 */
export const calcNodeSignature = (list: Node[]): string => {
  const rows = list.map(n => {
    const abs = ((n as any)?.computed?.positionAbsolute ?? (n as any)?.positionAbsolute ?? n.position ?? { x: 0, y: 0 }) as { x?: number; y?: number };
    const x = Math.round((abs?.x ?? 0) as number);
    const y = Math.round((abs?.y ?? 0) as number);
    let wRaw = 0;
    if (typeof n.measured?.width === 'number') wRaw = n.measured.width as number;
    else if (typeof n.width === 'number') wRaw = n.width as number;
    else if (typeof n.style?.width === 'number') wRaw = n.style.width as number;
    const w = Math.round(wRaw);
    let hRaw = 0;
    if (typeof n.measured?.height === 'number') hRaw = n.measured.height as number;
    else if (typeof n.height === 'number') hRaw = n.height as number;
    else if (typeof n.style?.height === 'number') hRaw = n.style.height as number;
    const h = Math.round(hRaw);
    const type = String(n.type || '');
    const shape = String((n.data as any)?.shape || '');
    const label = String((n.data as any)?.label || '');
    return `${n.id}:${x}:${y}:${w}:${h}:${type}:${shape}:${label}`;
  }).sort();
  return rows.join('|');
};

/**
 * 计算边集合的轻量签名
 * 目的：替代深度 JSON 比较，避免在每次 props 变更时阻塞主线程。
 */
export const calcEdgeSignature = (list: Edge[]): string => {
  const pointsSig = (pts: unknown): string => {
    if (!Array.isArray(pts) || pts.length < 2) return '';
    const first = pts[0] as { x?: unknown; y?: unknown };
    const last = pts[pts.length - 1] as { x?: unknown; y?: unknown };
    const fx = typeof first?.x === 'number' ? Math.round(first.x) : null;
    const fy = typeof first?.y === 'number' ? Math.round(first.y) : null;
    const lx = typeof last?.x === 'number' ? Math.round(last.x) : null;
    const ly = typeof last?.y === 'number' ? Math.round(last.y) : null;
    if (fx === null || fy === null || lx === null || ly === null) return '';
    return `${pts.length}:${fx},${fy}:${lx},${ly}`;
  };
  const rows = list
    .map(e => {
      const d = (e as any)?.data as any;
      const elk = pointsSig(d?.elkPath);
      const computed = pointsSig(d?.computedPath);
      const waypoints = pointsSig(d?.waypoints);
      const algo = typeof d?.algorithm === 'string' ? d.algorithm : '';
      return `${e.id}:${e.source}:${e.target}:${String(e.type || '')}:${String(e.sourceHandle || '')}:${String(e.targetHandle || '')}:${elk}:${computed}:${waypoints}:${algo}`;
    })
    .sort();
  return rows.join('|');
};

export interface DiagramStabilityParams {
    rfNodes: Node[];
    rfEdges: Edge[];
    layoutStrategy: any;
    nodeLayoutStrategy: string | undefined;
    latestEdgesRef: React.MutableRefObject<Edge[]>;
    setRfEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    edgeMode: 'advanced-smart' | 'native';
    baseFitTriggerKey?: string | number;
}

export function useDiagramStability({
    rfNodes,
    rfEdges,
    layoutStrategy,
    nodeLayoutStrategy,
    latestEdgesRef,
    setRfEdges,
    edgeMode,
    baseFitTriggerKey
}: DiagramStabilityParams) {
    // 计算布局边界签名用于触发适配
    const layoutFitSignature = useMemo(() => {
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        rfNodes.forEach((n) => {
            const abs = ((n as any)?.computed?.positionAbsolute ?? (n as any)?.positionAbsolute ?? n.position ?? { x: 0, y: 0 }) as { x?: number; y?: number };
            const x = abs?.x ?? 0;
            const y = abs?.y ?? 0;
            const w = (typeof n.measured?.width === 'number' && isFinite(n.measured.width))
            ? n.measured.width
            : (typeof n.width === 'number' && isFinite(n.width))
                ? n.width
                : (typeof n.style?.width === 'number' && isFinite(n.style.width))
                ? n.style.width
                : 220;
            const h = (typeof n.measured?.height === 'number' && isFinite(n.measured.height))
            ? n.measured.height
            : (typeof n.height === 'number' && isFinite(n.height))
                ? n.height
                : (typeof n.style?.height === 'number' && isFinite(n.style.height))
                ? n.style.height
                : 100;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
        });
        const safe = (v: number) => (isFinite(v) ? Math.round(v) : 0);
        return `${safe(minX)}:${safe(minY)}:${safe(maxX)}:${safe(maxY)}:${rfNodes.length}:${rfEdges.length}`;
    }, [rfNodes, rfEdges]);

    const [isLayoutStable, setIsLayoutStable] = useState<boolean>(false);
    const [layoutEpoch, setLayoutEpoch] = useState<number>(0);

    const STABILITY_DEBOUNCE_MS = 300;
    const lastSignatureRef = useRef<string>('');
    const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const changedNodeIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (stableTimerRef.current) {
            clearTimeout(stableTimerRef.current);
            stableTimerRef.current = null;
        }

        if (layoutFitSignature !== lastSignatureRef.current) {
            lastSignatureRef.current = layoutFitSignature;
            Promise.resolve().then(() => setIsLayoutStable(false));
        }

        stableTimerRef.current = setTimeout(() => {
            if (layoutFitSignature === lastSignatureRef.current) {
                setIsLayoutStable(true);
                const ids = Array.from(changedNodeIdsRef.current);
                changedNodeIdsRef.current.clear();
                if (ids.length > 0) {
                    EdgeRoutingCoordinator.getInstance().notifyGraphChange(ids);
                } else {
                    EdgeRoutingCoordinator.getInstance().notifyGraphChange();
                    setLayoutEpoch(e => e + 1);
                }
            }
        }, STABILITY_DEBOUNCE_MS);

        return () => {
            if (stableTimerRef.current) {
                clearTimeout(stableTimerRef.current);
                stableTimerRef.current = null;
            }
        };
    }, [layoutFitSignature, rfEdges.length]);

    useEffect(() => {
        if (!isLayoutStable) return;
        EdgeRoutingCoordinator.getInstance().batchRouteDirtyEdges();
    }, [isLayoutStable]);

    useEffect(() => {
        Promise.resolve().then(() => setIsLayoutStable(false));
        EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
        Promise.resolve().then(() => {
            setLayoutEpoch((prev: number) => prev + 1);
            const nextEdges = latestEdgesRef.current;
            setRfEdges(nextEdges.map(e => ({
                ...e,
                data: {
                    ...(e.data as any),
                    elkPath: undefined,
                    computedPath: undefined,
                    algorithm: undefined
                }
            })));
            EdgeRoutingCoordinator.getInstance().initializeEdges(nextEdges);
        });
    }, [layoutStrategy, nodeLayoutStrategy, setRfEdges, latestEdgesRef]);

    const lastStableFitKeyRef = useRef<string>('');

    const fitTriggerKey = useMemo(() => {
        const layered = LayeredConfigManager.getInstance();
        const containment = String(layered.get<string>('diagram.layout.CONTAINMENT_POLICY', 'elastic') || 'elastic');
        const rank = String(layered.get<string>('diagram.layout.RANK_MODE', 'elk') || 'elk');
        const post = String(layered.get<string>('diagram.layout.POST_RESHAPE_PROFILE', '') || '');
        const strategyName = (() => {
            if (typeof layoutStrategy === 'string') return layoutStrategy;
            if (layoutStrategy && typeof layoutStrategy === 'object') {
            const maybe = layoutStrategy as { getName?: () => unknown };
            const name = maybe.getName?.();
            return typeof name === 'string' ? name : '';
            }
            return '';
        })();
        const edgeModeKey = (edgeMode === 'advanced-smart') ? 'advanced-smart' : 'native';
        const suffix = `${containment}:${rank}:${post}`;
        const key = baseFitTriggerKey ? `${baseFitTriggerKey}:${suffix}` : `${layoutFitSignature}:${edgeModeKey}:${strategyName}:${nodeLayoutStrategy ?? ''}:${containment}:${rank}:${post}`;
        
        // 只有在布局完全稳定后才更新 fitTriggerKey，防止切换布局或重绘过程中的中间抖动
        if (!isLayoutStable && lastStableFitKeyRef.current) {
            return lastStableFitKeyRef.current;
        }
        
        lastStableFitKeyRef.current = key;
        return key;
    }, [baseFitTriggerKey, layoutFitSignature, edgeMode, layoutStrategy, nodeLayoutStrategy, isLayoutStable]);

    return {
        layoutFitSignature,
        isLayoutStable,
        setIsLayoutStable,
        layoutEpoch,
        changedNodeIdsRef,
        fitTriggerKey
    };
}
