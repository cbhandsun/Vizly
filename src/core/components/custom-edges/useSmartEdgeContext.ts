import { useMemo, useCallback, useRef } from 'react';
import { useStore } from '@xyflow/react';
import type { EdgeProps, Edge } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { useSimpleNodeMap, type SimpleNodeData } from '../../hooks/useNodeMap';
import { selectBestPortCombination } from '../../algorithms/smartEdgeUtils';
import { diagramConfigManager } from '@/core/config/DiagramConfig';
import { LayeredConfigManager } from '../../config/LayeredConfigManager';
import { parseHandlePosition } from '../../routing/utils/handleUtils';
import { safeLog } from '../../utils/consoleCleanup';
import type { CenteredCoords } from './hooks/useSmartPathWorker';
import { resolveSmartEdgeHandleSelection } from './smartEdgeHandleSelection';
import {
    createSmartEdgeAbsolutePositionResolver,
    type SmartEdgeNode,
    type SmartEdgePoint,
} from './smartEdgeNodeGeometry';
import {
    buildSmartEdgeCenteredCoords,
    resolveSmartEdgeFallbackPositions,
} from './smartEdgeCenteredCoords';

// Reuse direction votes for identical topology signatures.
type LayoutDirection = 'LR' | 'RL' | 'TB' | 'BT';
type Point = SmartEdgePoint;
type DirectionBucket = 'up' | 'down' | 'left' | 'right';

type SmartNode = SmartEdgeNode;

type SmartEdgeConfig = {
    bundleStrength: number;
    maxBundleSize: number;
    obstaclePadding: number;
    labelCollisionOffset: number;
    jitterThresholdMultiplier: number;
    borderRadius: number;
    sourceOffset: number;
    targetOffset: number;
    minLastSegment: number;
    gridSize: number;
    jumpRadius: number;
    debug: boolean;
    debugPortHeatmap: boolean;
    strictOrthogonal: boolean;
} & Record<string, unknown>;

type SmartEdgeData = Record<string, unknown> & {
    _draggingNodeIds?: unknown;
    manualHandleSides?: unknown;
    inferredSubDomainHandles?: unknown;
    handleSelectionPolicy?: unknown;
    auto?: unknown;
    manualHandles?: unknown;
    _manualHandles?: unknown;
    runtimeHandleLock?: unknown;
    _runtimeHandleLock?: unknown;
    edgeConfig?: Partial<SmartEdgeConfig>;
    borderRadius?: unknown;
    layoutDirection?: unknown;
};

type ReactFlowStoreSnapshot = {
    edges?: Edge[];
    nodeLookup?: Map<string, SmartNode>;
};

type DiagramConfigSnapshot = {
    edge?: { handleSelectionPolicy?: unknown };
    layout?: { direction?: unknown };
};

type HandleFlagPair = { source: boolean; target: boolean };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isLayoutDirection = (value: unknown): value is LayoutDirection =>
    value === 'LR' || value === 'RL' || value === 'TB' || value === 'BT';

const getEdgeData = (data: unknown): SmartEdgeData =>
    isRecord(data) ? data as SmartEdgeData : {};

const getConfigSnapshot = (): DiagramConfigSnapshot => {
    try {
        const config = diagramConfigManager.getConfig();
        return isRecord(config) ? config as DiagramConfigSnapshot : {};
    } catch {
        return {};
    }
};

const readHandlePair = (value: unknown): HandleFlagPair => {
    if (value === true) return { source: true, target: true };
    if (isRecord(value)) {
        return { source: Boolean(value.source), target: Boolean(value.target) };
    }
    return { source: false, target: false };
};

const _directionVoteCache = new Map<number, LayoutDirection>();

// Cache hemisphere buckets per topology/source/target and select the current edge later.
type EdgeListCache = { outgoingBuckets: Record<string, string[]>; incomingBuckets: Record<string, string[]> };
const _multiEdgeListCache = new Map<string, EdgeListCache>();
let _multiEdgeListCacheTopoSig: number = -1;
/**
 * Return type for useSmartEdgeContext hook
 */
export interface SmartEdgeContextResult {
    layoutDirection: LayoutDirection;
    isExplicitLayoutDirection: boolean;
    multiEdgeInfo: {
        isManyToOne: boolean;
        isOneToMany: boolean;
        incomingCount: number;
        outgoingCount: number;
        incomingIndex: number;
        outgoingIndex: number;
        enableBus: boolean;
    };
    centeredCoords: CenteredCoords;
    fallbackPositions: { sourcePos: Position; targetPos: Position };
    edgeConfig: SmartEdgeConfig;
    handleSelectionPolicy: string;
    respectSourceHandle: boolean;
    respectTargetHandle: boolean;
    isReverseEdge: boolean;
    nodesDragging: boolean;
    sourceHandleId?: string | null;
    targetHandleId?: string | null;
    // 🚀 [PERF] 暴露内部数据，避免边组件重复订阅
    storeEdges: Edge[];
    simpleNodeMap: Map<string, SimpleNodeData>;
}

/**
 * Centralised hook that gathers all smart‑edge related calculations.
 */
export function useSmartEdgeContext(props: EdgeProps): SmartEdgeContextResult {
    const {
        id,
        source,
        target,
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourceHandleId: rawSourceHandleId,
        targetHandleId: rawTargetHandleId,
    } = props;
    const edgeData = getEdgeData(props.data);

    // ---------- Hooks (Top Level) ----------
    const simpleNodeMap = useSimpleNodeMap();
    const storeEdges: Edge[] = useStore(useCallback((s: ReactFlowStoreSnapshot) => s.edges ?? [], []));
    const storeEdgesRef = useRef(storeEdges);
    storeEdgesRef.current = storeEdges;

    // 🚀 [PERF] 连接拓扑签名：仅在边的连接关系变化时才重算 multiEdgeInfo
    // storeEdges 引用在拖拽时因 _dragUpdate 频繁变化，但 multiEdgeInfo 只关心 id/source/target
    // [PERF-2] 改用 djb2 滚动哈希替代字符串 join：相同 O(E) 计算，
    //   但不产生中间字符串数组和超长拼接字符串，消除拖拽时的 GC 压力。
    const edgeTopologySig = useMemo(() => {
        let h = 5381;
        for (const e of storeEdges) {
            if (e.id) for (let i = 0; i < e.id.length; i++)     h = (h * 33) ^ e.id.charCodeAt(i);
            if (e.source) for (let i = 0; i < e.source.length; i++) h = (h * 33) ^ e.source.charCodeAt(i);
            if (e.target) for (let i = 0; i < e.target.length; i++) h = (h * 33) ^ e.target.charCodeAt(i);
        }
        return h >>> 0; // unsigned 32-bit integer
    }, [storeEdges]);

    const endpointFanCounts = useMemo(() => {
        void edgeTopologySig;
        let outgoingFromSource = 0;
        let incomingToTarget = 0;
        for (const e of storeEdgesRef.current) {
            if (e.source === source) outgoingFromSource += 1;
            if (e.target === target) incomingToTarget += 1;
        }
        return { outgoingFromSource, incomingToTarget };
    }, [edgeTopologySig, source, target]);
    // 🚀 [PERF] 使用 nodeLookup 精准订阅替代 useNodes() 全量订阅
    // useNodes() 每条边都订阅全量节点数组 → O(N×E) 重算
    // nodeLookup.get() 只获取需要的 2 个节点 → O(1)
    const nodeLookup = useStore(useCallback((s: ReactFlowStoreSnapshot) => s.nodeLookup, []));

    // 精准获取 source/target 节点（InternalNodeBase 含 internals.positionAbsolute）
    const sourceNodeInternal = nodeLookup?.get(source);
    const targetNodeInternal = nodeLookup?.get(target);

    // [FIX] 稳定化节点引用 —— 只在路由相关字段（位置/尺寸/拖拽）变化时创建新对象
    // 忽略 selected 等无关属性变化，避免触发 centeredCoords → Worker 不必要的重算
    const sourceNodeRef = useRef<SmartNode | undefined>(undefined);
    const sourceNode = useMemo(() => {
        if (!sourceNodeInternal) { sourceNodeRef.current = undefined; return undefined; }
        const n = sourceNodeInternal;
        const posAbs = n.internals?.positionAbsolute ?? n.positionAbsolute;
        const prev = sourceNodeRef.current;
        if (prev &&
            prev.positionAbsolute?.x === posAbs?.x &&
            prev.positionAbsolute?.y === posAbs?.y &&
            prev.width === n.width && prev.height === n.height &&
            prev.measured?.width === n.measured?.width &&
            prev.measured?.height === n.measured?.height &&
            prev.dragging === n.dragging) {
            return prev;
        }
        const result = { ...n, positionAbsolute: posAbs };
        sourceNodeRef.current = result;
        return result;
    }, [sourceNodeInternal]);

    const targetNodeRef = useRef<SmartNode | undefined>(undefined);
    const targetNode = useMemo(() => {
        if (!targetNodeInternal) { targetNodeRef.current = undefined; return undefined; }
        const n = targetNodeInternal;
        const posAbs = n.internals?.positionAbsolute ?? n.positionAbsolute;
        const prev = targetNodeRef.current;
        if (prev &&
            prev.positionAbsolute?.x === posAbs?.x &&
            prev.positionAbsolute?.y === posAbs?.y &&
            prev.width === n.width && prev.height === n.height &&
            prev.measured?.width === n.measured?.width &&
            prev.measured?.height === n.measured?.height &&
            prev.dragging === n.dragging) {
            return prev;
        }
        const result = { ...n, positionAbsolute: posAbs };
        targetNodeRef.current = result;
        return result;
    }, [targetNodeInternal]);

    // 🚀 [PERF] getAbsPos 直接使用 nodeLookup Map，无需每条边重建
    const getAbsPos = useMemo(
        () => createSmartEdgeAbsolutePositionResolver(nodeLookup, simpleNodeMap),
        [nodeLookup, simpleNodeMap],
    );

    // Detect dragging state from live node objects
    // [FIX] Priority to _draggingNodeIds from props.data which updates in real-time during drag
    const draggingIds = Array.isArray(edgeData._draggingNodeIds)
        ? edgeData._draggingNodeIds.filter((value): value is string => typeof value === 'string')
        : undefined;
    const isSourceDragging = draggingIds?.includes(source);
    const isTargetDragging = draggingIds?.includes(target);

    // Combine with store state for robustness
    const nodesDragging = !!(isSourceDragging || isTargetDragging || sourceNode?.dragging || targetNode?.dragging);

    const { sourceHandleId, targetHandleId } = useMemo(
        () => resolveSmartEdgeHandleSelection({
            rawSourceHandleId,
            rawTargetHandleId,
            manualHandleSides: edgeData.manualHandleSides,
            inferredSubDomainHandles: edgeData.inferredSubDomainHandles,
            sourceNode,
            targetNode,
            sourceX,
            sourceY,
            targetX,
            targetY,
            incomingToTarget: endpointFanCounts.incomingToTarget,
            outgoingFromSource: endpointFanCounts.outgoingFromSource,
        }),
        [edgeData, rawSourceHandleId, rawTargetHandleId, sourceNode, sourceX, sourceY, targetNode, targetX, targetY, endpointFanCounts],
    );

    const handleSelectionPolicy = useMemo(() => {
        const layered = (() => {
            try {
                return LayeredConfigManager.getInstance().get<string | undefined>('diagram.edge.handleSelectionPolicy', undefined);
            } catch {
                return undefined;
            }
        })();
        const fromCfg = (() => {
            try {
                return getConfigSnapshot().edge?.handleSelectionPolicy;
            } catch {
                return undefined;
            }
        })();
        const fromEdge = edgeData.handleSelectionPolicy;
        return String(fromEdge ?? layered ?? fromCfg ?? 'respect').toLowerCase();
    }, [edgeData]);

    // Handle Auto Flags
    const autoFlags = useMemo(() => {
        const flags = edgeData.auto;
        return {
            autoSource: Array.isArray(flags) && flags.includes('source'),
            autoTarget: Array.isArray(flags) && flags.includes('target'),
        };
    }, [edgeData]);

    const manualFlags = useMemo(() => {
        const raw = edgeData.manualHandles ?? edgeData._manualHandles;
        const bySide = edgeData.manualHandleSides;
        if (Array.isArray(bySide)) {
            const list = bySide.map((x) => String(x).toLowerCase());
            return { manualSource: list.includes('source'), manualTarget: list.includes('target') };
        }
        if (raw === true) return { manualSource: true, manualTarget: true };
        if (isRecord(raw)) {
            return { manualSource: Boolean(raw.source), manualTarget: Boolean(raw.target) };
        }
        return { manualSource: false, manualTarget: false };
    }, [edgeData]);

    const runtimeHandleLock = useMemo(() => {
        return readHandlePair(edgeData.runtimeHandleLock ?? edgeData._runtimeHandleLock);
    }, [edgeData]);

    const respectSourceHandle = Boolean(sourceHandleId)
        && (runtimeHandleLock.source || (manualFlags.manualSource && !autoFlags.autoSource));

    const respectTargetHandle = Boolean(targetHandleId)
        && (runtimeHandleLock.target || (manualFlags.manualTarget && !autoFlags.autoTarget));

    // ---------- 0️⃣ Edge configuration ----------
    const edgeConfig = useMemo(() => {
        const strictOverride = edgeData.edgeConfig?.strictOrthogonal !== false;
        const dataBorderRadius = Number(edgeData.borderRadius);
        const defaultBorderRadius = Number.isFinite(dataBorderRadius)
            ? Math.max(0, dataBorderRadius)
            : 8;

        const DEFAULT_EDGE_CONFIG = {
            bundleStrength: 0.6,
            maxBundleSize: 6,
            obstaclePadding: 2,
            labelCollisionOffset: 8,
            jitterThresholdMultiplier: 2,
            borderRadius: defaultBorderRadius,
            sourceOffset: 12, // Reduced from 25 for tighter handle connection
            targetOffset: 15, // Reduced from 35 for tighter handle connection
            minLastSegment: 15, // Reduced from 30 for tighter handle connection
            gridSize: 15,
            jumpRadius: 10,
            debug: false,
            debugPortHeatmap: false,
            strictOrthogonal: strictOverride
        };
        return { ...DEFAULT_EDGE_CONFIG, ...(edgeData.edgeConfig ?? {}) };
    }, [edgeData]);

    // ---------- 1️⃣ Layout direction inference ----------
    const isExplicitLayoutDirection = useMemo(() => {
        if (!respectSourceHandle || !respectTargetHandle) {
            return isLayoutDirection(edgeData.layoutDirection);
        }
        const sHandle = String(sourceHandleId || '').toLowerCase();
        const tHandle = String(targetHandleId || '').toLowerCase();
        if ((sHandle === 'r' && tHandle === 'l') || (sHandle === 'l' && tHandle === 'r')) return true;
        if ((sHandle === 'b' && tHandle === 't') || (sHandle === 't' && tHandle === 'b')) return true;
        if (isLayoutDirection(edgeData.layoutDirection)) return true;
        return false;
    }, [sourceHandleId, targetHandleId, edgeData, respectSourceHandle, respectTargetHandle]);

    const layoutDirection = useMemo((): LayoutDirection => {
        if (respectSourceHandle && respectTargetHandle) {
            const sDir = parseHandlePosition(sourceHandleId);
            const tDir = parseHandlePosition(targetHandleId);

            if (sDir && tDir) {
                if ((sDir === Position.Right && tDir === Position.Left) || (sDir === Position.Left && tDir === Position.Right)) {
                    return sDir === Position.Right ? 'LR' : 'RL';
                }
                if ((sDir === Position.Bottom && tDir === Position.Top) || (sDir === Position.Top && tDir === Position.Bottom)) {
                    return sDir === Position.Bottom ? 'TB' : 'BT';
                }
            }
        }

        const sourceNode = simpleNodeMap.get(source);
        const targetNode = simpleNodeMap.get(target);
        let dx: number, dy: number;
        if (sourceNode && targetNode) {
            const sAbs = getAbsPos(source);
            const tAbs = getAbsPos(target);
            const sW = sourceNode.width || sourceNode.measured?.width || 0;
            const sH = sourceNode.height || sourceNode.measured?.height || 0;
            const tW = targetNode.width || targetNode.measured?.width || 0;
            const tH = targetNode.height || targetNode.measured?.height || 0;
            const sCx = sAbs.x + sW / 2;
            const sCy = sAbs.y + sH / 2;
            const tCx = tAbs.x + tW / 2;
            const tCy = tAbs.y + tH / 2;
            dx = tCx - sCx;
            dy = tCy - sCy;
        } else {
            dx = targetX - sourceX;
            dy = targetY - sourceY;
        }

        if (Number.isFinite(dx) && Number.isFinite(dy) && (Math.abs(dx) + Math.abs(dy) > 0)) {
            if (Math.abs(dy) > Math.abs(dx)) {
                return dy > 0 ? 'TB' : 'BT';
            }
            return dx > 0 ? 'LR' : 'RL';
        }

        if (isLayoutDirection(edgeData.layoutDirection)) {
            return edgeData.layoutDirection;
        }

        const globalDir = getConfigSnapshot().layout?.direction;
        if (isLayoutDirection(globalDir)) {
            return globalDir;
        }

        return 'LR';
    }, [sourceHandleId, targetHandleId, edgeData, source, target, sourceX, sourceY, targetX, targetY, simpleNodeMap, respectSourceHandle, respectTargetHandle, getAbsPos]);

    // ---------- 1.2️⃣ Directionality (Reverse Check) ----------
    // [FIX] Use **global** layout direction as baseline for reverse detection,
    // NOT the per-edge inferred `layoutDirection` which self-defeats:
    // e.g. a bottom→top edge infers BT, making target-above-source "forward" in BT.
    // [FIX C-6] O(E²)→O(E)：全局方向投票不再依赖 storeEdges（每帧引用变化），
    // 改为仅依赖 edgeTopologySig（连接关系字符串签名），同一渲染批次内只计算一次。
    // 使用模块级缓存：相同签名复用上次结果，避免每条边组件重复投票。
    const edgeLayoutDirectionOverride = edgeData.layoutDirection;
    const globalBaseDirection = useMemo((): LayoutDirection => {
        // Priority 1: Explicit edge-level override（每条边可独立覆盖）
        const edgeDir = edgeLayoutDirectionOverride;
        if (isLayoutDirection(edgeDir)) return edgeDir;

        // Priority 2: 基于拓扑签名缓存的多数投票
        // 签名相同 → 返回上次缓存结果，无需重新遍历所有边
        const cached = _directionVoteCache.get(edgeTopologySig);
        if (cached) return cached;

        let result: 'LR' | 'RL' | 'TB' | 'BT' = 'TB';
        const topologyEdges = storeEdgesRef.current;
        if (topologyEdges.length > 0) {
            const votes = { TB: 0, BT: 0, LR: 0, RL: 0 };
            for (const e of topologyEdges) {
                const sAbs = getAbsPos(e.source);
                const tAbs = getAbsPos(e.target);
                const dx = tAbs.x - sAbs.x;
                const dy = tAbs.y - sAbs.y;
                if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                    if (Math.abs(dy) > Math.abs(dx)) {
                        if (dy > 0) votes.TB++; else votes.BT++;
                    } else {
                        if (dx > 0) votes.LR++; else votes.RL++;
                    }
                }
            }
            let maxVotes = -1;
            for (const [dir, count] of Object.entries(votes)) {
                if (count > maxVotes && isLayoutDirection(dir)) { maxVotes = count; result = dir; }
            }
        }

        // Priority 3: Global diagram config fallback
        if (result === 'TB') {
            try {
                const globalDir = getConfigSnapshot().layout?.direction;
                if (isLayoutDirection(globalDir)) {
                    result = globalDir;
                }
            } catch { /* keep TB */ }
        }

        // 缓存本次结果（限制缓存大小，避免内存泄漏）
        if (_directionVoteCache.size > 20) _directionVoteCache.clear();
        _directionVoteCache.set(edgeTopologySig, result);
        return result;
    }, [edgeLayoutDirectionOverride, edgeTopologySig, getAbsPos]);
    const isReverseEdge = useMemo(() => {
        const sourceNode = simpleNodeMap.get(source);
        const targetNode = simpleNodeMap.get(target);
        // Use the global baseline direction, not per-edge inferred direction
        const refDir = globalBaseDirection;
        let geomReverse = false;

        const { dx, dy } = sourceNode && targetNode ? (() => {
            const sAbs = getAbsPos(source);
            const tAbs = getAbsPos(target);
            return { dx: tAbs.x - sAbs.x, dy: tAbs.y - sAbs.y };
        })() : {
            dx: targetX - sourceX,
            dy: targetY - sourceY,
        };

        // [FIX] Industry Standard Projection Verification
        // An edge is only a Reverse Edge (U-Turn Feedback Loop) if its vector opposes the baseline direction
        // AND this backward displacement mathematically dominates the orthogonal (cross-flow) delta.
        // A strictly vertical jump (dy=200, dx=-1) in an 'LR' layout is purely orthogonal, NOT reversed!
        if (refDir === 'TB') {
            geomReverse = dy < 0 && Math.abs(dy) > Math.abs(dx);
        } else if (refDir === 'BT') {
            geomReverse = dy > 0 && Math.abs(dy) > Math.abs(dx);
        } else if (refDir === 'LR') {
            geomReverse = dx < 0 && Math.abs(dx) > Math.abs(dy);
        } else if (refDir === 'RL') {
            geomReverse = dx > 0 && Math.abs(dx) > Math.abs(dy);
        }

        // [FIX] same-handle-side alone is NOT sufficient to declare a reverse edge.
        // Default node templates often have top/bottom handles on all nodes; treating
        // every same-side pair as a U-Turn feedback loop causes widespread bypass misfire.
        // Requirement: handle directions must CORROBORATE geomReverse, not override it.
        const result = geomReverse || (() => {
            const sDir = parseHandlePosition(sourceHandleId);
            const tDir = parseHandlePosition(targetHandleId);
            if (sDir && tDir && sDir === tDir) {
                const isHorizontal = sDir === Position.Left || sDir === Position.Right;
                // Only treat same-side horizontal handles as reverse in LR/RL when geometry
                // also confirms backward displacement (geomReverse already calculated above).
                if (isHorizontal && ['LR', 'RL'].includes(refDir) && geomReverse) return true;
                // Same for vertical handles in TB/BT: require geometric confirmation.
                if (!isHorizontal && ['TB', 'BT'].includes(refDir) && geomReverse) return true;
            }
            return false;
        })();

        if (result) {
            // [FIX] Only log in development — avoids console flooding in production
            // (this runs inside useMemo, firing on every drag frame for each reverse edge)
            if (import.meta.env.DEV) {
                safeLog.debug(`[ReverseEdge] ${source}→${target} isReverse=TRUE  dx=${Math.round(dx)} dy=${Math.round(dy)} refDir=${refDir} geomReverse=${geomReverse} sHandle=${sourceHandleId} tHandle=${targetHandleId}`);
            }
        }
        return result;
    }, [sourceHandleId, targetHandleId, globalBaseDirection, source, target, simpleNodeMap, sourceX, sourceY, targetX, targetY, getAbsPos]);

    // ---------- 1.5️⃣ Smart Port Selection ----------
    // [FIX] Hysteresis for port selection.
    // Prevents flipping between port combinations when geometry is at boundary values.
    // Only accepts new ports if node positions changed by ≥ PORT_HYSTERESIS px.
    const lastSmartLayoutRef = useRef<{
        source: string; target: string;
        sx: number; sy: number; tx: number; ty: number;
        sourcePos: Position; targetPos: Position;
    } | null>(null);

    const smartLayout = useMemo(() => {
        const sNode = simpleNodeMap.get(source);
        const tNode = simpleNodeMap.get(target);

        if (sNode && tNode) {
            const sAbs = getAbsPos(source);
            const tAbs = getAbsPos(target);
            if (!Number.isFinite(sAbs.x) || !Number.isFinite(sAbs.y) || !Number.isFinite(tAbs.x) || !Number.isFinite(tAbs.y)) {
                return null;
            }
            const best = selectBestPortCombination(
                { ...sNode, x: sAbs.x, y: sAbs.y, position: sAbs, positionAbsolute: sAbs },
                { ...tNode, x: tAbs.x, y: tAbs.y, position: tAbs, positionAbsolute: tAbs },
                []
            );

            const getCoord = (abs: Point, n: SmartNode | SimpleNodeData, p: Position) => {
                const w = n.width || 0;
                const h = n.height || 0;
                const x = abs.x;
                const y = abs.y;
                if (p === Position.Top) return { x: x + w / 2, y };
                if (p === Position.Bottom) return { x: x + w / 2, y: y + h };
                if (p === Position.Left) return { x, y: y + h / 2 };
                return { x: x + w, y: y + h / 2 };
            };

            // [FIX] Hysteresis: if ports changed but positions barely moved, keep old ports
            const PORT_HYSTERESIS = 5; // px
            const prev = lastSmartLayoutRef.current;
            if (prev && prev.source === source && prev.target === target) {
                const posDelta = Math.abs(sAbs.x - prev.sx) + Math.abs(sAbs.y - prev.sy)
                              + Math.abs(tAbs.x - prev.tx) + Math.abs(tAbs.y - prev.ty);

                if (posDelta < PORT_HYSTERESIS &&
                    (best.sourcePos !== prev.sourcePos || best.targetPos !== prev.targetPos)) {
                    // Positions barely changed but ports flipped → keep old ports
                    return {
                        sourcePos: prev.sourcePos,
                        targetPos: prev.targetPos,
                        sourceX: getCoord(sAbs, sNode, prev.sourcePos).x,
                        sourceY: getCoord(sAbs, sNode, prev.sourcePos).y,
                        targetX: getCoord(tAbs, tNode, prev.targetPos).x,
                        targetY: getCoord(tAbs, tNode, prev.targetPos).y
                    };
                }
            }

            // Accept new ports and cache
            lastSmartLayoutRef.current = {
                source, target,
                sx: sAbs.x, sy: sAbs.y, tx: tAbs.x, ty: tAbs.y,
                sourcePos: best.sourcePos, targetPos: best.targetPos
            };

            return {
                sourcePos: best.sourcePos,
                targetPos: best.targetPos,
                sourceX: getCoord(sAbs, sNode, best.sourcePos).x,
                sourceY: getCoord(sAbs, sNode, best.sourcePos).y,
                targetX: getCoord(tAbs, tNode, best.targetPos).x,
                targetY: getCoord(tAbs, tNode, best.targetPos).y
            };
        }
        return null;
    }, [source, target, simpleNodeMap, getAbsPos]);

    // ---------- 2️⃣ Edge grouping info ----------
    // [P1-2] 使用模块级缓存，相同拓扑签名下 outgoing/incoming 列表只计算一次，
    // 避免 E 条边各自对 storeEdges 做 O(E) forEach（总计 O(E²)）。
    const multiEdgeInfo = useMemo(() => {
        // 当拓扑签名变化时，清空旧缓存，防止无限增长
        if (_multiEdgeListCacheTopoSig !== edgeTopologySig) {
            _multiEdgeListCache.clear();
            _multiEdgeListCacheTopoSig = edgeTopologySig;
        }

        const cacheKey = `${source}:${target}`;
        let cached = _multiEdgeListCache.get(cacheKey);

        if (!cached) {
            const sourceNodeStatic = simpleNodeMap.get(source);
            const targetNodeStatic = simpleNodeMap.get(target);
            const topologyEdges = storeEdgesRef.current;

            const classifyDirection = (from: SmartNode | SimpleNodeData, to: SmartNode | SimpleNodeData): DirectionBucket | null => {
                if (!from || !to) return null;
                const fw = from.width || 0; const fh = from.height || 0;
                const tw = to.width || 0;   const th = to.height || 0;
                const fromAbs = from.id ? getAbsPos(from.id) : undefined;
                const toAbs = to.id ? getAbsPos(to.id) : undefined;
                const fx = fromAbs?.x ?? from.x ?? 0; const fy = fromAbs?.y ?? from.y ?? 0;
                const tx = toAbs?.x ?? to.x ?? 0;     const ty = toAbs?.y ?? to.y ?? 0;
                const cx1 = fx + fw / 2;    const cy1 = fy + fh / 2;
                const cx2 = tx + tw / 2;    const cy2 = ty + th / 2;
                const dx = cx2 - cx1;       const dy = cy2 - cy1;
                if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
                const ax = Math.abs(dx);    const ay = Math.abs(dy);
                if (ax < 1 && ay < 1) return null;
                if (ay > ax * 1.5) return dy >= 0 ? 'down' : 'up';
                if (ax > ay * 1.5) return dx >= 0 ? 'right' : 'left';
                const isVL = layoutDirection === 'TB' || layoutDirection === 'BT';
                const isHL = layoutDirection === 'LR' || layoutDirection === 'RL';
                if (isVL && ay >= ax * 0.5) return dy >= 0 ? 'down' : 'up';
                if (isHL && ax >= ay * 0.5) return dx >= 0 ? 'right' : 'left';
                return null;
            };

            const outgoingBuckets: Record<string, string[]> = {};
            const incomingBuckets: Record<string, string[]> = {};

            if (sourceNodeStatic) {
                topologyEdges.forEach((e) => {
                    if (e.source !== source) return;
                    const tNode = simpleNodeMap.get(e.target);
                    const dir = tNode ? classifyDirection(sourceNodeStatic, tNode) : null;
                    if (!dir) return;
                    if (!outgoingBuckets[dir]) outgoingBuckets[dir] = [];
                    outgoingBuckets[dir].push(e.id);
                });
            }

            if (targetNodeStatic) {
                topologyEdges.forEach((e) => {
                    if (e.target !== target) return;
                    const sNode = simpleNodeMap.get(e.source);
                    const dir = sNode ? classifyDirection(sNode, targetNodeStatic) : null;
                    if (!dir) return;
                    if (!incomingBuckets[dir]) incomingBuckets[dir] = [];
                    incomingBuckets[dir].push(e.id);
                });
            }

            if (Object.keys(outgoingBuckets).length === 0) {
                const allOutgoing = topologyEdges.filter(e => e.source === source).map(e => e.id).sort();
                if (allOutgoing.length > 1) outgoingBuckets.all = allOutgoing;
            } else {
                Object.keys(outgoingBuckets).forEach((key) => {
                    outgoingBuckets[key] = [...outgoingBuckets[key]].sort();
                });
            }

            if (Object.keys(incomingBuckets).length === 0) {
                const allIncoming = topologyEdges.filter(e => e.target === target).map(e => e.id).sort();
                if (allIncoming.length > 1) incomingBuckets.all = allIncoming;
            } else {
                Object.keys(incomingBuckets).forEach((key) => {
                    incomingBuckets[key] = [...incomingBuckets[key]].sort();
                });
            }

            cached = { outgoingBuckets, incomingBuckets };
            _multiEdgeListCache.set(cacheKey, cached);
        }

        const pickCurrentHemisphere = (buckets: Record<string, string[]>, currentId: string) => {
            const containing = Object.values(buckets).find(list => list.includes(currentId));
            if (containing) return containing.length > 1 ? containing : [];
            return [];
        };

        const outgoingList = pickCurrentHemisphere(cached.outgoingBuckets, id);
        const incomingList = pickCurrentHemisphere(cached.incomingBuckets, id);
        const isManyToOne = incomingList.length > 1;
        const isOneToMany = outgoingList.length > 1;

        return {
            isManyToOne,
            isOneToMany,
            incomingCount: incomingList.length,
            outgoingCount: outgoingList.length,
            // id-specific index computed here (not cached, O(1))
            incomingIndex: Math.max(0, incomingList.indexOf(id)),
            outgoingIndex: Math.max(0, outgoingList.indexOf(id)),
            enableBus: isManyToOne || isOneToMany,
        };
    // [FIX] Removed storeEdges from deps — edgeTopologySig already captures topology changes.
    // storeEdges reference changes on every selection change (selected property),
    // causing unnecessary multiEdgeInfo recalculation and cascading re-renders.
    }, [edgeTopologySig, source, target, id, simpleNodeMap, layoutDirection, getAbsPos]);

    // ---------- 3️⃣ Centered coordinates ----------
    const centeredCoords = useMemo(() => buildSmartEdgeCenteredCoords({
        nodesDragging,
        source,
        target,
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourceNode,
        targetNode,
        sourceHandleId,
        targetHandleId,
        sourcePosition: props.sourcePosition,
        targetPosition: props.targetPosition,
        simpleNodeMap,
        smartLayout,
        multiEdgeInfo,
        layoutDirection,
        respectSourceHandle,
        respectTargetHandle,
        getAbsolutePosition: getAbsPos,
    }), [
        nodesDragging,
        sourceNode, targetNode,
        source, target,
        sourceX, sourceY, targetX, targetY,
        sourceHandleId, targetHandleId,
        props.sourcePosition, props.targetPosition,
        simpleNodeMap, smartLayout,
        multiEdgeInfo, layoutDirection,
        respectSourceHandle, respectTargetHandle,
        getAbsPos,
    ]);

    const fallbackPositions = useMemo(() => resolveSmartEdgeFallbackPositions({
        layoutDirection,
        sourcePosition: props.sourcePosition,
        targetPosition: props.targetPosition,
        sourceHandleId,
        targetHandleId,
        smartLayout,
        respectSourceHandle,
        respectTargetHandle,
    }), [
        layoutDirection,
        props.sourcePosition,
        props.targetPosition,
        sourceHandleId,
        targetHandleId,
        smartLayout,
        respectSourceHandle,
        respectTargetHandle,
    ]);
    return {
        layoutDirection,
        isExplicitLayoutDirection,
        multiEdgeInfo,
        centeredCoords,
        fallbackPositions,
        edgeConfig,
        handleSelectionPolicy,
        respectSourceHandle,
        respectTargetHandle,
        isReverseEdge,
        nodesDragging, // [NEW] Exported for Jitter control
        sourceHandleId,
        targetHandleId,
        // 🚀 [PERF] 暴露内部数据，避免 AdvancedSmartEdge 重复订阅
        storeEdges,
        simpleNodeMap,
    };
}
