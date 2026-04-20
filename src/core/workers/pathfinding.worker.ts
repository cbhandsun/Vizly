/* eslint-disable @typescript-eslint/no-explicit-any */
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
    PathfindingContext,
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


import type { LineObstacle } from '../types/routing';

// [Imp-8] Global Cache Definition
interface WorkerGraphCache {
    version: number;
    spatialIndex: QuadTree | null;
    visibilityGraph: any | null;
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

const getNodeXY = (n: any): { x: number; y: number } => {
    const abs = n?.computed?.positionAbsolute || n?.positionAbsolute || n?.absolutePosition;
    const pos = abs || n?.position;
    return {
        x: pos?.x ?? n?.x ?? 0,
        y: pos?.y ?? n?.y ?? 0
    };
};

/**
 * Core Pathfinding Execution Logic
 * Delegates to the modular EdgeRoutingWorker
 */
export const executeEdgePathfinding = (context: PathfindingContext): any => {
    return EdgeRoutingWorker.execute(context);
};






/**
 * Worker Entry Point
 * Handles both Single and Batch messages.
 */
self.onmessage = (e: MessageEvent) => {
    const data = e.data;

    if (data.mode === 'batch') {
        const { jobId: batchId, context, tasks } = data as BatchPathFindingJob;

        if (context.config?.debug) {
            console.log('[DEBUG-WORKER] Batch Received. TaskCount:', tasks?.length);
            console.log('[DEBUG-WORKER] Batch Context:', {
                nodeCount: context.nodes?.length,
                edgeCount: context.edges?.length,
                taskCount: tasks?.length
            });
        }

        // [P2-3] Build UnifiedRoutingConfig early for batch context
        const unifiedConfig: UnifiedRoutingConfig = {
            ...createDefaultRoutingConfig(),
            ...(context.config || {})
        };



        // [Imp-8] Caching Logic
        let spatialIndex: QuadTree;
        let visibilityGraphCache: any;
        let grid: PathfindingGrid;
        let gridBounds: { startX: number; startY: number; endX: number; endY: number };

        const currentVersion = context.graphVersion;
        const targetGridSize = unifiedConfig.algorithm.gridSize || 20;

        // Try Cache
        if (currentVersion !== undefined &&
            globalCache.version === currentVersion &&
            globalCache.spatialIndex &&
            globalCache.grid &&
            globalCache.gridBounds &&
            globalCache.gridSize === targetGridSize) {

            // console.log(`[Worker] Cache HIT (v${currentVersion})`);
            spatialIndex = globalCache.spatialIndex;
            visibilityGraphCache = globalCache.visibilityGraph;
            grid = globalCache.grid;
            gridBounds = globalCache.gridBounds;

        } else {
            // Build New
            if (currentVersion !== undefined) {
                // console.log(`[Worker] Cache MISS/UPDATE (v${currentVersion} vs v${globalCache.version})`);
            }

            // Calculate Bounds (From Nodes/Obstacles ONLY)
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

            if (context.nodes?.length) {
                context.nodes.forEach((n: any) => {
                    const { x: nx, y: ny } = getNodeXY(n);
                    if (nx < minX) minX = nx;
                    if (nx > maxX) maxX = nx;
                    if (ny < minY) minY = ny;
                    if (ny > maxY) maxY = ny;
                });
            }

            // Fallback
            if (minX === Infinity) { minX = 0; maxX = 1000; minY = 0; maxY = 1000; }

            const PADDING = 200;
            const CONTAINER_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'swimlane', 'domain']);

            // Re-map node obstacles
            const nodeObstacles = context.nodes?.filter((n: any) => {
                if (n.type && CONTAINER_TYPES.has(n.type)) return false;
                return true;
            }).map((n: any) => ({
                id: n.id,
                ...getNodeXY(n),
                width: n.measured?.width || n.width || 150,
                height: n.measured?.height || n.height || 80
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
            gridBounds = { startX: minX - PADDING, startY: minY - PADDING, endX: maxX + PADDING, endY: maxY + PADDING };
            grid = buildPathfindingGrid(spatialIndex, gridBounds, targetGridSize);

            // Update Cache
            if (currentVersion !== undefined) {
                globalCache = {
                    version: currentVersion,
                    spatialIndex,
                    visibilityGraph: visibilityGraphCache,
                    gridSize: targetGridSize,
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

        if (unifiedConfig.debug) {
            console.log('[Worker] Starting Task Execution Loop. Debug:', unifiedConfig.debug);
        }

        // A. Pre-process Priorities
        const outgoing = new Map<string, any[]>();
        const incoming = new Map<string, any[]>();
        const nodeLookup = new Map<string, any>();

        if (context.nodes) {
            context.nodes.forEach((n: any) => nodeLookup.set(n.id, n));
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
                return (tA.y + tA.height / 2) - (tB.y + tB.height / 2); // Top-to-Bottom default
            }
            if (sameTarget) {
                // N-to-1: Sort by Source Position
                return (sA.y + sA.height / 2) - (sB.y + sB.height / 2);
            }

            // Fallback: Default Deviation Sort
            const getDeviation = (t: any, s: any, tgt: any) => {
                const dy = Math.abs((s.y + s.height / 2) - (tgt.y + tgt.height / 2));
                const dx = Math.abs((s.x + s.width / 2) - (tgt.x + tgt.width / 2));
                return Math.min(dy, dx);
            };
            return getDeviation(a, sA, tA) - getDeviation(b, sB, tB);
        });

        // C. Sequential Execution with Guide Line Accumulation
        const results: PathFindingTaskResult[] = [];
        const groupPaths = new Map<string, LineObstacle[]>(); // Key: "NodeID_DIR" (e.g. "MsgView_IN")

        // [NEW] Port Usage Tracking for Batch
        const portUsageMap: Record<string, number> = {};

        // [Imp-9] Prepare Global Debug Data (VG/SpatialIndex)
        const debugDataExtras: any = {};
        if (unifiedConfig.debug) {
            // Serialize VG
            if (visibilityGraphCache) {
                const vg = visibilityGraphCache as VisibilityGraph;
                const debugEdges: any[] = [];
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
                    debugDataExtras.obstacles = spatialIndex.getAll().map((o: any) => ({
                        x: o.x, y: o.y, width: o.width, height: o.height, id: o.id
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
            let result: any;
            try {
                result = executeEdgePathfinding({
                    job: task,
                    graph: context,
                    config: unifiedConfig,
                    runtime: {
                        prebuiltGrid: grid,
                        spatialIndex: spatialIndex,
                        visibilityGraphCache: visibilityGraphCache,
                        guideLines: relevantGuideLines,
                        portUsage: portUsageMap,
                        congestionGrid: congestionGrid // [NEW]
                    }
                });
            } catch (err: any) {
                console.error(`[Worker] Task execution failed for edge ${task.edgeId}:`, err);
                // Provide a safe fallback result so the batch doesn't crash completely
                const sx = task.sourceX ?? 0;
                const sy = task.sourceY ?? 0;
                const tx = task.targetX ?? 0;
                const ty = task.targetY ?? 0;
                result = {
                    edgeId: task.edgeId,
                    jobId: task.jobId,
                    path: `M ${sx} ${sy} L ${tx} ${ty}`,
                    points: [{ x: sx, y: sy }, { x: tx, y: ty }],
                    labelX: (sx + tx) / 2,
                    labelY: (sy + ty) / 2,
                    error: err.message || 'Worker task crashed'
                };
            }


            // [NEW] Update Port Usage
            if (result && result.sourcePos && result.targetPos) {
                const posToDir = (pos: any) => {
                    if (pos === Position.Top) return 'top';
                    if (pos === Position.Bottom) return 'bottom';
                    if (pos === Position.Left) return 'left';
                    if (pos === Position.Right) return 'right';
                    return 'bottom';
                };

                const sKey = `${task.source}-${posToDir(result.sourcePos)}`;
                const tKey = `${task.target}-${posToDir(result.targetPos)}`;

                portUsageMap[sKey] = (portUsageMap[sKey] || 0) + 1;
                portUsageMap[tKey] = (portUsageMap[tKey] || 0) + 1;
            }

            // [FIX] Ensure ID propagation
            result.edgeId = task.edgeId;
            result.jobId = task.jobId;

            // [DEBUG] Attach Global Debug Data (VG/SpatialIndex)
            if (unifiedConfig.debug && debugDataExtras) {
                if (!result.debugInfo) result.debugInfo = { algorithmDebug: {} };
                if (!result.debugInfo.algorithmDebug) result.debugInfo.algorithmDebug = {};
                Object.assign(result.debugInfo.algorithmDebug as any, debugDataExtras);
            }

            // [FIX] Ensure Metadata exists
            if (!result.metadata) {
                console.warn(`[Worker] Result for ${task.edgeId} missing metadata! Attaching default.`);
                result.metadata = { strategy: (result as any).debugInfo?.algorithmDebug?.strategy || 'Recovered' };
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
                console.log('[Worker] Starting edge bundling...');
                // [FIX] Pass spatialIndex (includes nodes) to prevent invalid bundling collisions
                optimizedPaths = bundleEdges(optimizedPaths, channelConfig.bundleStrength, spatialIndex);
                console.log(`[Worker] Bundling complete. Paths count: ${optimizedPaths.length}`);
            } else if (channelConfig.enableChannelRouting) {
                optimizedPaths = separateParallelPaths(optimizedPaths, channelConfig.channelSpacing, spatialIndex);
            }
            const optimizedMap = new Map(optimizedPaths.map(p => [p.edgeId, p.points]));
            for (const result of successfulResults) {
                const updatedPoints = optimizedMap.get(result.edgeId || result.jobId);
                if (!updatedPoints) continue;
                result.points = updatedPoints;
                result.path = createFilletedPath(updatedPoints, unifiedConfig.postProcessing.borderRadius ?? 12);
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
    
        } catch (err: any) {
            console.error('[DEBUG-WORKER] Return serialization failed:', err);
            self.postMessage({
                type: 'BATCH_RESULT',
                batchId,
                error: 'Serialization Failed: ' + err.message
            });
        }
    } else {
        // [P2-3] Legacy / Single Mode Handling
        // Detect if we're receiving a PathFindingRequest { job, graph } or legacy flat data
        const isNewRequest = (data as any).job && (data as any).graph;

        const jobData = isNewRequest ? (data as any).job : data;
        const graphData = isNewRequest ? (data as any).graph : data;

        // Construct context from appropriate source
        const { nodes, edges, obstacles, config } = graphData;

        // TaskData should focus ONLY on edge-specific fields
        // If it's legacy, we strip out graph fields to avoid pollution
        const {
            nodes: _n, edges: _e, obstacles: _o, config: _c,
            job: _j, graph: _g, // Also strip potential nested keys if mixed
            ...edgeProps
        } = jobData;

        // [FIX] Ensure Nodes are treated as Obstacles in Single Mode too
        const CONTAINER_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'swimlane', 'domain']);
        const nodeObstacles = nodes?.filter((n: any) => {
            // [FIX] Unconditionally exclude container types from obstacles
            // Containers should never be obstacles in this context
            if (n.type && CONTAINER_TYPES.has(n.type)) {
                return false;
            }
            return true;
        }).map((n: any) => ({
            ...getNodeXY(n),
            width: n.measured?.width || n.width || 150,
            height: n.measured?.height || n.height || 80
        })) || [];
        const allObstacles = [...(obstacles || []), ...nodeObstacles];

        const context = { nodes, edges, obstacles: allObstacles, config };

        // [P2-3] Build UnifiedRoutingConfig for single mode
        const unifiedConfig: UnifiedRoutingConfig = {
            ...createDefaultRoutingConfig(),
            ...(config || {})
        };
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

        const job: PathFindingJob = edgeProps as PathFindingJob;

        // No prebuilt grid (findPath will build it internally)
        // console.log('[Worker] Executing Logic for job:', job.edgeId);
        try {
            const result = executeEdgePathfinding({
                job,
                graph: context,
                config: unifiedConfig,
                runtime: { spatialIndex, visibilityGraphCache }
            });

            // Post back flattened result as before
            if (result.error) {
                console.error('[Worker] Posting ERROR:', result.error);
                self.postMessage({ jobId: result.jobId, error: result.error });
            } else {
                // console.log('[Worker] Posting SUCCESS:', result.edgeId, 'Points:', result.points?.length);
                self.postMessage(result);
            }
        } catch (err: any) {
            console.error('[Worker] CRITICAL FAILURE:', err);
            self.postMessage({ jobId: job.edgeId, error: err.message });
        }
    }
};

/**
 * [NEW] Helper to rasterize path points into the congestion grid
 */
function rasterizePathToGrid(
    targetGrid: Int32Array,
    points: any[],
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

        // Rasterize segment p1-p2
        // Simple Bresenham or axis-aligned filling
        const gStart = {
            x: Math.round(p1.x / size) * size,
            y: Math.round(p1.y / size) * size
        };
        const gEnd = {
            x: Math.round(p2.x / size) * size,
            y: Math.round(p2.y / size) * size
        };

        const idxStart = getIdx(gStart.x, gStart.y);
        const idxEnd = getIdx(gEnd.x, gEnd.y);

        addCost(idxStart);
        addCost(idxEnd);

        if (Math.abs(gStart.y - gEnd.y) < 1) { // Horizontal
            const sIdx = Math.min(idxStart, idxEnd);
            const eIdx = Math.max(idxStart, idxEnd);
            // Optimization: bulk fill if contiguous (only works if in same row, usually true for H-seg)
            // Be careful about wrapping? getIdx handles simple C/R check. 
            // If they are on same row:
            for (let idx = sIdx; idx <= eIdx; idx++) {
                addCost(idx);
            }
        } else if (Math.abs(gStart.x - gEnd.x) < 1) { // Vertical
            const sIdx = Math.min(idxStart, idxEnd);
            const eIdx = Math.max(idxStart, idxEnd);
            for (let idx = sIdx; idx <= eIdx; idx += cols) {
                addCost(idx);
            }
        }
        // Ignore diagonal segments rasterization here (handled by endpoints usually or A* won't produce them much)
    }
}





// [FIX] Removed extra closing brace
// rasterizePathToGrid is now a sibling function
