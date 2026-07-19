/* eslint-disable @typescript-eslint/no-unused-vars */
import { createDefaultRoutingConfig } from '../types/routing';
import {
    PathFindingJob,
    PathFindingResult,
    SharedTrunkSegment,
    Point,
    SharedGraphContext,
} from '../types/routing';
import { Edge, Position } from '@xyflow/react';
import WorkerPool from '../workers/WorkerPool';
import { EdgeRoutingCache } from './EdgeRoutingCache';
import { RoutingPerformanceMonitor } from '../monitoring/RoutingPerformanceMonitor';
import { IncrementalRoutingManager } from './IncrementalRoutingManager';
import { PathfindingWorkerPool } from '../workers/PathfindingWorkerPool'; // [FIX] Partial lowercase filename
import { RoutingStrategySelector } from '../algorithms/RoutingStrategySelector';
import { VisibilityGraphCache } from '../algorithms/VisibilityGraphCache';
import { setPathfindingConfig } from '../algorithms/pathfinding';
import { LineObstacle, Rectangle } from '../algorithms/pathfinding';
import { optimizePaths } from '../algorithms/LPNudge';
import { clearRenderedPathCache } from '../routing/renderedPathCache';
import { buildRoutedLabelObstacle, getGraphEdgeLabelText } from './edgeRoutingLabels';
import { buildEdgeRoutingCandidateAxes } from './edgeRoutingCandidateAxes';
import { collectHardNodeObstacleRects, collectSoftNodeObstacleRects, type EdgeRoutingObstacleNode } from './edgeRoutingNodeObstacles';
import { routeJobsWithParallelFallback, routeSerialFallbackJobs } from './edgeRoutingParallel';
import { createEdgeRoutingObstacleCollector } from './edgeRoutingObstacles';
import { scheduleEdgeRoutingBatch } from './edgeRoutingScheduling';
import {
    assignSameSidePortSeparation as separateSameSidePorts,
} from './edgeRoutingPortSeparation';
import {
    logEdgeRoutingCoordinatorBatchRoutingFailure,
    logEdgeRoutingCoordinatorCachesCleared,
    logEdgeRoutingCoordinatorDebugToolsReady,
    logEdgeRoutingCoordinatorGlobalNudgeFailure,
    logEdgeRoutingCoordinatorMissingResult,
    logEdgeRoutingCoordinatorNoLatestRequest,
    logEdgeRoutingCoordinatorParallelFallback,
    logEdgeRoutingCoordinatorParallelIncomplete,
    logEdgeRoutingCoordinatorParallelPoolInitFailure,
    logEdgeRoutingCoordinatorSerialRoutingFailure,
    logEdgeRoutingGraphVersionSubscriberFailure,
} from '../utils/routingLogging';
import {
    collectFixedRoutingPathContext,
    collectPendingRoutingLineObstacles,
    type KnownRoutingPathCandidate,
} from './edgeRoutingCoordinatorPostProcessing';
import {
    assignGlobalRoutingChannels,
    injectRoutingCongestionContext,
} from './edgeRoutingChannelAssignment';
import { applyGlobalRoutingPostProcessing } from './edgeRoutingGlobalPostProcessing';
import {
    buildRoutingDebugPayload,
    commitRoutingBatchResults,
    createRoutingBatchSnapshot,
    syncPreparedJobsToLatestRequests,
    type RoutingBatchRequest,
} from './edgeRoutingBatchLifecycle';
import { assignBusRoutingMetadata } from './edgeRoutingBusGroupProcessing';
import { buildEdgeRoutingFailureFallback } from './edgeRoutingFailureFallback';
import { EdgeRoutingIncrementalState } from './edgeRoutingIncrementalState';

/**
 * [P0-2] Main coordination service for edge routing.
 * Manages caching, worker delegation, and incremental updates.
 */
export type RoutingRequest = RoutingBatchRequest;

export interface PortUsageStats {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

/** [Phase 2] Debug data structure for trunk visualization */
interface TrunkDebugData {
    /** Edge ID */
    edgeId: string;
    /** Edge type (main, feedback, data, etc.) */
    edgeType?: string;
    /** Geometric delta */
    delta: number;
    /** Direction sign */
    dirSign: number;
    /** Classified side (1 = forward, -1 = backward) */
    side: number;
    /** Whether edge type influenced classification */
    typeInfluenced: boolean;
    /** Trunk geometry if assigned */
    trunk?: {
        direction: 'horizontal' | 'vertical';
        axis: number;
        range: { min: number; max: number };
        port?: string;
    };
}

type CacheablePathFindingJob = Partial<PathFindingJob> & {
    sourceRect?: Rectangle;
    targetRect?: Rectangle;
    type?: string;
};

export class EdgeRoutingCoordinator {
    private static instance: EdgeRoutingCoordinator | null = null;
    private workerPool: WorkerPool;
    private cache: EdgeRoutingCache;
    private monitor: RoutingPerformanceMonitor;
    private incrementalManager: IncrementalRoutingManager;

    // [P0] Parallel worker pool
    private parallelPool: PathfindingWorkerPool | null = null;
    private useParallelRouting: boolean = false;

    // [P1.2] VG and Strategy optimizations
    private vgCacheManager: VisibilityGraphCache;
    private strategySelector: RoutingStrategySelector;

    // [P0-2] Topology, graph-version, and dirty-edge state
    private incrementalState = new EdgeRoutingIncrementalState(logEdgeRoutingGraphVersionSubscriberFailure);
    /** [SharedTrunk] Accumulated shared trunk segments from latest batch, keyed by group ID */
    private sharedTrunks: Map<string, SharedTrunkSegment> = new Map();
    private routedLabelObstacles: Map<string, Rectangle & { edgeId: string; ownerId: string }> = new Map();
    private latestRoutedPaths: Map<string, { graphKey: string; points: Point[]; updatedAt: number }> = new Map();

    // [P2-3] Port Usage for Congestion Awareness
    // private portUsageStats: Record<string, PortUsageStats> = {};

    // [P2-3] Pending Requests for Batching
    // Track latest request per edge to avoid duplicate work in same tick
    private latestRequests: Map<string, { request: RoutingRequest; graphKey: string; seq: number; updatedAt: number }> = new Map();
    private requestSeq: number = 0;

    // [NEW] Debug State
    private debugEdgeId: string | null = null;
    private onDebugData: ((data: unknown) => void) | null = null;

    // [Phase 2] Trunk Debug Data Collection
    private trunkDebugData: Map<string, TrunkDebugData> = new Map();

    public clearDebugEdge(): void {
        this.setDebugEdge(null);
    }

    // [FIX] Debounce Timer
    private pendingTimeout: any = null;
    // Map to store resolvers for pending edge requests
    private pendingResolvers: Map<
        string,
        { resolve: (value: PathFindingResult | PromiseLike<PathFindingResult>) => void; seq: number }
    > = new Map();

    private readonly MAX_PENDING_SEGMENTS = 400;

    private isDragging: boolean = false;

    // [COLD-START] 鍐峰惎鍔ㄤ繚鎶わ細freeze 鏈熼棿鎵€鏈?scheduleBatchRouting 璋冪敤琚寕璧?
    // 鐩村埌 unfreeze() 琚皟鐢紝鍐嶄竴娆℃€ф壒閲忚Е鍙戯紝閬垮厤鑺傜偣娴嬮噺涓嶇ǔ瀹氭椂 A* 澶ч噺鏃犳晥杩唬
    private isFrozen: boolean = false;
    private frozenDuringColdStart: boolean = false;

    /**
     * [COLD-START] 鍐荤粨璺敱璋冨害銆?
     * 鍦ㄤ粠缂撳瓨鍔犺浇鏁版嵁鏃惰皟鐢紝闃叉鑺傜偣灏哄鏈ǔ瀹氬墠瑙﹀彂澶ч噺 A* 璁＄畻銆?
     */
    public freeze(): void {
        this.isFrozen = true;
        this.frozenDuringColdStart = true;
        if (this.pendingTimeout) {
            clearTimeout(this.pendingTimeout);
            this.pendingTimeout = null;
        }
    }

    /**
     * [COLD-START] 瑙ｅ喕璺敱璋冨害锛屽苟绔嬪嵆瑙﹀彂涓€娆℃壒閲忚绠椼€?
     * 鍦ㄨ妭鐐规祴閲忕ǔ瀹氬悗锛圧F measured.width > 0锛夎皟鐢ㄣ€?
     */
    public unfreeze(): void {
        if (!this.isFrozen) return;
        this.isFrozen = false;
        this.frozenDuringColdStart = false;
        // 绔嬪嵆瑙﹀彂涓€娆℃壒閲忚矾鐢憋紙鎵€鏈夌Н鍘嬬殑璇锋眰閮藉湪 latestRequests 閲岋級
        if (this.latestRequests.size > 0) {
            this.markAllDirty();
            this.scheduleBatchRouting();
        }
    }

    /** [COLD-START] 灏嗘墍鏈夊凡鐭ヨ竟鏍囪涓鸿剰 */
    private markAllDirty(): void {
        this.incrementalState.markAllDirty(this.latestRequests.keys());
    }

    /**
     * [H-10] Notify coordinator that a drag operation is in progress.
     * Increases debounce delay during drag to reduce CPU load (~75% fewer route calls).
     */
    public setDragging(dragging: boolean): void {
        this.isDragging = dragging;
        if (!dragging) {
            // Immediately trigger routing on drag-end to snap to final position
            this.scheduleBatchRouting();
        }
    }

    /**
     * [P0] Schedule a batch routing run (debounced).
     * Call this after manually marking edges as dirty.
     */
    public scheduleBatchRouting(): void {
        scheduleEdgeRoutingBatch({
            isFrozen: this.isFrozen,
            isDragging: this.isDragging,
            pendingTimeout: this.pendingTimeout,
            clearTimer: (handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
            scheduleTimer: (callback, delayMs) => setTimeout(callback, delayMs),
            setPendingTimeout: (handle) => {
                this.pendingTimeout = handle;
            },
            triggerBatchRouting: () => {
                void this.triggerBatchRouting();
            },
        });
    }

    private constructor() {
        this.workerPool = WorkerPool.getInstance();
        this.cache = EdgeRoutingCache.getInstance();
        this.monitor = RoutingPerformanceMonitor.getInstance();
        this.incrementalManager = new IncrementalRoutingManager();

        // [P1.2] Initialize VG optimization modules
        this.vgCacheManager = new VisibilityGraphCache({ maxSize: 10 });
        this.strategySelector = new RoutingStrategySelector();

        // Configure pathfinding to use P1.2 optimizations
        setPathfindingConfig({
            enableSmartStrategy: true,
            strategySelector: this.strategySelector,
            vgCacheManager: this.vgCacheManager
        });

        // Initialize parallel pool if enabled
        this.initializeParallelPool();
    }

    /**
     * [P0 OPTIMIZATION] Initialize parallel worker pool
     */
    private initializeParallelPool(): void {
        try {
            this.parallelPool = new PathfindingWorkerPool();
            this.useParallelRouting = true;
        } catch (error) {
            logEdgeRoutingCoordinatorParallelPoolInitFailure(error);
            this.useParallelRouting = false;
        }
    }

    public static getInstance(): EdgeRoutingCoordinator {
        if (!EdgeRoutingCoordinator.instance) {
            EdgeRoutingCoordinator.instance = new EdgeRoutingCoordinator();
            // [DEBUG] Expose globally for console debugging
            // Usage: window.__vizly_coordinator__.forceClearAllCaches()
            try { (window as any).__vizly_coordinator__ = EdgeRoutingCoordinator.instance; } catch {}
        }
        return EdgeRoutingCoordinator.instance;
    }

    /**
     * [P0] Get current graph version
     */
    public getGraphVersion(): number {
        return this.incrementalState.getGraphVersion();
    }

    /**
     * [P0-2] 璁㈤槄 graphVersion 鍙樺寲銆?
     * 杩斿洖鍙栨秷璁㈤槄鍑芥暟锛岄厤鍚?useSyncExternalStore 浣跨敤銆?
     * 杩欐牱 useSmartPathWorker 鍙互鍝嶅簲寮忓湴杩借釜鐗堟湰鍙樺寲锛?
     * 鑰屼笉闇€瑕佹妸 getGraphVersion() 鍑芥暟璋冪敤鏀捐繘 deps array銆?
     */
    public subscribeGraphVersion(callback: () => void): () => void {
        return this.incrementalState.subscribeGraphVersion(callback);
    }

    /**
     * Mark the graph as dirty (topology changed).
     * This invalidates the cache because routing depends on obstacles/other edges.
     */
    public notifyGraphChange(changedNodeIds?: string[]): void {
        // [P2.1] Incremental cache invalidation
        if (changedNodeIds && changedNodeIds.length > 0 && this.incrementalState.hasDependencies()) {
            // [FIX] DO NOT increment graphVersion in incremental mode!
            // graphVersion is part of every cache key (getCachedResult uses it).
            // Incrementing it invalidates ALL cached results, even for edges whose
            // source/target didn't move. Only delete specific edge caches.
            const affectedEdges = this.incrementalState.getAffectedEdgeIds(changedNodeIds);
            // Mark only affected edges as dirty
            for (const edgeId of affectedEdges) {
                this.cache.deleteByEdgeId(edgeId);
                this.incrementalState.markDirty(edgeId);
                this.latestRoutedPaths.delete(edgeId);
            }
        } else {
            // Fallback: full invalidation when no specific nodes provided
            this.incrementalState.incrementGraphVersion();
            this.cache.clear();
            this.latestRoutedPaths.clear();
            this.incrementalState.clearDirtyEdges();
            this.incrementalState.markAllDirty();
        }

        this.workerPool.markDirty();

        for (const [edgeId, pending] of this.pendingResolvers.entries()) {
            const entry = this.latestRequests.get(edgeId);
            const sx = entry?.request.job.sourceX ?? 0;
            const sy = entry?.request.job.sourceY ?? 0;
            const tx = entry?.request.job.targetX ?? 0;
            const ty = entry?.request.job.targetY ?? 0;
            pending.resolve({
                jobId: entry?.request.job.jobId || edgeId,
                edgeId,
                path: `M ${sx} ${sy} L ${tx} ${ty}`,
                points: [{ x: sx, y: sy }, { x: tx, y: ty }],
                labelX: (sx + tx) / 2,
                labelY: (sy + ty) / 2,
                error: 'Graph changed'
            });
        }
        this.pendingResolvers.clear();
    }

    /**
     * [FIX] Force clear ALL caches and reset routing state
     * More thorough than notifyGraphChange - clears port usage, dependencies, etc.
     */
    public forceClearAllCaches(): void {
        this.cache.clear();
        this.workerPool.markDirty();
        this.incrementalState.clearDirtyEdges();
        this.incrementalState.resetDependencies();
        this.latestRequests.clear();
        this.latestRoutedPaths.clear();
        this.routedLabelObstacles.clear();
        this.incrementalState.incrementGraphVersion();
        
        // Clear global SVG path cache to prevent "flying lines" UI fallback.
        clearRenderedPathCache();

        // Re-mark all known edges as dirty so they re-route on next render
        this.incrementalState.markAllDirty();
        this.scheduleBatchRouting();

        logEdgeRoutingCoordinatorCachesCleared();
    }

    private onSelectionChange: ((edgeId: string | null) => void) | null = null;

    public setDebugEdge(edgeId: string | null) {
        this.debugEdgeId = edgeId;
        if (this.onSelectionChange) {
            this.onSelectionChange(edgeId);
        }
    }

    public forceDebugReRoute(edgeId?: string | null): void {
        const targetId = edgeId ?? this.debugEdgeId;
        if (!targetId) {
            return;
        }
        this.setDebugEdge(targetId);

        const entry = this.latestRequests.get(targetId);
        if (!entry) {
            logEdgeRoutingCoordinatorNoLatestRequest(targetId);
            return;
        }

        // [FIX] Refresh source/target coordinates from the latest stored graph context.
        // If nodes moved since the last route, the cached job has stale sourceX/Y/targetX/Y.
        // Pull fresh center-point coordinates so debug routing reflects the current layout.
        try {
            const freshNodes: any[] = entry.request.graph?.nodes ?? [];
            const freshNodeMap = new Map<string, any>(freshNodes.map((n: any) => [n.id, n]));
            const srcNode = freshNodeMap.get(entry.request.job.source);
            const tgtNode = freshNodeMap.get(entry.request.job.target);
            if (srcNode) {
                const sx = srcNode.positionAbsolute?.x ?? srcNode.position?.x ?? srcNode.x ?? entry.request.job.sourceX;
                const sy = srcNode.positionAbsolute?.y ?? srcNode.position?.y ?? srcNode.y ?? entry.request.job.sourceY;
                const sw = srcNode.measured?.width ?? srcNode.width ?? 150;
                const sh = srcNode.measured?.height ?? srcNode.height ?? 80;
                entry.request.job.sourceX = sx + sw / 2;
                entry.request.job.sourceY = sy + sh / 2;
            }
            if (tgtNode) {
                const tx = tgtNode.positionAbsolute?.x ?? tgtNode.position?.x ?? tgtNode.x ?? entry.request.job.targetX;
                const ty = tgtNode.positionAbsolute?.y ?? tgtNode.position?.y ?? tgtNode.y ?? entry.request.job.targetY;
                const tw = tgtNode.measured?.width ?? tgtNode.width ?? 150;
                const th = tgtNode.measured?.height ?? tgtNode.height ?? 80;
                entry.request.job.targetX = tx + tw / 2;
                entry.request.job.targetY = ty + th / 2;
            }
        } catch {
            // Non-critical: proceed with stale coords if refresh fails
        }

        this.incrementalState.markDirty(targetId);

        if (this.pendingTimeout) {
            clearTimeout(this.pendingTimeout);
        }
        this.pendingTimeout = setTimeout(() => {
            this.pendingTimeout = null;
            this.triggerBatchRouting();
        }, 0);
    }


    public registerDebugListener(callback: ((data: unknown) => void) | null) {
        this.onDebugData = callback;
    }

    public registerSelectionListener(callback: ((edgeId: string | null) => void) | null) {
        this.onSelectionChange = callback;
    }


    /**
     * Route an edge using Cache -> Worker fallback.
     * [P2-3] Refactored for separate Job and Graph Context
     */
    public async route(request: RoutingRequest): Promise<PathFindingResult> {
        const startTime = performance.now();
        const { edgeId, job, graph } = request;
        const isBus = !!job.isOneToMany || !!job.isManyToOne;

        // 1. Generate Cache Key
            const cacheParams = {
            ...this.extractCacheableParams(job, graph),
            version: this.incrementalState.getGraphVersion()
        };
        const key = this.cache.generateKey(edgeId, cacheParams);

        // 2. Check Cache
            const cached = isBus ? null : this.cache.get(key);
        if (cached) {
            this.monitor.track({
                edgeId: edgeId,
                routingTime: performance.now() - startTime,
                cacheHit: true
            });
            const graphKey = this.buildGraphKey(graph);
            this.latestRequests.set(edgeId, { request, graphKey, seq: ++this.requestSeq, updatedAt: performance.now() });
            this.storeLatestRoutedPath(edgeId, cached, graphKey);
            return cached;
        }

        // 3. Register for Batch Processing and Wait
        return new Promise<PathFindingResult>((resolve) => {
            const existing = this.pendingResolvers.get(edgeId);
            if (existing) {
                // [FIX] Chain resolvers instead of overwriting.
                // When React StrictMode or component remount causes route() to be
                // called multiple times for the same edge, the old resolver would be
                // overwritten, orphaning the old Promise (it would never resolve).
                // By chaining, ALL Promises for this edge resolve together.
            const previousResolve = existing.resolve;
                existing.resolve = (result: PathFindingResult | PromiseLike<PathFindingResult>) => {
                    previousResolve(result);
                    resolve(result);
                };
                // Update the request data with latest coordinates
                this.registerRoutingRequest(request, existing.seq);
            } else {
                const seq = ++this.requestSeq;
                this.pendingResolvers.set(edgeId, { resolve, seq });
                this.registerRoutingRequest(request, seq);
            }
        });
    }

    /**
     * [P0] Fallback to serial routing if parallel fails
     */
    private async routeSerialFallback(
        jobs: PathFindingJob[],
        graph: SharedGraphContext
    ): Promise<PathFindingResult[]> {
        return routeSerialFallbackJobs({
            jobs,
            graph,
            assignBusIndices: (fallbackJobs, fallbackGraph) =>
                assignBusRoutingMetadata(fallbackJobs, fallbackGraph),
            assignSameSidePortSeparation: this.assignSameSidePortSeparation.bind(this),
            assignGlobalChannels: this.assignGlobalChannels.bind(this),
            calculatePath: (job, currentGraph) => this.workerPool.calculatePath(job, currentGraph as any),
        });
    }

    /**
     * [P2-3] Extract parameters relevant for caching key
     */
    private extractCacheableParams(
        job: CacheablePathFindingJob,
        _graph: SharedGraphContext,
        pendingEdges?: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }>
    ): Record<string, unknown> {
        // We only care about things that affect pathfinding geometry
        // [H-9] Compute lightweight XOR hash of pendingEdges so cache key changes when
        // neighboring edges reroute (their new segments affect port selection).
        let peHash = 0;
        if (pendingEdges && pendingEdges.length > 0) {
            peHash = pendingEdges.length;
            for (const seg of pendingEdges) {
                peHash = ((peHash * 31) + Math.round(seg.start.x + seg.end.y * 7)) >>> 0;
            }
        }
        return {
            rv: 15,
            s: job.source,
            t: job.target,
            sx: Math.round(job.sourceX ?? 0),
            sy: Math.round(job.sourceY ?? 0),
            tx: Math.round(job.targetX ?? 0),
            ty: Math.round(job.targetY ?? 0),
            sr: job.sourceRect ? `${job.sourceRect.x},${job.sourceRect.y},${job.sourceRect.width},${job.sourceRect.height}` : '0',
            tr: job.targetRect ? `${job.targetRect.x},${job.targetRect.y},${job.targetRect.width},${job.targetRect.height}` : '0',
            // Include obstacles signature? Ideally yes, but maybe graph version handles it.
            // For now rely on graphVersion for global obstacle changes.
            // But if we want local caching, we might need a spatial hash of relevant obstacles.
            type: job.type || 's', // Smart
            sourceHandle: job.sourceHandle || '',
            targetHandle: job.targetHandle || '',
            sourcePosition: job.sourcePosition || '',
            targetPosition: job.targetPosition || '',
            // [FIX] Include Bus Routing params in cache key
            bus: `${!!job.isOneToMany}|${!!job.isManyToOne}|${job.busTrunkSource?.x ?? 0},${job.busTrunkSource?.y ?? 0}|${job.busTrunkTarget?.x ?? 0},${job.busTrunkTarget?.y ?? 0}`,
            pe: peHash,  // [H-9] pendingEdges fingerprint
        };
    }

    /**
     * [P0-2] Initialize edge dependencies for incremental routing.
     * Call this once with all edges to build the dependency graph.
     */
    public initializeEdges(edges: Edge[]): void {
        const { affectedNodeIds, hadExistingEdges } = this.incrementalState.initializeEdges(edges);
        // [FIX] Invalidate affected nodes to trigger peer re-routing when topology changes
        if (affectedNodeIds.length > 0 && hadExistingEdges) {
            this.notifyGraphChange(affectedNodeIds);
        }
    }

    /**
     * [P0-2] Mark nodes as changed (e.g., during drag).
     * This marks all edges connected to these nodes as dirty.
     */
    public markNodesChanged(nodeIds: string[] | string): void {
        this.incrementalState.markNodesChanged(nodeIds);
    }

    /**
     * [P0-2] Get list of dirty edges that need rerouting.
     */
    public getDirtyEdges(): string[] {
        return this.incrementalState.getDirtyEdgeIds();
    }

    /**
     * [P0-2] Clear dirty flags after rerouting.
     */
    public clearDirtyEdges(): void {
        this.incrementalState.clearDirtyEdges();
    }

    /**
     * [P0-2] Check if incremental routing is needed.
     */
    public hasDirtyEdges(): boolean {
        return this.incrementalState.hasDirtyEdges();
    }

    /**
     * [P0-2] Get incremental routing statistics.
     */
    public getIncrementalStats(): { total: number; dirty: number; ratio: number } {
        return this.incrementalState.getStats();
    }

    private buildJob(request: RoutingRequest): PathFindingJob {
        const baseJob = request.job as Partial<PathFindingJob>;
        return {
            ...baseJob,
            edgeId: request.edgeId,
            jobId: baseJob.jobId || request.edgeId
        } as PathFindingJob;
    }

    public registerRoutingRequest(request: RoutingRequest, seq?: number): void {
        const graphKey = this.buildGraphKey(request.graph);
        const s = typeof seq === 'number' ? seq : ++this.requestSeq;
        const _isFirstRequest = !this.latestRequests.has(request.edgeId);
        this.latestRequests.set(request.edgeId, { request, graphKey, seq: s, updatedAt: performance.now() });
        
        // [FIX] Any requested edge MUST be added to dirty batch.
        // If the smart edge hook dispatched a route() request, its fingerprint changed 
        // (e.g. user toggled edge type). Without this, the Promise never resolves and the edge 
        // enters a permanent fallback 'Straight Line' mode.
        this.incrementalState.markDirty(request.edgeId);

        // Debounce trigger
        this.scheduleBatchRouting();
    }

    private async triggerBatchRouting() {
        if (!this.hasDirtyEdges()) return;

        try {
            await this.batchRouteDirtyEdges();
        } catch (error: unknown) {
            logEdgeRoutingCoordinatorBatchRoutingFailure(error);
            // [FIX] Ensure pending resolvers are cleared to avoid deadlocks
            for (const [edgeId, pending] of this.pendingResolvers.entries()) {
                const entry = this.latestRequests.get(edgeId);
                pending.resolve(buildEdgeRoutingFailureFallback(edgeId, entry?.request.job));
            }
            this.pendingResolvers.clear();
        }
    }

    public getCachedResult(request: RoutingRequest): PathFindingResult | null {
        const cacheParams = {
            ...this.extractCacheableParams(request.job, request.graph),
            version: this.incrementalState.getGraphVersion()
        };
        const key = this.cache.generateKey(request.edgeId, cacheParams);
        return this.cache.get(key) ?? null;
    }

    private storeLatestRoutedPath(edgeId: string, result: PathFindingResult, graphKey: string): void {
        if (!result.points || result.points.length < 2 || result.error) {
            this.latestRoutedPaths.delete(edgeId);
            return;
        }
        this.latestRoutedPaths.set(edgeId, {
            graphKey,
            points: result.points.map(point => ({ x: point.x, y: point.y })),
            updatedAt: performance.now(),
        });
    }

    /**
     * [P1.2] Simplified graph key using version number.
     * Since graphVersion increments on every topology change,
     * this is sufficient for grouping purposes.
     */
    private buildGraphKey(_graph: SharedGraphContext): string {
        return `v${this.incrementalState.getGraphVersion()}`;
    }

    /**
     * [P0-2] Batch route all dirty edges.
     * Uses parallel worker pool if available.
     */
    public async batchRouteDirtyEdges(): Promise<Map<string, PathFindingResult>> {
        const dirtyIds = this.getDirtyEdges();
        if (dirtyIds.length === 0) return new Map();
        const group = createRoutingBatchSnapshot(dirtyIds, this.latestRequests);
        if (!group) {
            this.incrementalState.clearDirtyEdges();
            return new Map();
        }

        const startTime = performance.now();
        const jobs = group.requests.map(request => {
            const job = this.buildJob(request);
            if (this.debugEdgeId && request.edgeId === this.debugEdgeId) {
                job.debug = true;
            }
            return job;
        });
        assignBusRoutingMetadata(jobs, group.graph, {
            onClassification: classification => {
                this.trunkDebugData.set(classification.edge.id, {
                    edgeId: classification.edge.id,
                    edgeType: classification.edge.type,
                    delta: classification.delta,
                    dirSign: 0,
                    side: 0,
                    typeInfluenced: false,
                });
            },
            onTrunk: (edges, trunk) => edges.forEach(edge => {
                const debugEntry = this.trunkDebugData.get(edge.id);
                if (!debugEntry) return;
                debugEntry.trunk = {
                    direction: trunk.direction,
                    axis: trunk.axis,
                    range: trunk.range,
                    port: trunk.suggestedPort,
                };
            }),
        });
        this.assignSameSidePortSeparation(jobs, group.graph);
        syncPreparedJobsToLatestRequests(jobs, this.latestRequests);
        this.assignGlobalChannels(jobs);
        this.injectCongestionContext(jobs, group.graph);

        const relatedNodeIds = new Set<string>();
        group.requests.forEach(request => {
            if (request.job.source) relatedNodeIds.add(request.job.source);
            if (request.job.target) relatedNodeIds.add(request.job.target);
        });
        const pendingEdges = this.collectPendingEdges(
            group.graphKey,
            relatedNodeIds,
            this.MAX_PENDING_SEGMENTS
        );
        const graphContext = pendingEdges.length > 0
            ? {
                ...group.graph,
                pendingEdges: [...(group.graph.pendingEdges ?? []), ...pendingEdges],
            }
            : group.graph;
        const results = await this.routeParallel(jobs, graphContext);
        if (group.graph.config?.postProcessing?.enableNudge !== false && results.length > 0) {
            this.applyGlobalNudge(results, group.requests, group.graph, jobs, group.graphKey);
        }
        return commitRoutingBatchResults({
            requests: group.requests,
            results,
            jobs,
            seqByEdge: group.seqByEdge,
            getLatestSeq: edgeId => this.latestRequests.get(edgeId)?.seq,
            pendingResolvers: this.pendingResolvers,
            clearDirtyEdge: edgeId => this.incrementalState.clearDirtyEdge(edgeId),
            onMissingResult: logEdgeRoutingCoordinatorMissingResult,
            onCommitFailure: error => logEdgeRoutingCoordinatorBatchRoutingFailure(error),
            onResult: (request, result, job) => {
                const isBus = !!job?.isOneToMany || !!job?.isManyToOne;
                if (!isBus) {
                    const cacheParams = {
                        ...this.extractCacheableParams(request.job, group.graph, pendingEdges),
                        version: this.incrementalState.getGraphVersion()
                    };
                    const key = this.cache.generateKey(request.edgeId, cacheParams);
                    this.cache.set(key, result);
                }
                this.monitor.track({
                    edgeId: request.edgeId,
                    routingTime: performance.now() - startTime,
                    cacheHit: false,
                    workerTime: result.metadata?.executionTime,
                    strategy: result.metadata?.strategy,
                    bendCount: (result.metadata as any)?.bendCount,
                    efficiencyRatio: (result.metadata as any)?.efficiencyRatio,
                });
                const shouldEmitDebug =
                    (this.debugEdgeId && request.edgeId === this.debugEdgeId) ||
                    job?.debug ||
                    group.graph.config?.debug;
                if (shouldEmitDebug && this.onDebugData) {
                    this.onDebugData(buildRoutingDebugPayload(
                        request.edgeId,
                        result,
                        this.trunkDebugData.get(request.edgeId),
                        job
                    ));
                }
                this.storeLatestRoutedPath(request.edgeId, result, group.graphKey);
                this.updateRoutedLabelObstacle(request.edgeId, result, group.graph);
            },
        });
    }

    private collectPendingEdges(graphKey: string, relatedNodeIds: Set<string>, maxSegments: number): LineObstacle[] {
        return collectPendingRoutingLineObstacles(
            this.collectKnownRoutingPathCandidates(),
            graphKey,
            relatedNodeIds,
            maxSegments
        );
    }

    private collectFixedPathContext(
        graphKey: string,
        activeResults: PathFindingResult[],
        activeEdgeIds: Set<string>,
        maxEdges: number = 80
    ): Map<string, Point[]> {
        return collectFixedRoutingPathContext(
            this.collectKnownRoutingPathCandidates(),
            graphKey,
            activeResults,
            activeEdgeIds,
            maxEdges
        );
    }

    private collectKnownRoutingPathCandidates(): KnownRoutingPathCandidate[] {
        return [...this.latestRequests.entries()].map(([edgeId, entry]) => {
            const cached = this.getCachedResult(entry.request);
            const latest = this.latestRoutedPaths.get(edgeId);
            return {
                edgeId,
                graphKey: entry.graphKey,
                sourceId: entry.request.job?.source,
                targetId: entry.request.job?.target,
                dirty: this.incrementalState.isDirty(edgeId),
                cachedPoints: cached?.points,
                points: cached?.points ?? (
                    latest?.graphKey === entry.graphKey ? latest.points : undefined
                ),
            };
        });
    }

    private collectSoftRoutingObstacles(graph: SharedGraphContext, excludedEdgeIds: Set<string> = new Set()): Rectangle[] {
        const soft: Rectangle[] = [];
        const pushRect = createEdgeRoutingObstacleCollector(soft, { excludedOwnerIds: excludedEdgeIds });

        (graph.softObstacles ?? []).forEach(pushRect);
        (graph.routingLabels ?? []).forEach(pushRect);
        this.routedLabelObstacles.forEach(pushRect);

        const nodes = (graph.nodes ?? []) as EdgeRoutingObstacleNode[];
        collectSoftNodeObstacleRects(nodes).forEach(pushRect);

        return soft;
    }

    private collectHardRoutingObstacles(graph: SharedGraphContext): Rectangle[] {
        const hard: Rectangle[] = [];
        const pushRect = createEdgeRoutingObstacleCollector(hard, { dedupe: true });

        (graph.obstacles ?? []).forEach(pushRect);

        const nodes = (graph.nodes ?? []) as EdgeRoutingObstacleNode[];
        collectHardNodeObstacleRects(nodes).forEach(pushRect);

        return hard;
    }

    private updateRoutedLabelObstacle(edgeId: string, result: PathFindingResult, graph: SharedGraphContext): void {
        const labelObstacle = buildRoutedLabelObstacle(
            edgeId,
            getGraphEdgeLabelText(edgeId, graph),
            result
        );
        if (!labelObstacle) {
            this.routedLabelObstacles.delete(edgeId);
            return;
        }

        this.routedLabelObstacles.set(edgeId, labelObstacle);
    }

    private buildWaypointCandidateAxes(
        graph: SharedGraphContext,
        assignedJobs?: PathFindingJob[]
    ): { horizontal: number[]; vertical: number[] } {
        return buildEdgeRoutingCandidateAxes({
            hardObstacles: graph.obstacles ?? [],
            softObstacles: this.collectSoftRoutingObstacles(graph),
            assignedJobs,
        });
    }

    /**
     * [P0] Perform incremental routing for dirty edges.
     * Called by UI loop or scheduler.
     */
    public async routeIncremental(context: SharedGraphContext): Promise<Map<string, PathFindingResult>> {
        // [FIX C-9] 浣跨敤鐪熷疄鐨勮妭鐐瑰彉鍖栨娴嬶紙鍙栦唬鍘熸潵鐨勭┖鍑芥暟锛?
        const changedNodeIds = this.incrementalState.detectChangedNodes(context.nodes as any[]);
        if (changedNodeIds.length > 0) {
            // 灏嗘娴嬪埌鐨勭Щ鍔ㄨ妭鐐规爣璁颁负 dirty锛屼娇澶栭儴鏃犻渶鎵嬪姩璋冪敤 markNodesChanged
            this.markNodesChanged(changedNodeIds);
        }

        return this.batchRouteDirtyEdges();
    }
    /**
     * [P0] Route all edges using parallel worker pool
     * Target: 60-75% performance improvement for initial render
     */
    public async routeParallel(
        jobs: PathFindingJob[],
        graph: SharedGraphContext,
        _onProgress?: (completed: number, total: number) => void
    ): Promise<PathFindingResult[]> {
        return routeJobsWithParallelFallback({
            jobs,
            graph,
            useParallelRouting: this.useParallelRouting,
            parallelPool: this.parallelPool,
            runSerialFallback: () => this.routeSerialFallback(jobs, graph),
            allEdges: this.incrementalState.getEdges() as Edge[],
            setAllEdges: (edges) => {
                this.incrementalState.replaceEdges(edges);
            },
        });
    }

    /**
     * [P0] Get incremental routing statistics
     */
    public getOptimizationStats() {
        return {
            incremental: this.incrementalManager.getStats(),
            parallel: this.parallelPool?.getStats() || null,
            cache: this.cache.getStats(),
            // [P1.2] VG optimization stats
            vgCache: this.vgCacheManager.getStats(),
            strategy: this.strategySelector.getStats()
        };
    }

    /**
     * [P0] Enable/disable parallel routing
     */
    public setParallelRoutingEnabled(enabled: boolean): void {
        this.useParallelRouting = enabled && !!this.parallelPool;
    }

    /**
     * [P1.2] Clear VG cache
     */
    public clearVisibilityGraphCache(): void {
        this.vgCacheManager.clear();
    }

    /**
     * [P1.2] Get VG cache statistics
     */
    public getVGCacheStats() {
        return this.vgCacheManager.getStats();
    }

    /**
     * [P1.2] Set VG cache max size
     */
    public setVGCacheSize(maxSize: number): void {
        this.vgCacheManager.setMaxSize(maxSize);
    }

    /**
     * [P0] Assign Global Channels
     * Sorts edges globally within spatial bands to minimize crossings for parallel routes.
     */
    private assignGlobalChannels(jobs: PathFindingJob[]): void {
        const defaultConfig = createDefaultRoutingConfig();
        assignGlobalRoutingChannels(
            jobs,
            defaultConfig.bus.bidirectionalSpacing || 25
        );
    }


    /**
     * [P2-3] Inject Congestion Context
     * Pass information about OTHER edges in the batch to the worker
     * so it can build a local congestion map.
     */
    private injectCongestionContext(jobs: PathFindingJob[], graph: SharedGraphContext): void {
        injectRoutingCongestionContext(jobs, graph);
    }

    /**
     * [SharedTrunk] Public accessor 鈥?returns the latest shared trunk segments.
     * Called by useSmartPathWorker to pass trunk data to the canvas rendering layer.
     */
    public getSharedTrunks(): SharedTrunkSegment[] {
        return Array.from(this.sharedTrunks.values());
    }

    /**
     * [NEW] Helper to apply LPNudge separately for overlapping paths
     */
    private applyGlobalNudge(
        results: (PathFindingResult | null)[],
        requests: RoutingRequest[],
        graph: SharedGraphContext,
        assignedJobs?: PathFindingJob[],
        graphKey?: string
    ): void {
        const activeResults = results.filter((result): result is PathFindingResult =>
            !!result
            && !(result as PathFindingResult & { error?: unknown }).error
            && Array.isArray(result.points)
            && result.points.length > 0
        );
        const activeEdgeIds = new Set(activeResults.map(result => result.edgeId));
        const currentBatchEdgeIds = new Set(requests.map(request => request.edgeId));
        applyGlobalRoutingPostProcessing({
            results,
            requests,
            graphEdges: (graph.edges ?? []) as Array<{ target?: string }>,
            config: graph.config,
            assignedJobs,
            fixedContextPaths: graphKey
                ? this.collectFixedPathContext(graphKey, activeResults, activeEdgeIds)
                : undefined,
            hardObstacles: this.collectHardRoutingObstacles(graph),
            softObstacles: this.collectSoftRoutingObstacles(graph, currentBatchEdgeIds),
            candidateAxes: this.buildWaypointCandidateAxes(graph, assignedJobs),
            onFailure: logEdgeRoutingCoordinatorGlobalNudgeFailure,
        });
    }

    /**
     * [DEV] 寮哄埗娓呯┖鎵€鏈夎矾鐢辩紦瀛樺苟閫掑 graphVersion锛岃鎵€鏈夎竟閲嶆柊璁＄畻璺緞銆?
     * 鐢ㄤ簬淇敼浜嗚矾鐢辩畻娉曞悗鏃犻渶閲嶅惎鍗冲彲楠岃瘉鏁堟灉銆?
     */
    public clearAllCaches(): void {
        const graphVersion = this.incrementalState.incrementGraphVersion();
        this.cache.clear();
        this.latestRoutedPaths.clear();
        this.routedLabelObstacles.clear();
        clearRenderedPathCache();
        this.incrementalState.clearDirtyEdges();
        this.incrementalState.markAllDirty();
        this.workerPool.markDirty();
        logEdgeRoutingCoordinatorCachesCleared(graphVersion);
    }

    /**
     * Cleanup resources
     */
    public cleanup(): void {
        this.workerPool.terminate();
        this.parallelPool?.terminate();
        this.cache.clear();
        this.routedLabelObstacles.clear();
        EdgeRoutingCoordinator.instance = null;
    }
    /**
     * [FIX] In/Out Port Zone Separation on Same Side.
     *
     * 闂锛氳妭鐐?N 鐨勬煇涓€渚у悓鏃舵湁鍑鸿竟锛圢 浣滀负 source锛夊拰鍏ヨ竟锛圢 浣滀负 target锛夋椂锛?
     * 涓ょ被绔彛閮戒互渚ц竟涓績涓哄熀鍑嗭紝瀵艰嚧閲嶅彔銆?
     *
     * 淇绛栫暐锛?
     *   - bus trunk 鍑鸿竟缁勶細鏁翠綋绠?1 涓?outgoing slot锛堜繚鎸?trunk 鍏变韩绔彛涓嶅彉锛?
     *   - bus trunk 鍏ヨ竟缁勶細鏁翠綋绠?1 涓?incoming slot
     *   - 闈?bus 鍗曠嫭鍑鸿竟锛氬悇鍗?1 涓?outgoing slot
     *   - 闈?bus 鍗曠嫭鍏ヨ竟锛氬悇鍗?1 涓?incoming slot
     *   - 鍙湁鍚屼晶鍚屾椂瀛樺湪鍑烘Ы鍜屽叆妲芥椂鎵嶅垎绂伙紱鍗曠被鍒欒烦杩囷紙淇濇寔灞呬腑锛?
     *   - 鎸夊绔川蹇冩帓搴忓喅瀹氬嚭缁?鍏ョ粍鍝釜鍦ㄥ墠锛岄伩鍏嶈瑙変氦鍙?
     */
    private assignSameSidePortSeparation(jobs: PathFindingJob[], graph: SharedGraphContext): void {
        separateSameSidePorts(jobs, graph, this.latestRequests);
    }
}

// [DEV] Debug tools on window object (dev mode only)
if (typeof window !== 'undefined' && import.meta.env.DEV) {
    (window as any).__vizly_routing__ = {
        /** Clear all routing caches and force full re-route */
        clearCache: () => EdgeRoutingCoordinator.getInstance().clearAllCaches(),
        /** Get Coordinator instance */
        coordinator: () => EdgeRoutingCoordinator.getInstance(),
    };
    logEdgeRoutingCoordinatorDebugToolsReady();
}

