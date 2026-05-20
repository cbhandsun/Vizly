/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Edge Routing Worker Orchestrator
 * 
 * Orchestrates the preprocessing, pathfinding, and post-processing modules.
 * This is the primary logic engine for edge routing.
 */

import {
    Point,
    Rectangle,
    PathfindingContext,
    PathFindingResult,
    Position,
    PathFindingJob,
    UnifiedRoutingConfig
} from '../../types/routing';

// Minimal interfaces for graph elements within the worker context
interface GraphNode {
    id: string;
    measured?: { width: number; height: number };
    position?: { x: number; y: number };
    [key: string]: unknown;
}

interface GraphEdge {
    id: string;
    source: string;
    target: string;
    [key: string]: unknown;
}

import { GridBuilder } from './GridBuilder';
import { VisibilityGraphRouter } from './VisibilityGraphRouter';
import { AStarPathfinder } from './AStarPathfinder';
import { BusDetector } from '../preprocessing/BusDetector';
import { PortSelector } from '../preprocessing/PortSelector';
import { ObstacleAnalyzer } from '../preprocessing/ObstacleAnalyzer';
import { PathPostProcessor } from '../postprocessing/PathPostProcessor';
import { TrunkCalculator } from './TrunkCalculator';
import { countObstaclesInDirection } from './GraphBuilder';
import { QuadTree, SpatialIndex } from '../../algorithms/SpatialIndex';
import { getNodePosition, getPortOffsetPoint, makePathOrthogonal } from '../../algorithms/smartEdgeUtils';
import { generateSimplePath } from '../../algorithms/pathfinding';
import { analyzeGeometry, getPortRulesForGeometry, portCombinationToString } from '../../algorithms/geometry-classifier';

/**
 * [S5-P1] Returns the geometrically opposite port side.
 * Used for obstacle fallback: if the preferred port is heavily blocked,
 * try the opposite side instead of forcing A* to detour.
 */
function getOppositePort(pos: Position): Position {
    if (pos === Position.Top)    return Position.Bottom;
    if (pos === Position.Bottom) return Position.Top;
    if (pos === Position.Left)   return Position.Right;
    return Position.Left;
}

export class EdgeRoutingWorker {
    // [H-4] Module-level singleton cache for stateless routing modules.
    // These are reconstructed only when config.algorithm.gridSize or borderRadius changes,
    // reducing per-route object allocation and GC pressure.
    private static _cachedConfig: UnifiedRoutingConfig | null = null;
    private static _gridBuilder: GridBuilder | null = null;
    private static _astar: AStarPathfinder | null = null;
    private static _analyzer: ObstacleAnalyzer | null = null;
    private static _postProcessor: PathPostProcessor | null = null;
    private static _trunkCalculator: TrunkCalculator | null = null;
    // [B1] 加入单例缓存：vgRouter/busDetector/portSelector 是纯配置驱动的无状态类，可安全复用
    // 原代论说“轻量级—每条边新建”，但 50 条边批处理创建 150 个对象，增加 GC 压力
    private static _vgRouter: VisibilityGraphRouter | null = null;
    private static _busDetector: BusDetector | null = null;
    private static _portSelectorWorker: PortSelector | null = null;

    private static getModules(config: UnifiedRoutingConfig) {
        // Re-use if same config reference or same gridSize (the only field that changes module behavior)
        const cached = EdgeRoutingWorker._cachedConfig;
        const stale = !cached ||
            cached.algorithm.gridSize !== config.algorithm.gridSize ||
            cached.postProcessing.borderRadius !== config.postProcessing.borderRadius;

        if (stale) {
            EdgeRoutingWorker._cachedConfig = config;
            EdgeRoutingWorker._gridBuilder = new GridBuilder(config);
            EdgeRoutingWorker._astar = new AStarPathfinder(config);
            EdgeRoutingWorker._analyzer = new ObstacleAnalyzer();
            EdgeRoutingWorker._postProcessor = new PathPostProcessor(config);
            EdgeRoutingWorker._trunkCalculator = new TrunkCalculator();
            // [B1] 同步重建配置相关单例
            EdgeRoutingWorker._vgRouter = new VisibilityGraphRouter(config);
            EdgeRoutingWorker._busDetector = new BusDetector(config);
            EdgeRoutingWorker._portSelectorWorker = new PortSelector(config);
        }

        return {
            gridBuilder: EdgeRoutingWorker._gridBuilder!,
            astar: EdgeRoutingWorker._astar!,
            analyzer: EdgeRoutingWorker._analyzer!,
            postProcessor: EdgeRoutingWorker._postProcessor!,
            trunkCalculator: EdgeRoutingWorker._trunkCalculator!,
            vgRouter: EdgeRoutingWorker._vgRouter!,
            busDetector: EdgeRoutingWorker._busDetector!,
            portSelector: EdgeRoutingWorker._portSelectorWorker!,
        };
    }

    /**
     * Main execution entry point for a single edge
     */
    static execute(context: PathfindingContext): PathFindingResult {
        const { job, graph, config, runtime = {} } = context;
        const { prebuiltGrid, spatialIndex: prebuiltSpatialIndex } = runtime;

        // 1. Initialize Modules — stateless ones are cached, stateful ones created fresh
        const { gridBuilder, astar, analyzer, postProcessor, trunkCalculator, vgRouter, busDetector, portSelector } = EdgeRoutingWorker.getModules(config);
        // [B1] vgRouter/busDetector/portSelector 已加入单例缓存，不再每条边新建


        // 2. Setup Spatial Index (if needed)
        let spatialIndex: SpatialIndex | undefined = prebuiltSpatialIndex;
        // [B3] 阈値 50 → 20：40 节点的图（常见规模）改走 QuadTree 而非线性扫描
        if (!spatialIndex && graph.obstacles.length > 20) {
            const bounds = analyzer.getBounds(graph.obstacles);
            const padding = 2000;
            spatialIndex = new QuadTree({
                x: bounds.minX - padding,
                y: bounds.minY - padding,
                width: (bounds.maxX - bounds.minX) + padding * 2,
                height: (bounds.maxY - bounds.minY) + padding * 2
            });
            const index = spatialIndex;
            graph.obstacles.forEach(obs => index.insert(obs));
        }

        // 3. Resolve Node Rects
        const nodes = graph.nodes as unknown as GraphNode[];
        // [P1.4] Build nodeMap for O(1) lookups instead of O(N) Array.find()
        const nodeMap = new Map<string, GraphNode>();
        for (const n of nodes) {
            nodeMap.set(n.id, n);
        }
        const sNode = nodeMap.get(job.source);
        const tNode = nodeMap.get(job.target);

        // [L-1] Build edgeMap alongside nodeMap for O(1) edge lookups (used in pickPeerGroup)
        const edgeMap = new Map<string, GraphEdge>();
        for (const e of graph.edges as unknown as GraphEdge[]) {
            edgeMap.set(e.id, e);
        }

        if (!sNode || !tNode) {
            return this.errorResult(job, 'Source or Target node not found');
        }

        const sNodePos = getNodePosition(sNode);
        const tNodePos = getNodePosition(tNode);
        const sRect: Rectangle = {
            x: sNodePos.x,
            y: sNodePos.y,
            width: sNode.measured?.width || 150,
            height: sNode.measured?.height || 80
        };
        const tRect: Rectangle = {
            x: tNodePos.x,
            y: tNodePos.y,
            width: tNode.measured?.width || 150,
            height: tNode.measured?.height || 80
        };

        // [SELF-LOOP] Early exit: source and target are the same node.
        // A* / VG cannot handle zero-distance routing. Generate a deterministic
        // rectangular loop path attached to the node's right side (industry standard: yFiles / Draw.io).
        if (job.source === job.target) {
            const LOOP_W = 40;  // horizontal extent of the loop
            const LOOP_H = 30;  // vertical extent of the loop
            const OFFSET = 8;   // port offset from node edge
            // Attach at the right-center of the node
            const rx = sRect.x + sRect.width;
            const ry = sRect.y + sRect.height / 2;
            // Rectangle: right-center → right+offset → out-right+W,ry-H/2 → out-right+W,ry+H/2 → right-center
            const loopPoints: Point[] = [
                { x: rx,           y: ry },
                { x: rx + OFFSET,  y: ry },
                { x: rx + LOOP_W,  y: ry - LOOP_H / 2 },
                { x: rx + LOOP_W,  y: ry + LOOP_H / 2 },
                { x: rx + OFFSET,  y: ry },
                { x: rx,           y: ry },
            ];
            const loopPath = `M ${loopPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;
            return {
                jobId: job.jobId,
                edgeId: job.edgeId,
                path: loopPath,
                points: loopPoints,
                labelX: rx + LOOP_W + 4,
                labelY: ry,
                sourcePos: Position.Right,
                targetPos: Position.Right,
                usedSourcePos: Position.Right,
                usedTargetPos: Position.Right,
                metadata: { strategy: 'Self-Loop' },
                debugInfo: {
                    algorithmDebug: {
                        strategy: 'Self-Loop',
                        rawPoints: loopPoints,
                        visited: [],
                        grid: null,
                        obstacles: [],
                        sourceRect: sRect,
                        targetRect: sRect,
                        portSelection: {
                            selected: { source: Position.Right, target: Position.Right },
                            layoutDirection: job.layoutDirection,
                            detectedGeometry: 'collocated',
                            hasExplicitSource: false, hasExplicitTarget: false,
                            isManyToOne: false, incomingCount: 1,
                            hasPrecomputedTrunk: false, peerGroupSize: 0,
                            peerGroupKey: '', peerGroupMembers: [],
                            trunkAxis: null, trunkVertical: null,
                            sourceHandle: null, targetHandle: null,
                            centers: { source: { x: sRect.x + sRect.width/2, y: sRect.y + sRect.height/2 }, target: { x: sRect.x + sRect.width/2, y: sRect.y + sRect.height/2 }, dx: 0, dy: 0 }
                        }
                    },
                    obstacles: [],
                    selectedSourcePos: Position.Right,
                    selectedTargetPos: Position.Right
                }
            };
        }


        // This prevents them from treated as hard obstacles during pathfinding checks (like Theta*)
        const routingObstacles = Array.isArray(graph.obstacles)
            ? graph.obstacles.filter((o: Rectangle & { id?: string }) => {
                // Filter by ID
                if (o.id && (o.id === job.source || o.id === job.target)) return false;
                // Filter by Geometry (approximate match) - critical if IDs are missing
                const isSource = Math.abs(o.x - sRect.x) < 1 && Math.abs(o.y - sRect.y) < 1 && Math.abs(o.width - sRect.width) < 1 && Math.abs(o.height - sRect.height) < 1;
                const isTarget = Math.abs(o.x - tRect.x) < 1 && Math.abs(o.y - tRect.y) < 1 && Math.abs(o.width - tRect.width) < 1 && Math.abs(o.height - tRect.height) < 1;
                return !isSource && !isTarget;
            })
            : graph.obstacles;

        const clearanceRects = [sRect, tRect];



        // 4. Pre-processing: Bus Consensus & Direction
        // [H-6] Pass pre-built nodeMap to avoid O(N) Array.find() inside resolveBusOrientation
        const busOrientation = busDetector.resolveBusOrientation(
            !!job.isManyToOne,
            job.isManyToOne ? job.target : job.source,
            graph.edges,
            graph.nodes,
            job.layoutDirection || 'LR',
            nodeMap
        );

        let startPos = job.sourcePosition || Position.Right;
        let endPos = job.targetPosition || Position.Left;

        const hasExplicitSource = !!job.sourceHandle;
        const hasExplicitTarget = !!job.targetHandle;
        // [B4] 内联箭头函数提升为静态方法，避免每条边创建闭包对象
        const parseHandleDir = EdgeRoutingWorker.parseHandleDir;

        let hasFixedSourcePort = false;
        let hasFixedTargetPort = false;
        let busPeerGroupSize = 0;
        let busPeerGroupKey: string | null = null;
        let busPeerGroupMembers: string[] | null = null;

        if (hasExplicitSource) {
            const p = parseHandleDir(job.sourceHandle);
            if (p) {
                startPos = p;
                hasFixedSourcePort = true;
            }
        }

        if (hasExplicitTarget) {
            const p = parseHandleDir(job.targetHandle);
            if (p) {
                endPos = p;
                hasFixedTargetPort = true;
            }
        }


        // [IRONCLAD LOCK] When an edge is a verified member of a global trunk, it MUST NOT
        // reject the port assignment. Group consensus takes absolute priority over local geometric efficiency.
        // [S4] isGlobalTrunkMember is still used by portSelector allowSourceOverride / allowTargetOverride.
        const isGlobalTrunkMember = !!(job.busTrunkSource && job.busTrunkTarget);

        /**
         * [S5-P2] Unified trunk axis port resolver — with approach-direction conflict guard.
         *
         * Calculates the port a node should face given the global trunk geometry.
         * IMPROVEMENT: If the trunk-facing port is the SAME as the direct approach direction
         * from the other node, it means entry and exit would be on the same side (same-side
         * in/out). In that case, fall back to the direct geometric port to avoid the U-turn.
         *
         * @param rect        The node rectangle
         * @param otherRect   The other endpoint rectangle (used for conflict detection)
         * @param isTargetSide  true if resolving the target (entry) port, false for source (exit)
         */
        const resolvePortFromTrunkAxis = (
            rect: Rectangle,
            otherRect?: Rectangle,
            isTargetSide?: boolean
        ): Position => {
            const ts = job.busTrunkSource!;
            const tt = job.busTrunkTarget!;
            const isVertTrunk = Math.abs(ts.x - tt.x) < 1.0;
            const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

            let trunkPort: Position;
            if (isVertTrunk) {
                trunkPort = center.x > ts.x ? Position.Left : Position.Right;
            } else {
                trunkPort = center.y > ts.y ? Position.Top : Position.Bottom;
            }

            // [FIX-C-shape] Strong alignment override — runs BEFORE the isGlobalTrunkMember
            // shortcut so it can rescue trunk members from C-shaped paths.
            // When nodes are strongly aligned on one axis (e.g., vertically stacked with
            // |dy| >> |dx|, ratio > 3), the trunk axis port (e.g., Right) forces a U-turn
            // detour. Use the direct geometric port instead even for trunk members.
            if (otherRect) {
                const otherCenter = { x: otherRect.x + otherRect.width / 2, y: otherRect.y + otherRect.height / 2 };
                const dx = isTargetSide
                    ? (otherCenter.x - center.x)
                    : (center.x - otherCenter.x);
                const dy = isTargetSide
                    ? (otherCenter.y - center.y)
                    : (center.y - otherCenter.y);

                let directPort: Position;
                if (Math.abs(dx) > Math.abs(dy)) {
                    directPort = dx > 0 ? Position.Left : Position.Right;
                } else {
                    directPort = dy > 0 ? Position.Top : Position.Bottom;
                }

                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);
                const dominantRatio = Math.max(absDx, absDy) / (Math.min(absDx, absDy) + 1);
                if (dominantRatio > 3 && (
                    (absDy > absDx && (trunkPort === Position.Left || trunkPort === Position.Right)) ||
                    (absDx > absDy && (trunkPort === Position.Top || trunkPort === Position.Bottom))
                )) {
                    // Strong geometric dominance overrides trunk port assignment
                    return directPort;
                }
            }

            // [CONFLICT GUARD] For NON-trunk-members, check same-side entry/exit.
            // For trunk members we trust the Coordinator's port assignment (with the
            // strong-alignment exception handled above).
            if (isGlobalTrunkMember) {
                return trunkPort;
            }

            if (otherRect) {
                const otherCenter = { x: otherRect.x + otherRect.width / 2, y: otherRect.y + otherRect.height / 2 };
                const dx = isTargetSide
                    ? (otherCenter.x - center.x)  // source → target: dx from target's perspective is source-direction
                    : (center.x - otherCenter.x);  // source side: dx toward target
                const dy = isTargetSide
                    ? (otherCenter.y - center.y)
                    : (center.y - otherCenter.y);

                // Direct approach port (from-source direction when isTargetSide)
                let directPort: Position;
                if (Math.abs(dx) > Math.abs(dy)) {
                    directPort = dx > 0 ? Position.Left : Position.Right;  // source is to the left → enter Left
                } else {
                    directPort = dy > 0 ? Position.Top : Position.Bottom;  // source is above → enter Top
                }

                if (isTargetSide) {
                    if (trunkPort === directPort) {
                        return directPort;
                    }
                } else {
                    const opposite = (p: Position) => (
                        p === Position.Top ? Position.Bottom :
                        p === Position.Bottom ? Position.Top :
                        p === Position.Left ? Position.Right : Position.Left
                    );
                    if (trunkPort === opposite(directPort)) {
                        return directPort;
                    }
                }
            }

            return trunkPort;
        };


        // [S4] busSourcePort / busTargetPort 不再由 Coordinator 预注入。
        // 端口决策统一在此 Worker 内部，通过 busTrunkSource/busTrunkTarget 几何推算。
        // [S5-P2] O2M hub 源端口 + M2O hub 目标端口 统一使用 resolvePortFromTrunkAxis()

        // O2M: hub（源）面向 trunk axis
        // [FIX-shared-port] Hub port must NOT depend on individual peer geometry.
        // Passing sRect/tRect as otherRect caused per-edge "strong alignment override",
        // making some edges exit the hub from different ports. Pass undefined to ensure
        // all edges in the same trunk group share the same hub port.
        if (job.isOneToMany && job.busTrunkSource && job.busTrunkTarget && !hasFixedSourcePort) {
            startPos = resolvePortFromTrunkAxis(sRect, undefined, false);
            hasFixedSourcePort = true;
        }

        // M2O: hub（目标）面向 trunk axis
        // [M2O TRUNK] Target node must face the trunk axis.
        // Trunk axis sits between the sources and the target.
        // → If trunk is ABOVE target: target faces UP → Position.Top
        // → If trunk is BELOW target: target faces DOWN → Position.Bottom
        // [FIX-shared-port] Same fix: don't pass per-edge source rect to hub port calculation.
        if (job.isManyToOne && job.busTrunkSource && job.busTrunkTarget && !hasFixedTargetPort) {
            endPos = resolvePortFromTrunkAxis(tRect, undefined, true);
            hasFixedTargetPort = true;
        }

        const pickPeerGroup = (originId: string, isSource: boolean, allPeers: GraphEdge[], _orientationIsHorz: boolean): { edges: GraphEdge[]; key: string; members: string[] } => {
            // [L-1] Use pre-built nodeMap and edgeMap for O(1) lookups.
            // Previously used edges.find() and nodes.find() which were O(N) each,
            // and nodes.find() inside the filter loop was O(N×M).
            const refEdge = edgeMap.get(job.edgeId);
            if (!refEdge) return { edges: allPeers, key: 'ALL', members: allPeers.map(e => e.id) };
            const originNode = nodeMap.get(originId);
            const otherId = isSource ? refEdge.target : refEdge.source;
            const otherNode = nodeMap.get(otherId);
            if (!originNode || !otherNode) return { edges: allPeers, key: 'ALL', members: allPeers.map(e => e.id) };
            const oPos = getNodePosition(originNode);
            const oW = originNode.measured?.width || (originNode as unknown as Record<string, any>).width || 0;
            const oH = originNode.measured?.height || (originNode as unknown as Record<string, any>).height || 0;
            const oC = { x: oPos.x + oW / 2, y: oPos.y + oH / 2 };
            const tPos = getNodePosition(otherNode);
            const tW = otherNode.measured?.width || (otherNode as unknown as Record<string, any>).width || 0;
            const tH = otherNode.measured?.height || (otherNode as unknown as Record<string, any>).height || 0;
            const tC = { x: tPos.x + tW / 2, y: tPos.y + tH / 2 };

            const layoutDir = job.layoutDirection || 'LR';
            const isHorz = layoutDir === 'LR' || layoutDir === 'RL';
            const dirSign = (layoutDir === 'RL' || layoutDir === 'BT') ? -1 : 1;
            const DEADZONE = 20;

            const refV = { x: tC.x - oC.x, y: tC.y - oC.y };
            const refDelta = isHorz ? refV.x : refV.y;
            if (Math.abs(refDelta) < DEADZONE) {
                return { edges: allPeers, key: 'ALL', members: allPeers.map(e => e.id) };
            }
            const forward = isSource ? ((refDelta * dirSign) > 0) : ((refDelta * dirSign) < 0);
            const refKey = forward ? 'FWD' : 'REV';
            const filtered = allPeers.filter(pe => {
                if (pe.id === job.edgeId) return true;
                const pid = isSource ? pe.target : pe.source;
                // [L-1] O(1) nodeMap lookup instead of O(N) nodes.find()
                const pn = nodeMap.get(pid);
                if (!pn) return false;
                const pPos = getNodePosition(pn);
                const pW = pn.measured?.width || (pn as unknown as Record<string, any>).width || 0;
                const pH = pn.measured?.height || (pn as unknown as Record<string, any>).height || 0;
                const pC = { x: pPos.x + pW / 2, y: pPos.y + pH / 2 };
                const v = { x: pC.x - oC.x, y: pC.y - oC.y };
                const d = isHorz ? v.x : v.y;
                if (Math.abs(d) < DEADZONE) return true;
                const fwd = isSource ? ((d * dirSign) > 0) : ((d * dirSign) < 0);
                return fwd === forward;
            });
            const chosen = filtered.length >= 2 ? filtered : allPeers;
            return { edges: chosen, key: filtered.length >= 2 ? refKey : 'ALL', members: chosen.map(e => e.id) };
        };

        const peerGroupForBus = (() => {
            const allPeers = (graph.edges as unknown as GraphEdge[]).filter(e =>
                job.isManyToOne ? e.target === job.target : job.isOneToMany ? e.source === job.source : false
            );
            if (allPeers.length === 0) return null;
            if (job.isManyToOne) return pickPeerGroup(job.target, false, allPeers, busOrientation.isHorz);
            if (job.isOneToMany) return pickPeerGroup(job.source, true, allPeers, busOrientation.isHorz);
            return null;
        })();

        if (peerGroupForBus) {
            busPeerGroupSize = peerGroupForBus.edges.length;
            busPeerGroupKey = peerGroupForBus.key;
            busPeerGroupMembers = peerGroupForBus.members;
        }

        if (!hasFixedSourcePort && job.isOneToMany && peerGroupForBus) {
            const nodes = graph.nodes as unknown as GraphNode[];
            if (peerGroupForBus.edges.length > 1) {
                const result = busDetector.calculateBusConsensus(
                    false, sRect, peerGroupForBus.edges,
                    nodes, spatialIndex || null, routingObstacles, startPos, hasExplicitSource
                );
                startPos = result.position;
                hasFixedSourcePort = result.hasFixed;
            }
        }

        if (!hasFixedTargetPort && job.isManyToOne && peerGroupForBus) {
            const nodes = graph.nodes as unknown as GraphNode[];
            if (peerGroupForBus.edges.length > 1) {
                const result = busDetector.calculateBusConsensus(
                    true, tRect, peerGroupForBus.edges,
                    nodes, spatialIndex || null, routingObstacles, endPos, hasExplicitTarget
                );
                endPos = result.position;
                hasFixedTargetPort = result.hasFixed;
            }
        }

        // [S5-P2] O2M peer 目标端口：使用 resolvePortFromTrunkAxis() 统一推算
        // 若无 trunk 信息，回退到中心点几何计算
        if (!hasFixedTargetPort && (job.isOneToMany || (job.busTrunkSource && job.busTrunkTarget))) {
            if (job.busTrunkSource && job.busTrunkTarget) {
                endPos = resolvePortFromTrunkAxis(tRect, sRect, true);
            } else {
                // Fallback: Center-to-Center Logic（无 trunk 时）
                const sCenter = { x: sRect.x + sRect.width / 2, y: sRect.y + sRect.height / 2 };
                const tCenter = { x: tRect.x + tRect.width / 2, y: tRect.y + tRect.height / 2 };
                const dx = sCenter.x - tCenter.x;
                const dy = sCenter.y - tCenter.y;
                const isHorizontalRel = Math.abs(dx) > Math.abs(dy) * 0.8;
                endPos = isHorizontalRel ? (dx > 0 ? Position.Right : Position.Left)
                                         : (dy > 0 ? Position.Bottom : Position.Top);
            }

            // [S5-P1] 障碍物回退：若推算端口被堵 > 2 个障碍物，尝试对称端口
            const blocked = countObstaclesInDirection(tRect, endPos, routingObstacles, 40);
            if (blocked > 2) {
                const fallback = getOppositePort(endPos);
                const fallbackBlocked = countObstaclesInDirection(tRect, fallback, routingObstacles, 40);
                if (fallbackBlocked < blocked) {
                    endPos = fallback;
                }
                // 若两者都堵，保持 endPos 不变，让 A* 负责绕行
            }
            hasFixedTargetPort = true;
        }

        // [S5-P2] M2O peer 源端口：使用 resolvePortFromTrunkAxis() 统一推算
        if (!hasFixedSourcePort && (job.isManyToOne || (job.busTrunkSource && job.busTrunkTarget))) {
            if (job.busTrunkSource && job.busTrunkTarget) {
                startPos = resolvePortFromTrunkAxis(sRect, tRect, false);
            } else {
                // Fallback: Center-to-Center Logic（无 trunk 时）
                const sCenter = { x: sRect.x + sRect.width / 2, y: sRect.y + sRect.height / 2 };
                const tCenter = { x: tRect.x + tRect.width / 2, y: tRect.y + tRect.height / 2 };
                const dx = tCenter.x - sCenter.x;
                const dy = tCenter.y - sCenter.y;
                const isHorizontalRel = Math.abs(dx) > Math.abs(dy) * 0.8;
                startPos = isHorizontalRel ? (dx > 0 ? Position.Right : Position.Left)
                                           : (dy > 0 ? Position.Bottom : Position.Top);
            }

            // [S5-P1] 障碍物回退：若推算端口被堵 > 2 个障碍物，尝试对称端口
            const blocked = countObstaclesInDirection(sRect, startPos, routingObstacles, 40);
            if (blocked > 2) {
                const fallback = getOppositePort(startPos);
                const fallbackBlocked = countObstaclesInDirection(sRect, fallback, routingObstacles, 40);
                if (fallbackBlocked < blocked) {
                    startPos = fallback;
                }
            }
            hasFixedSourcePort = true;
        }

        // 4.5 [MOVED] Reverse Edge bypass now runs AFTER port selection (Section 5.5)
        // to prevent portSelector from overriding the bypass ports.

        // 5. Port Selection
        const portUsage = runtime.portUsage || {};
        // [S5-P9] Pass constrained ports so bus-fixed sides are not overridden by cost optimization.
        // If a port has already been locked (hasFixed*), forward it as a constraint so selectPorts
        // only optimizes the unconstrained side.
        const pResult = portSelector.selectPorts(sRect, tRect, routingObstacles, {
            effectiveDir: busOrientation.busDir,
            portUsage,
            sourceId: job.source,
            targetId: job.target,
            lineObstacles: graph.pendingEdges, // [FIX P0] Enable crossing-aware port selection
            constrainedSourcePos: hasFixedSourcePort ? startPos : undefined,
            constrainedTargetPos: hasFixedTargetPort ? endPos : undefined,
        });

        const geometryForRules = analyzeGeometry(
            (tRect.x + tRect.width / 2) - (sRect.x + sRect.width / 2),
            (tRect.y + tRect.height / 2) - (sRect.y + sRect.height / 2),
            {
                // [S4-P11] Provide bounding boxes for precise boundary-gap collocated detection
                sourceBounds: { x: sRect.x, y: sRect.y, width: sRect.width, height: sRect.height },
                targetBounds: { x: tRect.x, y: tRect.y, width: tRect.width, height: tRect.height },
                sourceSize: { width: sRect.width, height: sRect.height },
                targetSize: { width: tRect.width, height: tRect.height },
            }
        );

        const portRules = getPortRulesForGeometry(geometryForRules);
        const currentCombo = portCombinationToString(startPos, endPos);
        const bestSourceCombo = portCombinationToString(pResult.sourcePos, endPos);
        const bestTargetCombo = portCombinationToString(startPos, pResult.targetPos);
        const currentForbidden = portRules.forbidden.includes(currentCombo);
        const bestSourceForbidden = portRules.forbidden.includes(bestSourceCombo);
        const bestTargetForbidden = portRules.forbidden.includes(bestTargetCombo);

        // [IRONCLAD LOCK] Bus Strictness: If it's a Bus Hub, we strictly enforce the Consensus Port.
        // We DO NOT allow override if it's a global trunk member, even if geometry rules consider it "forbidden"
        // because trunk logic often dictates orthogonal wrap-arounds that standard geometric rules prohibit.
        const allowSourceOverride = !isGlobalTrunkMember && ((!job.isOneToMany && config.portSelection.preferGeometryOverBus) || (currentForbidden && !bestSourceForbidden));
        const allowTargetOverride = !isGlobalTrunkMember && ((!job.isManyToOne && config.portSelection.preferGeometryOverBus) || (currentForbidden && !bestTargetForbidden));

        // Use optimal ports if they have high confidence or if no consensus was reached
        if (!hasFixedSourcePort && pResult.confidence > config.portSelection.highConfidenceThreshold) {
            startPos = pResult.sourcePos;
            hasFixedSourcePort = true;
        } else if (!hasFixedSourcePort && !hasExplicitSource && allowSourceOverride && !bestSourceForbidden && (currentForbidden || pResult.confidence > config.portSelection.highConfidenceThreshold) && pResult.sourcePos !== startPos) {
            startPos = pResult.sourcePos;
            hasFixedSourcePort = true;
        }
        if (!hasFixedTargetPort && pResult.confidence > config.portSelection.highConfidenceThreshold) {
            endPos = pResult.targetPos;
            hasFixedTargetPort = true;
        } else if (!hasFixedTargetPort && !hasExplicitTarget && allowTargetOverride && !bestTargetForbidden && (currentForbidden || pResult.confidence > config.portSelection.highConfidenceThreshold) && pResult.targetPos !== endPos) {
            endPos = pResult.targetPos;
            hasFixedTargetPort = true;
        }

        // 5.5 [FIX] Reverse Edge: Smart Bypass Port Selection (AFTER port selection)
        // Runs AFTER all bus/trunk/portSelector logic so it has final authority.
        // Forces same-side ports on a PERPENDICULAR side to create a U-turn bypass path.
        //
        // [FIX-diagonal] When the edge is classified as DIAGONAL (e.g. diagonal-ne for e21),
        // the geometry rules already have an optimal L-shape port (e.g. R→L or B→T).
        // Forcing same-side bypass (e.g. R→R) is both forbidden AND suboptimal.
        // Guard: only activate bypass if the dominant axis ratio is high (>1.8), meaning
        // the edge is nearly pure-horizontal or pure-vertical (i.e. a true U-turn case).
        let isReverseBypassActive = false;
        let reverseBypassSide: Position | null = null;

        // [FIX-crossgroup] Cross-group edges (source & target in different containers) should NOT
        // trigger U-turn bypass. They represent inter-module dependencies whose long arcs are
        // expected. Let A* find the optimal path directly without forcing same-side ports.
        const sParentId = (sNode as unknown as Record<string, unknown>)?.parentId
            || (sNode as unknown as Record<string, unknown>)?.parentNode;
        const tParentId = (tNode as unknown as Record<string, unknown>)?.parentId
            || (tNode as unknown as Record<string, unknown>)?.parentNode;
        const isCrossGroupEdge = !!(sParentId && tParentId && sParentId !== tParentId);

        // [FIX-trunk] Global trunk members (M2O/O2M) must NEVER activate the reverse bypass.
        // The Coordinator has already computed optimal trunk ports (e.g. Top/Bottom) via
        // resolvePortFromTrunkAxis(). Allowing the bypass to overwrite them with same-side
        // Right→Right ports is precisely what causes the large U-turn arcs seen in bus topologies.
        if (job.isReverseEdge && !isGlobalTrunkMember && !isCrossGroupEdge && !hasExplicitSource && !hasExplicitTarget) {
            // [FIX] Use ACTUAL geometry (dx/dy) to decide bypass side, NOT just layoutDirection.
            // If we blindly use layoutDirection='LR' → Top/Bottom, but the target is significantly
            // BELOW the source (dy > 0), then Bottom→Bottom creates a huge U-turn downward.
            // The bypass side should always be PERPENDICULAR to the dominant connection direction.
            const dx = (tRect.x + tRect.width / 2) - (sRect.x + sRect.width / 2);
            const dy = (tRect.y + tRect.height / 2) - (sRect.y + sRect.height / 2);
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);

            // [FIX-diagonal] Skip bypass for genuinely diagonal edges (dominant ratio < 1.8).
            // A diagonal edge like diagonal-ne has geometry rules that select better L-shape ports.
            // Forcing U-Turn bypass on diagonals produces forbidden same-side connections (e.g. R→R).
            const dominantRatio = (Math.max(absDx, absDy) + 1) / (Math.min(absDx, absDy) + 1);
            const isTrulyAxisAligned = dominantRatio >= 1.8;

            if (!isTrulyAxisAligned) {
                // Diagonal edge — let geometry-classifier port rules handle port selection.
                // The preferred ports (e.g. R→L for diagonal-ne) produce clean L-shapes.
                // [A1] debug log 已改为 config.debug 条件保护，删除生产环境每条边级的 console.log
                if (config.debug) console.log(`[Worker] ${job.source}→${job.target}: diagonal reverse edge (ratio=${dominantRatio.toFixed(2)}<1.8), skipping U-Turn bypass.`);
            } else if (absDx > absDy) {
                // Dominant horizontal → bypass via Top or Bottom (perpendicular)
                // [FIX-pathlen] Score = obstacle_weight + estimated_detour_length.
                // Pure obstacle count ignores that one side may require a far longer arc.
                const BYPASS_GAP = 80;
                const topCount = countObstaclesInDirection(sRect, Position.Top, routingObstacles, 120)
                               + countObstaclesInDirection(tRect, Position.Top, routingObstacles, 120);
                const bottomCount = countObstaclesInDirection(sRect, Position.Bottom, routingObstacles, 120)
                                  + countObstaclesInDirection(tRect, Position.Bottom, routingObstacles, 120);

                const topBypassY = Math.min(sRect.y, tRect.y) - BYPASS_GAP;
                const bottomBypassY = Math.max(sRect.y + sRect.height, tRect.y + tRect.height) + BYPASS_GAP;
                const topPathLen    = Math.abs(sRect.y - topBypassY)
                                    + absDx
                                    + Math.abs(tRect.y - topBypassY);
                const bottomPathLen = Math.abs((sRect.y + sRect.height) - bottomBypassY)
                                    + absDx
                                    + Math.abs((tRect.y + tRect.height) - bottomBypassY);

                const topScore    = topCount    * 200 + topPathLen;
                const bottomScore = bottomCount * 200 + bottomPathLen;
                reverseBypassSide = topScore <= bottomScore ? Position.Top : Position.Bottom;

                startPos = reverseBypassSide;
                endPos = reverseBypassSide;
                hasFixedSourcePort = true;
                hasFixedTargetPort = true;
                isReverseBypassActive = true;
            } else {
                // Dominant vertical → bypass via Left or Right (perpendicular)
                // [FIX-pathlen] Same scoring improvement: weight obstacle count + detour length.
                const BYPASS_GAP = 80;
                const leftCount = countObstaclesInDirection(sRect, Position.Left, routingObstacles, 120)
                                + countObstaclesInDirection(tRect, Position.Left, routingObstacles, 120);
                const rightCount = countObstaclesInDirection(sRect, Position.Right, routingObstacles, 120)
                                 + countObstaclesInDirection(tRect, Position.Right, routingObstacles, 120);

                const leftBypassX  = Math.min(sRect.x, tRect.x) - BYPASS_GAP;
                const rightBypassX = Math.max(sRect.x + sRect.width, tRect.x + tRect.width) + BYPASS_GAP;
                const leftPathLen  = Math.abs(sRect.x - leftBypassX)
                                   + absDy
                                   + Math.abs(tRect.x - leftBypassX);
                const rightPathLen = Math.abs((sRect.x + sRect.width) - rightBypassX)
                                   + absDy
                                   + Math.abs((tRect.x + tRect.width) - rightBypassX);

                const leftScore  = leftCount  * 200 + leftPathLen;
                const rightScore = rightCount * 200 + rightPathLen;

                // [FIX] When scores are very close (diff ≤ 5%), prefer the side where
                // the target is located to produce a shorter bypass arc.
                const scoreDiff = Math.abs(leftScore - rightScore);
                const scoreAvg  = (leftScore + rightScore) / 2;
                if (scoreDiff / (scoreAvg + 1) <= 0.05 && Math.abs(dx) > 50) {
                    reverseBypassSide = dx > 0 ? Position.Right : Position.Left;
                } else {
                    reverseBypassSide = leftScore <= rightScore ? Position.Left : Position.Right;
                }

                startPos = reverseBypassSide;
                endPos = reverseBypassSide;
                hasFixedSourcePort = true;
                hasFixedTargetPort = true;
                isReverseBypassActive = true;
            }
        }

        // 5.6 [FIX] Self-Collision Guard: Prevent port selections that force paths through own node body.
        // When bus/trunk logic selects a port that faces AWAY from the target (e.g., Bottom port
        // but target is to the upper-right), the A* path must loop back through the source node.
        // This guard detects such cases and overrides to the direct geometric port.
        // Only applies to non-reverse edges (reverse edges intentionally use same-side ports).
        if (!isReverseBypassActive && !hasExplicitSource && !hasExplicitTarget) {
            const sCx = sRect.x + sRect.width / 2;
            const sCy = sRect.y + sRect.height / 2;
            const tCx = tRect.x + tRect.width / 2;
            const tCy = tRect.y + tRect.height / 2;
            const dx = tCx - sCx;
            const dy = tCy - sCy;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);

            // Determine the direct geometric port (the side facing the target)
            const getDirectPort = (ddx: number, ddy: number, adx: number, ady: number): Position => {
                if (adx > ady) {
                    return ddx > 0 ? Position.Right : Position.Left;
                }
                return ddy > 0 ? Position.Bottom : Position.Top;
            };

            // Check if current source port faces AWAY from target
            // "Faces away" = port direction is OPPOSITE to approach direction on the dominant axis
            const checkPortConflict = (
                port: Position, ddx: number, ddy: number, adx: number, ady: number
            ): boolean => {
                if (adx > ady) {
                    // Dominant horizontal: port should face left or right toward target
                    if (ddx > 0 && port === Position.Left) return true;   // target right, exit left
                    if (ddx < 0 && port === Position.Right) return true;  // target left, exit right
                    // Also check if vertical port on dominant-horizontal edge
                    // Only flag if the vertical distance is small (would cross through node)
                    if ((port === Position.Top || port === Position.Bottom) && adx > ady * 2) {
                        // Strong horizontal dominance but using vertical port
                        if (port === Position.Bottom && ddy < 0) return true;  // exit down, target above
                        if (port === Position.Top && ddy > 0) return true;     // exit up, target below
                    }
                } else {
                    // Dominant vertical: port should face top or bottom toward target
                    if (ddy > 0 && port === Position.Top) return true;    // target below, exit up
                    if (ddy < 0 && port === Position.Bottom) return true; // target above, exit down
                    // Also check if horizontal port on dominant-vertical edge
                    if ((port === Position.Left || port === Position.Right) && ady > adx * 2) {
                        if (port === Position.Right && ddx < 0) return true;
                        if (port === Position.Left && ddx > 0) return true;
                    }
                }
                return false;
            };

            // Guard source port
            if (checkPortConflict(startPos, dx, dy, absDx, absDy)) {
                const directPort = getDirectPort(dx, dy, absDx, absDy);
                startPos = directPort;
            }

            // Guard target port (target sees the source as "incoming" — flip dx/dy perspective)
            if (checkPortConflict(endPos, -dx, -dy, absDx, absDy)) {
                const directPort = getDirectPort(-dx, -dy, absDx, absDy);
                endPos = directPort;
            }
        }

        // 5.7 [FIX-C-shape] C-shape anti-pattern guard — runs INDEPENDENTLY of the self-collision
        // guard above so it works even when hasExplicitSource/hasExplicitTarget are set.
        //
        // Problem: When BOTH ports are horizontal (Left/Right) but the nodes are primarily
        // vertically separated (|dy| >> |dx|), the orthogonal path must go:
        //   → horizontal stub → vertical leg → horizontal stub  (C-shape or Z-shape, 3 segments)
        // This is always worse than an L-shape path via Bottom→Top:
        //   → vertical leg → horizontal stub  (2 segments, direct)
        //
        // Trigger: both ports horizontal + |dy| > |dx| * 2 (vertical dominance)
        //          AND not a global trunk member (trunk ports are set by Coordinator)
        //          AND not a reverse bypass (bypass intentionally uses same-side ports)
        //          AND no edge-level explicit handle override (sourceHandle/targetHandle strings)
        if (!isReverseBypassActive && !isGlobalTrunkMember && !hasExplicitSource && !hasExplicitTarget) {
            const sCx2 = sRect.x + sRect.width / 2;
            const sCy2 = sRect.y + sRect.height / 2;
            const tCx2 = tRect.x + tRect.width / 2;
            const tCy2 = tRect.y + tRect.height / 2;
            const dx2 = tCx2 - sCx2;
            const dy2 = tCy2 - sCy2;
            const absDx2 = Math.abs(dx2);
            const absDy2 = Math.abs(dy2);

            const bothHoriz = (
                (startPos === Position.Left || startPos === Position.Right) &&
                (endPos   === Position.Left || endPos   === Position.Right)
            );
            const bothVert = (
                (startPos === Position.Top || startPos === Position.Bottom) &&
                (endPos   === Position.Top || endPos   === Position.Bottom)
            );

                // [A1] C-shape debug log 已移除（生产环境每次路由均输出会阻塞 Worker 消息队列）

            // [A2] 阈値 2× → 1.4×：更准确地捕获明显垂直主导但仍被渲染为 C-shape 的边
            // Draw.io 等价阈値约 1.3×，取 1.4× 为稳妙平衡点
            if (bothHoriz && absDy2 > absDx2 * 1.4) {
                // Strong vertical dominance with horizontal ports → C-shape → fix to L-shape
                startPos = dy2 > 0 ? Position.Bottom : Position.Top;
                endPos   = dy2 > 0 ? Position.Top    : Position.Bottom;
            } else if (bothVert && absDx2 > absDy2 * 1.4) {
                // Strong horizontal dominance with vertical ports → fix
                startPos = dx2 > 0 ? Position.Right : Position.Left;
                endPos   = dx2 > 0 ? Position.Left  : Position.Right;
            }
        }

        // 5.8 [FIX-crossgroup-lateral] Cross-subGroup lateral links should use facing side ports.
        // In domain layouts with horizontal subgroups, a left-lower node often connects to a
        // right-upper node. Pure geometry can pick Top/Bottom ports and A* then routes outside
        // the target container, creating the tall blue detour seen in WMS diagrams. If the two
        // node boxes are already separated by a clear horizontal gap, use the facing side ports
        // and still let A* handle obstacles between them.
        if (
            isCrossGroupEdge &&
            !isReverseBypassActive &&
            !isGlobalTrunkMember &&
            !job.isOneToMany &&
            !job.isManyToOne &&
            !hasExplicitSource &&
            !hasExplicitTarget
        ) {
            const rightwardGap = tRect.x - (sRect.x + sRect.width);
            const leftwardGap = sRect.x - (tRect.x + tRect.width);
            const lateralGap = Math.max(rightwardGap, leftwardGap);
            const minLateralGap = Math.max(80, Math.min(sRect.width, tRect.width) * 0.35);

            if (lateralGap > minLateralGap) {
                if (rightwardGap >= leftwardGap) {
                    startPos = Position.Right;
                    endPos = Position.Left;
                } else {
                    startPos = Position.Left;
                    endPos = Position.Right;
                }
                hasFixedSourcePort = true;
                hasFixedTargetPort = true;
            }
        }


        // 6. Coordinates with Distribution
        // [Bus Optimization] Force coalesced ports for Bus Hubs (Tree Root) to create a clean bundle
        // [FIX-port-spread] 但如果 Coordinator 明确设置了 count > 1（端口冲突扩展），
        // 尊重它——表示 O2M 和 M2O 需要在同侧用不同连接点，不能强制合并到中心。
        const forceSourceCoalesce = job.isOneToMany && (job.outgoingCount || 1) <= 1;
        const forceTargetCoalesce = job.isManyToOne && (job.incomingCount || 1) <= 1;
        const isBus = !!job.isOneToMany || !!job.isManyToOne;

        const outgoingCount = forceSourceCoalesce ? 1 : (job.outgoingCount || 1);
        const incomingCount = forceTargetCoalesce ? 1 : (job.incomingCount || 1);
        const allowSourceSlide = !isBus && config.portSelection.enableDynamicPorts;
        const allowTargetSlide = !isBus && config.portSelection.enableDynamicPorts;

        const srcCenter = { x: sRect.x + sRect.width / 2, y: sRect.y + sRect.height / 2 };
        const tgtCenter = { x: tRect.x + tRect.width / 2, y: tRect.y + tRect.height / 2 };
        const sharedCenter = {
            x: (srcCenter.x + tgtCenter.x) / 2,
            y: (srcCenter.y + tgtCenter.y) / 2
        };

        const startPt = portSelector.getDistributedPortPoint(
            sRect, startPos,
            forceSourceCoalesce ? 0 : (job.outgoingIndex || 0),
            outgoingCount,
            allowSourceSlide ? sharedCenter : undefined
        );
        const endPt = portSelector.getDistributedPortPoint(
            tRect, endPos,
            forceTargetCoalesce ? 0 : (job.incomingIndex || 0),
            incomingCount,
            allowTargetSlide ? sharedCenter : undefined
        );

        // Apply Offsets (Stubs) to avoid being trapped in obstacle padding
        const startWithOffset = getPortOffsetPoint(startPt.x, startPt.y, startPos, config.offsets.source);
        const endWithOffset = getPortOffsetPoint(endPt.x, endPt.y, endPos, config.offsets.target);

        // [DEBUG] Log Port Coordinates
        // if (job.edgeId === 'e7' || job.edgeId === 'e8') {
        //        // }

        // 7. Pathfinding Strategy
        let pathPoints: Point[] | null = null;
        let strategyName = 'Unknown';
        // [DEBUG] Container for pathfinding internals (grid, visited nodes)
        // [PERF] Only collect heavy debug data if explicitly requested for this edge
        const shouldCollectDebugData = job.debug === true;
        const debugData: { visited?: Point[]; grid?: { minX: number, minY: number, cols: number, rows: number, size: number, data: Int32Array } } = {};

        // [总线主干道] Check if trunk routing should be applied
        const isBusScenario = (job.isOneToMany || job.isManyToOne);
        const peerCount = job.isOneToMany ? (job.outgoingCount || 1) : (job.incomingCount || 1);
        const hasPrecomputedTrunk = !!(job.busTrunkSource && job.busTrunkTarget);
        const isSharedGlobalTrunk = hasPrecomputedTrunk && (((job as any).peerGroupSize || 0) > 1);

        // Use trunk if precomputed by Coordinator OR if local calculation deems it necessary
        // [Imp-12] Lower threshold to 1 for explict bus scenarios to ensure uniform routing style
        const shouldUseTrunk = hasPrecomputedTrunk || (isBusScenario && trunkCalculator.shouldUseTrunkRouting(peerCount, 1));


        if (shouldUseTrunk) {
            let trunkStart: Point | null = null;
            let trunkEnd: Point | null = null;
            let trunkAxis: number | null = null;
            let isVertical = false;

            // [T6] 提取公共辅助函数：将端口重置为基于 source→target 主轴方向的几何最优端口。
            // 原来此段代码在 3 处重复（precomputed trunk skip / unified guard vertical / horizontal）。
            // 提取后维护只需改一处，后续扩展（45°对角线判断等）只需在此添加。
            const resetPortsToGeometric = () => {
                if (hasExplicitSource || hasExplicitTarget) return;
                const gdx = (tRect.x + tRect.width / 2) - (sRect.x + sRect.width / 2);
                const gdy = (tRect.y + tRect.height / 2) - (sRect.y + sRect.height / 2);
                if (Math.abs(gdx) > Math.abs(gdy)) {
                    startPos = gdx > 0 ? Position.Right : Position.Left;
                    endPos   = gdx > 0 ? Position.Left  : Position.Right;
                } else {
                    startPos = gdy > 0 ? Position.Bottom : Position.Top;
                    endPos   = gdy > 0 ? Position.Top    : Position.Bottom;
                }
                hasFixedSourcePort = false;
                hasFixedTargetPort = false;
            };

            // [Imp-cross-domain] Priority 1: Use Precomputed Trunk from Coordinator (Global Context)
            if (hasPrecomputedTrunk && job.busTrunkSource && job.busTrunkTarget) {
                // [FIX-cross-domain] Force port alignment with trunkPort if provided
                let skipTrunkDueToSelfCross = false;
                if ((job as any).trunkPort) {
                    const trunkPortPos = (job as any).trunkPort as Position;

                    // [FIX-self-cross] Self-crossing guard:
                    // If trunkPort points AWAY from the target, the path must cross through
                    // the source/target node's own body. Detect and skip trunkPort for this edge.
                    const sCx = sRect.x + sRect.width / 2;
                    const sCy = sRect.y + sRect.height / 2;
                    const tCx = tRect.x + tRect.width / 2;
                    const tCy = tRect.y + tRect.height / 2;
                    const dx = tCx - sCx;
                    const dy = tCy - sCy;

                    let wouldSelfCross = false;
                    if (job.isOneToMany) {
                        // For O2M: trunkPort is the source (hub) port direction
                        // If port=Left but target is to the RIGHT → self-cross
                        // If port=Right but target is to the LEFT → self-cross
                        // If port=Top but target is BELOW → self-cross
                        // If port=Bottom but target is ABOVE → self-cross
                        if (trunkPortPos === Position.Left && dx > sRect.width / 2) wouldSelfCross = true;
                        else if (trunkPortPos === Position.Right && dx < -sRect.width / 2) wouldSelfCross = true;
                        else if (trunkPortPos === Position.Top && dy > sRect.height / 2) wouldSelfCross = true;
                        else if (trunkPortPos === Position.Bottom && dy < -sRect.height / 2) wouldSelfCross = true;
                    } else if (job.isManyToOne) {
                        // For M2O: trunkPort is the target (hub) port direction
                        // Check from target's perspective: port points away from source
                        const rdx = sCx - tCx;
                        const rdy = sCy - tCy;
                        if (trunkPortPos === Position.Left && rdx > tRect.width / 2) wouldSelfCross = true;
                        else if (trunkPortPos === Position.Right && rdx < -tRect.width / 2) wouldSelfCross = true;
                        else if (trunkPortPos === Position.Top && rdy > tRect.height / 2) wouldSelfCross = true;
                        else if (trunkPortPos === Position.Bottom && rdy < -tRect.height / 2) wouldSelfCross = true;
                    }

                    if (wouldSelfCross) {
                        // Skip trunkPort: use geometric port selection instead, and skip trunk entirely
                        skipTrunkDueToSelfCross = true;
                    } else {
                        if (job.isOneToMany && !hasExplicitSource) {
                            startPos = trunkPortPos;
                            hasFixedSourcePort = true;
                        } else if (job.isManyToOne && !hasExplicitTarget) {
                            endPos = trunkPortPos;
                            hasFixedTargetPort = true;
                        }

                        // Recalculate anchor points to match the forced trunk port direction
                        const newStartPt = portSelector.getDistributedPortPoint(sRect, startPos, job.outgoingIndex || 0, job.outgoingCount || 1);
                        const newEndPt = portSelector.getDistributedPortPoint(tRect, endPos, job.incomingIndex || 0, job.incomingCount || 1);
                        
                        (startPt as any).x = newStartPt.x;
                        (startPt as any).y = newStartPt.y;
                        (endPt as any).x = newEndPt.x;
                        (endPt as any).y = newEndPt.y;

                        const sOffset = getPortOffsetPoint(newStartPt.x, newStartPt.y, startPos, config.offsets.source);
                        const tOffset = getPortOffsetPoint(newEndPt.x, newEndPt.y, endPos, config.offsets.target);
                        (startWithOffset as any).x = sOffset.x;
                        (startWithOffset as any).y = sOffset.y;
                        (endWithOffset as any).x = tOffset.x;
                        (endWithOffset as any).y = tOffset.y;
                    }
                }

                if (skipTrunkDueToSelfCross) {
                    // Fall through to A* pathfinding with geometric ports
                    resetPortsToGeometric();
                    if (!hasExplicitSource && !hasExplicitTarget) {
                        const newStartPt = portSelector.getDistributedPortPoint(sRect, startPos, job.outgoingIndex || 0, job.outgoingCount || 1);
                        const newEndPt = portSelector.getDistributedPortPoint(tRect, endPos, job.incomingIndex || 0, job.incomingCount || 1);
                        (startPt as { x: number; y: number }).x = newStartPt.x;
                        (startPt as { x: number; y: number }).y = newStartPt.y;
                        (endPt as { x: number; y: number }).x = newEndPt.x;
                        (endPt as { x: number; y: number }).y = newEndPt.y;
                        const newStartOffset = getPortOffsetPoint(newStartPt.x, newStartPt.y, startPos, config.offsets.source);
                        const newEndOffset = getPortOffsetPoint(newEndPt.x, newEndPt.y, endPos, config.offsets.target);
                        (startWithOffset as { x: number; y: number }).x = newStartOffset.x;
                        (startWithOffset as { x: number; y: number }).y = newStartOffset.y;
                        (endWithOffset as { x: number; y: number }).x = newEndOffset.x;
                        (endWithOffset as { x: number; y: number }).y = newEndOffset.y;
                    }
                } else {

                if (Math.abs(job.busTrunkSource.x - job.busTrunkTarget.x) < 1.0) {
                    isVertical = true;
                    trunkAxis = job.busTrunkSource.x;
                    trunkStart = { x: trunkAxis, y: startWithOffset.y };
                    trunkEnd = { x: trunkAxis, y: endWithOffset.y };
                } else {
                    // Horizontal trunk: trunk axis is a Y value.
                    // [FIX-shared-trunk] The horizontal segment must span the FULL group range
                    // (busTrunkSource.x → busTrunkTarget.x), NOT just this edge's startWithOffset.x
                    // → endWithOffset.x. Using per-edge x values caused each edge to walk only its
                    // own slice of the trunk, producing N parallel short horizontal stubs instead
                    // of one shared horizontal bus that all peers merge onto.
                    isVertical = false;
                    trunkAxis = job.busTrunkSource.y;
                    // The trunk segment spans the full group x-range from Coordinator.
                    const trunkXMin = Math.min(job.busTrunkSource.x, job.busTrunkTarget.x);
                    const trunkXMax = Math.max(job.busTrunkSource.x, job.busTrunkTarget.x);
                    // Each edge's branch touches the trunk at its own x position (clamped to range).
                    const branchSourceX = Math.max(trunkXMin, Math.min(trunkXMax, startWithOffset.x));
                    const branchTargetX = Math.max(trunkXMin, Math.min(trunkXMax, endWithOffset.x));
                    // trunkStart = point on trunk for this edge's SOURCE branch
                    // trunkEnd   = point on trunk for this edge's TARGET branch
                    trunkStart = { x: branchSourceX, y: trunkAxis };
                    trunkEnd   = { x: branchTargetX, y: trunkAxis };
                } // end horizontal trunk branch

                // [FIX] Detour Guard: Skip trunk routing when the precomputed trunk
                // forces an unreasonable detour for this specific edge.
                // In 1-to-Many scenarios, the trunk axis is computed for the GROUP of
                // edges (e.g., receipt→bi + receipt→putaway). If one edge's target is
                // in a completely different direction (e.g., straight down vs far right),
                // the trunk detour can be much longer than the direct path.
                // Guard: compare trunk Manhattan distance vs direct Manhattan distance.
                if (trunkStart && trunkEnd) {
                    const directManhattan = Math.abs(endWithOffset.x - startWithOffset.x)
                        + Math.abs(endWithOffset.y - startWithOffset.y);
                    const trunkManhattan = Math.abs(trunkStart.x - startWithOffset.x)
                        + Math.abs(trunkStart.y - startWithOffset.y)
                        + Math.abs(trunkEnd.x - trunkStart.x)
                        + Math.abs(trunkEnd.y - trunkStart.y)
                        + Math.abs(endWithOffset.x - trunkEnd.x)
                        + Math.abs(endWithOffset.y - trunkEnd.y);

                    // If trunk path is >2x longer than direct, skip trunk.
                    // This catches cases like receipt→putaway (direct=230px, trunk=580px).
                    let skipTrunk = !isSharedGlobalTrunk && directManhattan > 0 && trunkManhattan > directManhattan * 2;

                    // [FIX-C-shape] Additional guard: detect C-shape routing from vertical trunk.
                    // C-shape occurs when the path goes: source → (right) → trunkX → (down) → (left) → target.
                    // i.e., the horizontal step from source→trunk and trunk→target are in OPPOSITE directions.
                    // This is geometrically suboptimal and should fall back to direct A* routing.
                    if (!skipTrunk && !isSharedGlobalTrunk && isVertical) {
                        const step1H = trunkStart.x - startWithOffset.x;
                        const step3H = endWithOffset.x - trunkEnd.x;
                        const isCshape = Math.abs(step1H) > 5 && Math.abs(step3H) > 5
                            && Math.sign(step1H) !== Math.sign(step3H);
                        if (isCshape) {
                            skipTrunk = true;
                        }
                    }
                    // Similarly for horizontal trunk producing C-shape in vertical direction.
                    if (!skipTrunk && !isSharedGlobalTrunk && !isVertical) {
                        const step1V = trunkStart.y - startWithOffset.y;
                        const step3V = endWithOffset.y - trunkEnd.y;
                        const isCshape = Math.abs(step1V) > 5 && Math.abs(step3V) > 5
                            && Math.sign(step1V) !== Math.sign(step3V);
                        if (isCshape) {
                            skipTrunk = true;
                        }
                    }

                    if (skipTrunk) {
                        trunkStart = null;
                        trunkEnd = null;
                        trunkAxis = null;
                        // [T6] 使用提取的公共助手函数重置端口
                        resetPortsToGeometric();
                        // 重算端口锄点坐标以匹配新端口
                        if (!hasExplicitSource && !hasExplicitTarget) {
                            const newStartPt = portSelector.getDistributedPortPoint(sRect, startPos, job.outgoingIndex || 0, job.outgoingCount || 1);
                            const newEndPt = portSelector.getDistributedPortPoint(tRect, endPos, job.incomingIndex || 0, job.incomingCount || 1);
                            const portOffset: number = (config.algorithm as any).portOffset ?? 40;
                            (startPt as { x: number; y: number }).x = newStartPt.x;
                            (startPt as { x: number; y: number }).y = newStartPt.y;
                            (endPt as { x: number; y: number }).x = newEndPt.x;
                            (endPt as { x: number; y: number }).y = newEndPt.y;
                            (startWithOffset as { x: number; y: number }).x = startPos === Position.Left ? newStartPt.x - portOffset : startPos === Position.Right ? newStartPt.x + portOffset : newStartPt.x;
                            (startWithOffset as { x: number; y: number }).y = startPos === Position.Top ? newStartPt.y - portOffset : startPos === Position.Bottom ? newStartPt.y + portOffset : newStartPt.y;
                            (endWithOffset as { x: number; y: number }).x = endPos === Position.Left ? newEndPt.x - portOffset : endPos === Position.Right ? newEndPt.x + portOffset : newEndPt.x;
                            (endWithOffset as { x: number; y: number }).y = endPos === Position.Top ? newEndPt.y - portOffset : endPos === Position.Bottom ? newEndPt.y + portOffset : newEndPt.y;
                        }
                    }
                }
                } // end else (normal trunk path)
            } // end hasPrecomputedTrunk
            // Priority 2: Local Calculation (Fallback)
            else {
                const hubId = job.isOneToMany ? job.source : job.target;
                const hubNode = (graph.nodes as unknown as GraphNode[]).find(n => n.id === hubId);

                // [Bus Optimization] Filter peers by geometric quadrant to ensure trunk coherence
                // This prevents Reverse/Feedback edges from distorting the trunk axis
                const nodes = graph.nodes as unknown as GraphNode[];
                const edges = graph.edges as unknown as GraphEdge[];
                const currentQuad = busDetector.getEdgeQuadrant(job.edgeId, hubId, !!job.isOneToMany, nodes, edges);

                const allPeerEdges = (graph.edges as unknown as GraphEdge[]).filter(e =>
                    job.isOneToMany ? e.source === hubId : e.target === hubId
                );

                const coherentPeerEdges = busDetector.filterPeersByQuadrant(
                    allPeerEdges, hubId, !!job.isOneToMany, currentQuad, nodes, edges, job.layoutDirection || 'LR', job.edgeId
                );

                // Only proceed with trunk routing if we have enough coherent peers (min 2)
                // or if we really want to enforce trunk for single edges (usually not for local calc)
                const peerEdgesForTrunk = (coherentPeerEdges.length >= 2)
                    ? coherentPeerEdges
                    : (allPeerEdges.length >= 2 ? allPeerEdges : coherentPeerEdges);

                if (hubNode && peerEdgesForTrunk.length >= 2) {
                    const peerNodes = peerEdgesForTrunk.map(e => {
                        const pid = job.isOneToMany ? e.target : e.source;
                        // [L-1] O(1) nodeMap lookup instead of O(N) nodes.find() inside a loop
                        const n = nodeMap.get(pid);
                        if (!n) return null;
                        return {
                            x: getNodePosition(n).x,
                            y: getNodePosition(n).y,
                            width: n.measured?.width || 150,
                            height: n.measured?.height || 80
                        } as Rectangle;
                    }).filter((n): n is Rectangle => n !== null);

                    const hubRect = {
                        x: getNodePosition(hubNode).x,
                        y: getNodePosition(hubNode).y,
                        width: hubNode.measured?.width || 150,
                        height: hubNode.measured?.height || 80
                    };

                    const treeTrunk = trunkCalculator.calculateTreeTrunk(
                        hubRect, peerNodes, !!job.isManyToOne, config, job.layoutDirection,
                        undefined,            // precomputedCentroid: 本地计算路径不预传
                        routingObstacles      // [T1] 传入障碍物，启用轴线扫描避障
                    );

                    if (treeTrunk.direction === 'vertical') {
                        isVertical = true;
                        trunkAxis = treeTrunk.axis;
                        trunkStart = { x: treeTrunk.axis, y: startWithOffset.y };
                        trunkEnd = { x: treeTrunk.axis, y: endWithOffset.y };
                    } else {
                        isVertical = false;
                        trunkAxis = treeTrunk.axis;
                        trunkStart = { x: startWithOffset.x, y: treeTrunk.axis };
                        trunkEnd = { x: endWithOffset.x, y: treeTrunk.axis };
                    }
                } else {
                    // if (['e21', 'e22'].includes(job.edgeId)) {
                    //                    // }
                }
            }

            // [FIX-C-shape UNIFIED] Unified C-shape guard for BOTH precomputed and locally-calculated trunks.
            // After trunk points are resolved (from either priority 1 or 2), check if routing through
            // the trunk produces a C-shape (source exits in one horizontal direction, but must re-enter
            // from the opposite side to reach the target). If so, skip trunk and use direct A* routing.
            // This is the single authoritative guard for C-shape prevention.

            // [T6] Unified C-shape guard — 使用提取的 resetPortsToGeometric() 替代 3 处重复代码块
            if (trunkStart && trunkEnd && trunkAxis !== null) {
                let shouldSkipTrunk = false;
                if (isVertical) {
                    const step1H = trunkStart.x - startWithOffset.x;
                    const step3H = endWithOffset.x - trunkEnd.x;
                    if (Math.abs(step1H) > 5 && Math.abs(step3H) > 5 && Math.sign(step1H) !== Math.sign(step3H)) {
                        shouldSkipTrunk = true;
                        resetPortsToGeometric(); // [T6]
                    }
                } else {
                    const step1V = trunkStart.y - startWithOffset.y;
                    const step3V = endWithOffset.y - trunkEnd.y;
                    if (Math.abs(step1V) > 5 && Math.abs(step3V) > 5 && Math.sign(step1V) !== Math.sign(step3V)) {
                        shouldSkipTrunk = true;
                        resetPortsToGeometric(); // [T6]
                    }
                }
                if (shouldSkipTrunk) {
                    trunkStart = null;
                    trunkEnd = null;
                    trunkAxis = null;
                    // 重算端口锄点坐标（启用 getPortOffsetPoint 精确计算 offset）
                    if (!hasExplicitSource && !hasExplicitTarget) {
                        const newStartPt = portSelector.getDistributedPortPoint(sRect, startPos, job.outgoingIndex || 0, job.outgoingCount || 1);
                        const newEndPt = portSelector.getDistributedPortPoint(tRect, endPos, job.incomingIndex || 0, job.incomingCount || 1);
                        (startPt as { x: number; y: number }).x = newStartPt.x;
                        (startPt as { x: number; y: number }).y = newStartPt.y;
                        (endPt as { x: number; y: number }).x = newEndPt.x;
                        (endPt as { x: number; y: number }).y = newEndPt.y;
                        const newStartOffset = getPortOffsetPoint(newStartPt.x, newStartPt.y, startPos, config.offsets.source);
                        const newEndOffset = getPortOffsetPoint(newEndPt.x, newEndPt.y, endPos, config.offsets.target);
                        (startWithOffset as { x: number; y: number }).x = newStartOffset.x;
                        (startWithOffset as { x: number; y: number }).y = newStartOffset.y;
                        (endWithOffset as { x: number; y: number }).x = newEndOffset.x;
                        (endWithOffset as { x: number; y: number }).y = newEndOffset.y;
                    }
                }
            }

            // Execute Trunk Routing if we have valid trunk points (after unified C-shape guard)
            if (trunkStart && trunkEnd && trunkAxis !== null) {
                // [Validation] Ensure the trunk provides minimal clearance from the Hub to prevent overlap
                const hubRect = job.isOneToMany ? sRect : tRect;
                const hubCenterAxis = isVertical
                    ? hubRect.x + hubRect.width / 2
                    : hubRect.y + hubRect.height / 2;
                const hubExtent = isVertical ? hubRect.width / 2 : hubRect.height / 2;

                const dist = Math.abs(trunkAxis - hubCenterAxis);
                // If trunk is INSIDE the hub (dist < hubExtent), that's invalid.
                // We add a small buffer (e.g., 5px) to be safe.
                if (dist < hubExtent + 5) {
                    trunkStart = null; // Invalidate to fall back to standard routing
                } else {
                    // [Industry Standard] Construct Manhattan Path directly
                    // Instead of A*, we construct the orthogonal segments:
                    // 1. Branch -> Trunk Axis (Horizontal/Vertical)
                    // 2. Along Trunk Axis
                    // 3. Trunk Axis -> Hub (Horizontal/Vertical)

                    // Construct ideal waypoints
                    const waypoints = [startPt];
                    if (isVertical) {
                        if (startPos === Position.Top || startPos === Position.Bottom) waypoints.push(startWithOffset);
                        waypoints.push(trunkStart, trunkEnd);
                        if (endPos === Position.Top || endPos === Position.Bottom) waypoints.push(endWithOffset);
                    } else {
                        // Horizontal trunk (isVertical=false): Top/Bottom ports connect vertically
                        // to the trunk, then the trunk runs horizontally.
                        // [FIX-orthogonal] Always add startWithOffset/endWithOffset regardless of
                        // port direction. Without them, the path goes DIAGONALLY from startPt to
                        // trunkStart when branchSourceX ≠ startPt.x (clamped edge case).
                        // With them, the path is: startPt → startWithOffset (stub) →
                        // {startWithOffset.x, trunkAxis} [=trunkStart] → {endWithOffset.x, trunkAxis}
                        // [=trunkEnd] → endWithOffset (stub) → endPt — fully orthogonal.
                        waypoints.push(startWithOffset);
                        waypoints.push(trunkStart, trunkEnd);
                        waypoints.push(endWithOffset);
                    }
                    waypoints.push(endPt);

                    // Verify orthogonality and clean up collinear points
                    // trunkStart is calculated to share one coord with startWithOffset, so it forms a straight line.
                    // trunkEnd is calculated to share one coord with endWithOffset, so it forms a straight line.
                    // trunkStart and trunkEnd share the trunkAxis coord, so they form a straight line.

                    // Check for obstacles on this strict path
                    let isBlocked = false;
                    
                    // [FIX P2] Dynamic collision padding: use 30% of the actual gap to trunk, capped at 8px.
                    // Fixed 10px was too large for dense graphs (gap ~15px), causing most trunks to fall back to A*.
                    const trunkGapDist = Math.hypot(
                        trunkStart.x - startWithOffset.x,
                        trunkStart.y - startWithOffset.y
                    );
                    const dynamicPadding = Math.min(8, trunkGapDist * 0.3);

                    // [H-7] Use spatialIndex for trunk obstacle checks when available.
                    // Falls back to raw array — ObstacleAnalyzer.intersectsAnyObstacle handles both.
                    const trunkObstacles = spatialIndex ?? routingObstacles;

                    // [RESTORED] Always check for obstacles to maintain good obstacle avoidance.
                    // Previously this was skipped for Precomputed Trunks, which caused lines to plow through nodes.
                    if (analyzer.intersectsAnyObstacle(startWithOffset, trunkStart, trunkObstacles, dynamicPadding)) isBlocked = true;
                    if (!isBlocked && analyzer.intersectsAnyObstacle(trunkStart, trunkEnd, trunkObstacles, dynamicPadding)) isBlocked = true;
                    if (!isBlocked && analyzer.intersectsAnyObstacle(trunkEnd, endWithOffset, trunkObstacles, dynamicPadding)) isBlocked = true;

                    if (!isBlocked) {
                        pathPoints = waypoints;
                        strategyName = hasPrecomputedTrunk ? 'Global Trunk Direct' : 'Local Trunk Direct';
                    }
                    // [FIX] We do NOT invalidate trunkStart here anymore. 
                    // If it is blocked, we let it fall through to the Trunk A* fallback segment
                    // below, which preserves the trunk anchors while gracefully detouring around the obstacle.
                    
                    // If blocked, fall back to A* but use trunk points as mandatory waypoints
                    if (pathPoints === null && trunkStart !== null) { // Only proceed if trunkStart is still valid
                        // Route Segment 1: Start -> TrunkStart
                        const seg1 = astar.findPath(startWithOffset, trunkStart, {
                            grid: prebuiltGrid || gridBuilder.buildGrid(spatialIndex || graph.obstacles, {
                                startX: startWithOffset.x, startY: startWithOffset.y,
                                endX: trunkStart.x, endY: trunkStart.y
                            }, job.source, job.target),
                            obstacles: routingObstacles,
                            clearanceRects,
                            config,
                            congestionGrid: runtime.congestionGrid,
                            debugOut: shouldCollectDebugData ? debugData : undefined
                        });

                        // Route Segment 2: TrunkStart -> TrunkEnd (The Main Trunk)
                        const seg2 = astar.findPath(trunkStart, trunkEnd, {
                            grid: prebuiltGrid || gridBuilder.buildGrid(spatialIndex || graph.obstacles, {
                                startX: trunkStart.x, startY: trunkStart.y,
                                endX: trunkEnd.x, endY: trunkEnd.y
                            }, job.source, job.target),
                            obstacles: routingObstacles,
                            clearanceRects,
                            config,
                            congestionGrid: runtime.congestionGrid,
                            debugOut: shouldCollectDebugData ? debugData : undefined
                        });

                        // Route Segment 3: TrunkEnd -> End
                        const seg3 = astar.findPath(trunkEnd, endWithOffset, {
                            grid: prebuiltGrid || gridBuilder.buildGrid(spatialIndex || graph.obstacles, {
                                startX: trunkEnd.x, startY: trunkEnd.y,
                                endX: endWithOffset.x, endY: endWithOffset.y
                            }, job.source, job.target),
                            obstacles: routingObstacles,
                            clearanceRects,
                            config,
                            congestionGrid: runtime.congestionGrid,
                            debugOut: shouldCollectDebugData ? debugData : undefined
                        });

                        if (seg1 && seg2 && seg3) {
                            const trunkInternal = [...seg1, ...seg2, ...seg3];
                            const stitched = ensureSafeStitch(trunkInternal, startWithOffset, endWithOffset, routingObstacles);
                            pathPoints = [startPt, ...stitched, endPt];
                            strategyName = 'Trunk A*';
                        }
                    }
                }
            }
        }

        function samePoint(a: Point, b: Point) {
            return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 0.5;
        }

        // Helper to check if a sequence of points intersects any obstacles
        function isPathBlocked(path: Point[], obstacles: Rectangle[], padding: number = 0) {
            for (let i = 0; i < path.length - 1; i++) {
                if (analyzer.intersectsAnyObstacle(path[i], path[i+1], obstacles, padding)) {
                    return true;
                }
            }
            return false;
        }

        // [FIX] Avoid piercing obstacles when stitching snapped A* grid points back to precise origins/endpoints
        function ensureSafeStitch(pts: Point[], start: Point, end: Point, obstacles: Rectangle[]) {
            let res = [...pts];
            if (res.length === 0) return [start, end];

            // Safely stitch START if disconnected
            if (!samePoint(res[0], start)) {
                // If a direct line cuts an obstacle, it means start was inside a padding zone 
                // and the safe start is across an obstacle. Route with L-shape.
                const directPath = [start, res[0]];
                if (isPathBlocked(directPath, obstacles, 0)) {
                    // Try primitive L-shapes to orbit the penetrating label/obstacle
                    const cornerA = { x: start.x, y: res[0].y };
                    const cornerB = { x: res[0].x, y: start.y };
                    if (!isPathBlocked([start, cornerA, res[0]], obstacles, 0)) {
                        res = [start, cornerA, ...res];
                    } else if (!isPathBlocked([start, cornerB, res[0]], obstacles, 0)) {
                        res = [start, cornerB, ...res];
                    } else {
                        res = [start, ...res]; // Blind fallback
                    }
                } else {
                    res = [start, ...res];
                }
            }

            // Safely stitch END if disconnected
            const last = res[res.length - 1];
            if (!samePoint(last, end)) {
                const directPath = [last, end];
                // [FIX] Checking penetration with 0 padding to ONLY prevent hard clipping of the label text
                if (isPathBlocked(directPath, obstacles, 0)) {
                    const cornerA = { x: last.x, y: end.y };
                    const cornerB = { x: end.x, y: last.y };
                    if (!isPathBlocked([last, cornerA, end], obstacles, 0)) {
                        res = [...res, cornerA, end];
                    } else if (!isPathBlocked([last, cornerB, end], obstacles, 0)) {
                        res = [...res, cornerB, end];
                    } else {
                        res = [...res, end]; // Blind fallback
                    }
                } else {
                    res = [...res, end];
                }
            }
            return res;
        }

        // 7.5 [FIX] Reverse Edge: Forced U-turn Path Construction
        // When bypass is active, construct a deterministic U-shaped orthogonal path
        // instead of relying on A* which may take shortcuts through obstacles.
        if (!pathPoints && isReverseBypassActive && reverseBypassSide !== null) {
            const layoutDir = job.layoutDirection || 'TB';
            const isVerticalFlow = layoutDir === 'TB' || layoutDir === 'BT';

            // Calculate the bypass offset: how far to detour from the edge of both nodes
            // Based on the bounding box of obstacles between source and target
            const minX = Math.min(sRect.x, tRect.x);
            const maxX = Math.max(sRect.x + sRect.width, tRect.x + tRect.width);
            const minY = Math.min(sRect.y, tRect.y);
            const maxY = Math.max(sRect.y + sRect.height, tRect.y + tRect.height);

            // Find obstacles in the corridor between source and target
            // [FIX] For vertical flow: only consider obstacles in the X-band between/near source & target,
            // not ALL obstacles in the Y-range. Previously, nodes far to the right (e.g. a group container)
            // would inflate farthestRight, causing the bypass line to hug their right edge with only 40px clearance.
            const CORRIDOR_X_SLACK = 80; // allow obstacles slightly outside the S/T bounding box
            const corridorObstacles = routingObstacles.filter(o => {
                if (isVerticalFlow) {
                    // Must overlap the Y-range between source and target
                    const inY = o.y + o.height > minY && o.y < maxY;
                    if (!inY) return false;
                    // [FIX] Also must be within the relevant X-band (near source/target column)
                    // Don't let distant groups on the right inflate farthestRight
                    const inX = o.x < maxX + CORRIDOR_X_SLACK && o.x + o.width > minX - CORRIDOR_X_SLACK;
                    return inX;
                } else {
                    // Must overlap the X-range between source and target
                    const inX = o.x + o.width > minX && o.x < maxX;
                    if (!inX) return false;
                    // [FIX] Also constrain Y-band
                    const inY = o.y < maxY + CORRIDOR_X_SLACK && o.y + o.height > minY - CORRIDOR_X_SLACK;
                    return inY;
                }
            });

            // Calculate bypass distance: furthest obstacle edge + padding
            // [FIX] Increased from 40 to 60 for better visual clearance from adjacent nodes
            const BYPASS_PADDING = 60;
            let bypassCoord: number;

            if (isVerticalFlow) {
                // Bypass left or right
                if (reverseBypassSide === Position.Left) {
                    let farthestLeft = Math.min(sRect.x, tRect.x);
                    for (const o of corridorObstacles) {
                        if (o.x < farthestLeft) farthestLeft = o.x;
                    }
                    bypassCoord = farthestLeft - BYPASS_PADDING;
                } else {
                    let farthestRight = Math.max(sRect.x + sRect.width, tRect.x + tRect.width);
                    for (const o of corridorObstacles) {
                        if (o.x + o.width > farthestRight) farthestRight = o.x + o.width;
                    }
                    bypassCoord = farthestRight + BYPASS_PADDING;
                }

                // Construct U-turn: startPt → offset → bypass column → offset → endPt
                pathPoints = [
                    startPt,
                    startWithOffset,
                    { x: bypassCoord, y: startWithOffset.y },
                    { x: bypassCoord, y: endWithOffset.y },
                    endWithOffset,
                    endPt
                ];
            } else {
                // Horizontal flow: bypass top or bottom
                if (reverseBypassSide === Position.Top) {
                    let farthestTop = Math.min(sRect.y, tRect.y);
                    for (const o of corridorObstacles) {
                        if (o.y < farthestTop) farthestTop = o.y;
                    }
                    bypassCoord = farthestTop - BYPASS_PADDING;
                } else {
                    let farthestBottom = Math.max(sRect.y + sRect.height, tRect.y + tRect.height);
                    for (const o of corridorObstacles) {
                        if (o.y + o.height > farthestBottom) farthestBottom = o.y + o.height;
                    }
                    bypassCoord = farthestBottom + BYPASS_PADDING;
                }

                pathPoints = [
                    startPt,
                    startWithOffset,
                    { x: startWithOffset.x, y: bypassCoord },
                    { x: endWithOffset.x, y: bypassCoord },
                    endWithOffset,
                    endPt
                ];
            }
            strategyName = 'Reverse U-Turn';
        }

        // Fallback to standard routing if trunk routing failed or not applicable
        if (!pathPoints) {
            const activeObstacles = routingObstacles;
            
            // [FIX] Extract lineObstacles early so both VG and A* can use it to avoid crossings
            const lineObstacles = (graph.pendingEdges ?? []) as import('../../algorithms/pathfinding').LineObstacle[];

            // Try Visibility Graph first if recommended
            if (config.algorithm.useVisibilityGraph) {
                // [FIX] Pass lineObstacles to VG so it avoids unnecessary crossings with existing edges
                const vgPathPoints = vgRouter.findPath(startWithOffset, endWithOffset, activeObstacles, undefined, lineObstacles);
                if (vgPathPoints) {
                    // [FIX] Strict Orthogonalization Pre-verification
                    // VG produces diagonal lines that geometrically graze obstacles.
                    // If the path passes through a tight channel, it may be mathematically impossible to orthogonalize it without piercing obstacles.
                    // We run a strict test. If it fails, we abort VG and fall back to Grid A* which is mathematically guaranteed to find safe orthogonal routes.
                    const testOrtho = makePathOrthogonal(vgPathPoints, {
                        sourcePos: startPos,
                        targetPos: endPos,
                        strictOrthogonal: true
                    }, activeObstacles);
                    
                    if (!testOrtho) {
                        if (shouldCollectDebugData) {
                            console.warn(`[Worker] Visibility Graph path aborted: Cannot be orthogonalized safely. Falling back to Grid A*.`);
                        }
                        pathPoints = null; // Abort VG
                    } else {
                        pathPoints = vgPathPoints;
                        strategyName = activeObstacles.length < routingObstacles.length ? 'Hybrid VG' : 'Visibility Graph';
                    }
                }
            }

            // Fallback to Grid A*
            if (!pathPoints) {
                const bounds = {
                    startX: startWithOffset.x, startY: startWithOffset.y,
                    endX: endWithOffset.x, endY: endWithOffset.y
                };
                
                const activeConfig = config;

                // [FIX] Use full graph.obstacles (including source/target) for grid building
                // so GridBuilder can rasterize them as OBSTACLE (no buffer padding via sourceId/targetId).
                // activeObstacles is filtered and excludes source/target, causing A* to tunnel through them.
                const grid = prebuiltGrid || gridBuilder.buildGrid(spatialIndex || graph.obstacles, bounds, job.source, job.target);

                // Route from offset to offset, then we will stitch startPt/endPt
                const offsetPath = astar.findPath(startWithOffset, endWithOffset, {
                    grid,
                    obstacles: activeObstacles,
                    clearanceRects,
                    config: activeConfig,
                    lineObstacles,               // [FIX] 将已路由边作为软避障目标
                    congestionGrid: runtime.congestionGrid, // [NEW] 
                    debugOut: shouldCollectDebugData ? debugData : undefined // [DEBUG]
                });

                if (offsetPath) {
                    const stitched = ensureSafeStitch(offsetPath, startWithOffset, endWithOffset, activeObstacles);
                    pathPoints = [startPt, ...stitched, endPt];
                    strategyName = activeObstacles.length < routingObstacles.length ? 'Hybrid A* Grid' : 'A* Grid';
                }
            } else {
                // Visibility Graph path also needs stitching if it was offset-to-offset
                const stitched = ensureSafeStitch(pathPoints, startWithOffset, endWithOffset, activeObstacles);
                pathPoints = [startPt, ...stitched, endPt];
            }
        }

        if (!pathPoints) {
            // [FALLBACK] Ensure visual continuity even if A* / VG fails
            console.warn(`[Worker] Pathfinding failed for ${job.edgeId}, falling back to simple path.`);

            // Try generating a simple path with obstacle awareness
            // [FIX] Use routingObstacles which is already filtered to exclude source/target
            const simple = generateSimplePath(startWithOffset, endWithOffset, routingObstacles);
            if (simple) {
                const stitched = ensureSafeStitch(simple, startWithOffset, endWithOffset, routingObstacles);
                pathPoints = [startPt, ...stitched, endPt];
                strategyName = 'Simple Fallback';
            } else {
                // Last resort: standard L-shape.
                strategyName = 'L-Shape Fallback';
                // Try both H-V and V-H, pick the one that doesn't immediately overlap source/target rects.
                const cornerHV = { x: endPt.x, y: startPt.y };
                const cornerVH = { x: startPt.x, y: endPt.y };

                // Helper to check overlap with source/target only
                const intersects = (p1: Point, p2: Point) => {
                    // Check intersection with Source/Target Rects (expanded slightly)
                    // We use the raw rects passed in context or job
                    // But here we just want a sanity check.
                    // A simple heuristic: does the segment run "through" the node?
                    // We assume startPt/endPt are on the boundary.
                    // So we mainly care if the corner is inside.
                    const sR = job.sourceRect || sRect;
                    const tR = job.targetRect || tRect;
                    const padding = 5;

                    const isInside = (p: Point, r: Rectangle) =>
                        p.x > r.x - padding && p.x < r.x + r.width + padding &&
                        p.y > r.y - padding && p.y < r.y + r.height + padding;

                    return isInside(p1, sR) || isInside(p1, tR) || isInside(p2, sR) || isInside(p2, tR);
                };

                const hvBad = intersects(cornerHV, cornerHV);
                const vhBad = intersects(cornerVH, cornerVH);

                if (!hvBad && vhBad) {
                    pathPoints = [startPt, startWithOffset, cornerHV, endWithOffset, endPt];
                } else if (hvBad && !vhBad) {
                    pathPoints = [startPt, startWithOffset, cornerVH, endWithOffset, endPt];
                } else {
                    // Default to H-V (Horizontal first) usually looks better for side-ports
                    // But if ports are Top/Bottom, V-H is better.
                    const isVerticalPorts = (startPos === Position.Top || startPos === Position.Bottom) &&
                        (endPos === Position.Top || endPos === Position.Bottom);

                    if (isVerticalPorts) {
                        pathPoints = [startPt, startWithOffset, cornerVH, endWithOffset, endPt];
                    } else {
                        pathPoints = [startPt, startWithOffset, cornerHV, endWithOffset, endPt];
                    }
                }
            }
        }

        // 8. Post-Processing
        const postContext = {
            config,
            obstacles: routingObstacles,
            startPos,
            endPos,
            metadata: {
                isOneToMany: !!job.isOneToMany,
                isManyToOne: !!job.isManyToOne,
                outgoingIndex: job.outgoingIndex || 0,
                outgoingCount: job.outgoingCount || 1,
                incomingIndex: job.incomingIndex || 0,
                incomingCount: job.incomingCount || 1,
                // [NEW] Global Channel Ordering
                globalChannelIndex: job.globalChannelIndex,
                globalChannelCount: job.globalChannelCount,
                globalChannelType: job.globalChannelType,
                // [FIX] Bidirectional Direct Offset — 之前遗漏导致 Phase 3b 从未生效
                bidirectionalChannel: job.bidirectionalChannel,
                bidirectionalSpacing: job.bidirectionalSpacing,
                bidirectionalCount: (job as any).bidirectionalCount,
                strategy: strategyName // [FIX] Pass strategy to prevent overwriting 'Trunk Direct'
            }
        };

        if (!pathPoints || pathPoints.length === 0) {
            return this.errorResult(job, 'Pathfinding failed to generate any path');
        }


        const { points: finalPoints, svgPath } = postProcessor.process(pathPoints, postContext);

        const sCenter = { x: sRect.x + sRect.width / 2, y: sRect.y + sRect.height / 2 };
        const tCenter = { x: tRect.x + tRect.width / 2, y: tRect.y + tRect.height / 2 };
        const centerDx = tCenter.x - sCenter.x;
        const centerDy = tCenter.y - sCenter.y;
        const detectedGeometry = analyzeGeometry(centerDx, centerDy, {
            sourceSize: { width: sRect.width, height: sRect.height },
            targetSize: { width: tRect.width, height: tRect.height }
        });

            // 9. Calculate Label Position from final path points
            // [FIX] Industry standard: place label at midpoint of the LONGEST segment,
            // not the middle waypoint. A bend point (short segment) is a poor label anchor.
            const labelPos = (() => {
                if (!finalPoints || finalPoints.length < 2) return { x: 0, y: 0 };
                let maxLen = -1;
                let bestP1 = finalPoints[0];
                let bestP2 = finalPoints[1];
                for (let i = 0; i < finalPoints.length - 1; i++) {
                    const dx = finalPoints[i + 1].x - finalPoints[i].x;
                    const dy = finalPoints[i + 1].y - finalPoints[i].y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    if (len > maxLen) {
                        maxLen = len;
                        bestP1 = finalPoints[i];
                        bestP2 = finalPoints[i + 1];
                    }
                }
                return { x: (bestP1.x + bestP2.x) / 2, y: (bestP1.y + bestP2.y) / 2 };
            })();


            // 10. 路径质量指标：弯折数、总长度、效率比
            // 效率比 = 直线距离 / 实际路径长度（完美直线=1.0，绕道越多越小）
            let bendCount = 0;
            let pathTotalLength = 0;
            if (finalPoints && finalPoints.length >= 2) {
                for (let i = 1; i < finalPoints.length; i++) {
                    const dx = finalPoints[i].x - finalPoints[i - 1].x;
                    const dy = finalPoints[i].y - finalPoints[i - 1].y;
                    pathTotalLength += Math.sqrt(dx * dx + dy * dy);
                    if (i >= 2) {
                        const pdx = finalPoints[i - 1].x - finalPoints[i - 2].x;
                        const pdy = finalPoints[i - 1].y - finalPoints[i - 2].y;
                        // 平行向量不算弯折（共线点）
                        const cross = Math.abs(pdx * dy - pdy * dx);
                        if (cross > 0.5) bendCount++;
                    }
                }
            }
            const straightDist = (() => {
                const fp = finalPoints?.[0];
                const lp = finalPoints?.[finalPoints.length - 1];
                if (!fp || !lp) return 0;
                const dx = lp.x - fp.x;
                const dy = lp.y - fp.y;
                return Math.sqrt(dx * dx + dy * dy);
            })();
            const efficiencyRatio = pathTotalLength > 0
                ? Math.min(1, straightDist / pathTotalLength)
                : 1;

            return {
                jobId: job.jobId,
                edgeId: job.edgeId,
                path: svgPath,
                points: finalPoints,
                labelX: labelPos.x,
                labelY: labelPos.y,
                sourcePos: startPos,
            targetPos: endPos,
            usedSourcePos: startPos,
            usedTargetPos: endPos,
            effectiveIsManyToOne: job.effectiveIsManyToOne,
            busTrunkSource: job.busTrunkSource,
            busTrunkTarget: job.busTrunkTarget,
            metadata: {
                strategy: strategyName,
                // [路径质量] 弯折数、总长度、效率比
                bendCount,
                pathLength: Math.round(pathTotalLength),
                efficiencyRatio: Math.round(efficiencyRatio * 100) / 100,
            },
            debugInfo: {
                algorithmDebug: {
                    strategy: strategyName,
                    rawPoints: pathPoints,
                    visited: debugData.visited,
                    grid: debugData.grid,
                    obstacles: routingObstacles, // [FIX] Pass obstacles to debug info
                    sourceRect: sRect,
                    targetRect: tRect,
                    portSelection: {
                        selected: { source: startPos, target: endPos },
                        layoutDirection: job.layoutDirection,
                        detectedGeometry,
                        hasExplicitSource,
                        hasExplicitTarget,
                        isManyToOne: !!job.isManyToOne,
                        incomingCount: typeof job.incomingCount === 'number' ? job.incomingCount : (job.isManyToOne ? 1 : 0),
                        hasPrecomputedTrunk,
                        peerGroupSize: busPeerGroupSize,
                        peerGroupKey: busPeerGroupKey,
                        peerGroupMembers: busPeerGroupMembers,
                        trunkAxis: hasPrecomputedTrunk && job.busTrunkSource && job.busTrunkTarget
                            ? (Math.abs(job.busTrunkSource.x - job.busTrunkTarget.x) < 1.0 ? job.busTrunkSource.x : job.busTrunkSource.y)
                            : null,
                        trunkVertical: hasPrecomputedTrunk && job.busTrunkSource && job.busTrunkTarget
                            ? Math.abs(job.busTrunkSource.x - job.busTrunkTarget.x) < 1.0
                            : null,
                        sourceHandle: job.sourceHandle,
                        targetHandle: job.targetHandle,
                        centers: { source: sCenter, target: tCenter, dx: centerDx, dy: centerDy }
                    }
                },
                obstacles: routingObstacles, // [FIX] Top-level access
                selectedSourcePos: startPos,
                selectedTargetPos: endPos
            }
        };
    }

    private static errorResult(job: PathFindingJob, message: string): PathFindingResult {
        return {
            jobId: job.jobId,
            edgeId: job.edgeId,
            path: '',
            points: [],
            labelX: 0,
            labelY: 0,
            error: message
        };
    }

    /**
     * [B4] 静态方法：将 handle 字符串解析为 Position 枚举。
     * 原为 execute() 内的内联箭头函数，每条边调用时创建新闭包对象。
     * 提升为静态方法后，50 条边批处理中只有一个函数引用。
     */
    static parseHandleDir(h?: string | null): Position | undefined {
        if (!h) return undefined;
        const s = String(h).toLowerCase();
        // Priority 1: exact match
        if (s === 'left' || s === 'l')   return Position.Left;
        if (s === 'right' || s === 'r')  return Position.Right;
        if (s === 'top' || s === 't')    return Position.Top;
        if (s === 'bottom' || s === 'b') return Position.Bottom;
        // Priority 2: substring match (catches compound IDs like 'source-right', 't-right')
        if (s.includes('left'))   return Position.Left;
        if (s.includes('right'))  return Position.Right;
        if (s.includes('top'))    return Position.Top;
        if (s.includes('bottom')) return Position.Bottom;
        return undefined;
    }
}
