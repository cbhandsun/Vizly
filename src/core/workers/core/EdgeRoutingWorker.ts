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

import { GridBuilder } from './GridBuilder';
import { VisibilityGraphRouter } from './VisibilityGraphRouter';
import { AStarPathfinder } from './AStarPathfinder';
import { BusDetector } from '../preprocessing/BusDetector';
import { PortSelector } from '../preprocessing/PortSelector';
import { ObstacleAnalyzer } from '../preprocessing/ObstacleAnalyzer';
import { PathPostProcessor } from '../postprocessing/PathPostProcessor';
import { TrunkCalculator } from './TrunkCalculator';
import { countObstaclesInDirection } from './GraphBuilder';
import { getNodePosition, getPortOffsetPoint } from '../../algorithms/smartEdgeUtils';
import {
    logRoutingWorkerDebug,
} from '../../utils/routingLogging';
import {
    createSelfLoopRoutingResult,
    resolveWorkerRoutingContext,
    type WorkerGraphEdge as GraphEdge,
    type WorkerGraphNode as GraphNode,
} from './edgeRoutingWorkerContext';
import {
    chooseWorkerEndpointOrthogonalPort,
    collectWorkerPeerGroups,
    oppositeWorkerPort,
    resolveWorkerPortAnchors,
    resolveWorkerPortFromTrunkAxis,
} from './edgeRoutingWorkerBusGeometry';
import { applyWorkerPortGuards } from './edgeRoutingWorkerPortGuards';
import {
    buildWorkerPostProcessContext,
    buildWorkerRoutingResult,
} from './edgeRoutingWorkerResult';
import {
    buildWorkerReverseBypassPath,
    ensureSafeWorkerStitch,
    isWorkerPathBlocked,
} from './edgeRoutingWorkerPathSafety';
import { buildWorkerDualTrunkPath } from './edgeRoutingWorkerDualTrunk';
import { routeWorkerFallback } from './edgeRoutingWorkerFallback';
import { selectWorkerPorts } from './edgeRoutingWorkerPortSelection';

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
        const isPathBlocked = (path: Point[], obstacles: Rectangle[], padding = 0) =>
            isWorkerPathBlocked(path, obstacles, analyzer, padding);
        const ensureSafeStitch = (points: Point[], start: Point, end: Point, obstacles: Rectangle[]) =>
            ensureSafeWorkerStitch(points, start, end, obstacles, analyzer);
        // [B1] vgRouter/busDetector/portSelector 已加入单例缓存，不再每条边新建


        const contextResolution = resolveWorkerRoutingContext(
            job,
            graph,
            analyzer,
            prebuiltSpatialIndex
        );
        if (!contextResolution.ok) {
            return this.errorResult(job, contextResolution.error);
        }
        const {
            nodes: workerNodes,
            nodeMap,
            edgeMap,
            sourceNode: sNode,
            targetNode: tNode,
            sourceRect: sRect,
            targetRect: tRect,
            allObstacles,
            routingObstacles,
            clearanceRects,
            containerBorders,
            spatialIndex,
        } = contextResolution.value;
        if (job.source === job.target) {
            return createSelfLoopRoutingResult(job, sRect);
        }



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
        const fallbackTrunk = job.busTrunkSource && job.busTrunkTarget
            ? { source: job.busTrunkSource, target: job.busTrunkTarget }
            : undefined;

        // [S4] busSourcePort / busTargetPort 不再由 Coordinator 预注入。
        // 端口决策统一在此 Worker 内部，通过 busTrunkSource/busTrunkTarget 几何推算。
        // [S5-P2] O2M hub 源端口 + M2O hub 目标端口 统一使用 resolvePortFromTrunkAxis()

        // O2M: hub（源）面向 trunk axis
        // [FIX-dual] 去掉 !job.isManyToOne 互斥条件。
        // 双身份边同时有 O2M 和 M2O 的 trunk 数据，两端独立处理。
        // O2M 端使用 o2mTrunk 数据推算 source port。
        const o2mTrunk = job.busRoutingPlan?.o2mTrunk ?? job.o2mTrunk ?? (job as any).o2mTrunk;
        if (job.isOneToMany && o2mTrunk && !hasFixedSourcePort) {
            startPos = resolveWorkerPortFromTrunkAxis({
                rectangle: sRect,
                otherRectangle: tRect,
                trunkHint: o2mTrunk,
                fallbackTrunk,
                isGlobalTrunkMember,
            });
            hasFixedSourcePort = true;
        }

        // M2O: hub（目标）面向 trunk axis
        // [M2O TRUNK] Target node must face the trunk axis.
        // Trunk axis sits between the sources and the target.
        // → If trunk is ABOVE target: target faces UP → Position.Top
        // → If trunk is BELOW target: target faces DOWN → Position.Bottom
        // [FIX-shared-port] Same fix: don't pass per-edge source rect to hub port calculation.
        const m2oTrunk = job.busRoutingPlan?.m2oTrunk ?? job.m2oTrunk ?? (job as any).m2oTrunk;
        if (job.isManyToOne && m2oTrunk && !hasFixedTargetPort) {
            endPos = resolveWorkerPortFromTrunkAxis({
                rectangle: tRect,
                isTargetSide: true,
                trunkHint: m2oTrunk,
                fallbackTrunk,
                isGlobalTrunkMember,
            });
            hasFixedTargetPort = true;
        }

        // Dual-identity edges need two independent peer groups:
        // O2M owns the source-side fan-out; M2O owns the target-side fan-in.
        const { o2mPeerGroup, m2oPeerGroup } = collectWorkerPeerGroups(
            job,
            edgeMap,
            nodeMap
        );
        const peerGroupForDebug = o2mPeerGroup ?? m2oPeerGroup;

        if (peerGroupForDebug) {
            busPeerGroupSize = Math.max(o2mPeerGroup?.edges.length ?? 0, m2oPeerGroup?.edges.length ?? 0);
            busPeerGroupKey = [
                o2mPeerGroup ? `o2m:${o2mPeerGroup.key}` : null,
                m2oPeerGroup ? `m2o:${m2oPeerGroup.key}` : null,
            ].filter(Boolean).join('|') || peerGroupForDebug.key;
            busPeerGroupMembers = Array.from(new Set([
                ...(o2mPeerGroup?.members ?? []),
                ...(m2oPeerGroup?.members ?? []),
            ]));
        }

        // [FIX-dual] 去掉 !job.isManyToOne 互斥。O2M hub source port consensus。
        if (!hasFixedSourcePort && job.isOneToMany && o2mPeerGroup) {
            if (o2mPeerGroup.edges.length > 1) {
                const result = busDetector.calculateBusConsensus(
                    false, sRect, o2mPeerGroup.edges,
                    workerNodes, spatialIndex || null, routingObstacles, startPos, hasExplicitSource
                );
                startPos = result.position;
                hasFixedSourcePort = result.hasFixed;
            }
        }

        if (!hasFixedTargetPort && job.isManyToOne && m2oPeerGroup) {
            if (m2oPeerGroup.edges.length > 1) {
                const result = busDetector.calculateBusConsensus(
                    true, tRect, m2oPeerGroup.edges,
                    workerNodes, spatialIndex || null, routingObstacles, endPos, hasExplicitTarget
                );
                endPos = result.position;
                hasFixedTargetPort = result.hasFixed;
            }
        }

        // [S5-P2] O2M peer 目标端口：使用 resolvePortFromTrunkAxis() 统一推算
        // 若无 trunk 信息，回退到中心点几何计算
        if (!hasFixedTargetPort && (job.isOneToMany || (job.busTrunkSource && job.busTrunkTarget))) {
            if (job.busTrunkSource && job.busTrunkTarget) {
                // O2M peer 端用 o2mTrunk 数据
                endPos = resolveWorkerPortFromTrunkAxis({
                    rectangle: tRect,
                    otherRectangle: sRect,
                    isTargetSide: true,
                    trunkHint: o2mTrunk ?? undefined,
                    fallbackTrunk,
                    isGlobalTrunkMember,
                });
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
                const fallback = oppositeWorkerPort(endPos);
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
                // M2O peer 端用 m2oTrunk 数据
                startPos = resolveWorkerPortFromTrunkAxis({
                    rectangle: sRect,
                    otherRectangle: tRect,
                    trunkHint: m2oTrunk ?? undefined,
                    fallbackTrunk,
                    isGlobalTrunkMember,
                });
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
                const fallback = oppositeWorkerPort(startPos);
                const fallbackBlocked = countObstaclesInDirection(sRect, fallback, routingObstacles, 40);
                if (fallbackBlocked < blocked) {
                    startPos = fallback;
                }
            }
            hasFixedSourcePort = true;
        }

        // 5. Port Selection
        const portUsage = runtime.portUsage || {};
        const selectedPorts = selectWorkerPorts({
            job,
            config,
            selector: portSelector,
            sourceRect: sRect,
            targetRect: tRect,
            obstacles: routingObstacles,
            pendingEdges: graph.pendingEdges,
            effectiveDirection: busOrientation.busDir,
            portUsage,
            startPosition: startPos,
            endPosition: endPos,
            hasFixedSourcePort,
            hasFixedTargetPort,
            hasExplicitSource,
            hasExplicitTarget,
            isGlobalTrunkMember,
        });
        startPos = selectedPorts.startPosition;
        endPos = selectedPorts.endPosition;


        // 5.5 [FIX] Reverse Edge: Smart Bypass Port Selection (AFTER port selection)
        // Runs AFTER all bus/trunk/portSelector logic so it has final authority.
        // Forces same-side ports on a PERPENDICULAR side to create a U-turn bypass path.
        //
        // [FIX-diagonal] When the edge is classified as DIAGONAL (e.g. diagonal-ne for e21),
        // the geometry rules already have an optimal L-shape port (e.g. R→L or B→T).
        // Forcing same-side bypass (e.g. R→R) is both forbidden AND suboptimal.
        // Guard: only activate bypass if the dominant axis ratio is high (>1.8), meaning
        // the edge is nearly pure-horizontal or pure-vertical (i.e. a true U-turn case).
        const guardedPorts = applyWorkerPortGuards({
            job,
            sourceNode: sNode,
            targetNode: tNode,
            sourceRect: sRect,
            targetRect: tRect,
            routingObstacles,
            startPosition: startPos,
            endPosition: endPos,
            isGlobalTrunkMember,
            hasExplicitSource,
            hasExplicitTarget,
            onDebug: config.debug ? logRoutingWorkerDebug : undefined,
        });
        startPos = guardedPorts.startPosition;
        endPos = guardedPorts.endPosition;
        const { isReverseBypassActive, reverseBypassSide } = guardedPorts;

        // 5.6 [FIX] Self-Collision Guard: Prevent port selections that force paths through own node body.
        // When bus/trunk logic selects a port that faces AWAY from the target (e.g., Bottom port
        // but target is to the upper-right), the A* path must loop back through the source node.
        // This guard detects such cases and overrides to the direct geometric port.
        // Only applies to non-reverse edges (reverse edges intentionally use same-side ports).
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
        // 5.8 [FIX-crossgroup-lateral] Cross-subGroup lateral links should use facing side ports.
        // In domain layouts with horizontal subgroups, a left-lower node often connects to a
        // right-upper node. Pure geometry can pick Top/Bottom ports and A* then routes outside
        // the target container, creating the tall blue detour seen in WMS diagrams. If the two
        // node boxes are already separated by a clear horizontal gap, use the facing side ports
        // and still let A* handle obstacles between them.
        const isPrecomputedSharedTrunkMember =
            !!(job.busTrunkSource && job.busTrunkTarget) && ((job.busRoutingPlan?.peerGroupSize ?? job.peerGroupSize ?? 0) > 1);

        if (isPrecomputedSharedTrunkMember && job.isManyToOne && !hasExplicitSource) {
            startPos = resolveWorkerPortFromTrunkAxis({
                rectangle: sRect,
                otherRectangle: tRect,
                trunkHint: m2oTrunk ?? undefined,
                fallbackTrunk,
                isGlobalTrunkMember,
            });
        }

        // 6. Resolve distributed endpoint anchors and offset stubs.
        const portAnchors = resolveWorkerPortAnchors({
            job,
            config,
            selector: portSelector,
            sourceRect: sRect,
            targetRect: tRect,
            sourcePosition: startPos,
            targetPosition: endPos,
        });
        const {
            startPoint: startPt,
            endPoint: endPt,
            startOffset: startWithOffset,
            endOffset: endWithOffset,
        } = portAnchors;

        // 7. Pathfinding Strategy
        let pathPoints: Point[] | null = null;
        let strategyName = 'Unknown';
        const shouldCollectDebugData = job.debug === true;
        const shouldLogRouteDebug = config.debug === true && (config as any).verboseConsole === true;
        const debugData: { visited?: Point[]; grid?: { minX: number, minY: number, cols: number, rows: number, size: number, data: Int32Array } } = {};

        // [总线主干道] Check if trunk routing should be applied
        const isBusScenario = (job.isOneToMany || job.isManyToOne);
        const peerCount = job.isOneToMany ? (job.outgoingCount || 1) : (job.incomingCount || 1);
        const hasPrecomputedTrunk = !!(job.busTrunkSource && job.busTrunkTarget);
        const isSharedGlobalTrunk = hasPrecomputedTrunk && ((job.busRoutingPlan?.peerGroupSize ?? job.peerGroupSize ?? 0) > 1);

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
            };

            // [Imp-cross-domain] Priority 1: Use Precomputed Trunk from Coordinator (Global Context)
            if (hasPrecomputedTrunk && job.busTrunkSource && job.busTrunkTarget) {
                // [FIX-cross-domain] Force port alignment with trunkPort if provided
                let skipTrunkDueToSelfCross = false;
                // [FIX-dual] 双身份边分别处理 O2M source port 和 M2O target port
                const o2mPort = job.busRoutingPlan?.o2mTrunkPort ?? (job as any).o2mTrunkPort ?? ((job as any).trunkPort && job.isOneToMany && !job.isManyToOne ? (job as any).trunkPort : null);
                const m2oPort = job.busRoutingPlan?.m2oTrunkPort ?? (job as any).m2oTrunkPort ?? ((job as any).trunkPort && job.isManyToOne && !job.isOneToMany ? (job as any).trunkPort : null);
                const hasAnyTrunkPort = !!(o2mPort || m2oPort);
                if (hasAnyTrunkPort) {
                    const sCx = sRect.x + sRect.width / 2;
                    const sCy = sRect.y + sRect.height / 2;
                    const tCx = tRect.x + tRect.width / 2;
                    const tCy = tRect.y + tRect.height / 2;
                    const dx = tCx - sCx;
                    const dy = tCy - sCy;

                    // O2M: set source port
                    if (job.isOneToMany && o2mPort && !hasExplicitSource) {
                        let selfCross = false;
                        const resolvedO2mPort = chooseWorkerEndpointOrthogonalPort(sRect, tRect, o2mPort as Position);
                        if (resolvedO2mPort === Position.Left && dx > sRect.width / 2) selfCross = true;
                        else if (resolvedO2mPort === Position.Right && dx < -sRect.width / 2) selfCross = true;
                        else if (resolvedO2mPort === Position.Top && dy > sRect.height / 2) selfCross = true;
                        else if (resolvedO2mPort === Position.Bottom && dy < -sRect.height / 2) selfCross = true;
                        if (selfCross && !isSharedGlobalTrunk) {
                            skipTrunkDueToSelfCross = true;
                        } else {
                            startPos = resolvedO2mPort;
                        }
                    }

                    // M2O: set target port
                    if (job.isManyToOne && m2oPort && !hasExplicitTarget) {
                        const rdx = sCx - tCx;
                        const rdy = sCy - tCy;
                        let selfCross = false;
                        const resolvedM2oPort = m2oPort as Position;
                        if (resolvedM2oPort === Position.Left && rdx > tRect.width / 2) selfCross = true;
                        else if (resolvedM2oPort === Position.Right && rdx < -tRect.width / 2) selfCross = true;
                        else if (resolvedM2oPort === Position.Top && rdy > tRect.height / 2) selfCross = true;
                        else if (resolvedM2oPort === Position.Bottom && rdy < -tRect.height / 2) selfCross = true;
                        if (selfCross && !isSharedGlobalTrunk) {
                            skipTrunkDueToSelfCross = true;
                        } else {
                            endPos = resolvedM2oPort;
                        }
                    }

                    if (!skipTrunkDueToSelfCross) {
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
                    // [FIX-shared-trunk] Vertical trunk: use Coordinator's precomputed Y range
                    // (busTrunkSource.y → busTrunkTarget.y) as the shared trunk span.
                    // Previously used startWithOffset.y / endWithOffset.y which gave each edge
                    // its own Y slice — defeating trunk sharing.
                    const trunkYMin = Math.min(job.busTrunkSource.y, job.busTrunkTarget.y);
                    const trunkYMax = Math.max(job.busTrunkSource.y, job.busTrunkTarget.y);
                    // Each edge's branch touches the trunk at its own Y position (clamped to range)
                    const branchSourceY = Math.max(trunkYMin, Math.min(trunkYMax, startWithOffset.y));
                    const branchTargetY = Math.max(trunkYMin, Math.min(trunkYMax, endWithOffset.y));
                    trunkStart = { x: trunkAxis, y: branchSourceY };
                    trunkEnd = { x: trunkAxis, y: branchTargetY };
                    if (shouldLogRouteDebug) logRoutingWorkerDebug(`[TRUNK-DBG] ${job.edgeId} VERTICAL axis=${trunkAxis} busSrc=(${job.busTrunkSource.x.toFixed(1)},${job.busTrunkSource.y.toFixed(1)}) busTgt=(${job.busTrunkTarget.x.toFixed(1)},${job.busTrunkTarget.y.toFixed(1)}) trunkStart=(${trunkStart.x.toFixed(1)},${trunkStart.y.toFixed(1)}) trunkEnd=(${trunkEnd.x.toFixed(1)},${trunkEnd.y.toFixed(1)}) startOff=(${startWithOffset.x.toFixed(1)},${startWithOffset.y.toFixed(1)}) endOff=(${endWithOffset.x.toFixed(1)},${endWithOffset.y.toFixed(1)})`);
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
                    if (shouldLogRouteDebug) logRoutingWorkerDebug(`[TRUNK-DBG] ${job.edgeId} HORIZONTAL axis=${trunkAxis} busSrc=(${job.busTrunkSource.x.toFixed(1)},${job.busTrunkSource.y.toFixed(1)}) busTgt=(${job.busTrunkTarget.x.toFixed(1)},${job.busTrunkTarget.y.toFixed(1)}) trunkStart=(${trunkStart.x.toFixed(1)},${trunkStart.y.toFixed(1)}) trunkEnd=(${trunkEnd.x.toFixed(1)},${trunkEnd.y.toFixed(1)})`);
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
                    let preservePortsWhenSkippingTrunk = false;

                    const verticalEndpointPair =
                        (startPos === Position.Top || startPos === Position.Bottom)
                        && (endPos === Position.Top || endPos === Position.Bottom);
                    const horizontalEndpointPair =
                        (startPos === Position.Left || startPos === Position.Right)
                        && (endPos === Position.Left || endPos === Position.Right);
                    const sourceToTargetDelta = isVertical
                        ? endWithOffset.x - startWithOffset.x
                        : endWithOffset.y - startWithOffset.y;
                    const sourceToTrunkDelta = isVertical
                        ? trunkStart.x - startWithOffset.x
                        : trunkStart.y - startWithOffset.y;
                    const farSideTrunk =
                        Math.abs(sourceToTargetDelta) > 80
                        && Math.abs(sourceToTrunkDelta) > 80
                        && Math.sign(sourceToTargetDelta) !== Math.sign(sourceToTrunkDelta);
                    const orthogonalEndpointPairMatchesTrunk =
                        (isVertical && verticalEndpointPair)
                        || (!isVertical && horizontalEndpointPair);
                    if (!skipTrunk && isSharedGlobalTrunk && farSideTrunk && orthogonalEndpointPairMatchesTrunk) {
                        skipTrunk = true;
                        preservePortsWhenSkippingTrunk = true;
                    }

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
                        if (!preservePortsWhenSkippingTrunk) {
                            // [T6] 使用提取的公共助手函数重置端口
                            resetPortsToGeometric();
                        }
                        // 重算端口锄点坐标以匹配新端口
                        if (!preservePortsWhenSkippingTrunk && !hasExplicitSource && !hasExplicitTarget) {
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
            if (trunkStart && trunkEnd && trunkAxis !== null && !isSharedGlobalTrunk) {
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

            // Dual-identity edges are both O2M and M2O. A single generic busTrunk can only
            // preserve one side, because the Coordinator writes O2M and M2O trunk geometry in
            // separate passes. Build a composite route that uses both direction-specific trunks:
            // source stub -> O2M shared trunk -> handoff -> M2O shared trunk -> target stub.
            if (
                !pathPoints &&
                job.isOneToMany &&
                job.isManyToOne &&
                o2mTrunk &&
                m2oTrunk
            ) {
                const dualTrunkPath = buildWorkerDualTrunkPath({
                    sourceTrunk: o2mTrunk,
                    targetTrunk: m2oTrunk,
                    startPoint: startPt,
                    startOffset: startWithOffset,
                    endOffset: endWithOffset,
                    endPoint: endPt,
                    obstacles: routingObstacles,
                    analyzer,
                });
                if (dualTrunkPath) {
                    pathPoints = dualTrunkPath;
                    strategyName = 'Dual Global Trunk Direct';
                }
            }

            // Execute Trunk Routing if we have valid trunk points (after unified C-shape guard)
            if (!pathPoints && trunkStart && trunkEnd && trunkAxis !== null) {
                // [Validation] Ensure the trunk provides minimal clearance from the Hub to prevent overlap
                const hubRect = job.isOneToMany ? sRect : tRect;
                const hubCenterAxis = isVertical
                    ? hubRect.x + hubRect.width / 2
                    : hubRect.y + hubRect.height / 2;
                const hubExtent = isVertical ? hubRect.width / 2 : hubRect.height / 2;

                const dist = Math.abs(trunkAxis - hubCenterAxis);
                // If trunk is INSIDE the hub (dist < hubExtent), skip trunk routing and
                // fall back to the standard routing path.
                if (dist >= hubExtent + 5) {
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
                    
                    // [FIX P2] Dynamic collision padding: use 30% of the actual gap to trunk.
                    // Minimum 5px ensures some buffer; capped at 10px to avoid over-blocking.
                    const trunkGapDist = Math.hypot(
                        trunkStart.x - startWithOffset.x,
                        trunkStart.y - startWithOffset.y
                    );
                    const dynamicPadding = Math.min(10, Math.max(5, trunkGapDist * 0.3));

                    // [H-7] Use spatialIndex for trunk obstacle checks when available.
                    // Falls back to raw array — ObstacleAnalyzer.intersectsAnyObstacle handles both.
                    const trunkObstacles = spatialIndex ?? routingObstacles;

                    // [RESTORED] Always check for obstacles to maintain good obstacle avoidance.
                    // Previously this was skipped for Precomputed Trunks, which caused lines to plow through nodes.
                    if (analyzer.intersectsAnyObstacle(startWithOffset, trunkStart, trunkObstacles, dynamicPadding)) isBlocked = true;
                    if (!isBlocked && analyzer.intersectsAnyObstacle(trunkStart, trunkEnd, trunkObstacles, dynamicPadding)) isBlocked = true;
                    if (!isBlocked && analyzer.intersectsAnyObstacle(trunkEnd, endWithOffset, trunkObstacles, dynamicPadding)) isBlocked = true;

                    if (shouldLogRouteDebug) logRoutingWorkerDebug(`[TRUNK-DBG] ${job.edgeId} isBlocked=${isBlocked} dynamicPadding=${dynamicPadding.toFixed(1)} isSharedGlobal=${isSharedGlobalTrunk}`);
                    if (!isBlocked) {
                        pathPoints = waypoints;
                        strategyName = hasPrecomputedTrunk ? 'Global Trunk Direct' : 'Local Trunk Direct';
                        if (shouldLogRouteDebug) logRoutingWorkerDebug(`[TRUNK-DBG] ${job.edgeId} → ${strategyName}`);
                    }
                    // [FIX] We do NOT invalidate trunkStart here anymore. 
                    // If it is blocked, we let it fall through to the Trunk A* fallback segment
                    // below, which preserves the trunk anchors while gracefully detouring around the obstacle.
                    
                    // If blocked, fall back to A* but use trunk points as mandatory waypoints
                    if (pathPoints === null && trunkStart !== null) { // Only proceed if trunkStart is still valid
                        // Route Segment 1: Start -> TrunkStart
                        const seg1 = astar.findPath(startWithOffset, trunkStart, {
                            grid: prebuiltGrid || gridBuilder.buildGrid(spatialIndex || allObstacles, {
                                startX: startWithOffset.x, startY: startWithOffset.y,
                                endX: trunkStart.x, endY: trunkStart.y
                            }, job.source, job.target),
                            obstacles: routingObstacles,
                            clearanceRects,
                            config,
                            containerBorders,
                            congestionGrid: runtime.congestionGrid,
                            debugOut: shouldCollectDebugData ? debugData : undefined
                        });

                        // Route Segment 2: TrunkStart -> TrunkEnd (The Main Trunk)
                        // [FIX-trunk-alignment] For shared global trunks, the trunk segment is a
                        // straight line by design (trunkStart/End share the same Y or X axis).
                        // Using A* introduces grid-alignment artifacts that shift the trunk
                        // coordinate away from the assigned axis (e.g., 1440 → 1434/1446).
                        // [FIX-trunk-obstacle] But straight line must be verified against obstacles!
                        // If trunk axis crosses a third-party node, fall back to A* for seg2.
                        const isTrunkAxisAligned = isVertical
                            ? Math.abs(trunkStart.x - trunkEnd.x) < 1
                            : Math.abs(trunkStart.y - trunkEnd.y) < 1;
                        const canUseStraightTrunk = isSharedGlobalTrunk && isTrunkAxisAligned
                            && !analyzer.intersectsAnyObstacle(trunkStart, trunkEnd, trunkObstacles, dynamicPadding);
                        const seg2 = canUseStraightTrunk
                            ? [{ x: trunkStart.x, y: trunkStart.y }, { x: trunkEnd.x, y: trunkEnd.y }]
                            : astar.findPath(trunkStart, trunkEnd, {
                            grid: prebuiltGrid || gridBuilder.buildGrid(spatialIndex || allObstacles, {
                                startX: trunkStart.x, startY: trunkStart.y,
                                endX: trunkEnd.x, endY: trunkEnd.y
                            }, job.source, job.target),
                            obstacles: routingObstacles,
                            clearanceRects,
                            config,
                            containerBorders,
                            congestionGrid: runtime.congestionGrid,
                            debugOut: shouldCollectDebugData ? debugData : undefined
                        });

                        // Route Segment 3: TrunkEnd -> End
                        const seg3 = astar.findPath(trunkEnd, endWithOffset, {
                            grid: prebuiltGrid || gridBuilder.buildGrid(spatialIndex || allObstacles, {
                                startX: trunkEnd.x, startY: trunkEnd.y,
                                endX: endWithOffset.x, endY: endWithOffset.y
                            }, job.source, job.target),
                            obstacles: routingObstacles,
                            clearanceRects,
                            config,
                            containerBorders,
                            congestionGrid: runtime.congestionGrid,
                            debugOut: shouldCollectDebugData ? debugData : undefined
                        });

                        if (seg1 && seg2 && seg3) {
                            // [FIX-trunk-alignment] For shared global trunks, A* grid-snaps
                            // seg1's endpoint and seg3's startpoint away from the exact trunk
                            // coordinates (e.g., Y=1440 → 1434). Snap them back to ensure all
                            // buddy edges share the exact same trunk axis.
                            let fixedSeg1 = seg1;
                            let fixedSeg3 = seg3;
                            if (isSharedGlobalTrunk && seg1.length > 0 && seg3.length > 0) {
                                fixedSeg1 = [...seg1];
                                fixedSeg3 = [...seg3];
                                const lastIdx = fixedSeg1.length - 1;
                                // Snap seg1's last point to exact trunkStart
                                fixedSeg1[lastIdx] = { x: trunkStart.x, y: trunkStart.y };
                                // Snap seg3's first point to exact trunkEnd
                                fixedSeg3[0] = { x: trunkEnd.x, y: trunkEnd.y };
                            }
                            const trunkInternal = [...fixedSeg1, ...seg2, ...fixedSeg3];
                            const stitched = ensureSafeStitch(trunkInternal, startWithOffset, endWithOffset, routingObstacles);
                            pathPoints = [startPt, ...stitched, endPt];
                            strategyName = 'Trunk A*';
                        } else if (isSharedGlobalTrunk) {
                            // Shared bus members should preserve the common trunk when possible,
                            // but NOT at the cost of plowing through obstacles.
                            // [FIX-trunk-obstacle] Check if waypoints are safe before using them.
                            if (!isPathBlocked(waypoints, routingObstacles, 4)) {
                                pathPoints = waypoints;
                                strategyName = 'Global Trunk Direct';
                            } else if (trunkEnd) {
                                // [FIX-shared-convergence] 3-segment trunk A* failed. Route from source
                                // directly to the shared convergence point (trunkEnd) so all M2O/O2M
                                // siblings arrive at the SAME junction (e.g., (1120,1599)) regardless
                                // of which segment caused the blockage.
                                //
                                // Key insight: the previous seg1 grid only covered the horizontal band
                                // from startOff → trunkStart, too narrow to route AROUND obstacles.
                                // This A* uses a full-extent grid (source → trunkEnd) that covers
                                // the vertical space needed to detour below blocking nodes.
                                const convGrid = gridBuilder.buildGrid(
                                    spatialIndex || allObstacles,
                                    {
                                        startX: startWithOffset.x,
                                        startY: startWithOffset.y,
                                        endX: trunkEnd.x,
                                        endY: trunkEnd.y,
                                    },
                                    job.source,
                                    job.target
                                );
                                const convSeg = astar.findPath(startWithOffset, trunkEnd, {
                                    grid: convGrid,
                                    obstacles: routingObstacles,
                                    clearanceRects,
                                    config,
                                    containerBorders,
                                    congestionGrid: runtime.congestionGrid,
                                });
                                if (convSeg?.length) {
                                    // Snap last waypoint to exact trunkEnd so all siblings align precisely
                                    convSeg[convSeg.length - 1] = { x: trunkEnd.x, y: trunkEnd.y };
                                    pathPoints = [startPt, ...convSeg, endPt];
                                    strategyName = 'Global Trunk Convergence';
                                    if (shouldLogRouteDebug) logRoutingWorkerDebug(`[TRUNK-DBG] ${job.edgeId} → ${strategyName}`);
                                }
                                // If convergence A* also fails → fall through to standard A*/VG routing
                            }
                        }
                    }
                }
            }
        }

        // 7.5 [FIX] Reverse Edge: Forced U-turn Path Construction
        // When bypass is active, construct a deterministic U-shaped orthogonal path
        // instead of relying on A* which may take shortcuts through obstacles.
        if (!pathPoints && isReverseBypassActive && reverseBypassSide !== null) {
            pathPoints = buildWorkerReverseBypassPath({
                layoutDirection: job.layoutDirection,
                bypassSide: reverseBypassSide,
                sourceRect: sRect,
                targetRect: tRect,
                obstacles: routingObstacles,
                startPoint: startPt,
                startOffset: startWithOffset,
                endOffset: endWithOffset,
                endPoint: endPt,
                analyzer,
            });
            if (pathPoints) {
                strategyName = 'Reverse U-Turn';
            }
        }

        // Fallback to standard routing if trunk routing failed or not applicable
        if (!pathPoints) {
            const lineObstacles = (graph.pendingEdges ?? []) as import('../../algorithms/pathfinding').LineObstacle[];
            const fallback = routeWorkerFallback({
                job,
                config,
                startPoint: startPt,
                startOffset: startWithOffset,
                endOffset: endWithOffset,
                endPoint: endPt,
                startPosition: startPos,
                endPosition: endPos,
                sourceRect: sRect,
                targetRect: tRect,
                routingObstacles,
                allObstacles,
                spatialIndex,
                clearanceRects,
                containerBorders,
                lineObstacles,
                prebuiltGrid,
                congestionGrid: runtime.congestionGrid,
                shouldCollectDebugData,
                debugData,
                gridBuilder,
                astar,
                visibilityGraphRouter: vgRouter,
                analyzer,
            });
            pathPoints = fallback.points;
            strategyName = fallback.strategyName;
        }

        // 8. Post-Processing
        // [FIX] Include source/target node rects as extraObstacles for post-processing.
        // routingObstacles excludes source/target to allow A* to start/end inside them,
        // but simplification steps (trySimplify4PointCShape, collapseRedundantBends)
        // must still avoid cutting through the source/target nodes themselves.
        const postContext = buildWorkerPostProcessContext({
            job,
            config,
            obstacles: routingObstacles,
            sourceRect: sRect,
            targetRect: tRect,
            startPosition: startPos,
            endPosition: endPos,
            strategyName,
            hasSharedTrunk: isSharedGlobalTrunk,
        });

        if (!pathPoints || pathPoints.length === 0) {
            return this.errorResult(job, 'Pathfinding failed to generate any path');
        }

        const { points: finalPoints, svgPath } = postProcessor.process(pathPoints, postContext);

        return buildWorkerRoutingResult({
            job,
            svgPath,
            finalPoints,
            rawPoints: pathPoints,
            strategyName,
            debugData,
            routingObstacles,
            sourceRect: sRect,
            targetRect: tRect,
            startPosition: startPos,
            endPosition: endPos,
            hasExplicitSource,
            hasExplicitTarget,
            hasPrecomputedTrunk,
            busPeerGroupSize,
            busPeerGroupKey,
            busPeerGroupMembers,
        });
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
