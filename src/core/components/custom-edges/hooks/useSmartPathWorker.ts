import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { Edge, Position } from '@xyflow/react';
import { EdgeRoutingCoordinator } from '../../../services/EdgeRoutingCoordinator';
import { createFilletedPath } from '../../../algorithms/smartEdgeUtils'; // [FIX] Import utility
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
    elkPath?: Point2D[];
    computedPath?: Point2D[];
    algorithm?: string;
    labelPosition?: { x: number; y: number };
    _layoutEpoch?: number;
    [key: string]: unknown;
}

type Point2D = { x: number; y: number };

const _getElkPoints = (edgeData: EdgeData): Point2D[] | null => {
    if (!edgeData?.elkPath || !Array.isArray(edgeData.elkPath) || edgeData.elkPath.length <= 1) return null;
    const path = edgeData.elkPath as unknown[];
    if (!path.every(p => typeof (p as Point2D).x === 'number' && typeof (p as Point2D).y === 'number')) return null;
    return edgeData.elkPath;
};

const getComputedPoints = (edgeData: EdgeData): Point2D[] | null => {
    if (!edgeData?.computedPath || !Array.isArray(edgeData.computedPath) || edgeData.computedPath.length <= 1) return null;
    const path = edgeData.computedPath as unknown[];
    if (!path.every(p => {
        const pt = p as Point2D;
        return typeof pt.x === 'number' && typeof pt.y === 'number' && !Number.isNaN(pt.x) && !Number.isNaN(pt.y);
    })) return null;
    return edgeData.computedPath;
};

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

const useHydratedPath = (
    params: {
        elkPoints: Point2D[] | null;
        computedPoints: Point2D[] | null;
        edgeConfig: SmartEdgeOptions;
        edgeData: { algorithm?: string };
        id: string;
        path: string | null;
        setPath: Dispatch<SetStateAction<string | null>>;
        setSmartPoints: Dispatch<SetStateAction<Array<Point2D> | null>>;
        setIsLoading: Dispatch<SetStateAction<boolean>>;
        isHydratedRef: MutableRefObject<boolean>;
        isMountedRef: MutableRefObject<boolean>;
        isLayoutStable: boolean;
        nodesDragging?: boolean;
    }
) => {
    const {
        elkPoints,
        computedPoints,
        edgeConfig,
        edgeData,
        id,
        path,
        setPath,
        setSmartPoints,
        setIsLoading,
        isHydratedRef,
        isMountedRef,
        isLayoutStable,
        nodesDragging
    } = params;

    const lastElkSigRef = useRef<string>('');
    const lastComputedSigRef = useRef<string>('');

    const sig = (pts: Point2D[] | null): string => {
        if (!pts || pts.length < 2) return '';
        // [FIX] Hash ALL points to prevent stale path retention when internal geometry changes 
        // but start/end nodes remain identical.
        return pts.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join('|');
    };

    useEffect(() => {
        if (!isMountedRef.current) return;
        if (!isLayoutStable && !nodesDragging) return;

        if (elkPoints) {
            const s = sig(elkPoints);
            if (s && s === lastElkSigRef.current) return;
            lastElkSigRef.current = s;
            const svgPath = createFilletedPath(elkPoints, edgeConfig.borderRadius ?? 8);
            setTimeout(() => {
                if (!isMountedRef.current) return;
                if (path !== svgPath) {
                    setPath(svgPath);
                    setSmartPoints(elkPoints);
                }
                setIsLoading(false);
            }, 0);
            return;
        }

        if (computedPoints) {
            const s = sig(computedPoints);
            if (s && s === lastComputedSigRef.current) return;
            lastComputedSigRef.current = s;
            const svgPath = createFilletedPath(computedPoints, edgeConfig.borderRadius ?? 8);
            setTimeout(() => {
                if (!isMountedRef.current) return;
                if (path !== svgPath) {
                    // [FIX N-1] 取消注释：computedPoints 分支必须同步更新 path，
                    // 否则 ELK 布局完成后边路径永远停在旧布局形状
                    setPath(svgPath);
                    setSmartPoints(computedPoints);
                    setIsLoading(false);
                    isHydratedRef.current = true;
                }
            }, 0);
        }
    }, [computedPoints, edgeConfig.borderRadius, edgeData?.algorithm, elkPoints, id, isLayoutStable, nodesDragging, isMountedRef, path, setIsLoading, setPath, setSmartPoints, isHydratedRef]);
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

// [FIX] Define explicit interface for SimpleNode to replace 'any'
interface SimpleNode {
    id: string;
    type?: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    parentId?: string;
    parentNode?: string;
    position?: { x: number; y: number };
    positionAbsolute?: { x: number; y: number };
    measured?: { width: number; height: number };
    data?: {
        collapsed?: boolean;
        expanded?: boolean;
        hidden?: boolean;
        isObstacle?: boolean;
        [key: string]: unknown;
    };
    style?: {
        zIndex?: number;
        [key: string]: unknown;
    };
    zIndex?: number;
    computed?: {
        positionAbsolute?: { x: number; y: number };
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

interface ObstacleItem {
    id?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    type?: string;
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
/**
 * [P3.3] Compute absolute position for a node, recursing through parents.
 */
const getAbsolutePosition = (node: SimpleNode, nodeMap: Map<string, SimpleNode>, visited?: Set<string>): { x: number; y: number } => {
    const abs = node.computed?.positionAbsolute || node.positionAbsolute;
    if (abs) return abs;
    const base = node.position || { x: node.x ?? 0, y: node.y ?? 0 };
    const parentId = node.parentId || node.parentNode;
    if (!parentId) return base;
    const v = visited || new Set<string>();
    if (v.has(String(node.id))) return base;
    v.add(String(node.id));
    const parent = nodeMap.get(String(parentId));
    if (!parent) return base;
    const pAbs = getAbsolutePosition(parent, nodeMap, v);
    return { x: pAbs.x + (base.x ?? 0), y: pAbs.y + (base.y ?? 0) };
};

/** Node types that are NOT routing obstacles */
const IGNORED_OBSTACLE_TYPES = new Set([
    'group', 'subGroup', 'titleGroup',
    'domain', 'subDomain',
    'swimlane',
    'annotation', 'background',
    'sticky', 'comment'
]);

/** Container types that serve as soft boundaries */
const CONTAINER_TYPES = new Set(['group', 'subGroup', 'titleGroup', 'swimlane', 'domain', 'subDomain']);

interface ObstacleRect { id?: string; x: number; y: number; width: number; height: number; padding?: number; isSoftZone?: boolean; }

/**
 * [P3.3] Extracted obstacle building into independent useMemo.
 * Only recomputes when node map, obstacles list, or source/target change.
 */
const useObstacles = (
    simpleNodeMap: Map<string, SimpleNode>,
    obstacles: ObstacleItem[],
    source: string,
    target: string,
    edgeConfig: SmartEdgeOptions,
    isBus: boolean
): { obstacleRects: ObstacleRect[]; containerBounds: ObstacleRect[] } => {
    return useMemo(() => {
        const obstacleRects: ObstacleRect[] = [];
        const containerBounds: ObstacleRect[] = [];

        const addObstacle = (rect: ObstacleRect, isContainer: boolean = false) => {
            if (rect.width <= 0 || rect.height <= 0) return;
            if (isContainer) {
                containerBounds.push(rect);
            } else {
                // [FIX] DO NOT PRE-PAD OBSTACLES! Send the exact physical geometries to the Worker.
                // The Worker algorithms (A*, SimplePath, etc.) use their own finely-tuned clearance 
                // parameters (like bufferDistance=5). Pre-swelling the geometry by 10px here
                // defeats those tuned parameters and permanently seals shut tight 20px corridors.
                obstacleRects.push({
                    id: rect.id,
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    padding: rect.padding,
                    isSoftZone: rect.isSoftZone
                });
            }
        };

        const hasProvidedObstacles = Array.isArray(obstacles) && obstacles.length > 0;
        if (hasProvidedObstacles) {
            for (const obs of obstacles) {
                const node = obs?.id ? simpleNodeMap.get(obs.id) as SimpleNode : undefined;
                const type = (obs as SimpleNode).type || node?.type || '';

                if (IGNORED_OBSTACLE_TYPES.has(String(type))) {
                    if (CONTAINER_TYPES.has(String(type))) {
                        addObstacle({
                            id: obs?.id,
                            x: obs?.x ?? 0,
                            y: obs?.y ?? 0,
                            width: obs?.width ?? 0,
                            height: obs?.height ?? 0
                        }, true);
                    }
                    continue;
                }
                addObstacle({ id: obs?.id, x: obs?.x ?? 0, y: obs?.y ?? 0, width: obs?.width ?? 0, height: obs?.height ?? 0 });
            }
        } else {
            simpleNodeMap.forEach((n: SimpleNode) => {
                if (n.id === source || n.id === target) return;
                const t = String(n?.type || '');

                if (IGNORED_OBSTACLE_TYPES.has(t)) {
                    if (CONTAINER_TYPES.has(t)) {
                        const pos = getAbsolutePosition(n, simpleNodeMap);
                        const w = n.measured?.width || n.width || 0;
                        const h = n.measured?.height || n.height || 0;
                        addObstacle({ id: n.id, x: pos.x, y: pos.y, width: w, height: h }, true);
                    }
                    return;
                }

                if (!!n?.data?.hidden) return;
                if (typeof n?.data?.isObstacle === 'boolean' && !n.data.isObstacle) return;

                const z = typeof n?.zIndex === 'number' ? n.zIndex : (typeof n?.style?.zIndex === 'number' ? n.style.zIndex : 0);
                if (typeof z === 'number' && z < 0) return;

                const w = n.measured?.width || n.width || 0;
                const h = n.measured?.height || n.height || 0;
                if (w <= 0 || h <= 0) return;

                const pos = getAbsolutePosition(n, simpleNodeMap);
                addObstacle({ id: n.id, x: pos.x, y: pos.y, width: w, height: h });
            });
        }

        return { obstacleRects, containerBounds };
    }, [simpleNodeMap, obstacles, source, target, edgeConfig.obstaclePadding, isBus]);
};

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
    const isBus = useMemo(() => {
        return !!(centeredCoords.effectiveIsOneToMany || centeredCoords.effectiveIsManyToOne || (multiEdgeInfo && (multiEdgeInfo.isOneToMany || multiEdgeInfo.isManyToOne)));
    }, [centeredCoords.effectiveIsOneToMany, centeredCoords.effectiveIsManyToOne, multiEdgeInfo]);

    // [FIX] Stable signature for edgeData — only routing-relevant fields.
    // edgeData reference changes on every selection change (displayEdges .map()),
    // but routing only cares about _layoutEpoch and algorithm.
    const edgeDataSig = `${edgeData?._layoutEpoch ?? 0}|${edgeData?.algorithm ?? ''}`;

    // [P0-2] 响应式订阅 graphVersion，替代把 getGraphVersion() 放进 deps 的错误做法。
    // 之前写法：deps 里用函数调用，React 每次渲染都执行但无法检测返回值变化。
    // 新写法：useSyncExternalStore 能精确在 graphVersion 递增时触发重渲染。
    const graphVersion = useSyncExternalStore(
        (cb) => EdgeRoutingCoordinator.getInstance().subscribeGraphVersion(cb),
        () => EdgeRoutingCoordinator.getInstance().getGraphVersion(),
        () => 0
    );

    // [P3.3] Pre-compute obstacles via memoized hook (only recalculates when topology changes)
    const obstacleData = useObstacles(simpleNodeMap, obstacles as ObstacleItem[], source, target, edgeConfig, isBus);

    const elkPoints = useMemo(() => {
        return null;
    }, []);
    const computedPoints = useMemo(() => {
        if (isBus) return null;
        return getComputedPoints(edgeData);
    }, [edgeData, isBus]);

    // [REMOVED] Internal useStore for dragging. Passed via props now.
    // const nodesDragging = useStore((state: any) => state.nodesDragging);

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

        const layoutEpoch = edgeData?._layoutEpoch ?? 0;

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
            le: layoutEpoch
        };

        if (!isLayoutStable && !nodesDragging) {
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
            if (edgeData?.algorithm !== 'fallback') {
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

            const getAbsPos = (node: SimpleNode, visited?: Set<string>) => getAbsolutePosition(node, simpleNodeMap, visited);


            const sourceNode = getFreshNode(source, centeredCoords.sourceNodeOrigin);
            const targetNode = getFreshNode(target, centeredCoords.targetNodeOrigin);

            // [CRITICAL FIX] React Flow or Elk layout toggles may cause nodes to render with undefined width
            // for the first frame. Aborting here and clearing isLoading permanent-locks the edge into a fallback 
            // since the next frame's fingerprint might perfectly match. Let the worker handle zero-width as default 150x80.
            if (!sourceNode || !targetNode) {
                // [FIX] 节点在 simpleNodeMap 中找不到（常见于 HMR 热重载或首帧渲染）
                // 不能设 isLoading=false！那会导致 fingerprint 匹配后永远停在直线。
                // 正确做法：清除 fingerprint 强制下一帧重试，保持 loading 状态显示 fallback。
                console.warn(`[SmartWorker:${id}] Node not found in simpleNodeMap — retrying next frame. source=${source} target=${target} mapSize=${simpleNodeMap.size}`);
                lastFingerprintRef.current = ''; // 清除指纹，强制下帧重算
                // 保持 isLoading=true，下帧自然重试（不 setIsLoading(false)）
                return;
            }

            // [P3.3] Use pre-built obstacles from useObstacles memo
            // Only inner bodies of source/target need to be added dynamically
            const obstacleRects = [...obstacleData.obstacleRects];
            const containerBounds = [...obstacleData.containerBounds];

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
            if (sBody) obstacleRects.push(sBody);
            const tBody = getInnerBody(targetNode);
            if (tBody) obstacleRects.push(tBody);

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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const nodesArr = Array.from(simpleNodeMap.values()).map((n: any) => {
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
                    measured: { width: n.width, height: n.height },
                    type: n.type,
                    data: { collapsed: n.data?.collapsed, expanded: n.data?.expanded },
                    // [FIX-crossgroup] Pass parent refs so Worker can detect cross-group edges
                    parentId: n.parentId,
                    parentNode: n.parentNode,
                };
            });
            const edgesArr = storeEdges.map(e => ({
                id: e.id,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceHandle,
                targetHandle: e.targetHandle,
            }));

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
                obstacles: obstacleRects,
                containerBounds: containerBounds,
                layoutDirection,
                graphVersion,
                config: {
                    sourceOffset: edgeConfig.sourceOffset ?? 20,
                    targetOffset: edgeConfig.targetOffset ?? 32,
                    minLastSegment: edgeConfig.minLastSegment ?? 30,
                    borderRadius: (edgeData?.borderRadius as number) ?? edgeConfig.borderRadius ?? 4,
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
            if (cached) {
                if (isMountedRef.current) {
                    if (path !== cached.path) {
                        setPath(cached.path);
                    }
                    isHydratedRef.current = false;
                    if (edgeData?.labelPosition) {
                        setSmartLabelPos(edgeData.labelPosition);
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
                // [FIX] Store result in window-level cache BEFORE isMountedRef check.
                // When toggle causes edge type change, React Flow unmounts the old component
                // and mounts a new one. The old Promise resolves after unmount, so isMountedRef=false.
                // By caching the path here, the new component instance can pick it up immediately.
                if (res?.path && !res.error) {
                    const pathCache = (window as any).__dv_rendered_path_cache__;
                    if (pathCache instanceof Map) {
                        pathCache.set(id, res.path);
                    }
                }
                if (!isMountedRef.current) return;

                // [DEBUG] Worker Result Check
                if (!res || res.error || !res.path) {
                    console.warn(`[SmartWorker:${id}] Worker returned error or empty path:`, res?.error || 'Empty path');
                    // Fallback or retry logic could go here
                } else {
                }

                if (isMountedRef.current) {
                    // [FIX] FAIL-SAFE: If worker returns empty path, use straight line fallback
                    // [DEBUG] Log if fallback is triggered
                    const useFallback = !res || !res.path || res.error;
                    if (useFallback) {
                        console.warn(`[SmartWorker:${id}] Using Fallback Path! Reason: ${res?.error ? res.error : 'Empty Path'}`);
                    }

                    const safePath = res?.path || `M ${centeredCoords.sourceX} ${centeredCoords.sourceY} L ${centeredCoords.targetX} ${centeredCoords.targetY}`;
                    setPath(safePath);

                    isHydratedRef.current = false; // [FIX] Now we have the real path
                    if (edgeData?.labelPosition) {
                        setSmartLabelPos(edgeData.labelPosition);
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
                console.error(`[useSmartPathWorker] Worker Failed for ${id}:`, err);
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
        id, edgeDataSig, multiEdgeInfo, isLayoutStable, nodesDragging, elkPoints,
        isReverseEdge, isBus, graphVersion
    ]);

    return { path, smartLabelPos, setPath, setSmartLabelPos, smartPoints, isLoading, workerUsedPositions };

}
