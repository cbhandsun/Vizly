import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { MutableRefObject } from 'react';
import { Edge, Position } from '@xyflow/react';
import { EdgeRoutingCoordinator } from '../../../services/EdgeRoutingCoordinator';
import { setRenderedPathCacheValue } from '../../../routing/renderedPathCache';
import {
    logSmartPathWorkerEmptyResult,
    logSmartPathWorkerFallback,
    logSmartPathWorkerFailure,
    logSmartPathWorkerMissingNode,
} from './smartPathWorkerLogging';
import {
    getSmartPathAbsolutePosition,
    useSmartPathObstacles,
    type SmartPathObstacleItem as ObstacleItem,
    type SmartPathSimpleNode as SimpleNode,
} from './smartPathWorkerObstacles';
import {
    getComputedPoints,
    isComputedPathCompatibleWithHandles,
    isRoutingResultCompatibleWithHandles,
    pointsToOrthogonalPath,
    type SmartPathPoint,
} from './smartPathCompatibility';
// import WorkerPool from '../../../workers/WorkerPool'; // Replaced by Coordinator

// Define types locally to avoid circular deps
export interface CenteredCoords {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    busTrunkSource?: { x: number; y: number };
    busTrunkTarget?: { x: number; y: number };
    effectiveIsManyToOne?: boolean;
    effectiveIsOneToMany?: boolean;
    // [FIX] Pass exact node top-left position to avoid "Handle is Center" assumption errors
    sourceNodeOrigin?: { x: number; y: number };
    targetNodeOrigin?: { x: number; y: number };
}

export interface SmartEdgeOptions {
    borderRadius?: number;
    gridSize?: number;
    sourceOffset?: number;
    targetOffset?: number;
    minLastSegment?: number;
    jumpRadius?: number;
    obstaclePadding?: number;
    jitterThresholdMultiplier?: number;
    [key: string]: unknown;
}

export interface EdgeData {
    elkPath?: SmartPathPoint[];
    computedPath?: SmartPathPoint[];
    algorithm?: string;
    labelPosition?: { x: number; y: number };
    _layoutEpoch?: number;
    [key: string]: unknown;
}

const useLayoutStabilityReset = (
    isLayoutStable: boolean,
    lastFingerprintRef: MutableRefObject<string>
) => {
    const wasLayoutStableRef = useRef(isLayoutStable);

    useEffect(() => {
        if (!wasLayoutStableRef.current && isLayoutStable) {
            // [FIX] Gentle wakeup on layout stabilization.
            // Clear the fingerprint to bypass the debounce barricade flawlessly.
            // DO NOT wipe the path (causes flashes) or lastArgsRef (breaks wasDragging detection).
            lastFingerprintRef.current = '';
        }
        wasLayoutStableRef.current = isLayoutStable;
    }, [isLayoutStable, lastFingerprintRef]);
};



// Helper interface for the hook's input props
export interface MultiEdgeInfo {
    isOneToMany?: boolean;
    isManyToOne?: boolean;
    index?: number;
    count?: number;
    outgoingIndex?: number;
    outgoingCount?: number;
    incomingIndex?: number;
    incomingCount?: number;
    [key: string]: unknown;
}

export interface UseSmartPathWorkerProps {
    id: string;
    source: string;
    target: string;
    centeredCoords: CenteredCoords;
    fallbackPositions: { sourcePos: Position, targetPos: Position };
    obstacles: ObstacleItem[];
    simpleNodeMap: Map<string, SimpleNode>;
    storeEdges: Edge[];
    edgeConfig: SmartEdgeOptions;
    layoutDirection: string;
    zoomLevel: number;
    respectSourceHandle: boolean;
    respectTargetHandle: boolean;
    isReverseEdge: boolean;
    sourceHandleId?: string | null;
    targetHandleId?: string | null;
    edgeData: EdgeData;
    multiEdgeInfo: MultiEdgeInfo;
    isLayoutStable?: boolean;
    nodesDragging?: boolean;
}
interface LastArgs {
    sx: number;
    sy: number;
    tx: number;
    ty: number;
    s: string;
    t: string;
    sw: number;
    sh: number;
    tw: number;
    th: number;
    rS: boolean;
    rT: boolean;
    ld: string;
    isRev: boolean;
    le?: number;
    rls?: string;
    wasDragging?: boolean;
}

export function useSmartPathWorker(props: UseSmartPathWorkerProps) {
    const {
        id, source, target, centeredCoords, fallbackPositions, obstacles,
        simpleNodeMap, storeEdges, edgeConfig, layoutDirection, zoomLevel,
        respectSourceHandle, respectTargetHandle, isReverseEdge,
        sourceHandleId, targetHandleId, edgeData, multiEdgeInfo,
        isLayoutStable = true, // 默认稳定
        nodesDragging // [NEW] From props
    } = props;

    const [path, setPath] = useState<string | null>(null);
    const [smartLabelPos, setSmartLabelPos] = useState<{ x: number, y: number } | null>(null);
    const [smartPoints, setSmartPoints] = useState<Array<{ x: number, y: number }> | null>(null);
    // [NEW] Loading state for fade-in effect
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [workerUsedPositions, setWorkerUsedPositions] = useState<{ sourcePos?: Position; targetPos?: Position } | null>(null);

    const lastArgsRef = useRef<LastArgs | null>(null);
    const isMountedRef = useRef(true);
    const isHydratedRef = useRef(false); // [FIX] Track if current path is from hydration (placeholder)
    const pathRef = useRef<string | null>(path);
    const storeEdgesRef = useRef(storeEdges);
    const isBus = useMemo(() => {
        return !!(centeredCoords.effectiveIsOneToMany || centeredCoords.effectiveIsManyToOne || (multiEdgeInfo && (multiEdgeInfo.isOneToMany || multiEdgeInfo.isManyToOne)));
    }, [centeredCoords.effectiveIsOneToMany, centeredCoords.effectiveIsManyToOne, multiEdgeInfo]);

    // [FIX] Stable signature for edgeData — only routing-relevant fields.
    // edgeData reference changes on every selection change (displayEdges .map()),
    // but routing only cares about _layoutEpoch and algorithm.
    const edgeLayoutEpoch = edgeData?._layoutEpoch ?? 0;
    const edgeAlgorithm = edgeData?.algorithm;
    const edgeBorderRadius = edgeData?.borderRadius as number | undefined;
    const edgeLabelPosition = edgeData?.labelPosition;
    const edgeDataSig = `${edgeLayoutEpoch}|${edgeAlgorithm ?? ''}`;
    const routingLabelSig = useMemo(() => {
        return storeEdges.map((edge) => {
            const data = (edge.data ?? {}) as Record<string, unknown>;
            const label = String(data.label ?? (edge as unknown as Record<string, unknown>).label ?? '');
            const pos = data.labelPosition as { x?: number; y?: number } | undefined;
            const absX = data.absoluteLabelX;
            const absY = data.absoluteLabelY;
            return [
                edge.id,
                label,
                Math.round(Number(pos?.x ?? absX ?? 0)),
                Math.round(Number(pos?.y ?? absY ?? 0)),
            ].join(':');
        }).join('|');
    }, [storeEdges]);

    // [P0-2] 响应式订阅 graphVersion，替代把 getGraphVersion() 放进 deps 的错误做法。
    // 之前写法：deps 里用函数调用，React 每次渲染都执行但无法检测返回值变化。
    // 新写法：useSyncExternalStore 能精确在 graphVersion 递增时触发重渲染。
    const graphVersion = useSyncExternalStore(
        (cb) => EdgeRoutingCoordinator.getInstance().subscribeGraphVersion(cb),
        () => EdgeRoutingCoordinator.getInstance().getGraphVersion(),
        () => 0
    );

    // [P3.3] Pre-compute obstacles via memoized hook (only recalculates when topology changes)
    const obstacleData = useSmartPathObstacles(simpleNodeMap, obstacles as ObstacleItem[], source, target);
    const { obstacleRects, containerBounds } = obstacleData;

    const elkPoints = useMemo(() => {
        return null;
    }, []);
    const computedPoints = useMemo(() => {
        if (isBus) return null;
        const points = getComputedPoints(edgeData.computedPath);
        return isComputedPathCompatibleWithHandles(points, centeredCoords, respectSourceHandle, respectTargetHandle)
            ? points
            : null;
    }, [centeredCoords, edgeData, isBus, respectSourceHandle, respectTargetHandle]);

    // [REMOVED] Internal useStore for dragging. Passed via props now.
    // const nodesDragging = useStore((state: any) => state.nodesDragging);

    useEffect(() => {
        pathRef.current = path;
    }, [path]);

    useEffect(() => {
        storeEdgesRef.current = storeEdges;
    }, [storeEdges]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    // [FIX] Bulletproof routing fingerprint
    const lastFingerprintRef = useRef<string>('');

    // [FIX] 当布局从不稳定变为稳定时，清除指纹强制重新计算
    useLayoutStabilityReset(isLayoutStable, lastFingerprintRef);

    useEffect(() => {
        if (!isMountedRef.current) return;
        if (elkPoints) return;
        if (computedPoints && computedPoints.length > 1 && !nodesDragging) {
            const computedPath = pointsToOrthogonalPath(computedPoints);
            const timer = setTimeout(() => {
                if (!isMountedRef.current) return;
                setPath(computedPath);
                setSmartPoints(computedPoints);
                setIsLoading(false);
                isHydratedRef.current = false;
                lastFingerprintRef.current = '';
            }, 0);
            return () => clearTimeout(timer);
        }

        const currentArgs = {
            sx: centeredCoords.sourceX, sy: centeredCoords.sourceY,
            tx: centeredCoords.targetX, ty: centeredCoords.targetY,
            s: source,
            t: target,
            sw: simpleNodeMap.get(source)?.width ?? 0, sh: simpleNodeMap.get(source)?.height ?? 0,
            tw: simpleNodeMap.get(target)?.width ?? 0, th: simpleNodeMap.get(target)?.height ?? 0,
            rS: respectSourceHandle,
            rT: respectTargetHandle,
            ld: layoutDirection,
            isRev: isReverseEdge,
            le: edgeLayoutEpoch,
            rls: routingLabelSig
        };

        if (!isLayoutStable && !nodesDragging && !isLoading) {
            return;
        }

        if (nodesDragging) {
            return;
        }

        const fp = [
            Math.round(currentArgs.sx), Math.round(currentArgs.sy),
            Math.round(currentArgs.tx), Math.round(currentArgs.ty),
            Math.round(currentArgs.sw), Math.round(currentArgs.sh),
            Math.round(currentArgs.tw), Math.round(currentArgs.th),
            currentArgs.s, currentArgs.t,
            currentArgs.rS ? 1 : 0, currentArgs.rT ? 1 : 0,
            currentArgs.ld, currentArgs.isRev ? 1 : 0, currentArgs.le,
            sourceHandleId || '', targetHandleId || '',
            currentArgs.rls,
            multiEdgeInfo?.index ?? 0, multiEdgeInfo?.count ?? 1,
            multiEdgeInfo?.outgoingIndex ?? 0, multiEdgeInfo?.outgoingCount ?? 1,
            multiEdgeInfo?.incomingIndex ?? 0, multiEdgeInfo?.incomingCount ?? 1,
            isBus ? 1 : 0,
            obstacles?.length ?? 0,
        ].join('|');

        const justStoppedDragging = lastArgsRef.current?.wasDragging && !nodesDragging;

        // [CRITICAL FIX] Avoid StrictMode/Debounce Deadlock:
        // Do not skip if isLoading is still true! If a previous layout effect cancelled
        // the setTimeout before it ran, the fingerprint was mutated but the path was never requested.
        // This leaves isLoading permanently locked at true and permanently falls back.
        if (!isLoading && !justStoppedDragging && !nodesDragging && lastFingerprintRef.current === fp && !isHydratedRef.current) {
            if (edgeAlgorithm !== 'fallback') {
                return;
            }
        }
        

        // Store current dragging state for justStoppedDragging detection
        lastArgsRef.current = { ...currentArgs, wasDragging: nodesDragging };

        // Lod: Pass simplification flag
        const shouldSimplify = zoomLevel < 0.6;

        // Timer for debounce
        const timerId = setTimeout(() => {
            if (!isMountedRef.current) return;
            
            // [FIX] Update fingerprint ONLY when the worker is actually dispatched.
            // If the timeout is cancelled (e.g. by quick re-render), the fingerprint
            // remains unchanged, so the NEXT render will still see a mismatch and dispatch.
            lastFingerprintRef.current = fp;
            
            setIsLoading(true);

            // Worker Logic Start
            // [FIX] Clone nodes from map to avoid mutating state
            // AND override with live coordinates from centeredCoords if available.
            // This is CRITICAL because simpleNodeMap might be stale (React update lag) 
            // even though centeredCoords is fresh (from livePositionsRef).

            const getFreshNode = (id: string, origin?: { x: number; y: number }) => {
                const n = simpleNodeMap.get(id);
                if (!n) return undefined;

                // If we have an explicit origin from Context (live drag data), use it!
                if (origin) {
                    return {
                        ...n,
                        x: origin.x,
                        y: origin.y,
                        position: { x: origin.x, y: origin.y },
                        positionAbsolute: { x: origin.x, y: origin.y },
                        computed: { ...n.computed, positionAbsolute: { x: origin.x, y: origin.y } }
                    };
                }

                // Fallback: Use simpleNodeMap's data (might be stale but better than guessing)
                return n;
            };

            const getAbsPos = (node: SimpleNode, visited?: Set<string>) =>
                getSmartPathAbsolutePosition(node, simpleNodeMap, visited);


            const sourceNode = getFreshNode(source, centeredCoords.sourceNodeOrigin);
            const targetNode = getFreshNode(target, centeredCoords.targetNodeOrigin);

            // [CRITICAL FIX] React Flow or Elk layout toggles may cause nodes to render with undefined width
            // for the first frame. Aborting here and clearing isLoading permanent-locks the edge into a fallback 
            // since the next frame's fingerprint might perfectly match. Let the worker handle zero-width as default 150x80.
            if (!sourceNode || !targetNode) {
                // [FIX] 节点在 simpleNodeMap 中找不到（常见于 HMR 热重载或首帧渲染）
                // 不能设 isLoading=false！那会导致 fingerprint 匹配后永远停在直线。
                // 正确做法：清除 fingerprint 强制下一帧重试，保持 loading 状态显示 fallback。
                logSmartPathWorkerMissingNode({ edgeId: id, source, target, mapSize: simpleNodeMap.size });
                lastFingerprintRef.current = ''; // 清除指纹，强制下帧重算
                // 保持 isLoading=true，下帧自然重试（不 setIsLoading(false)）
                return;
            }

            // [P3.3] Use pre-built obstacles from the dedicated obstacle hook.
            // Only inner bodies of source/target need to be added dynamically
            const obstacleRectsForRequest = [...obstacleRects];
            const containerBoundsForRequest = [...containerBounds];

            const getInnerBody = (n: SimpleNode) => {
                if (!n) return null;
                const pos = getAbsPos(n);
                const w = n.measured?.width || n.width || 150;
                const h = n.measured?.height || n.height || 80;
                const SHRINK = isBus ? 0 : 1;
                if (w <= SHRINK * 2 || h <= SHRINK * 2) return null;
                return {
                    id: n.id,
                    x: pos.x + SHRINK,
                    y: pos.y + SHRINK,
                    width: w - SHRINK * 2,
                    height: h - SHRINK * 2
                };
            };

            const sBody = getInnerBody(sourceNode);
            if (sBody) obstacleRectsForRequest.push(sBody);
            const tBody = getInnerBody(targetNode);
            if (tBody) obstacleRectsForRequest.push(tBody);

            // [FIX] Use passed 'isReverseEdge' from Smart Context
            // This logic is now centralized in useSmartEdgeContext (Vector + Topology)
            // [Strategy] For Reverse Edges (Feedback), we want them to loop AROUND (Top/Bottom).
            // If we just swap LR->RL, it prefers Left/Right ports, leading to cut-throughs.
            // By forcing 'TB' (Vertical), the port selector prefers Top/Bottom ports.
            // const effectiveDirection = isReverse ? 'TB' : layoutDirection;
            // [REMOVED] Main Thread Port Selection.
            // We fully delegate this decision to the Worker, which has full context of obstacles and pathing.

            // [FIX] Priority: Forced (Bus) > Manual > Worker Autonomy
            // If we have a Bus Trunk or Explicit Handle, we force that position.
            // Otherwise, we pass undefined to let the Worker choose the best port from candidatePorts.
            const usedSourcePos = (centeredCoords.busTrunkSource || respectSourceHandle) ? fallbackPositions.sourcePos : undefined;
            const usedTargetPos = (centeredCoords.busTrunkTarget || respectTargetHandle) ? fallbackPositions.targetPos : undefined;

            // Candidate Ports
            const getPorts = (nodeId: string, overrideNode?: SimpleNode) => {
                const n = overrideNode || simpleNodeMap.get(nodeId) as SimpleNode | undefined;
                if (!n) return [];
                const w = n.measured?.width || n.width || 100;
                const h = n.measured?.height || n.height || 40;
                // [FIX N-2] 使用绝对坐标而不是 n.x/n.y（子节点 x/y 是相对父节点的偏移）
                // 嵌套在 Group 内的节点若用相对坐标，候选端口会整体偏移，路径起终点错位
                const absPos = getAbsPos(n);
                const x = absPos.x;
                const y = absPos.y;
                return [
                    { id: nodeId, x: x + w / 2, y, dir: 't' },
                    { id: nodeId, x: x + w / 2, y: y + h, dir: 'b' },
                    { id: nodeId, x, y: y + h / 2, dir: 'l' },
                    { id: nodeId, x: x + w, y: y + h / 2, dir: 'r' },
                ];
            };
            const candidatePorts = {
                source: getPorts(source, sourceNode),
                target: getPorts(target, targetNode),
            };

            // Nodes & Edges for Worker
             
            const nodesArr = Array.from(simpleNodeMap.values()).map((n) => {
                // [FIX] If this is source or target, use the FRESH node we created above!
                if (n.id === source && sourceNode) return sourceNode;
                if (n.id === target && targetNode) return targetNode;

                // [FIX] Use absolute position!
                // n.x/n.y might be relative if inside a group.
                // We need global coordinates to match edge sourceX/sourceY.
                const absolutePos = getAbsPos(n);
                return {
                    id: n.id,
                    position: absolutePos,
                    measured: {
                        width: n.measured?.width ?? n.width,
                        height: n.measured?.height ?? n.height,
                    },
                    width: n.measured?.width ?? n.width,
                    height: n.measured?.height ?? n.height,
                    type: n.type,
                    data: {
                        collapsed: n.data?.collapsed,
                        expanded: n.data?.expanded,
                        label: n.data?.label,
                        title: n.data?.title,
                        name: n.data?.name,
                    },
                    // [FIX-crossgroup] Pass parent refs so Worker can detect cross-group edges
                    parentId: n.parentId,
                    parentNode: n.parentNode,
                };
            });
            const currentStoreEdges = storeEdgesRef.current;
            const edgesArr = currentStoreEdges.map(e => ({
                id: e.id,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceHandle,
                targetHandle: e.targetHandle,
                label: (e.data as Record<string, unknown> | undefined)?.label ?? (e as unknown as Record<string, unknown>).label,
            }));
            const estimateLabelRect = (label: string, center: { x: number; y: number }) => {
                const text = label.replace(/<[^>]+>/g, '').trim();
                if (!text) return null;
                const width = Math.max(36, Math.min(220, text.length * 8 + 22));
                const height = 26;
                return {
                    x: center.x - width / 2,
                    y: center.y - height / 2,
                    width,
                    height,
                };
            };
            const routingLabels = currentStoreEdges
                .map(edge => {
                    const data = (edge.data ?? {}) as Record<string, unknown>;
                    const label = String(data.label ?? (edge as unknown as Record<string, unknown>).label ?? '');
                    const labelPos = data.labelPosition as { x?: number; y?: number } | undefined;
                    const x = Number(labelPos?.x ?? data.absoluteLabelX);
                const y = Number(labelPos?.y ?? data.absoluteLabelY);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                    const rect = estimateLabelRect(label, { x, y });
                    return rect ? { ...rect, edgeId: edge.id, ownerId: edge.id } : null;
                })
                .filter((rect): rect is { x: number; y: number; width: number; height: number; edgeId: string; ownerId: string } => !!rect);

            // EXECUTE WORKER via Coordinator


            // [P2-3] Refactored for separate Job and Graph Context
            const jobData = {
                source, target,
                sourceX: centeredCoords.sourceX, sourceY: centeredCoords.sourceY,
                targetX: centeredCoords.targetX, targetY: centeredCoords.targetY,
                // [FIX] Pass Trunk Geometry if available (from Context or previous calc)
                busTrunkSource: centeredCoords.busTrunkSource,
                busTrunkTarget: centeredCoords.busTrunkTarget,
                sourcePosition: usedSourcePos, targetPosition: usedTargetPos,
                sourceHandle: respectSourceHandle ? sourceHandleId : undefined,
                targetHandle: respectTargetHandle ? targetHandleId : undefined,
                // [FIX] Map effectiveIs... to is... for Worker compatibility
                isManyToOne: centeredCoords.effectiveIsManyToOne,
                isOneToMany: centeredCoords.effectiveIsOneToMany,
                effectiveIsManyToOne: centeredCoords.effectiveIsManyToOne,
                effectiveIsOneToMany: centeredCoords.effectiveIsOneToMany,
                outgoingIndex: multiEdgeInfo.outgoingIndex ?? (multiEdgeInfo.isOneToMany ? multiEdgeInfo.index : undefined) ?? 0,
                outgoingCount: multiEdgeInfo.outgoingCount ?? (multiEdgeInfo.isOneToMany ? multiEdgeInfo.count : undefined) ?? 1,
                incomingIndex: multiEdgeInfo.incomingIndex ?? (multiEdgeInfo.isManyToOne ? multiEdgeInfo.index : undefined) ?? 0,
                incomingCount: multiEdgeInfo.incomingCount ?? (multiEdgeInfo.isManyToOne ? multiEdgeInfo.count : undefined) ?? 1,
                layoutDirection: layoutDirection,
                candidatePorts,
                // [NEW] Pass reverse edge flag to Worker for bypass routing
                isReverseEdge
            };

            const coordinator = EdgeRoutingCoordinator.getInstance();
            const graphVersion = coordinator.getGraphVersion();

            const graphContext = {
                nodes: nodesArr,
                edges: edgesArr,
                obstacles: obstacleRectsForRequest,
                routingLabels,
                containerBounds: containerBoundsForRequest,
                layoutDirection,
                graphVersion,
                config: {
                    sourceOffset: edgeConfig.sourceOffset ?? 20,
                    targetOffset: edgeConfig.targetOffset ?? 32,
                    minLastSegment: edgeConfig.minLastSegment ?? 30,
                    borderRadius: edgeConfig.strictOrthogonal
                        ? 0
                        : (edgeBorderRadius ?? edgeConfig.borderRadius ?? 4),
                    gridSize: edgeConfig.gridSize ?? 20,
                    jumpRadius: edgeConfig.jumpRadius ?? 10,
                    shouldSimplify
                }
            };
            const routingRequest = {
                edgeId: id,
                job: jobData as unknown as import('../../../types/routing').PathFindingJob,
                graph: graphContext as unknown as import('../../../types/routing').PathFindingGraph
            };
            // [FIX] Strict Stability Check: Do not use cache or run if layout is unstable
            // During layout transitions (stable -> unstable -> stable), we must PAUSE routing
            // to avoid calculating paths against intermediate/stale node positions.
            // We allow running if dragging (for feedback) or if not yet hydrated (initial render).
            if (!isLayoutStable && !nodesDragging && isHydratedRef.current) {
                setIsLoading(false); // [BUG FIX] Crucial release. Otherwise stuck in fallback!
                return;
            }

            // [FIX] Removed !isBus exclusion: bus edges should use cache when topology unchanged.
            // Without this, every click triggers full re-route for bus edges, causing trunk axis drift.
            const cached = (!nodesDragging && isLayoutStable) ? coordinator.getCachedResult(routingRequest) : null;
            if (cached && isRoutingResultCompatibleWithHandles(cached, centeredCoords, respectSourceHandle, respectTargetHandle)) {
                if (isMountedRef.current) {
                    if (pathRef.current !== cached.path) {
                        setPath(cached.path);
                    }
                    isHydratedRef.current = false;
                    if (edgeLabelPosition) {
                        setSmartLabelPos(edgeLabelPosition);
                    } else if (typeof cached.labelX === 'number' && typeof cached.labelY === 'number') {
                        setSmartLabelPos({ x: cached.labelX, y: cached.labelY });
                    }
                }
                if (cached.points) {
                    setSmartPoints(cached.points);
                }
                setIsLoading(false);
                return;
            }

            coordinator.route(routingRequest).then((res: import('../../../types/routing').PathFindingResult) => {
                if (res && !isRoutingResultCompatibleWithHandles(res, centeredCoords, respectSourceHandle, respectTargetHandle)) {
                    if (isMountedRef.current) {
                        setPath(`M ${centeredCoords.sourceX} ${centeredCoords.sourceY} L ${centeredCoords.targetX} ${centeredCoords.targetY}`);
                        setSmartPoints([
                            { x: centeredCoords.sourceX, y: centeredCoords.sourceY },
                            { x: centeredCoords.targetX, y: centeredCoords.targetY }
                        ]);
                        setSmartLabelPos({
                            x: (centeredCoords.sourceX + centeredCoords.targetX) / 2,
                            y: (centeredCoords.sourceY + centeredCoords.targetY) / 2
                        });
                        setIsLoading(false);
                    }
                    return;
                }

                // [FIX] Store result in window-level cache BEFORE isMountedRef check.
                // When toggle causes edge type change, React Flow unmounts the old component
                // and mounts a new one. The old Promise resolves after unmount, so isMountedRef=false.
                // By caching the path here, the new component instance can pick it up immediately.
                if (res?.path && !res.error) {
                    setRenderedPathCacheValue(id, res.path);
                }
                if (!isMountedRef.current) return;

                // [DEBUG] Worker Result Check
                if (!res || res.error || !res.path) {
                    logSmartPathWorkerEmptyResult(id, res?.error || 'Empty path');
                    // Fallback or retry logic could go here
                }

                if (isMountedRef.current) {
                    // [FIX] FAIL-SAFE: If worker returns empty path, use straight line fallback
                    // [DEBUG] Log if fallback is triggered
                    const useFallback = !res || !res.path || res.error;
                    if (useFallback) {
                        logSmartPathWorkerFallback(id, res?.error ? res.error : 'Empty Path');
                    }

                    const safePath = res?.path || `M ${centeredCoords.sourceX} ${centeredCoords.sourceY} L ${centeredCoords.targetX} ${centeredCoords.targetY}`;
                    setPath(safePath);

                    isHydratedRef.current = false; // [FIX] Now we have the real path
                    if (edgeLabelPosition) {
                        setSmartLabelPos(edgeLabelPosition);
                    } else {
                        // [FIX] Use Worker's calculated label position directly.
                        // If fallback was used, calc simple center
                        if (!res?.path) {
                            setSmartLabelPos({
                                x: (centeredCoords.sourceX + centeredCoords.targetX) / 2,
                                y: (centeredCoords.sourceY + centeredCoords.targetY) / 2
                            });
                        } else {
                            setSmartLabelPos({ x: res.labelX, y: res.labelY });
                        }
                    }
                }
                // [NEW] Capture raw points
                if (res.points) {
                    setSmartPoints(res.points);
                }
                if (res.usedSourcePos || res.usedTargetPos) {
                    setWorkerUsedPositions({ sourcePos: res.usedSourcePos, targetPos: res.usedTargetPos });
                }
                setIsLoading(false);
            }).catch(err => {
                if (!isMountedRef.current) return;
                logSmartPathWorkerFailure(id, err);
                setIsLoading(false);
            });


        }, 8); // Reduced debounce for faster Worker response

        return () => clearTimeout(timerId);
        // [FIX] Removed storeEdges from deps — selection changes storeEdges reference
        // but doesn't affect routing. Edges data for Worker is captured in the closure.
        // [FIX] Removed `path` from deps — it is an OUTPUT of this effect (via setPath),
        // not an input. Having it as a dependency created a self-referencing infinite loop:
        // effect runs → Worker returns → setPath → path changes → effect re-runs → ∞
        // This caused "Maximum update depth exceeded" and prevented obstacle-aware paths
        // from being rendered.
        // [FIX] Replaced `edgeData` with `edgeDataSig` (stable string) to prevent
        // selection-triggered re-renders from re-running the Worker.
        // edgeData reference changes on every displayEdges .map() call,
        // but routing only depends on _layoutEpoch and algorithm fields.
    }, [
        centeredCoords, source, target, fallbackPositions, obstacles, simpleNodeMap,
        edgeConfig, layoutDirection, zoomLevel,
        respectSourceHandle, respectTargetHandle, sourceHandleId, targetHandleId,
        id, edgeDataSig, edgeLayoutEpoch, edgeAlgorithm, edgeBorderRadius, edgeLabelPosition,
        multiEdgeInfo, isLayoutStable, nodesDragging, elkPoints, computedPoints,
        isReverseEdge, isBus, graphVersion, routingLabelSig, isLoading, obstacleRects, containerBounds
    ]);

    return { path, smartLabelPos, setPath, setSmartLabelPos, smartPoints, isLoading, workerUsedPositions };

}
