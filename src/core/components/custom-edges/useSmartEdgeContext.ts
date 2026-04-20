// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/custom-edges/useSmartEdgeContext.ts
import { useMemo, useCallback, useRef } from 'react';
import { useStore } from '@xyflow/react';
import type { EdgeProps, Edge } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { useSimpleNodeMap } from '../../hooks/useNodeMap';
import { getConvergencePositions } from './convergencePositions';
import { selectBestPortCombination } from '../../algorithms/smartEdgeUtils';
import { diagramConfigManager } from '../config/DiagramConfig';
import { LayeredConfigManager } from '../../config/LayeredConfigManager';
import type { CenteredCoords } from './hooks/useSmartPathWorker';

// [FIX C-6] 模块级方向投票缓存：相同拓扑签名 → 复用计算结果，避免每条边重复 O(E) 计算。
// 整个应用生命周期内 key 数量 << 20，不存在内存泄漏风险（每次签名变化 clear 一次）。
const _directionVoteCache = new Map<string, 'LR' | 'RL' | 'TB' | 'BT'>();


/**
 * Return type for useSmartEdgeContext hook
 */
export interface SmartEdgeContextResult {
    layoutDirection: 'LR' | 'RL' | 'TB' | 'BT';
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
    edgeConfig: any;
    handleSelectionPolicy: string;
    respectSourceHandle: boolean;
    respectTargetHandle: boolean;
    isReverseEdge: boolean;
    nodesDragging: boolean;
    // 🚀 [PERF] 暴露内部数据，避免边组件重复订阅
    storeEdges: Edge[];
    simpleNodeMap: Map<string, any>;
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
        sourceHandleId,
        targetHandleId,
    } = props;

    // Helper to parse handle direction from ID
    const parseHandleDirection = (handleId?: string | null): Position | undefined => {
        if (!handleId) return undefined;
        const h = handleId.toLowerCase();
        if (h.startsWith('t') || h.includes('-top') || h.includes('top-')) return Position.Top;
        if (h.startsWith('b') || h.includes('-bottom') || h.includes('bottom-')) return Position.Bottom;
        if (h.startsWith('l') || h.includes('-left') || h.includes('left-')) return Position.Left;
        if (h.startsWith('r') || h.includes('-right') || h.includes('right-')) return Position.Right;
        return undefined;
    };

    // ---------- Hooks (Top Level) ----------
    const simpleNodeMap = useSimpleNodeMap();
    const storeEdges: Edge[] = useStore(useCallback((s: any) => s.edges, []));

    // 🚀 [PERF] 连接拓扑签名：仅在边的连接关系变化时才重算 multiEdgeInfo
    // storeEdges 引用在拖拽时因 _dragUpdate 频繁变化，但 multiEdgeInfo 只关心 id/source/target
    const edgeTopologySig = useMemo(() => {
        return storeEdges.map((e: Edge) => `${e.id}:${e.source}>${e.target}`).join('|');
    }, [storeEdges]);

    // 🚀 [PERF] 使用 nodeLookup 精准订阅替代 useNodes() 全量订阅
    // useNodes() 每条边都订阅全量节点数组 → O(N×E) 重算
    // nodeLookup.get() 只获取需要的 2 个节点 → O(1)
    const nodeLookup = useStore(useCallback((s: any) => s.nodeLookup, []));

    // 精准获取 source/target 节点（InternalNodeBase 含 internals.positionAbsolute）
    const sourceNodeInternal = nodeLookup?.get(source);
    const targetNodeInternal = nodeLookup?.get(target);

    // [FIX] 稳定化节点引用 —— 只在路由相关字段（位置/尺寸/拖拽）变化时创建新对象
    // 忽略 selected 等无关属性变化，避免触发 centeredCoords → Worker 不必要的重算
    const sourceNodeRef = useRef<any>(undefined);
    const sourceNode = useMemo(() => {
        if (!sourceNodeInternal) { sourceNodeRef.current = undefined; return undefined; }
        const n = sourceNodeInternal as any;
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

    const targetNodeRef = useRef<any>(undefined);
    const targetNode = useMemo(() => {
        if (!targetNodeInternal) { targetNodeRef.current = undefined; return undefined; }
        const n = targetNodeInternal as any;
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
    const getAbsPos = useMemo(() => {
        const resolve = (nodeLike: any, visited?: Set<string>): { x: number; y: number } => {
            const abs = nodeLike?.internals?.positionAbsolute || nodeLike?.computed?.positionAbsolute || nodeLike?.positionAbsolute;
            if (abs) return abs;
            const base = nodeLike?.position || { x: nodeLike?.x ?? 0, y: nodeLike?.y ?? 0 };
            const parentId = nodeLike?.parentId || nodeLike?.parentNode;
            if (!parentId) return base;
            const v = visited || new Set<string>();
            const myId = String(nodeLike?.id ?? '');
            if (myId && v.has(myId)) return base;
            if (myId) v.add(myId);
            const parent = nodeLookup?.get(String(parentId)) || simpleNodeMap.get(String(parentId));
            if (!parent) return base;
            const pAbs = resolve(parent, v);
            return { x: pAbs.x + (base.x ?? 0), y: pAbs.y + (base.y ?? 0) };
        };

        return (id: string): { x: number; y: number } => {
            const live = nodeLookup?.get(String(id));
            if (live) return resolve(live);
            const n = simpleNodeMap.get(id);
            if (n) return resolve(n);
            return { x: 0, y: 0 };
        };
    }, [nodeLookup, simpleNodeMap]);

    // Detect dragging state from live node objects
    // [FIX] Priority to _draggingNodeIds from props.data which updates in real-time during drag
    const draggingIds = (props.data as any)?._draggingNodeIds as string[] | undefined;
    const isSourceDragging = draggingIds?.includes(source);
    const isTargetDragging = draggingIds?.includes(target);

    // Combine with store state for robustness
    const nodesDragging = !!(isSourceDragging || isTargetDragging || sourceNode?.dragging || targetNode?.dragging);

    const handleSelectionPolicy = useMemo(() => {
        const layered = (() => {
            try {
                return LayeredConfigManager.getInstance().get<string>('diagram.edge.handleSelectionPolicy', undefined as any);
            } catch {
                return undefined;
            }
        })();
        const fromCfg = (() => {
            try {
                return (diagramConfigManager.getConfig() as any)?.edge?.handleSelectionPolicy;
            } catch {
                return undefined;
            }
        })();
        const fromEdge = (props.data as any)?.handleSelectionPolicy;
        return String(fromEdge ?? layered ?? fromCfg ?? 'respect').toLowerCase();
    }, [props.data]);

    const forceCostHandles = useMemo(() => {
        return handleSelectionPolicy.includes('force') && handleSelectionPolicy.includes('cost');
    }, [handleSelectionPolicy]);

    // Handle Auto Flags
    const autoFlags = useMemo(() => {
        const flags = (props.data as any)?.auto || [];
        return {
            autoSource: Array.isArray(flags) && flags.includes('source'),
            autoTarget: Array.isArray(flags) && flags.includes('target'),
        };
    }, [props.data]);

    const manualFlags = useMemo(() => {
        const raw = (props.data as any)?.manualHandles ?? (props.data as any)?._manualHandles;
        const bySide = (props.data as any)?.manualHandleSides;
        if (Array.isArray(bySide)) {
            const list = bySide.map((x: any) => String(x).toLowerCase());
            return { manualSource: list.includes('source'), manualTarget: list.includes('target') };
        }
        if (raw === true) return { manualSource: true, manualTarget: true };
        if (raw && typeof raw === 'object') {
            return { manualSource: Boolean((raw as any).source), manualTarget: Boolean((raw as any).target) };
        }
        return { manualSource: false, manualTarget: false };
    }, [props.data]);

    const respectSourceHandle = Boolean(sourceHandleId)
        && manualFlags.manualSource
        && !forceCostHandles
        && !autoFlags.autoSource;

    const respectTargetHandle = Boolean(targetHandleId)
        && manualFlags.manualTarget
        && !forceCostHandles
        && !autoFlags.autoTarget;

    // ---------- 0️⃣ Edge configuration ----------
    const edgeConfig = useMemo(() => {
        const strictOverride = (props.data as any)?.edgeConfig?.strictOrthogonal !== false; // Default true based on user request

        const DEFAULT_EDGE_CONFIG = {
            bundleStrength: 0.6,
            maxBundleSize: 6,
            obstaclePadding: 2,
            labelCollisionOffset: 8,
            jitterThresholdMultiplier: 2,
            borderRadius: strictOverride ? 0 : 20, // 0 for strict orthogonal
            sourceOffset: 12, // Reduced from 25 for tighter handle connection
            targetOffset: 15, // Reduced from 35 for tighter handle connection
            minLastSegment: 15, // Reduced from 30 for tighter handle connection
            gridSize: 15,
            jumpRadius: 10,
            debug: false,
            debugPortHeatmap: false,
            strictOrthogonal: strictOverride
        };
        return { ...DEFAULT_EDGE_CONFIG, ...(props.data?.edgeConfig ?? {}) };
    }, [props.data?.edgeConfig]);

    // ---------- 1️⃣ Layout direction inference ----------
    const isExplicitLayoutDirection = useMemo(() => {
        if (!respectSourceHandle || !respectTargetHandle) {
            const edgeDir = (props.data as any)?.layoutDirection;
            return edgeDir === 'RL' || edgeDir === 'TB' || edgeDir === 'BT' || edgeDir === 'LR';
        }
        const sHandle = String(sourceHandleId || '').toLowerCase();
        const tHandle = String(targetHandleId || '').toLowerCase();
        if ((sHandle === 'r' && tHandle === 'l') || (sHandle === 'l' && tHandle === 'r')) return true;
        if ((sHandle === 'b' && tHandle === 't') || (sHandle === 't' && tHandle === 'b')) return true;
        const edgeDir = (props.data as any)?.layoutDirection;
        if (edgeDir === 'RL' || edgeDir === 'TB' || edgeDir === 'BT' || edgeDir === 'LR') return true;
        return false;
    }, [sourceHandleId, targetHandleId, props.data, respectSourceHandle, respectTargetHandle]);

    const layoutDirection = useMemo((): 'LR' | 'RL' | 'TB' | 'BT' => {
        if (respectSourceHandle && respectTargetHandle) {
            const sDir = parseHandleDirection(sourceHandleId);
            const tDir = parseHandleDirection(targetHandleId);

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

        const edgeDir = (props.data as any)?.layoutDirection;
        if (edgeDir === 'RL' || edgeDir === 'TB' || edgeDir === 'BT' || edgeDir === 'LR') {
            return edgeDir;
        }

        const globalDir = (diagramConfigManager.getConfig() as any)?.layout?.direction;
        if (globalDir === 'LR' || globalDir === 'RL' || globalDir === 'TB' || globalDir === 'BT') {
            return globalDir;
        }

        return 'LR';
    }, [sourceHandleId, targetHandleId, props.data, source, target, sourceX, sourceY, targetX, targetY, simpleNodeMap, respectSourceHandle, respectTargetHandle, getAbsPos]);

    // ---------- 1.2️⃣ Directionality (Reverse Check) ----------
    // [FIX] Use **global** layout direction as baseline for reverse detection,
    // NOT the per-edge inferred `layoutDirection` which self-defeats:
    // e.g. a bottom→top edge infers BT, making target-above-source "forward" in BT.
    // [FIX C-6] O(E²)→O(E)：全局方向投票不再依赖 storeEdges（每帧引用变化），
    // 改为仅依赖 edgeTopologySig（连接关系字符串签名），同一渲染批次内只计算一次。
    // 使用模块级缓存：相同签名复用上次结果，避免每条边组件重复投票。
    const globalBaseDirection = useMemo((): 'LR' | 'RL' | 'TB' | 'BT' => {
        // Priority 1: Explicit edge-level override（每条边可独立覆盖）
        const edgeDir = (props.data as any)?.layoutDirection;
        if (edgeDir === 'LR' || edgeDir === 'RL' || edgeDir === 'TB' || edgeDir === 'BT') return edgeDir;

        // Priority 2: 基于拓扑签名缓存的多数投票
        // 签名相同 → 返回上次缓存结果，无需重新遍历所有边
        const cached = _directionVoteCache.get(edgeTopologySig);
        if (cached) return cached;

        let result: 'LR' | 'RL' | 'TB' | 'BT' = 'TB';
        if (storeEdges && storeEdges.length > 0) {
            const votes = { TB: 0, BT: 0, LR: 0, RL: 0 };
            for (const e of storeEdges) {
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
                if (count > maxVotes) { maxVotes = count; result = dir as any; }
            }
        }

        // Priority 3: Global diagram config fallback
        if (result === 'TB') {
            try {
                const globalDir = (diagramConfigManager.getConfig() as any)?.layout?.direction;
                if (globalDir === 'LR' || globalDir === 'RL' || globalDir === 'TB' || globalDir === 'BT') {
                    result = globalDir;
                }
            } catch { /* keep TB */ }
        }

        // 缓存本次结果（限制缓存大小，避免内存泄漏）
        if (_directionVoteCache.size > 20) _directionVoteCache.clear();
        _directionVoteCache.set(edgeTopologySig, result);
        return result;
    }, [props.data, edgeTopologySig, storeEdges, getAbsPos]);


    const isReverseEdge = useMemo(() => {
        const sourceNode = simpleNodeMap.get(source);
        const targetNode = simpleNodeMap.get(target);
        // Use the global baseline direction, not per-edge inferred direction
        const refDir = globalBaseDirection;
        let geomReverse = false;

        let dx = 0;
        let dy = 0;

        if (sourceNode && targetNode) {
            const sAbs = getAbsPos(source);
            const tAbs = getAbsPos(target);
            dx = tAbs.x - sAbs.x;
            dy = tAbs.y - sAbs.y;
        } else {
            dx = targetX - sourceX;
            dy = targetY - sourceY;
        }

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

        if (geomReverse) return true;

        const sDir = parseHandleDirection(sourceHandleId);
        const tDir = parseHandleDirection(targetHandleId);

        if (sDir && tDir && sDir === tDir) {
            const isHorizontal = sDir === Position.Left || sDir === Position.Right;
            if (isHorizontal && ['LR', 'RL'].includes(refDir)) return true;
            if (!isHorizontal && ['TB', 'BT'].includes(refDir)) return true;
        }

        return false;
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

            const getCoord = (abs: { x: number; y: number }, n: any, p: Position) => {
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
    const multiEdgeInfo = useMemo(() => {
        const sourceNodeStatic = simpleNodeMap.get(source);
        const targetNodeStatic = simpleNodeMap.get(target);

        const classifyDirection = (from: any, to: any): string | null => {
            if (!from || !to) return null;
            const fw = from.width || 0;
            const fh = from.height || 0;
            const tw = to.width || 0;
            const th = to.height || 0;
            const fx = from.x ?? 0;
            const fy = from.y ?? 0;
            const tx = to.x ?? 0;
            const ty = to.y ?? 0;
            const cx1 = fx + fw / 2;
            const cy1 = fy + fh / 2;
            const cx2 = tx + tw / 2;
            const cy2 = ty + th / 2;
            const dx = cx2 - cx1;
            const dy = cy2 - cy1;
            if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
            const ax = Math.abs(dx);
            const ay = Math.abs(dy);
            if (ax < 1 && ay < 1) return null;

            if (ay > ax * 1.5) {
                return dy >= 0 ? 'down' : 'up';
            }
            if (ax > ay * 1.5) {
                return dx >= 0 ? 'right' : 'left';
            }

            const isVerticalLayout = layoutDirection === 'TB' || layoutDirection === 'BT';
            const isHorizontalLayout = layoutDirection === 'LR' || layoutDirection === 'RL';

            if (isVerticalLayout && ay >= ax * 0.5) {
                return dy >= 0 ? 'down' : 'up';
            }
            if (isHorizontalLayout && ax >= ay * 0.5) {
                return dx >= 0 ? 'right' : 'left';
            }
            return null;
        };

        const outgoingBuckets: Record<string, string[]> = {};
        const incomingBuckets: Record<string, string[]> = {};

        if (sourceNodeStatic) {
            storeEdges.forEach((e) => {
                if (e.source !== source) return;
                const tNode = simpleNodeMap.get(e.target);
                const dir = tNode ? classifyDirection(sourceNodeStatic, tNode) : null;
                if (!dir) return;
                if (!outgoingBuckets[dir]) outgoingBuckets[dir] = [];
                outgoingBuckets[dir].push(e.id);
            });
        }

        if (targetNodeStatic) {
            storeEdges.forEach((e) => {
                if (e.target !== target) return;
                const sNode = simpleNodeMap.get(e.source);
                const dir = sNode ? classifyDirection(sNode, targetNodeStatic) : null;
                if (!dir) return;
                if (!incomingBuckets[dir]) incomingBuckets[dir] = [];
                incomingBuckets[dir].push(e.id);
            });
        }

        let outgoingList: string[] = [];
        Object.values(outgoingBuckets).forEach((list) => {
            if (list.length > 1 && list.includes(id)) {
                const sorted = [...list].sort();
                if (sorted.length > outgoingList.length) {
                    outgoingList = sorted;
                }
            }
        });
        if (outgoingList.length === 0) {
            const allOutgoing = storeEdges
                .filter(e => e.source === source)
                .map(e => e.id)
                .sort();
            if (allOutgoing.length > 1 && allOutgoing.includes(id)) {
                outgoingList = allOutgoing;
            }
        }

        let incomingList: string[] = [];
        Object.values(incomingBuckets).forEach((list) => {
            if (list.length > 1 && list.includes(id)) {
                const sorted = [...list].sort();
                if (sorted.length > incomingList.length) {
                    incomingList = sorted;
                }
            }
        });
        if (incomingList.length === 0) {
            const allIncoming = storeEdges
                .filter(e => e.target === target)
                .map(e => e.id)
                .sort();
            if (allIncoming.length > 1 && allIncoming.includes(id)) {
                incomingList = allIncoming;
            }
        }

        const isManyToOne = incomingList.length > 1;
        const isOneToMany = outgoingList.length > 1;
        const enableBus = isManyToOne || isOneToMany;

        return {
            isManyToOne,
            isOneToMany,
            incomingCount: incomingList.length,
            outgoingCount: outgoingList.length,
            incomingIndex: incomingList.indexOf(id) >= 0 ? incomingList.indexOf(id) : 0,
            outgoingIndex: outgoingList.indexOf(id) >= 0 ? outgoingList.indexOf(id) : 0,
            enableBus,
        };
    // [FIX] Removed storeEdges from deps — edgeTopologySig already captures topology changes.
    // storeEdges reference changes on every selection change (selected property),
    // causing unnecessary multiEdgeInfo recalculation and cascading re-renders.
    }, [edgeTopologySig, source, target, id, simpleNodeMap, layoutDirection]);

    // ---------- 3️⃣ Centered coordinates ----------
    const centeredCoords = useMemo(() => {
        // [FIX] Removed livePositions dependency. 
        // We now rely on 'sourceNode' and 'targetNode' derived from useNodes(), 
        // which provides live positions during drag without needing ref hacks.

        // [FIX] Helper to calculate handle position
        const calcHandlePos = (
            node: any,
            defaultX: number,
            defaultY: number,
            handleId?: string | null,
            defaultPosition?: Position
        ) => {
            if (!node) return { pos: { x: defaultX, y: defaultY }, nodeOrigin: { x: defaultX, y: defaultY } };

            // 1. Get live position (absolute)
            // Priority: Absolute > Computed > Position
            // During drag, positionAbsolute is the most reliable real-time value.
            const livePos = (node.dragging && node.positionAbsolute)
                ? node.positionAbsolute
                : (node.positionAbsolute || node.computed?.positionAbsolute || node.position || { x: defaultX, y: defaultY });

            const w = node.width || node.measured?.width || 0;
            const h = node.height || node.measured?.height || 0;

            // Calculate offset based on handleId if available
            let offsetX = 0;
            let offsetY = 0;

            // Try to find handle in node internals if available
            // Note: We can't access node.internals directly here if it's not exposed
            // Instead, we infer handle position from handleId naming convention
            // which is standard in this codebase (source-right, target-left etc)

            // Helper to parse handle direction from ID - Moved to module scope or defined stably
            // Check if we can use the one from imports or define a stable one.
            // For minimal change, we will use the logic directly here or rely on the outer scope if provided.
            // However, the best fix is to use the robust matching logic.

            // [FIX] Improved handle position calculation checking all formats
            if (handleId) {
                // Use the same logic as parseHandleDirection but avoid shadowing 'h' (height)
                const lowerId = handleId.toLowerCase();
                let dir: Position | undefined;

                if (lowerId.startsWith('t') || lowerId.includes('-top') || lowerId.includes('top-')) dir = Position.Top;
                else if (lowerId.startsWith('b') || lowerId.includes('-bottom') || lowerId.includes('bottom-')) dir = Position.Bottom;
                else if (lowerId.startsWith('l') || lowerId.includes('-left') || lowerId.includes('left-')) dir = Position.Left;
                else if (lowerId.startsWith('r') || lowerId.includes('-right') || lowerId.includes('right-')) dir = Position.Right;

                if (dir === Position.Left) {
                    offsetX = 0;
                    offsetY = h / 2;
                } else if (dir === Position.Right) {
                    offsetX = w;
                    offsetY = h / 2;
                } else if (dir === Position.Top) {
                    offsetX = w / 2;
                    offsetY = 0;
                } else if (dir === Position.Bottom) {
                    offsetX = w / 2;
                    offsetY = h;
                } else {
                    const dx = defaultX - livePos.x;
                    const dy = defaultY - livePos.y;
                    const epsilon = 1;
                    const inferred =
                        Math.abs(dx - 0) <= epsilon ? Position.Left :
                            Math.abs(dx - w) <= epsilon ? Position.Right :
                                Math.abs(dy - 0) <= epsilon ? Position.Top :
                                    Math.abs(dy - h) <= epsilon ? Position.Bottom :
                                        defaultPosition;
                    if (inferred === Position.Left) { offsetX = 0; offsetY = h / 2; }
                    else if (inferred === Position.Right) { offsetX = w; offsetY = h / 2; }
                    else if (inferred === Position.Top) { offsetX = w / 2; offsetY = 0; }
                    else if (inferred === Position.Bottom) { offsetX = w / 2; offsetY = h; }
                    else { offsetX = dx; offsetY = dy; }
                }
            } else {
                const dir = defaultPosition;
                if (dir === Position.Left) {
                    offsetX = 0;
                    offsetY = h / 2;
                } else if (dir === Position.Right) {
                    offsetX = w;
                    offsetY = h / 2;
                } else if (dir === Position.Top) {
                    offsetX = w / 2;
                    offsetY = 0;
                } else if (dir === Position.Bottom) {
                    offsetX = w / 2;
                    offsetY = h;
                } else {
                    offsetX = defaultX - livePos.x;
                    offsetY = defaultY - livePos.y;
                }
            }

            return {
                pos: {
                    x: livePos.x + offsetX,
                    y: livePos.y + offsetY
                },
                nodeOrigin: livePos
            };
        };

        const srcData = calcHandlePos(sourceNode, sourceX, sourceY, sourceHandleId, props.sourcePosition);
        const tgtData = calcHandlePos(targetNode, targetX, targetY, targetHandleId, props.targetPosition);

        // [FIX] Defensive check for TypeScript safety
        if (!srcData?.pos || !tgtData?.pos) {
            return {
                sourceX,
                sourceY,
                targetX,
                targetY,
                effectiveIsOneToMany: false,
                effectiveIsManyToOne: false
            };
        }

        let finalSourceX = srcData.pos.x;
        let finalSourceY = srcData.pos.y;
        let finalTargetX = tgtData.pos.x;
        let finalTargetY = tgtData.pos.y;

        const sourceNodeStatic = simpleNodeMap.get(source);
        const targetNodeStatic = simpleNodeMap.get(target);

        const positions = getConvergencePositions(layoutDirection);

        // [FIX] Simplified: Always enable bus spreading for multi-edges.
        const enableBusOverride = true;

        // [FIX] Simplified: Always enable bus spreading for multi-edges.
        // [FIX] Use Smart Layout coordinates if we are not respecting handles
        // This ensures that "headless" smart edges connect to the best port instead of the center.
        // [FIX] Skip smartLayout override during drag — smartLayout uses simpleNodeMap (stale),
        // while calcHandlePos uses live nodeLookup positions.
        if (!nodesDragging && !respectSourceHandle && smartLayout) {
            finalSourceX = smartLayout.sourceX;
            finalSourceY = smartLayout.sourceY;
        }

        if (!nodesDragging && !respectTargetHandle && smartLayout) {
            finalTargetX = smartLayout.targetX;
            finalTargetY = smartLayout.targetY;
        }

        let busTrunkSource: { x: number; y: number } | undefined;
        let busTrunkTarget: { x: number; y: number } | undefined;

        // Force Source Position for bus
        const shouldForceSource = (multiEdgeInfo.isOneToMany)
            && sourceNodeStatic && multiEdgeInfo.enableBus && !respectSourceHandle;

        if (shouldForceSource && sourceNodeStatic) {
            const pos = positions.source;
            const w = sourceNodeStatic.width || 0;
            const h = sourceNodeStatic.height || 0;
            const abs = getAbsPos(source);

            // [FIX] Restore Exact Overlap (Bus Trunk Effect) as requested by user.
            if (pos === Position.Top) { finalSourceX = abs.x + w / 2; finalSourceY = abs.y; }
            else if (pos === Position.Bottom) { finalSourceX = abs.x + w / 2; finalSourceY = abs.y + h; }
            else if (pos === Position.Left) { finalSourceX = abs.x; finalSourceY = abs.y + h / 2; }
            else if (pos === Position.Right) { finalSourceX = abs.x + w; finalSourceY = abs.y + h / 2; }

            // [FIX] Set busTrunkSource to indicate forced port usage
            busTrunkSource = { x: finalSourceX, y: finalSourceY };
        }

        // Force Target Position for bus
        const shouldForceTarget = (multiEdgeInfo.isManyToOne)
            && targetNodeStatic && multiEdgeInfo.enableBus && !respectTargetHandle;

        if (shouldForceTarget && targetNodeStatic) {
            const pos = positions.target;
            const w = targetNodeStatic.width || 0;
            const h = targetNodeStatic.height || 0;
            const abs = getAbsPos(target);

            // [FIX] Restore Exact Overlap (Bus Trunk Effect) as requested by user.
            if (pos === Position.Top) { finalTargetX = abs.x + w / 2; finalTargetY = abs.y; }
            else if (pos === Position.Bottom) { finalTargetX = abs.x + w / 2; finalTargetY = abs.y + h; }
            else if (pos === Position.Left) { finalTargetX = abs.x; finalTargetY = abs.y + h / 2; }
            else if (pos === Position.Right) { finalTargetX = abs.x + w; finalTargetY = abs.y + h / 2; }

            // [FIX] Set busTrunkTarget to indicate forced port usage
            busTrunkTarget = { x: finalTargetX, y: finalTargetY };
        }

        const result = {
            sourceX: finalSourceX,
            sourceY: finalSourceY,
            targetX: finalTargetX,
            targetY: finalTargetY,
            forcedSourcePos: undefined,
            forcedTargetPos: undefined,
            busTrunkSource,
            busTrunkTarget,
            effectiveIsOneToMany: multiEdgeInfo.isOneToMany && enableBusOverride,
            effectiveIsManyToOne: multiEdgeInfo.isManyToOne && enableBusOverride,
            sourceNodeOrigin: srcData.nodeOrigin,
            targetNodeOrigin: tgtData.nodeOrigin
        };

        return result;
    }, [
        sourceNode, targetNode,
        source, target,
        sourceX, sourceY, targetX, targetY,
        sourceHandleId, targetHandleId,
        props.sourcePosition, props.targetPosition,
        simpleNodeMap, smartLayout,
        multiEdgeInfo, layoutDirection,
        respectSourceHandle, respectTargetHandle,
        getAbsPos
    ]);

    // ---------- 4️⃣ Fallback positions ----------
    const fallbackPositions = useMemo(() => {
        // [FIX] Re-use the helper defined above
        const handleSP = parseHandleDirection(sourceHandleId);
        const handleTP = parseHandleDirection(targetHandleId);

        // Use Smart Position if available and not overridden by handle/bus
        const smartSP = smartLayout ? smartLayout.sourcePos : undefined;
        const smartTP = smartLayout ? smartLayout.targetPos : undefined;

        const finalSourcePos = (respectSourceHandle ? (handleSP || props.sourcePosition) : smartSP) ||
            props.sourcePosition || (
                layoutDirection === 'RL' ? Position.Left :
                    layoutDirection === 'TB' ? Position.Bottom :
                        layoutDirection === 'BT' ? Position.Top :
                            Position.Right
            );

        const finalTargetPos = (respectTargetHandle ? (handleTP || props.targetPosition) : smartTP) ||
            props.targetPosition || (
                layoutDirection === 'RL' ? Position.Right :
                    layoutDirection === 'TB' ? Position.Top :
                        layoutDirection === 'BT' ? Position.Bottom :
                            Position.Left
            );

        return { sourcePos: finalSourcePos, targetPos: finalTargetPos };
    }, [layoutDirection, props.sourcePosition, props.targetPosition, sourceHandleId, targetHandleId, smartLayout, respectSourceHandle, respectTargetHandle]);

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
        // 🚀 [PERF] 暴露内部数据，避免 AdvancedSmartEdge 重复订阅
        storeEdges,
        simpleNodeMap: simpleNodeMap as Map<string, any>,
    };
}
