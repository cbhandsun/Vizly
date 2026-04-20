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
    PathFindingJob
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

export class EdgeRoutingWorker {
    /**
     * Main execution entry point for a single edge
     */
    static execute(context: PathfindingContext): PathFindingResult {
        const { job, graph, config, runtime = {} } = context;
        const { prebuiltGrid, spatialIndex: prebuiltSpatialIndex } = runtime;

        // 1. Initialize Modules
        const gridBuilder = new GridBuilder(config);
        const vgRouter = new VisibilityGraphRouter(config);
        const astar = new AStarPathfinder(config);
        const busDetector = new BusDetector(config);
        const portSelector = new PortSelector(config);
        const analyzer = new ObstacleAnalyzer();
        const postProcessor = new PathPostProcessor(config);
        const trunkCalculator = new TrunkCalculator();

        // 2. Setup Spatial Index (if needed)
        let spatialIndex: SpatialIndex | undefined = prebuiltSpatialIndex;
        if (!spatialIndex && graph.obstacles.length > 50) {
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

        if (!sNode || !tNode) {
            return this.errorResult(job, 'Source or Target node not found');
        }

        const sRect: Rectangle = {
            x: getNodePosition(sNode).x,
            y: getNodePosition(sNode).y,
            width: sNode.measured?.width || 150,
            height: sNode.measured?.height || 80
        };
        const tRect: Rectangle = {
            x: getNodePosition(tNode).x,
            y: getNodePosition(tNode).y,
            width: tNode.measured?.width || 150,
            height: tNode.measured?.height || 80
        };

        // [FIX] Create a clean obstacle list for A* that excludes source/target nodes
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
        const busOrientation = busDetector.resolveBusOrientation(
            !!job.isManyToOne,
            job.isManyToOne ? job.target : job.source,
            graph.edges,
            graph.nodes,
            job.layoutDirection || 'LR'
        );

        let startPos = job.sourcePosition || Position.Right;
        let endPos = job.targetPosition || Position.Left;

        const hasExplicitSource = !!job.sourceHandle;
        const hasExplicitTarget = !!job.targetHandle;
        const parseHandleDir = (h?: string | null) => {
            if (!h) return undefined;
            const s = String(h).toLowerCase();
            if (s.includes('left')) return Position.Left;
            if (s.includes('right')) return Position.Right;
            if (s.includes('top')) return Position.Top;
            if (s.includes('bottom')) return Position.Bottom;
            if (s.startsWith('l')) return Position.Left;
            if (s.startsWith('r')) return Position.Right;
            if (s.startsWith('t')) return Position.Top;
            if (s.startsWith('b')) return Position.Bottom;
            return undefined;
        };

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

        // [Bus Optimization] Respect explicit bus trunk port if provided
        // [Sanity Check] Verify if the bus port is geometrically reasonable
        // If the bus port points strictly AWAY from the target, and the direct path is clear,
        // we should ignore the bus preference to avoid unnecessary detours (e.g. loops).
        const getPortNormal = (p: Position) => {
            if (p === Position.Top) return { x: 0, y: -1 };
            if (p === Position.Bottom) return { x: 0, y: 1 };
            if (p === Position.Left) return { x: -1, y: 0 };
            if (p === Position.Right) return { x: 1, y: 0 };
            return { x: 0, y: 0 };
        };
        const isPortReasonable = (rect: Rectangle, port: Position, targetCenter: Point) => {
            // 1. Calculate vector to target
            const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            const v = { x: targetCenter.x - center.x, y: targetCenter.y - center.y };

            // 2. Check dot product
            const normal = getPortNormal(port);
            const dot = (v.x * normal.x) + (v.y * normal.y);

            // 3. Relaxed Threshold: Only reject if STRONGLY opposite (e.g. trying to go Up when Target is clearly Down)
            // Allow some side-movement, but reject > 100px opposition
            if (dot < -100) return false;
            return true;
        };

        const tCenterForSanity = { x: tRect.x + tRect.width / 2, y: tRect.y + tRect.height / 2 };
        const sCenterForSanity = { x: sRect.x + sRect.width / 2, y: sRect.y + sRect.height / 2 };

        // [IRONCLAD LOCK] When an edge is a verified member of a global trunk, it MUST NOT
        // reject the port assignment. Group consensus takes absolute priority over local geometric efficiency.
        const isGlobalTrunkMember = !!(job.busTrunkSource && job.busTrunkTarget);

        if (!hasFixedSourcePort && job.busSourcePort) {
            if (isGlobalTrunkMember || isPortReasonable(sRect, job.busSourcePort, tCenterForSanity)) {
                startPos = job.busSourcePort;
                hasFixedSourcePort = true;
            }
        }
        if (!hasFixedTargetPort && job.busTargetPort) {
            if (isGlobalTrunkMember || isPortReasonable(tRect, job.busTargetPort, sCenterForSanity)) {
                endPos = job.busTargetPort;
                hasFixedTargetPort = true;
            }
        }

        // [FIX] Bus trunk should NOT take priority over EXPLICIT handles!
        // If the user specifically routed to a Right/Left handle, forcing it to Top/Bottom 
        // ruins the diagram visual mapping (arrowhead floats away from handle).
        if (job.isOneToMany && job.busSourcePort && !hasFixedSourcePort) {
            startPos = job.busSourcePort;
            hasFixedSourcePort = true;
        } else if (job.isOneToMany && job.busTrunkSource && job.busTrunkTarget && !hasFixedSourcePort) {
            const isVertTrunk = Math.abs(job.busTrunkSource.x - job.busTrunkTarget.x) < 1.0;
            const axisX = job.busTrunkSource.x;
            const axisY = job.busTrunkSource.y;
            const sCenter = { x: sRect.x + sRect.width / 2, y: sRect.y + sRect.height / 2 };

            if (isVertTrunk) {
                startPos = sCenter.x > axisX ? Position.Left : Position.Right;
            } else {
                startPos = sCenter.y > axisY ? Position.Top : Position.Bottom;
            }
            hasFixedSourcePort = true;
        }

        // Apply same respect for explicit handles to Many-to-One edges.
        if (job.isManyToOne && job.busTargetPort && !hasFixedTargetPort) {
            endPos = job.busTargetPort;
            hasFixedTargetPort = true;
        } else if (job.isManyToOne && job.busTrunkSource && job.busTrunkTarget && !hasFixedTargetPort) {
            const isVertTrunk = Math.abs(job.busTrunkSource.x - job.busTrunkTarget.x) < 1.0;
            const axisX = job.busTrunkSource.x;
            const axisY = job.busTrunkSource.y;
            const tCenter = { x: tRect.x + tRect.width / 2, y: tRect.y + tRect.height / 2 };

            if (isVertTrunk) {
                endPos = tCenter.x > axisX ? Position.Left : Position.Right;
            } else {
                endPos = tCenter.y > axisY ? Position.Top : Position.Bottom;
            }
            hasFixedTargetPort = true;
        }

        const pickPeerGroup = (originId: string, isSource: boolean, allPeers: GraphEdge[], _orientationIsHorz: boolean): { edges: GraphEdge[]; key: string; members: string[] } => {
            const nodes = graph.nodes as unknown as GraphNode[];
            const edges = graph.edges as unknown as GraphEdge[];
            const refEdge = edges.find(e => e.id === job.edgeId);
            if (!refEdge) return { edges: allPeers, key: 'ALL', members: allPeers.map(e => e.id) };
            const originNode = nodes.find(n => n.id === originId);
            const otherId = isSource ? refEdge.target : refEdge.source;
            const otherNode = nodes.find(n => n.id === otherId);
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
                const pn = nodes.find(n => n.id === pid);
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

        if (!hasFixedTargetPort && (job.isOneToMany || (job.busTrunkSource && job.busTrunkTarget))) {
            // [Industry Standard] Peer Port Logic: Face the Trunk Axis
            if (job.busTrunkSource && job.busTrunkTarget) {
                const isVertTrunk = Math.abs(job.busTrunkSource.x - job.busTrunkTarget.x) < 1.0;
                const axisX = job.busTrunkSource.x;
                const axisY = job.busTrunkSource.y;
                const tCenter = { x: tRect.x + tRect.width / 2, y: tRect.y + tRect.height / 2 };

                if (isVertTrunk) {
                    endPos = tCenter.x > axisX ? Position.Left : Position.Right;
                } else {
                    endPos = tCenter.y > axisY ? Position.Top : Position.Bottom;
                }
            } else {
                // Fallback: Center-to-Center Logic
                const sCenter = { x: sRect.x + sRect.width / 2, y: sRect.y + sRect.height / 2 };
                const tCenter = { x: tRect.x + tRect.width / 2, y: tRect.y + tRect.height / 2 };
                const dx = sCenter.x - tCenter.x;
                const dy = sCenter.y - tCenter.y;
                const isHorizontalRel = Math.abs(dx) > Math.abs(dy) * 0.8;
                if (isHorizontalRel) {
                    endPos = dx > 0 ? Position.Right : Position.Left;
                } else {
                    endPos = dy > 0 ? Position.Bottom : Position.Top;
                }
            }

            // Check for obstruction
            const blocked = countObstaclesInDirection(tRect, endPos, routingObstacles, 40);
            if (blocked > 2) {
                // Try alternative if blocked (simple fallback)
                // ... (keep existing obstruction logic if desired, or trust trunk)
            }
            hasFixedTargetPort = true;
        }

        if (!hasFixedSourcePort && (job.isManyToOne || (job.busTrunkSource && job.busTrunkTarget))) {
            // [Industry Standard] Peer Port Logic: Face the Trunk Axis
            if (job.busTrunkSource && job.busTrunkTarget) {
                const isVertTrunk = Math.abs(job.busTrunkSource.x - job.busTrunkTarget.x) < 1.0;
                const axisX = job.busTrunkSource.x;
                const axisY = job.busTrunkSource.y;
                const sCenter = { x: sRect.x + sRect.width / 2, y: sRect.y + sRect.height / 2 };

                if (isVertTrunk) {
                    startPos = sCenter.x > axisX ? Position.Left : Position.Right;
                } else {
                    startPos = sCenter.y > axisY ? Position.Top : Position.Bottom;
                }
            } else {
                const sCenter = { x: sRect.x + sRect.width / 2, y: sRect.y + sRect.height / 2 };
                const tCenter = { x: tRect.x + tRect.width / 2, y: tRect.y + tRect.height / 2 };
                const dx = tCenter.x - sCenter.x;
                const dy = tCenter.y - sCenter.y;
                const isHorizontalRel = Math.abs(dx) > Math.abs(dy) * 0.8;
                if (isHorizontalRel) {
                    startPos = dx > 0 ? Position.Right : Position.Left;
                } else {
                    startPos = dy > 0 ? Position.Bottom : Position.Top;
                }
            }

            const blocked = countObstaclesInDirection(sRect, startPos, routingObstacles, 40);
            if (blocked > 2) {
                // ...
            }
            hasFixedSourcePort = true;
        }

        // 4.5 [MOVED] Reverse Edge bypass now runs AFTER port selection (Section 5.5)
        // to prevent portSelector from overriding the bypass ports.

        // 5. Port Selection
        const portUsage = runtime.portUsage || {};
        const pResult = portSelector.selectPorts(sRect, tRect, routingObstacles, {
            effectiveDir: busOrientation.busDir,
            portUsage,
            sourceId: job.source,
            targetId: job.target
        });
        const geometryForRules = analyzeGeometry(
            (tRect.x + tRect.width / 2) - (sRect.x + sRect.width / 2),
            (tRect.y + tRect.height / 2) - (sRect.y + sRect.height / 2)
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
        // Forces same-side ports to create U-turn bypass path around obstacles.
        let isReverseBypassActive = false;
        let reverseBypassSide: Position | null = null;
        if (job.isReverseEdge && !hasExplicitSource && !hasExplicitTarget) {
            const layoutDir = job.layoutDirection || 'TB';
            const isVerticalFlow = layoutDir === 'TB' || layoutDir === 'BT';

            if (isVerticalFlow) {
                const leftCount = countObstaclesInDirection(sRect, Position.Left, routingObstacles, 120)
                                + countObstaclesInDirection(tRect, Position.Left, routingObstacles, 120);
                const rightCount = countObstaclesInDirection(sRect, Position.Right, routingObstacles, 120)
                                 + countObstaclesInDirection(tRect, Position.Right, routingObstacles, 120);
                reverseBypassSide = leftCount <= rightCount ? Position.Left : Position.Right;
            } else {
                const topCount = countObstaclesInDirection(sRect, Position.Top, routingObstacles, 120)
                               + countObstaclesInDirection(tRect, Position.Top, routingObstacles, 120);
                const bottomCount = countObstaclesInDirection(sRect, Position.Bottom, routingObstacles, 120)
                                  + countObstaclesInDirection(tRect, Position.Bottom, routingObstacles, 120);
                reverseBypassSide = topCount <= bottomCount ? Position.Top : Position.Bottom;
            }
            startPos = reverseBypassSide;
            endPos = reverseBypassSide;
            hasFixedSourcePort = true;
            hasFixedTargetPort = true;
            isReverseBypassActive = true;
        }

        // 6. Coordinates with Distribution
        // [Bus Optimization] Force coalesced ports for Bus Hubs (Tree Root) to create a clean bundle
        const forceSourceCoalesce = job.isOneToMany;
        const forceTargetCoalesce = job.isManyToOne;
        const isBus = forceSourceCoalesce || forceTargetCoalesce;

        const outgoingCount = forceSourceCoalesce ? 1 : (job.outgoingCount || 1);
        const incomingCount = forceTargetCoalesce ? 1 : (job.incomingCount || 1);
        const allowSourceSlide = !isBus && outgoingCount > 1;
        const allowTargetSlide = !isBus && incomingCount > 1;

        const startPt = portSelector.getDistributedPortPoint(
            sRect, startPos,
            forceSourceCoalesce ? 0 : (job.outgoingIndex || 0),
            outgoingCount,
            allowSourceSlide ? { x: tRect.x + tRect.width / 2, y: tRect.y + tRect.height / 2 } : undefined
        );
        const endPt = portSelector.getDistributedPortPoint(
            tRect, endPos,
            forceTargetCoalesce ? 0 : (job.incomingIndex || 0),
            incomingCount,
            allowTargetSlide ? { x: sRect.x + sRect.width / 2, y: sRect.y + sRect.height / 2 } : undefined
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

        // Use trunk if precomputed by Coordinator OR if local calculation deems it necessary
        // [Imp-12] Lower threshold to 1 for explict bus scenarios to ensure uniform routing style
        const shouldUseTrunk = hasPrecomputedTrunk || (isBusScenario && trunkCalculator.shouldUseTrunkRouting(peerCount, 1));

        if (shouldUseTrunk) {
            let trunkStart: Point | null = null;
            let trunkEnd: Point | null = null;
            let trunkAxis: number | null = null;
            let isVertical = false;

            // Priority 1: Use Precomputed Trunk from Coordinator (Global Context)
            if (hasPrecomputedTrunk && job.busTrunkSource && job.busTrunkTarget) {
                if (Math.abs(job.busTrunkSource.x - job.busTrunkTarget.x) < 1.0) {
                    isVertical = true;
                    trunkAxis = job.busTrunkSource.x;
                    trunkStart = { x: trunkAxis, y: startWithOffset.y };
                    trunkEnd = { x: trunkAxis, y: endWithOffset.y };
                } else {
                    isVertical = false;
                    trunkAxis = job.busTrunkSource.y;
                    trunkStart = { x: startWithOffset.x, y: trunkAxis };
                    trunkEnd = { x: endWithOffset.x, y: trunkAxis };
                }

                // if (['e21', 'e22', 'e23'].includes(job.edgeId)) {
                //                // }
            }
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
                        const n = (graph.nodes as unknown as GraphNode[]).find(ng => ng.id === pid);
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
                        hubRect, peerNodes, !!job.isManyToOne, config, job.layoutDirection
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

            // Execute Trunk Routing if we have valid trunk points
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
                        if (startPos === Position.Left || startPos === Position.Right) waypoints.push(startWithOffset);
                        waypoints.push(trunkStart, trunkEnd);
                        if (endPos === Position.Left || endPos === Position.Right) waypoints.push(endWithOffset);
                    }
                    waypoints.push(endPt);

                    // Verify orthogonality and clean up collinear points
                    // trunkStart is calculated to share one coord with startWithOffset, so it forms a straight line.
                    // trunkEnd is calculated to share one coord with endWithOffset, so it forms a straight line.
                    // trunkStart and trunkEnd share the trunkAxis coord, so they form a straight line.

                    // Check for obstacles on this strict path
                    let isBlocked = false;
                    
                    // [RESTORED] Always check for obstacles to maintain good obstacle avoidance.
                    // Previously this was skipped for Precomputed Trunks, which caused lines to plow through nodes.
                    if (analyzer.intersectsAnyObstacle(startWithOffset, trunkStart, routingObstacles, 10)) isBlocked = true;
                    if (!isBlocked && analyzer.intersectsAnyObstacle(trunkStart, trunkEnd, routingObstacles, 10)) isBlocked = true;
                    if (!isBlocked && analyzer.intersectsAnyObstacle(trunkEnd, endWithOffset, routingObstacles, 10)) isBlocked = true;

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
            const corridorObstacles = routingObstacles.filter(o => {
                if (isVerticalFlow) {
                    // Vertical flow: corridor is horizontally between nodes
                    return o.y + o.height > minY && o.y < maxY;
                } else {
                    return o.x + o.width > minX && o.x < maxX;
                }
            });

            // Calculate bypass distance: furthest obstacle edge + padding
            const BYPASS_PADDING = 40;
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
            let activeObstacles = routingObstacles;

            // Try Visibility Graph first if recommended
            if (config.algorithm.useVisibilityGraph) {
                // [FIX] Use activeObstacles (clean & pruned list) to prevent VG from failing on source/target
                let vgPathPoints = vgRouter.findPath(startWithOffset, endWithOffset, activeObstacles, undefined);
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
                
                let activeConfig = config;

                // [FIX] Use activeObstacles for grid building too
                const grid = prebuiltGrid || gridBuilder.buildGrid(activeObstacles, bounds, job.source, job.target);

                // Route from offset to offset, then we will stitch startPt/endPt
                const offsetPath = astar.findPath(startWithOffset, endWithOffset, {
                    grid,
                    obstacles: activeObstacles,
                    clearanceRects,
                    config: activeConfig,
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
            const labelPos = (() => {
                if (!finalPoints || finalPoints.length < 2) return { x: 0, y: 0 };
                // Use midpoint of middle segment for best label placement
                const midIdx = Math.floor(finalPoints.length / 2);
                const p1 = finalPoints[Math.max(0, midIdx - 1)];
                const p2 = finalPoints[Math.min(finalPoints.length - 1, midIdx)];
                return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            })();

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
                strategy: strategyName
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
}
