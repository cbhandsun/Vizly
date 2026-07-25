import {
    buildPathfindingGrid,
    PathfindingGrid
} from '../algorithms/pathfinding';
import { EdgeRoutingWorker } from './core/EdgeRoutingWorker';
import {
    PathFindingJob,
    Position,
    BatchPathFindingJob,
    PathFindingTaskResult,
    PathFindingResult,
    PathfindingContext,
    Point,
    UnifiedRoutingConfig,
    createDefaultRoutingConfig
} from '../types/routing';
import { QuadTree, SpatialIndex } from '../algorithms/SpatialIndex';
import { buildVisibilityGraph, VisibilityGraph } from '../algorithms/visibilityGraph';
import {
    getSmartLabelPosition,
    createFilletedPath
} from '../algorithms/smartEdgeUtils';
import { separateParallelPaths, bundleEdges, DEFAULT_CHANNEL_CONFIG } from '../algorithms/edgeChannelRouting';
import {
    logPathfindingWorkerCriticalFailure,
    logPathfindingWorkerMissingMetadata,
    logPathfindingWorkerPostingError,
    logPathfindingWorkerSerializationFailure,
    logPathfindingWorkerTaskExecutionFailure,
} from '../utils/routingLogging';

import type { LineObstacle } from '../types/routing';
import {
    getWorkerErrorMessage as getErrorMessage,
    getWorkerNodeCenter as nodeCenter,
    getWorkerNodeDimension as getNodeDimension,
    getWorkerNodeId as getNodeId,
    getWorkerNodeType as getNodeType,
    getWorkerNodeXY as getNodeXY,
    hasWorkerString as hasString,
    isValidBatchPathfindingWorkerMessage,
    isValidSinglePathfindingWorkerMessage,
    isValidWorkerJob,
    isWorkerRecord as isRecord,
    isWorkerRectangle as isRectangle,
    postInvalidWorkerMessage,
    readWorkerBorderRadius as readBorderRadius,
} from './pathfindingWorkerBoundary';
export {
    isValidBatchPathfindingWorkerMessage,
    isValidSinglePathfindingWorkerMessage,
} from './pathfindingWorkerBoundary';

// [Imp-8] Global Cache Definition
interface WorkerGraphCache {
    version: number;
    spatialIndex: QuadTree | null;
    visibilityGraph: VisibilityGraph | null;
    gridSize: number;
    grid: PathfindingGrid | null;
    gridBounds: { startX: number; startY: number; endX: number; endY: number } | null;
}

let globalCache: WorkerGraphCache = {
    version: -1,
    spatialIndex: null,
    visibilityGraph: null,
    gridSize: 20,
    grid: null,
    gridBounds: null
};

/**
 * Core Pathfinding Execution Logic
 * Delegates to the modular EdgeRoutingWorker
 */
export const executeEdgePathfinding = (context: PathfindingContext): PathFindingResult => {
    return EdgeRoutingWorker.execute(context);
};






/**
 * Worker Entry Point
 * Handles both Single and Batch messages.
 */
self.onmessage = (e: MessageEvent) => {
    const data = e.data;
    if (!isRecord(data)) {
        postInvalidWorkerMessage(undefined, 'Invalid pathfinding worker message');
        return;
    }

    if (data.mode === 'batch') {
        if (!isValidBatchPathfindingWorkerMessage(data)) {
            postInvalidWorkerMessage(hasString(data.jobId) ? data.jobId : undefined, 'Invalid batch pathfinding request', true);
            return;
        }

        const { jobId: batchId, context, tasks } = data as BatchPathFindingJob;

        // [P2-3] Build UnifiedRoutingConfig early for batch context
        const unifiedConfig: UnifiedRoutingConfig = {
            ...createDefaultRoutingConfig(),
            ...(context.config || {})
        };
        // [FIX] Force borderRadius to 8px (Hyper-Glass V3 standard)
        // Shallow merge above cannot propagate flat config.borderRadius into postProcessing.
        unifiedConfig.postProcessing.borderRadius = readBorderRadius(context.config);


        // [Imp-8] Caching Logic
        let spatialIndex: QuadTree;
        let visibilityGraphCache: VisibilityGraph | undefined | null;
        let grid: PathfindingGrid;

        const currentVersion = context.graphVersion;
        const baseGridSize = unifiedConfig.algorithm.gridSize || 20;
        // [I-9] Adaptive gridSize based on full graph extent (not single edge distance).
        // Calculate it before the cache check; otherwise large graphs cache a 30/40px
        // grid but compare future batches against the 20px base size and never hit.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        if (context.nodes?.length) {
            context.nodes.forEach(n => {
                const { x: nx, y: ny } = getNodeXY(n);
                const width = getNodeDimension(n, 'width');
                const height = getNodeDimension(n, 'height');
                if (nx < minX) minX = nx;
                if (nx + width > maxX) maxX = nx + width;
                if (ny < minY) minY = ny;
                if (ny + height > maxY) maxY = ny + height;
            });
        }

        // Fallback
        if (minX === Infinity) { minX = 0; maxX = 1000; minY = 0; maxY = 1000; }

        const graphExtent = Math.max(maxX - minX, maxY - minY);
        const effectiveGridSize = graphExtent > 8000 ? Math.max(baseGridSize, 40)
            : graphExtent > 4000 ? Math.max(baseGridSize, 30)
            : graphExtent > 2000 ? Math.max(baseGridSize, 20)
            : baseGridSize;

        // Try Cache
        if (currentVersion !== undefined &&
            globalCache.version === currentVersion &&
            globalCache.spatialIndex &&
            globalCache.grid &&
            globalCache.gridBounds &&
            globalCache.gridSize === effectiveGridSize) {

            spatialIndex = globalCache.spatialIndex!;
            visibilityGraphCache = globalCache.visibilityGraph;
            grid = globalCache.grid;

        } else {
            // Build New
            if (currentVersion !== undefined) {
                // cache version is stale, rebuild
            }

            const PADDING = 200;
            const CONTAINER_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'swimlane', 'domain']);

            // Re-map node obstacles
            const nodeObstacles = context.nodes?.filter(n => {
                const nodeType = getNodeType(n);
                if (nodeType && CONTAINER_TYPES.has(nodeType)) return false;
                return true;
            }).map(n => ({
                id: getNodeId(n),
                ...getNodeXY(n),
                width: getNodeDimension(n, 'width', 150),
                height: getNodeDimension(n, 'height', 80)
            })) || [];

            const allObstacles = [...(context.obstacles || []), ...nodeObstacles];

            // Build SpatialIndex
            spatialIndex = new QuadTree({
                x: minX - PADDING,
                y: minY - PADDING,
                width: (maxX - minX) + PADDING * 2,
                height: (maxY - minY) + PADDING * 2
            });
            allObstacles.forEach(obs => spatialIndex.insert(obs));

            // Build VisibilityGraph
            visibilityGraphCache = unifiedConfig.algorithm.useVisibilityGraph &&
                allObstacles.length >= (unifiedConfig.algorithm.visibilityGraphThreshold ?? 6)
                ? buildVisibilityGraph(spatialIndex)
                : undefined;

            // Build Grid
            const gridBounds = { startX: minX - PADDING, startY: minY - PADDING, endX: maxX + PADDING, endY: maxY + PADDING };
            // [I-9] Use effectiveGridSize (graph-extent adaptive) instead of raw targetGridSize
            grid = buildPathfindingGrid(spatialIndex, gridBounds, effectiveGridSize);

            // Update Cache
            if (currentVersion !== undefined) {
                globalCache = {
                    version: currentVersion,
                    spatialIndex,
                    visibilityGraph: visibilityGraphCache ?? null,
                    gridSize: effectiveGridSize,
                    grid,
                    gridBounds
                };
            }
        }


        // [NEW] Global Congestion Grid for Batch
        // Stores accumulated path costs to discourage overcrowding
        const congestionGrid = new Int32Array(grid.maxIndex).fill(0);


        // 2. Execute Tasks
        // 2. Execute Tasks (Sequential with Smart Sorting & Guide Lines)
        // [INDUSTRY STANDARD] Trunk Routing:
        // By sorting "Central" edges first and passing their paths as "Guide Lines" to siblings,
        // we encourage the A* algorithm (with MERGE_PATH cost) to bundle edges together.

        // A. Pre-process Priorities
        const outgoing = new Map<string, PathFindingJob[]>();
        const incoming = new Map<string, PathFindingJob[]>();
        const nodeLookup = new Map<string, unknown>();

        if (context.nodes) {
            context.nodes.forEach(n => {
                const nodeId = getNodeId(n);
                if (nodeId) nodeLookup.set(nodeId, n);
            });
        }

        tasks.forEach(t => {
            const outgoingList = outgoing.get(t.source);
            if (outgoingList) {
                outgoingList.push(t);
            } else {
                outgoing.set(t.source, [t]);
            }
            const incomingList = incoming.get(t.target);
            if (incomingList) {
                incomingList.push(t);
            } else {
                incoming.set(t.target, [t]);
            }
        });

        // B. Sort Tasks (Barycenter Heuristic)
        // Priority:
        // 1. "Central" edges of M-to-1 or 1-to-M Groups (The "Spine" creators)
        // 2. "Outer" edges of Groups (The "Followers")
        // 3. Independent edges

        // [OPTIMIZATION] Barycenter Sorting
        // Sort edges within a bus based on their target's position to minimize crossings.
        tasks.sort((a, b) => {
            // 1. Group Priority: Process edges that belong to larger groups first
            // This helps in establishing the trunk early.
            const aGroupSize = (outgoing.get(a.source)?.length || 0) + (incoming.get(a.target)?.length || 0);
            const bGroupSize = (outgoing.get(b.source)?.length || 0) + (incoming.get(b.target)?.length || 0);
            if (Math.abs(aGroupSize - bGroupSize) > 0) return bGroupSize - aGroupSize; // Large groups first

            // 2. Barycenter / Euclidean Order
            // If sharing a source (1-to-N), sort by Target position (Y for vertical flow, X for horizontal)
            const sA = nodeLookup.get(a.source);
            const tA = nodeLookup.get(a.target);
            const sB = nodeLookup.get(b.source);
            const tB = nodeLookup.get(b.target);

            if (!sA || !tA || !sB || !tB) return 0;

            const sameSource = a.source === b.source;
            const sameTarget = a.target === b.target;

            if (sameSource) {
                // 1-to-N: Sort by Target Position
                // Determine dominant flow direction of the source
                // For simplicity, just check relative position of targets
                return nodeCenter(tA).y - nodeCenter(tB).y; // Top-to-Bottom default
            }
            if (sameTarget) {
                // N-to-1: Sort by Source Position
                return nodeCenter(sA).y - nodeCenter(sB).y;
            }

            // Fallback: Default Deviation Sort
            const getDeviation = (source: unknown, target: unknown) => {
                const sourceCenter = nodeCenter(source);
                const targetCenter = nodeCenter(target);
                const dy = Math.abs(sourceCenter.y - targetCenter.y);
                const dx = Math.abs(sourceCenter.x - targetCenter.x);
                return Math.min(dy, dx);
            };
            return getDeviation(sA, tA) - getDeviation(sB, tB);
        });

        // C. Sequential Execution with Guide Line Accumulation
        const results: PathFindingTaskResult[] = [];
        const groupPaths = new Map<string, LineObstacle[]>(); // Key: "NodeID_DIR" (e.g. "MsgView_IN")

        // [NEW] Port Usage Tracking for Batch
        const portUsageMap: Record<string, number> = {};

        // [Imp-9] Prepare Global Debug Data (VG/SpatialIndex)
        const debugDataExtras: Record<string, unknown> = {};
        if (unifiedConfig.debug) {
            // Serialize VG
            if (visibilityGraphCache) {
                const vg = visibilityGraphCache as VisibilityGraph;
                const debugEdges: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
                if (vg && vg.edges) {
                    vg.edges.forEach((neighbors, u) => {
                        const uPt = vg.vertices[u];
                        if (uPt) {
                            neighbors.forEach(v => {
                                if (u < v) { // Avoid duplicates
                                    const vPt = vg.vertices[v];
                                    if (vPt) debugEdges.push({ x1: uPt.x, y1: uPt.y, x2: vPt.x, y2: vPt.y });
                                }
                            });
                        }
                    });
                    debugDataExtras.visibilityGraph = { edges: debugEdges };
                }
            }
            // Serialize SpatialIndex
            if (spatialIndex && typeof spatialIndex.getDebugBounds === 'function') {
                debugDataExtras.spatialIndex = { bounds: spatialIndex.getDebugBounds() };
                if (typeof spatialIndex.getAll === 'function') {
                    debugDataExtras.obstacles = spatialIndex.getAll().map(o => ({
                        x: o.x,
                        y: o.y,
                        width: o.width,
                        height: o.height,
                        id: isRecord(o) ? o.id : undefined
                    }));
                }
            }
        }

        for (const task of tasks) {
            // Detect Group context
            const myOutCount = outgoing.get(task.source)?.length || 0;
            const myInCount = incoming.get(task.target)?.length || 0;

            const relevantGuideLines: LineObstacle[] = [];

            // [TRUNK STRATEGY]
            // If Many-to-One: Use paths entering same Target as guides
            if (myInCount > 1) {
                const guides = groupPaths.get(`${task.target}_IN`);
                if (guides) relevantGuideLines.push(...guides);
            }
            // If One-to-Many: Use paths exiting same Source as guides
            if (myOutCount > 1) {
                const guides = groupPaths.get(`${task.source}_OUT`);
                if (guides) relevantGuideLines.push(...guides);
            }



            // Execute with new PathfindingContext
            let result: PathFindingResult;
            try {
                result = executeEdgePathfinding({
                    job: task,
                    graph: context,
                    config: unifiedConfig,
                    runtime: {
                        prebuiltGrid: grid,
                        spatialIndex: spatialIndex,
                        visibilityGraphCache: visibilityGraphCache ?? undefined,
                        guideLines: relevantGuideLines,
                        portUsage: portUsageMap,
                        congestionGrid: congestionGrid // [NEW]
                    }
                });
            } catch (err: unknown) {
                logPathfindingWorkerTaskExecutionFailure(task.edgeId, err);
                // Provide a safe fallback result so the batch doesn't crash completely
                const sx = Number.isFinite(task.sourceX) ? task.sourceX! : 0;
                const sy = Number.isFinite(task.sourceY) ? task.sourceY! : 0;
                const tx = Number.isFinite(task.targetX) ? task.targetX! : 0;
                const ty = Number.isFinite(task.targetY) ? task.targetY! : 0;
                result = {
                    edgeId: task.edgeId,
                    jobId: task.jobId,
                    path: `M ${sx} ${sy} L ${tx} ${ty}`,
                    points: [{ x: sx, y: sy }, { x: tx, y: ty }],
                    labelX: (sx + tx) / 2,
                    labelY: (sy + ty) / 2,
                    error: getErrorMessage(err, 'Worker task crashed')
                };
            }


            // [SMART] Update Port Usage with approach-direction awareness.
            // Key format:
            //   "${nodeId}-${portDir}"                    → total count at port (legacy)
            //   "${nodeId}-${portDir}-from-${approachDir}" → count from a specific approach direction
            //
            // This allows cost evaluation to distinguish:
            //   - Same approach   → MERGE  (e.g. two edges from above entering Top → bundle)
            //   - Cross approach  → DIVERGE (e.g. edge from left + edge from above both at Top → conflict)
            if (result && result.sourcePos && result.targetPos) {
                const posToDir = (pos: Position | undefined) => {
                    if (pos === Position.Top) return 'top';
                    if (pos === Position.Bottom) return 'bottom';
                    if (pos === Position.Left) return 'left';
                    if (pos === Position.Right) return 'right';
                    return 'bottom';
                };

                // Compute approach direction of this edge (source → target dominant axis)
                const srcNode = nodeLookup.get(task.source);
                const tgtNode = nodeLookup.get(task.target);
                let approachDir = 'top';
                if (srcNode && tgtNode) {
                    const { x: sx, y: sy } = getNodeXY(srcNode);
                    const { x: tx, y: ty } = getNodeXY(tgtNode);
                    const dx = tx - sx;
                    const dy = ty - sy;
                    if (Math.abs(dx) > Math.abs(dy)) {
                        approachDir = dx > 0 ? 'right' : 'left';
                    } else {
                        approachDir = dy > 0 ? 'bottom' : 'top';
                    }
                }

                const sPortDir = posToDir(result.sourcePos);
                const tPortDir = posToDir(result.targetPos);

                // Legacy total keys (for backward compatibility)
                const sKey = `${task.source}-${sPortDir}`;
                const tKey = `${task.target}-${tPortDir}`;
                portUsageMap[sKey] = (portUsageMap[sKey] || 0) + 1;
                portUsageMap[tKey] = (portUsageMap[tKey] || 0) + 1;

                // Direction-aware keys for smart merge/diverge decision
                const tDirKey = `${task.target}-${tPortDir}-from-${approachDir}`;
                portUsageMap[tDirKey] = (portUsageMap[tDirKey] || 0) + 1;

                // Also track source approach for outgoing edges (future use)
                const sDirKey = `${task.source}-${sPortDir}-exit`;
                portUsageMap[sDirKey] = (portUsageMap[sDirKey] || 0) + 1;
            }

            // [FIX] Ensure ID propagation
            result.edgeId = task.edgeId;
            result.jobId = task.jobId;

            // [DEBUG] Attach Global Debug Data (VG/SpatialIndex)
            if (unifiedConfig.debug && debugDataExtras) {
                if (!result.debugInfo) result.debugInfo = { algorithmDebug: {} };
                if (!result.debugInfo.algorithmDebug) result.debugInfo.algorithmDebug = {};
                const existingAlgorithmDebug = isRecord(result.debugInfo.algorithmDebug)
                    ? result.debugInfo.algorithmDebug
                    : {};
                result.debugInfo.algorithmDebug = {
                    ...existingAlgorithmDebug,
                    ...debugDataExtras
                };
            }

            // [FIX] Ensure Metadata exists
            if (!result.metadata) {
                logPathfindingWorkerMissingMetadata(task.edgeId);
                const algorithmDebug = isRecord(result.debugInfo?.algorithmDebug)
                    ? result.debugInfo.algorithmDebug
                    : {};
                result.metadata = {
                    strategy: hasString(algorithmDebug.strategy) ? algorithmDebug.strategy : 'Recovered'
                };
            }



            results.push({ jobId: task.jobId, result });

            // Harvest Path for Guidelines
            // Convert Point[] -> LineObstacle[]
            if (result.points && result.points.length > 1) {
                const pathAsLines: LineObstacle[] = [];
                for (let i = 0; i < result.points.length - 1; i++) {
                    pathAsLines.push({
                        start: result.points[i],
                        end: result.points[i + 1]
                    });
                }

                // Store for Siblings
                if (myInCount > 1) {
                    const key = `${task.target}_IN`;
                    const existing = groupPaths.get(key);
                    if (existing) {
                        existing.push(...pathAsLines);
                    } else {
                        groupPaths.set(key, [...pathAsLines]);
                    }
                }
                if (myOutCount > 1) {
                    const key = `${task.source}_OUT`;
                    const existing = groupPaths.get(key);
                    if (existing) {
                        existing.push(...pathAsLines);
                    } else {
                        groupPaths.set(key, [...pathAsLines]);
                    }
                }
            }

            // [FIX] Update Congestion Grid (Feedback Loop)
            // Use higher penalty (30) to forcefully separate parallel paths 
            if (typeof congestionGrid !== 'undefined' && congestionGrid !== null && result.points?.length > 1) {
                rasterizePathToGrid(congestionGrid, result.points, 30, grid);
            }
        }



        const channelConfig = {
            ...DEFAULT_CHANNEL_CONFIG,
            ...(unifiedConfig.channel || {})
        };

        if (channelConfig.enableChannelRouting || channelConfig.enableEdgeBundling) {
            const successfulResults = results
                .filter(r => r.result && !r.error && r.result.points && r.result.points.length > 1)
                .map(r => r.result);
            const basePaths = successfulResults.map(r => ({
                edgeId: r.edgeId || r.jobId,
                points: r.points
            }));
            let optimizedPaths = basePaths;
            if (channelConfig.enableEdgeBundling) {
                // [FIX] Pass spatialIndex (includes nodes) to prevent invalid bundling collisions
                optimizedPaths = bundleEdges(optimizedPaths, channelConfig.bundleStrength, spatialIndex);
            } else if (channelConfig.enableChannelRouting) {
                optimizedPaths = separateParallelPaths(optimizedPaths, channelConfig.channelSpacing, spatialIndex);
            }
            const optimizedMap = new Map(optimizedPaths.map(p => [p.edgeId, p.points]));
            for (const result of successfulResults) {
                const updatedPoints = optimizedMap.get(result.edgeId || result.jobId);
                if (!updatedPoints) continue;
                result.points = updatedPoints;
                result.path = createFilletedPath(updatedPoints, unifiedConfig.postProcessing.borderRadius ?? 8);
                const labelPos = getSmartLabelPosition(updatedPoints);
                result.labelX = labelPos.x;
                result.labelY = labelPos.y;
            }
        }

        // 3. Post Batch Result
        try {
            const sanitizedResults = results.map(r => {
                if (r.result) {
                    return {
                        jobId: r.jobId,
                        result: {
                            ...r.result,
                            debugInfo: r.result.debugInfo
                        }
                    };
                }
                return r;
            });

            self.postMessage({
                type: 'BATCH_RESULT',
                batchId,
                results: sanitizedResults
            });
    
        } catch (err: unknown) {
            logPathfindingWorkerSerializationFailure(err);
            self.postMessage({
                type: 'BATCH_RESULT',
                batchId,
                error: 'Serialization Failed: ' + getErrorMessage(err, 'Unknown error')
            });
        }
    } else {
        if (!isValidSinglePathfindingWorkerMessage(data)) {
            postInvalidWorkerMessage(hasString(data.jobId) ? data.jobId : undefined, 'Invalid pathfinding request');
            return;
        }

        // [P2-3] Legacy / Single Mode Handling
        // Detect if we're receiving a PathFindingRequest { job, graph } or legacy flat data
        const isNewRequest = isRecord(data.job) && isRecord(data.graph);

        const jobData = isNewRequest ? data.job : data;
        const graphData = isNewRequest ? data.graph : data;
        if (!isRecord(jobData) || !isRecord(graphData) || !isValidWorkerJob(jobData)) {
            postInvalidWorkerMessage(hasString(data.jobId) ? data.jobId : undefined, 'Invalid pathfinding request');
            return;
        }

        // Construct context from appropriate source
        const nodes = Array.isArray(graphData.nodes) ? graphData.nodes : [];
        const edges = Array.isArray(graphData.edges) ? graphData.edges : [];
        const obstacles = Array.isArray(graphData.obstacles)
            ? graphData.obstacles.filter(isRectangle)
            : [];
        const config = isRecord(graphData.config)
            ? graphData.config as Partial<UnifiedRoutingConfig>
            : {};

        // TaskData should focus ONLY on edge-specific fields
        // If it's legacy, we strip out graph fields to avoid pollution
        const {
            nodes: _n, edges: _e, obstacles: _o, config: _c,
            job: _j, graph: _g, // Also strip potential nested keys if mixed
            ...edgeProps
        } = jobData;

        // [FIX] Ensure Nodes are treated as Obstacles in Single Mode too
        const CONTAINER_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'swimlane', 'domain']);
        const nodeObstacles = nodes.filter(n => {
            // [FIX] Unconditionally exclude container types from obstacles
            // Containers should never be obstacles in this context
            const nodeType = getNodeType(n);
            if (nodeType && CONTAINER_TYPES.has(nodeType)) {
                return false;
            }
            return true;
        }).map(n => ({
            ...getNodeXY(n),
            width: getNodeDimension(n, 'width', 150),
            height: getNodeDimension(n, 'height', 80)
        }));
        const allObstacles = [...(obstacles || []), ...nodeObstacles];

        const context = { nodes, edges, obstacles: allObstacles, config };

        // [P2-3] Build UnifiedRoutingConfig for single mode
        const unifiedConfig: UnifiedRoutingConfig = {
            ...createDefaultRoutingConfig(),
            ...(config || {})
        };
        // [FIX] Force borderRadius to 8px (Hyper-Glass V3 standard)
        unifiedConfig.postProcessing.borderRadius = readBorderRadius(config);
        const visibilityGraphEnabled = unifiedConfig.algorithm.useVisibilityGraph &&
            allObstacles.length >= (unifiedConfig.algorithm.visibilityGraphThreshold ?? 6);
        const shouldBuildSpatialIndex = allObstacles.length > 0 && (visibilityGraphEnabled || allObstacles.length > 50);

        let spatialIndex: SpatialIndex | undefined;
        if (shouldBuildSpatialIndex) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (let i = 0; i < allObstacles.length; i++) {
                const obs = allObstacles[i];
                if (obs.x < minX) minX = obs.x;
                if (obs.y < minY) minY = obs.y;
                if (obs.x + obs.width > maxX) maxX = obs.x + obs.width;
                if (obs.y + obs.height > maxY) maxY = obs.y + obs.height;
            }

            if (minX === Infinity) {
                minX = 0;
                minY = 0;
                maxX = 1000;
                maxY = 1000;
            }

            const padding = 200;
            spatialIndex = new QuadTree({
                x: minX - padding,
                y: minY - padding,
                width: (maxX - minX) + padding * 2,
                height: (maxY - minY) + padding * 2
            });

            for (let i = 0; i < allObstacles.length; i++) {
                spatialIndex.insert(allObstacles[i]);
            }
        }

        const visibilityGraphCache = visibilityGraphEnabled
            ? buildVisibilityGraph(spatialIndex || allObstacles)
            : undefined;

        const job: PathFindingJob = {
            ...edgeProps,
            jobId: jobData.jobId,
            edgeId: jobData.edgeId,
            source: jobData.source,
            target: jobData.target,
            sourceX: jobData.sourceX,
            sourceY: jobData.sourceY,
            targetX: jobData.targetX,
            targetY: jobData.targetY
        };

        // No prebuilt grid (findPath will build it internally)
        try {
            const result = executeEdgePathfinding({
                job,
                graph: context,
                config: unifiedConfig,
                runtime: { spatialIndex, visibilityGraphCache }
            });

            // Post back flattened result as before
            if (result.error) {
                logPathfindingWorkerPostingError(result.error);
                self.postMessage({ jobId: result.jobId, error: result.error });
            } else {
                self.postMessage(result);
            }
        } catch (err: unknown) {
            logPathfindingWorkerCriticalFailure(err);
            self.postMessage({ jobId: job.edgeId, error: getErrorMessage(err, 'Worker execution failed') });
        }
    }
};

/**
 * [NEW] Helper to rasterize path points into the congestion grid
 */
function rasterizePathToGrid(
    targetGrid: Int32Array,
    points: Point[],
    cost: number,
    gridSpec: { minX: number, minY: number, cols: number, rows: number, size: number, maxIndex: number }
) {
    if (!points || points.length < 2) return;

    const { minX, minY, cols, rows, size, maxIndex } = gridSpec;

    // Helper to set cost safely
    const addCost = (idx: number) => {
        if (idx >= 0 && idx < maxIndex) {
            targetGrid[idx] += cost;
        }
    };

    const getIdx = (x: number, y: number) => {
        const c = Math.floor((x - minX) / size);
        const r = Math.floor((y - minY) / size);
        if (c < 0 || c >= cols || r < 0 || r >= rows) return -1;
        return r * cols + c;
    };

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];

        const gStart = {
            x: Math.round(p1.x / size) * size,
            y: Math.round(p1.y / size) * size
        };
        const gEnd = {
            x: Math.round(p2.x / size) * size,
            y: Math.round(p2.y / size) * size
        };

        const cStart = Math.floor((gStart.x - minX) / size);
        const rStart = Math.floor((gStart.y - minY) / size);
        const cEnd   = Math.floor((gEnd.x   - minX) / size);
        const rEnd   = Math.floor((gEnd.y   - minY) / size);

        if (Math.abs(gStart.y - gEnd.y) < 1) {
            // [FIX-P2⑦] Horizontal segment: iterate by column index in the SAME row
            // Previously used raw linear index which could cross row boundaries.
            if (rStart < 0 || rStart >= rows) continue;
            const colMin = Math.max(0, Math.min(cStart, cEnd));
            const colMax = Math.min(cols - 1, Math.max(cStart, cEnd));
            for (let c = colMin; c <= colMax; c++) {
                addCost(rStart * cols + c);
            }
        } else if (Math.abs(gStart.x - gEnd.x) < 1) {
            // Vertical segment: step by cols (unchanged, already correct)
            if (cStart < 0 || cStart >= cols) continue;
            const rowMin = Math.max(0, Math.min(rStart, rEnd));
            const rowMax = Math.min(rows - 1, Math.max(rStart, rEnd));
            for (let r = rowMin; r <= rowMax; r++) {
                addCost(r * cols + cStart);
            }
        } else {
            // Diagonal (rare from A*): mark endpoints only
            addCost(getIdx(gStart.x, gStart.y));
            addCost(getIdx(gEnd.x, gEnd.y));
        }
    }
}





// [FIX] Removed extra closing brace
// rasterizePathToGrid is now a sibling function
