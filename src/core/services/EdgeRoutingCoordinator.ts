/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { TrunkCalculator } from '../workers/core/TrunkCalculator';

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
import { globalChannelRouting, type BuddyGroup } from '../algorithms/globalChannelRouting';
import { createFilletedPath } from '../algorithms/smartEdgeUtils';
import { refineOrthogonalWaypointsDetailed, type WaypointRefinementSummary } from '../algorithms/orthogonalWaypointRefiner';
import { optimizeHubPortOrder } from '../algorithms/hubPortOrderOptimizer';
import { refineManyToOneFanIn, type ManyToOneFanInGroup } from '../algorithms/manyToOneFanIn';

/**
 * [P0-2] Main coordination service for edge routing.
 * Manages caching, worker delegation, and incremental updates.
 */

export interface RoutingRequest {
    edgeId: string;
    job: Partial<PathFindingJob> & {
        source: string;
        target: string;
        sourceRect?: Rectangle;
        targetRect?: Rectangle;
    };
    graph: SharedGraphContext;
    priority?: number; // 0=High (Interactive), 1=Normal, 2=Low (Background)
}

export interface PortUsageStats {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

// [Phase 1] Trunk Routing Configuration Constants
            const TRUNK_CONFIG = {
    /** Unified deadzone threshold for side classification (卤30px) */
    DEADZONE_THRESHOLD: 30,
    /** Minimum edges to form a bus trunk */
    MIN_BUS_SIZE: 2,
    /** Bias multiplier for feedback edges (Phase 2) */
    FEEDBACK_BIAS: 1.5,
} as const;

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

interface HubPortGroupInfo {
    tangent: number;
    jobs: PathFindingJob[];
}

/**
 * [Phase 2] Classify edge side with Edge Type semantic support
 * 
 * @param delta - Geometric delta (peer position - hub position)
 * @param dirSign - Direction sign based on layout (+1 for LR/TB, -1 for RL/BT)
 * @param edgeType - Edge type ('feedback', 'main', etc.) for semantic classification
 * @returns 1 for forward/positive side, -1 for backward/negative side
 */
function classifyEdgeSide(delta: number, dirSign: number, edgeType?: string): number {
    // Semantic Rule: feedback edges are ALWAYS backward
    if (edgeType === 'feedback') {
        return -1;
    }

    // Apply unified deadzone threshold
            const isForward = (delta * dirSign) > -TRUNK_CONFIG.DEADZONE_THRESHOLD;
    return isForward ? 1 : -1;
}

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

    // [P0-2] State for incremental updates
    private dirtyEdges: Set<string> = new Set();
    private edgeDependencies: Map<string, Set<string>> = new Map(); // edgeId -> Set<nodeId>
    private allEdges: Edge[] = [];
    /** [SharedTrunk] Accumulated shared trunk segments from latest batch, keyed by group ID */
    private sharedTrunks: Map<string, SharedTrunkSegment> = new Map();
    private routedLabelObstacles: Map<string, Rectangle & { edgeId: string; ownerId: string }> = new Map();

    private graphVersion: number = 0;
    // [P0-2] graphVersion 璁㈤槄鑰呴泦鍚堬紝鐢ㄤ簬 useSyncExternalStore 鍝嶅簲寮忚闃?
    private graphVersionSubscribers: Set<() => void> = new Set();

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
        this.latestRequests.forEach((_, edgeId) => this.dirtyEdges.add(edgeId));
        this.allEdges.forEach(e => this.dirtyEdges.add(e.id));
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
        // [COLD-START] 鍐荤粨鏈熼棿鎸傝捣鎵€鏈夎皟搴︼紝绛?unfreeze() 缁熶竴瑙﹀彂
        if (this.isFrozen) return;

        // [FIX C-1] 鏍囧噯闃叉姈锛氭瘡娆¤皟鐢ㄥ厛娓呴櫎鏃ц鏃跺櫒鍐嶉噸鏂拌缃€?
        // [H-10] 鎷栨嫿涓彁鍗囧幓鎶栧埌 60ms锛屽噺灏?~75% 鐨勮矾鐢辫Е鍙戞鏁帮紝
        //        閲婃斁 Worker pool 缁欎氦浜掑搷搴斾娇鐢ㄣ€傛嫋鎷界粨鏉熷悗鎭㈠ 16ms銆?
        if (this.pendingTimeout) {
            clearTimeout(this.pendingTimeout);
        }
        const delay = this.isDragging ? 60 : 16;
        this.pendingTimeout = setTimeout(() => {
            this.pendingTimeout = null;
            this.triggerBatchRouting();
        }, delay);
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
            console.warn('[EdgeRoutingCoordinator] Failed to initialize parallel pool:', error);
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
        return this.graphVersion;
    }

    /**
     * [P0-2] 璁㈤槄 graphVersion 鍙樺寲銆?
     * 杩斿洖鍙栨秷璁㈤槄鍑芥暟锛岄厤鍚?useSyncExternalStore 浣跨敤銆?
     * 杩欐牱 useSmartPathWorker 鍙互鍝嶅簲寮忓湴杩借釜鐗堟湰鍙樺寲锛?
     * 鑰屼笉闇€瑕佹妸 getGraphVersion() 鍑芥暟璋冪敤鏀捐繘 deps array銆?
     */
    public subscribeGraphVersion(callback: () => void): () => void {
        this.graphVersionSubscribers.add(callback);
        return () => this.graphVersionSubscribers.delete(callback);
    }

    /** [P0-2] 閫氱煡鎵€鏈?graphVersion 璁㈤槄鑰?*/
    private notifyGraphVersionSubscribers(): void {
        this.graphVersionSubscribers.forEach(cb => cb());
    }

    /**
     * Mark the graph as dirty (topology changed).
     * This invalidates the cache because routing depends on obstacles/other edges.
     */
    public notifyGraphChange(changedNodeIds?: string[]): void {
        // [P2.1] Incremental cache invalidation
        if (changedNodeIds && changedNodeIds.length > 0 && this.edgeDependencies.size > 0) {
            // [FIX] DO NOT increment graphVersion in incremental mode!
            // graphVersion is part of every cache key (getCachedResult uses it).
            // Incrementing it invalidates ALL cached results, even for edges whose
            // source/target didn't move. Only delete specific edge caches.
            const affectedEdges = new Set<string>();
            for (const nodeId of changedNodeIds) {
                const deps = this.edgeDependencies.get(nodeId);
                if (deps) {
                    for (const edgeId of deps) {
                        affectedEdges.add(edgeId);
                        this.cache.deleteByEdgeId(edgeId);
                    }
                }
            }
            // Mark only affected edges as dirty
            for (const edgeId of affectedEdges) {
                this.dirtyEdges.add(edgeId);
            }
        } else {
            // Fallback: full invalidation when no specific nodes provided
            this.graphVersion++;
            this.notifyGraphVersionSubscribers();
            this.cache.clear();
            this.dirtyEdges.clear();
            this.allEdges.forEach(edge => this.dirtyEdges.add(edge.id));
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
        this.dirtyEdges.clear();
        this.edgeDependencies.clear();
        this.latestRequests.clear();
        this.routedLabelObstacles.clear();
        this.graphVersion++;
        this.notifyGraphVersionSubscribers();
        
        // Clear global SVG path cache to prevent "flying lines" UI fallback
        try {
            const cache = (window as any).__dv_rendered_path_cache__;
            if (cache instanceof Map) {
                cache.clear();
            }
        } catch (e) {}

        // Re-mark all known edges as dirty so they re-route on next render
        this.allEdges.forEach(edge => this.dirtyEdges.add(edge.id));
        this.scheduleBatchRouting();

        console.info('[EdgeRoutingCoordinator] All caches cleared. Edges will re-route.');
    }

    private nodeParentMap: Map<string, string | undefined> = new Map();
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
            console.warn('[EdgeRoutingCoordinator] forceDebugReRoute: no latest request for edge', targetId);
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

        this.dirtyEdges.add(targetId);

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
            version: this.graphVersion
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
        // [FIX] Ensure Bus Indices are assigned even in serial fallback
        // This is critical because if parallel routing fails or is disabled,
        // we still need the trunk geometry for proper bus routing.
        this.assignBusIndices(jobs, graph);
        this.assignSameSidePortSeparation(jobs, graph); // [FIX] In/Out port zone separation
        this.assignGlobalChannels(jobs);

        const results: PathFindingResult[] = [];

        for (const job of jobs) {
            try {
                const result = await this.workerPool.calculatePath(job, graph as any);
                results.push(result);
            } catch (err) {
                console.error(`[Coordinator] Serial routing failed for ${job.edgeId}:`, err);
                // [FIX] Return fallback path instead of empty string to ensure visibility
            const fallbackPath = `M ${job.sourceX} ${job.sourceY} L ${job.targetX} ${job.targetY}`;
                results.push({
                    jobId: job.jobId,
                    edgeId: job.edgeId,
                    path: fallbackPath,
                    points: [{ x: job.sourceX, y: job.sourceY }, { x: job.targetX, y: job.targetY }],
                    labelX: (job.sourceX + job.targetX) / 2,
                    labelY: (job.sourceY + job.targetY) / 2,
                    error: String(err)
                });
            }
        }

        return results;
    }

    /**
     * [P2-3] Extract parameters relevant for caching key
     */
    private extractCacheableParams(
        job: Partial<PathFindingJob> & { sourceRect?: Rectangle; targetRect?: Rectangle },
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
            rv: 11,
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
            // @ts-expect-error - Job type is loose string in legacy code
            type: job.type || 's', // Smart
            sourceHandle: (job as any).sourceHandle || '',
            targetHandle: (job as any).targetHandle || '',
            sourcePosition: (job as any).sourcePosition || '',
            targetPosition: (job as any).targetPosition || '',
            // [FIX] Include Bus Routing params in cache key
            bus: `${!!(job as any).isOneToMany}|${!!(job as any).isManyToOne}|${(job as any).busTrunkSource?.x ?? 0},${(job as any).busTrunkSource?.y ?? 0}|${(job as any).busTrunkTarget?.x ?? 0},${(job as any).busTrunkTarget?.y ?? 0}`,
            pe: peHash,  // [H-9] pendingEdges fingerprint
        };
    }

    /**
     * [P0-2] Initialize edge dependencies for incremental routing.
     * Call this once with all edges to build the dependency graph.
     */
    public initializeEdges(edges: Edge[]): void {
        const oldEdgeIds = new Set(this.allEdges.map(e => e.id));
        const newEdgeIds = new Set(edges.map(e => e.id));
        const affectedNodes = new Set<string>();

        // Detect removed edges
        this.allEdges.forEach(e => {
            if (!newEdgeIds.has(e.id)) {
                affectedNodes.add(e.source);
                affectedNodes.add(e.target);
            }
        });

        // Detect added or changed edges
        edges.forEach(e => {
            if (!oldEdgeIds.has(e.id)) {
                affectedNodes.add(e.source);
                affectedNodes.add(e.target);
            } else {
                const old = this.allEdges.find(o => o.id === e.id);
                if (old && (old.source !== e.source || old.target !== e.target)) {
                    affectedNodes.add(old.source);
                    affectedNodes.add(old.target);
                    affectedNodes.add(e.source);
                    affectedNodes.add(e.target);
                }
            }
        });

        this.allEdges = edges;
        this.edgeDependencies.clear();

        // Build dependency map: edge 鈫?nodes it depends on
        edges.forEach(edge => {
            const deps = new Set<string>();
            deps.add(edge.source);
            deps.add(edge.target);
            this.edgeDependencies.set(edge.id, deps);
        });

        // [FIX] Invalidate affected nodes to trigger peer re-routing when topology changes
        if (affectedNodes.size > 0 && oldEdgeIds.size > 0) {
            this.notifyGraphChange(Array.from(affectedNodes));
        }

    }

    /**
     * [P0-2] Mark nodes as changed (e.g., during drag).
     * This marks all edges connected to these nodes as dirty.
     */
    public markNodesChanged(nodeIds: string[] | string): void {
        const ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
        const initialDirty = new Set<string>();

        ids.forEach(nodeId => {
            // Find all edges that depend on this node
            this.edgeDependencies.forEach((deps, edgeId) => {
                if (deps.has(nodeId)) {
                    initialDirty.add(edgeId);
                }
            });
        });

        // [FIX] Expand dirty set to include siblings (edges sharing source or target).
        // Since bus trunk centroids depend on ALL peers, moving one peer must invalidate and re-route ALL peers.
        initialDirty.forEach(edgeId => {
            this.dirtyEdges.add(edgeId);
            const edge = this.allEdges.find(e => e.id === edgeId);
            if (edge) {
                this.allEdges.forEach(sibling => {
                    if (sibling.source === edge.source || sibling.target === edge.target) {
                        this.dirtyEdges.add(sibling.id);
                    }
                });
            }
        });
    }

    /**
     * [P0-2] Get list of dirty edges that need rerouting.
     */
    public getDirtyEdges(): string[] {
        return Array.from(this.dirtyEdges);
    }

    /**
     * [P0-2] Clear dirty flags after rerouting.
     */
    public clearDirtyEdges(): void {
        this.dirtyEdges.clear();
    }

    /**
     * [P0-2] Check if incremental routing is needed.
     */
    public hasDirtyEdges(): boolean {
        return this.dirtyEdges.size > 0;
    }

    /**
     * [P0-2] Get incremental routing statistics.
     */
    public getIncrementalStats(): { total: number; dirty: number; ratio: number } {
        const total = this.allEdges.length;
        const dirty = this.dirtyEdges.size;
        return {
            total,
            dirty,
            ratio: total > 0 ? dirty / total : 0
        };
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
        this.dirtyEdges.add(request.edgeId);

        // Debounce trigger
        this.scheduleBatchRouting();
    }

    private async triggerBatchRouting() {
        if (!this.hasDirtyEdges()) return;

        try {
            await this.batchRouteDirtyEdges();
        } catch (err: any) {
            console.error('[EdgeRoutingCoordinator] batchRouteDirtyEdges failed:', err);
            // [FIX] Ensure pending resolvers are cleared to avoid deadlocks
            for (const [edgeId, pending] of this.pendingResolvers.entries()) {
                const entry = this.latestRequests.get(edgeId);
                const sx = Number.isFinite(entry?.request.job.sourceX) ? entry!.request.job.sourceX : 0;
                const sy = Number.isFinite(entry?.request.job.sourceY) ? entry!.request.job.sourceY : 0;
                const tx = Number.isFinite(entry?.request.job.targetX) ? entry!.request.job.targetX : 0;
                const ty = Number.isFinite(entry?.request.job.targetY) ? entry!.request.job.targetY : 0;
                pending.resolve({
                    jobId: entry?.request.job.jobId || edgeId,
                    edgeId,
                    path: `M ${sx} ${sy} L ${tx} ${ty}`,
                    points: [{ x: sx, y: sy }, { x: tx, y: ty }],
                    labelX: (sx + tx) / 2,
                    labelY: (sy + ty) / 2,
                    error: 'Batch routing failed: ' + err.message
                });
            }
            this.pendingResolvers.clear();
        }
    }

    public getCachedResult(request: RoutingRequest): PathFindingResult | null {
        const cacheParams = {
            ...this.extractCacheableParams(request.job, request.graph),
            version: this.graphVersion
        };
        const key = this.cache.generateKey(request.edgeId, cacheParams);
        return this.cache.get(key) ?? null;
    }

    /**
     * [P1.2] Simplified graph key using version number.
     * Since graphVersion increments on every topology change,
     * this is sufficient for grouping purposes.
     */
    private buildGraphKey(_graph: SharedGraphContext): string {
        return `v${this.graphVersion}`;
    }

    /**
     * [P0-2] Batch route all dirty edges.
     * Uses parallel worker pool if available.
     */
    public async batchRouteDirtyEdges(): Promise<Map<string, PathFindingResult>> {
        const resultsMap = new Map<string, PathFindingResult>();
        const dirtyIds = this.getDirtyEdges();
        if (dirtyIds.length === 0) return resultsMap;

        const entries = dirtyIds
            .map(id => this.latestRequests.get(id))
            .filter((entry): entry is { request: RoutingRequest; graphKey: string; seq: number; updatedAt: number } => Boolean(entry));

        if (entries.length === 0) {
            // [FIX] Prevent infinite loop where dirty edges exist but have no pending requests
            this.dirtyEdges.clear();
            return resultsMap;
        }

        const groups = new Map<string, { graph: SharedGraphContext; requests: RoutingRequest[]; graphKey: string; seqByEdge: Map<string, number> }>();

        const freshest = entries.reduce((a, b) => (a.updatedAt >= b.updatedAt ? a : b));
        const unifiedKey = freshest.graphKey;
        const seqByEdge = new Map<string, number>();
        const requests = entries.map(e => {
            seqByEdge.set(e.request.edgeId, e.seq);
            return e.request;
        });
        groups.set(unifiedKey, { graph: freshest.request.graph, requests, graphKey: freshest.graphKey, seqByEdge });

        // [DEBUG] Check Grouping
        //        // groups.forEach((g, k) =>
        for (const group of groups.values()) {
            const startTime = performance.now();
            const jobs = group.requests.map(req => {
                const job = this.buildJob(req);
                if (this.debugEdgeId && req.edgeId === this.debugEdgeId) {
                    job.debug = true;
                }
                return job;
            });

            // [FIX] Assign Bus Indices for Nudge
            this.assignBusIndices(jobs, group.graph);

            // [FIX] In/Out port zone separation (same node, same side)
            this.assignSameSidePortSeparation(jobs, group.graph);

            // [FIX] Sync separation/bus indices back to latestRequests.request.job
            // buildJob does a shallow copy, so mutations to the job object do NOT
            // propagate back to request.job. Without this sync, the cache key
            // (which includes outgoingIndex, incomingCount etc.) is stale and the
            // old cached path is returned, bypassing the new port separation layout.
            for (const job of jobs) {
                const entry = this.latestRequests.get(job.edgeId);
                if (entry) {
                    const rj = entry.request.job as Partial<PathFindingJob>;
                    rj.outgoingIndex = job.outgoingIndex;
                    rj.outgoingCount = job.outgoingCount;
                    rj.incomingIndex = job.incomingIndex;
                    rj.incomingCount = job.incomingCount;
                    rj.isOneToMany   = job.isOneToMany;
                    rj.isManyToOne   = job.isManyToOne;
                    rj.busTrunkSource = job.busTrunkSource;
                    rj.busTrunkTarget = job.busTrunkTarget;
                }
            }

            // [FIX] Assign Global Channels for Crossing Reduction
            this.assignGlobalChannels(jobs);

            // [FIX] Inject neighbor context for congestion
            this.injectCongestionContext(jobs, group.graph);

            const relatedNodeIds = new Set<string>();
            group.requests.forEach(req => {
                if (req.job?.source) relatedNodeIds.add(req.job.source);
                if (req.job?.target) relatedNodeIds.add(req.job.target);
            });
            const pendingEdges = this.collectPendingEdges(group.graphKey, relatedNodeIds, this.MAX_PENDING_SEGMENTS);
            const graphContext = pendingEdges.length > 0
                ? { ...group.graph, pendingEdges: [...(group.graph.pendingEdges ?? []), ...pendingEdges] }
                : group.graph;

            const results = await this.routeParallel(jobs, graphContext);

            // [NEW] Global Nudging: separate parallel line segments (LPNudge)
            const config = group.graph.config;
            const isNudgeEnabled = config?.postProcessing?.enableNudge !== false;
            
            if (isNudgeEnabled && results.length > 0) {
                this.applyGlobalNudge(results, group.requests, group.graph, jobs, group.graphKey);
            }

            // [SharedTrunk] Extract shared trunk segments for M2O/O2M groups
            // and trim individual edge paths to branch-only segments.
            const newTrunks = this.mergeTrunkSegments(results, group.requests);
            for (const [key, seg] of newTrunks) {
                this.sharedTrunks.set(key, seg);
            }

            // [FIX] Iterate over REQUESTS to ensure every request gets a response (Prevent Hanging Promises)
            group.requests.forEach((req, index) => {
                const expectedSeq = group.seqByEdge.get(req.edgeId);
                const latestSeq = this.latestRequests.get(req.edgeId)?.seq;
                // [FIX] Do NOT skip processing when seq mismatches.
                // The old code returned early here, but this left the pendingResolver
                // permanently unresolved 鈥?the component's Promise.then() never fires.
                // The result is still fresh (just computed by the Worker), so use it.
            const isSuperseded = typeof expectedSeq === 'number' && typeof latestSeq === 'number' && expectedSeq !== latestSeq;

                const result = results[index];

                if (!result) {
                    console.error(`[Coordinator] Missing result for edge ${req.edgeId} at index ${index}`);
                    const pending = this.pendingResolvers.get(req.edgeId);
                    if (pending) {
                        const sx = req.job.sourceX ?? 0;
                        const sy = req.job.sourceY ?? 0;
                        const tx = req.job.targetX ?? 0;
                        const ty = req.job.targetY ?? 0;
                        pending.resolve({
                            jobId: req.job.jobId || req.edgeId,
                            edgeId: req.edgeId,
                            path: `M ${sx} ${sy} L ${tx} ${ty}`,
                            points: [{ x: sx, y: sy }, { x: tx, y: ty }],
                            labelX: (sx + tx) / 2,
                            labelY: (sy + ty) / 2,
                            error: 'Missing result from parallel routing'
                        });
                        this.pendingResolvers.delete(req.edgeId);
                    }
                    return;
                }

                const isBus = !!(req.job as any).isOneToMany || !!(req.job as any).isManyToOne;
                if (!isBus) {
                    const cacheParams = {
                        ...this.extractCacheableParams(req.job, group.graph, pendingEdges),
                        version: this.graphVersion
                    };
                    const key = this.cache.generateKey(req.edgeId, cacheParams);
                    this.cache.set(key, result);
                }

                // [FIX] Track Performance 鈥?鍚瓥鐣ュ悕绉?+ 璺緞璐ㄩ噺鎸囨爣
                this.monitor.track({
                    edgeId: req.edgeId,
                    routingTime: performance.now() - startTime,
                    cacheHit: false,
                    workerTime: result.metadata?.executionTime,
                    strategy: result.metadata?.strategy,       // 浼犻€掔瓥鐣ュ悕锛屼緵鍒嗗竷鍥句娇鐢?
                    bendCount: (result.metadata as any)?.bendCount,
                    efficiencyRatio: (result.metadata as any)?.efficiencyRatio,
                });

                const shouldEmitDebug =
                    (this.debugEdgeId && req.edgeId === this.debugEdgeId) ||
                    jobs[index]?.debug ||
                    group.graph.config?.debug;
                if (shouldEmitDebug) {
                    console.dir(result, { depth: null });
                    if (this.onDebugData) {
                        const trunkData = this.trunkDebugData.get(req.edgeId);
                        // [Trunk Vis] 娉ㄥ叆 trunkAxis/trunkVertical/peerGroupMembers
                        // 璁?VisualizerTab 鍙互鍦?Canvas 涓婄粯鍒朵富骞茶酱铏氱嚎鍜?Peer Group 鍖呭洿妗?
            const trunkVisualization = trunkData?.trunk ? {
                            trunkAxis: trunkData.trunk.axis,
                            trunkVertical: trunkData.trunk.direction === 'vertical',
                            trunkRange: trunkData.trunk.range,
                        } : {};
                        // 浠?jobs 涓皾璇曟彁鍙?peerGroup 淇℃伅
            const jobAny = jobs[index] as any;
                        const peerGroupInfo = jobAny?.peerGroupMembers ? {
                            peerGroupMembers: jobAny.peerGroupMembers,
                            peerGroupSize: jobAny.peerGroupSize ?? jobAny.peerGroupMembers?.length,
                            peerGroupKey: jobAny.peerGroupKey,
                        } : {};

                        this.onDebugData({
                            edgeId: req.edgeId,
                            pathPoints: result.points,
                            metadata: result.metadata,
                            ...(result.debugInfo || {}),
                            // [Phase 2] Trunk classification info (optional for bus edges)
                            trunkClassification: trunkData ? {
                                side: trunkData.side > 0 ? 'FORWARD' : 'BACKWARD',
                                edgeType: trunkData.edgeType,
                                delta: trunkData.delta,
                                typeInfluenced: trunkData.typeInfluenced,
                                trunk: trunkData.trunk
                            } : null,
                            // [Trunk Vis] 灏?trunk/peer 鏁版嵁娉ㄥ叆 portSelection锛岃 VisualizerTab 鍙鍙?
                            algorithmDebug: {
                                ...((result.debugInfo as any)?.algorithmDebug ?? {}),
                                portSelection: {
                                    ...((result.debugInfo as any)?.algorithmDebug?.portSelection ?? {}),
                                    ...trunkVisualization,
                                    ...peerGroupInfo,
                                }
                            }
                        });
                    }
                }

                resultsMap.set(req.edgeId, result);
                this.updateRoutedLabelObstacle(req.edgeId, result, group.graph);
                // Only clear dirty flag if this is the latest request
                if (!isSuperseded) {
                    this.dirtyEdges.delete(req.edgeId);
                }

                // [FIX] Always resolve the pending resolver, regardless of seq.
                // The result is fresh from the Worker. Even if a newer request was
                // registered during async computation, the geometric result is still
                // valid (coordinates haven't changed, only the seq counter advanced
                // due to React re-renders).
            const pending = this.pendingResolvers.get(req.edgeId);
                if (pending) {
                    pending.resolve(result);
                    this.pendingResolvers.delete(req.edgeId);
                }
            });
        }

        return resultsMap;
    }

    private collectPendingEdges(graphKey: string, relatedNodeIds: Set<string>, maxSegments: number): LineObstacle[] {
        const pendingEdges: LineObstacle[] = [];
        const rawSegmentLimit = Math.max(maxSegments, maxSegments * 4);

        // [FIX P3] Compute spatial bounding box of current batch so we can collect
        // nearby cached edges even if they share no nodes with the current batch.
        // This ensures A* can avoid crossings with edges outside the current node set.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const SPATIAL_MARGIN = 300; // px buffer around the batch bounding box

        for (const [edgeId, entry] of this.latestRequests.entries()) {
            if (!relatedNodeIds.has(entry.request.job?.source ?? '') &&
                !relatedNodeIds.has(entry.request.job?.target ?? '')) continue;
            const cached = this.getCachedResult(entry.request);
            if (!cached?.points) continue;
            for (const pt of cached.points) {
                if (pt.x < minX) minX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y > maxY) maxY = pt.y;
            }
        }
        const hasBounds = minX !== Infinity;
        const bboxMinX = minX - SPATIAL_MARGIN;
        const bboxMinY = minY - SPATIAL_MARGIN;
        const bboxMaxX = maxX + SPATIAL_MARGIN;
        const bboxMaxY = maxY + SPATIAL_MARGIN;

        for (const [edgeId, entry] of this.latestRequests.entries()) {
            if (this.dirtyEdges.has(edgeId)) continue;
            if (entry.graphKey !== graphKey) continue;

            const cached = this.getCachedResult(entry.request);
            if (!cached?.points || cached.points.length < 2) continue;

            // [FIX P3] Spatial filter: include edges whose ANY segment falls within the expanded bbox.
            // Fallback to node-ID filter only if we couldn't compute a bounding box.
            if (hasBounds) {
                const inBounds = cached.points.some(pt =>
                    pt.x >= bboxMinX && pt.x <= bboxMaxX &&
                    pt.y >= bboxMinY && pt.y <= bboxMaxY
                );
                if (!inBounds) continue;
            } else if (relatedNodeIds.size > 0) {
                const sourceId = entry.request.job?.source;
                const targetId = entry.request.job?.target;
                if (sourceId && !relatedNodeIds.has(sourceId) && targetId && !relatedNodeIds.has(targetId)) continue;
            }

            for (let i = 0; i < cached.points.length - 1; i++) {
                pendingEdges.push({
                    start: cached.points[i],
                    end: cached.points[i + 1]
                });
                if (pendingEdges.length >= rawSegmentLimit) {
                    return this.compactLineObstacles(pendingEdges, maxSegments);
                }
            }
        }
        return this.compactLineObstacles(pendingEdges, maxSegments);
    }

    private collectFixedPathContext(
        graphKey: string,
        activeResults: PathFindingResult[],
        activeEdgeIds: Set<string>,
        maxEdges: number = 80
    ): Map<string, Point[]> {
        const fixedPaths = new Map<string, Point[]>();
        if (activeResults.length === 0) return fixedPaths;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const result of activeResults) {
            for (const point of result.points ?? []) {
                minX = Math.min(minX, point.x);
                minY = Math.min(minY, point.y);
                maxX = Math.max(maxX, point.x);
                maxY = Math.max(maxY, point.y);
            }
        }
        if (minX === Infinity) return fixedPaths;

        const SPATIAL_MARGIN = 360;
        const bbox = {
            minX: minX - SPATIAL_MARGIN,
            minY: minY - SPATIAL_MARGIN,
            maxX: maxX + SPATIAL_MARGIN,
            maxY: maxY + SPATIAL_MARGIN,
        };

        const overlapsBBox = (points: Point[]): boolean => {
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                const segMinX = Math.min(a.x, b.x);
                const segMaxX = Math.max(a.x, b.x);
                const segMinY = Math.min(a.y, b.y);
                const segMaxY = Math.max(a.y, b.y);
                if (segMaxX >= bbox.minX && segMinX <= bbox.maxX && segMaxY >= bbox.minY && segMinY <= bbox.maxY) {
                    return true;
                }
            }
            return false;
        };

        for (const [edgeId, entry] of this.latestRequests.entries()) {
            if (fixedPaths.size >= maxEdges) break;
            if (activeEdgeIds.has(edgeId) || this.dirtyEdges.has(edgeId)) continue;
            if (entry.graphKey !== graphKey) continue;

            const cached = this.getCachedResult(entry.request);
            if (!cached?.points || cached.points.length < 2) continue;
            if (!overlapsBBox(cached.points)) continue;
            fixedPaths.set(edgeId, cached.points.map(p => ({ x: p.x, y: p.y })));
        }

        return fixedPaths;
    }

    private compactLineObstacles(lines: LineObstacle[], maxSegments: number): LineObstacle[] {
        if (lines.length <= 1) return lines;

        const AXIS_TOLERANCE = 1.5;
        const MERGE_GAP = 2;
        const axisGroups = new Map<string, {
            isHorizontal: boolean;
            fixed: number;
            ranges: Array<{ min: number; max: number }>;
        }>();
        const diagonalMap = new Map<string, LineObstacle>();

        const rounded = (value: number, quantum = 2) => Math.round(value / quantum) * quantum;

        for (const line of lines) {
            const isHorizontal = Math.abs(line.start.y - line.end.y) < AXIS_TOLERANCE;
            const isVertical = Math.abs(line.start.x - line.end.x) < AXIS_TOLERANCE;

            if (isHorizontal || isVertical) {
                const fixed = rounded(isHorizontal
                    ? (line.start.y + line.end.y) / 2
                    : (line.start.x + line.end.x) / 2);
                const min = isHorizontal
                    ? Math.min(line.start.x, line.end.x)
                    : Math.min(line.start.y, line.end.y);
                const max = isHorizontal
                    ? Math.max(line.start.x, line.end.x)
                    : Math.max(line.start.y, line.end.y);
                if (max - min < 1) continue;

                const key = `${isHorizontal ? 'h' : 'v'}:${fixed}`;
                const group = axisGroups.get(key);
                if (group) {
                    group.ranges.push({ min, max });
                } else {
                    axisGroups.set(key, { isHorizontal, fixed, ranges: [{ min, max }] });
                }
                continue;
            }

            const a = `${rounded(line.start.x)},${rounded(line.start.y)}`;
            const b = `${rounded(line.end.x)},${rounded(line.end.y)}`;
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            diagonalMap.set(key, line);
        }

        const compacted: LineObstacle[] = [];
        for (const group of axisGroups.values()) {
            group.ranges.sort((a, b) => a.min - b.min || a.max - b.max);
            let current: { min: number; max: number } | null = null;

            const flush = () => {
                if (!current) return;
                compacted.push(group.isHorizontal
                    ? { start: { x: current.min, y: group.fixed }, end: { x: current.max, y: group.fixed } }
                    : { start: { x: group.fixed, y: current.min }, end: { x: group.fixed, y: current.max } });
            };

            for (const range of group.ranges) {
                if (!current) {
                    current = { ...range };
                } else if (range.min <= current.max + MERGE_GAP) {
                    current.max = Math.max(current.max, range.max);
                } else {
                    flush();
                    current = { ...range };
                }
            }
            flush();
        }

        for (const line of diagonalMap.values()) {
            compacted.push(line);
        }

        return compacted.slice(0, maxSegments);
    }

    private collectSoftRoutingObstacles(graph: SharedGraphContext, excludedEdgeIds: Set<string> = new Set()): Rectangle[] {
        const soft: Rectangle[] = [];
        const pushRect = (rect: (Partial<Rectangle> & { edgeId?: string; ownerId?: string }) | undefined) => {
            if (!rect) return;
            const ownerId = rect.edgeId ?? rect.ownerId;
            if (ownerId && excludedEdgeIds.has(ownerId)) return;
            const x = Number(rect.x);
            const y = Number(rect.y);
            const width = Number(rect.width);
            const height = Number(rect.height);
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return;
            if (width <= 1 || height <= 1) return;
            soft.push({ x, y, width, height });
        };

        (graph.softObstacles ?? []).forEach(pushRect);
        (graph.routingLabels ?? []).forEach(pushRect);
        this.routedLabelObstacles.forEach(pushRect);

        const nodes = (graph.nodes ?? []) as Array<{
            id?: string;
            type?: string;
            data?: Record<string, unknown>;
            position?: { x?: number; y?: number };
            positionAbsolute?: { x?: number; y?: number };
            computed?: { positionAbsolute?: { x?: number; y?: number } };
            measured?: { width?: number; height?: number };
            width?: number;
            height?: number;
        }>;
        const titleLikeTypes = new Set(['group', 'subGroup', 'titleGroup', 'domain', 'subDomain', 'swimlane']);

        nodes.forEach(node => {
            const type = node.type ?? '';
            const hasVisibleTitle = titleLikeTypes.has(type)
                || typeof node.data?.label === 'string'
                || typeof node.data?.title === 'string'
                || typeof node.data?.name === 'string';
            if (!hasVisibleTitle) return;

            const pos = node.computed?.positionAbsolute ?? node.positionAbsolute ?? node.position ?? { x: 0, y: 0 };
            const width = node.measured?.width ?? node.width ?? 0;
            const height = node.measured?.height ?? node.height ?? 0;
            if (!width || !height) return;

            const titleHeight = Math.min(44, Math.max(24, height * 0.18));
            pushRect({
                x: (pos.x ?? 0) + 8,
                y: (pos.y ?? 0) + 6,
                width: Math.max(0, width - 16),
                height: titleHeight,
            });
        });

        return soft;
    }

    private updateRoutedLabelObstacle(edgeId: string, result: PathFindingResult, graph: SharedGraphContext): void {
        const labelText = this.getGraphEdgeLabel(edgeId, graph);
        if (!labelText) {
            this.routedLabelObstacles.delete(edgeId);
            return;
        }

        const x = Number(result.labelX);
        const y = Number(result.labelY);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            this.routedLabelObstacles.delete(edgeId);
            return;
        }

        const width = Math.max(36, Math.min(220, labelText.length * 8 + 22));
        const height = 26;
        this.routedLabelObstacles.set(edgeId, {
            edgeId,
            ownerId: edgeId,
            x: x - width / 2,
            y: y - height / 2,
            width,
            height,
        });
    }

    private getGraphEdgeLabel(edgeId: string, graph: SharedGraphContext): string {
        const edge = (graph.edges ?? []).find((e: any) => e?.id === edgeId) as any;
        const raw = edge?.label ?? edge?.data?.label;
        return typeof raw === 'string' ? raw.replace(/<[^>]+>/g, '').trim() : '';
    }

    private buildWaypointCandidateAxes(
        graph: SharedGraphContext,
        assignedJobs?: PathFindingJob[]
    ): { horizontal: number[]; vertical: number[] } {
        const horizontal = new Set<number>();
        const vertical = new Set<number>();
        const addRectAxes = (rect: Rectangle, margin: number) => {
            horizontal.add(Math.round(rect.y - margin));
            horizontal.add(Math.round(rect.y + rect.height + margin));
            vertical.add(Math.round(rect.x - margin));
            vertical.add(Math.round(rect.x + rect.width + margin));
        };

        (graph.obstacles ?? []).forEach(rect => addRectAxes(rect, 8));
        this.collectSoftRoutingObstacles(graph).forEach(rect => addRectAxes(rect, 6));

        (assignedJobs ?? []).forEach(job => {
            if (!job.busTrunkSource || !job.busTrunkTarget) return;
            if (Math.abs(job.busTrunkSource.x - job.busTrunkTarget.x) < 1.0) {
                vertical.add(Math.round(job.busTrunkSource.x));
            } else if (Math.abs(job.busTrunkSource.y - job.busTrunkTarget.y) < 1.0) {
                horizontal.add(Math.round(job.busTrunkSource.y));
            }
        });

        return {
            horizontal: [...horizontal].slice(0, 240),
            vertical: [...vertical].slice(0, 240),
        };
    }

    /**
     * [P0] Perform incremental routing for dirty edges.
     * Called by UI loop or scheduler.
     */
    public async routeIncremental(context: SharedGraphContext): Promise<Map<string, PathFindingResult>> {
        // [FIX C-9] 浣跨敤鐪熷疄鐨勮妭鐐瑰彉鍖栨娴嬶紙鍙栦唬鍘熸潵鐨勭┖鍑芥暟锛?
            const changedNodeIds = this.identifyChangedNodes(context.nodes as any[], this.allEdges);
        if (changedNodeIds.length > 0) {
            // 灏嗘娴嬪埌鐨勭Щ鍔ㄨ妭鐐规爣璁颁负 dirty锛屼娇澶栭儴鏃犻渶鎵嬪姩璋冪敤 markNodesChanged
            this.markNodesChanged(changedNodeIds);
        }

        return this.batchRouteDirtyEdges();
    }


    // [FIX C-9] 鑺傜偣浣嶇疆蹇収锛岀敤浜庡閲忔娴?
    private _nodePositionSnapshot = new Map<string, { x: number; y: number }>();

    /**
     * [FIX C-9] 鍩轰簬浣嶇疆蹇収妫€娴嬫樉钁楃Щ鍔ㄧ殑鑺傜偣銆?
     * 涓庝笂娆¤矾鐢辨椂鐨勫潗鏍囧姣旓紝瓒呰繃闃堝€硷紙2px锛夊垯鏍囪涓?宸插彉鍖?銆?
     * 鍚屾椂鏇存柊蹇収浠ュ涓嬫瀵规瘮銆?
     */
    private identifyChangedNodes(allNodes: any[], _allEdges: Edge[]): string[] {
        const MOVE_THRESHOLD = 2; // px锛屽皬浜庢鍊艰涓烘槸鏁板€煎櫔澹?
            const changedIds: string[] = [];

        for (const node of allNodes) {
            const id: string = node.id;
            const posAbs = node.positionAbsolute || node.computed?.positionAbsolute || node.position;
            if (!posAbs) continue;
            const x = posAbs.x ?? 0;
            const y = posAbs.y ?? 0;

            const prev = this._nodePositionSnapshot.get(id);
            if (!prev || Math.abs(x - prev.x) > MOVE_THRESHOLD || Math.abs(y - prev.y) > MOVE_THRESHOLD) {
                changedIds.push(id);
                this._nodePositionSnapshot.set(id, { x, y });
            }
        }

        // 娓呯悊宸插垹闄ょ殑鑺傜偣蹇収锛堥槻鍐呭瓨娉勬紡锛?
        if (this._nodePositionSnapshot.size > allNodes.length + 50) {
            const aliveIds = new Set(allNodes.map((n: any) => n.id));
            for (const id of this._nodePositionSnapshot.keys()) {
                if (!aliveIds.has(id)) this._nodePositionSnapshot.delete(id);
            }
        }

        return changedIds;
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
        // [SYNC] Populate allEdges to enable Nudge context for this batch
        if (this.allEdges.length === 0 && jobs.length > 0) {
            // Map PathFindingJob to Edge-like structure to avoid @ts-ignore
            this.allEdges = jobs.map(job => ({
                id: job.edgeId,
                source: job.source,
                target: job.target,
                data: {}
            })) as any[];
        }
        if (!this.useParallelRouting || !this.parallelPool) {
            // console.warn('[P0 Parallel] Pool not available, falling back to serial routing');
            return this.routeSerialFallback(jobs, graph);
        }

        //
        try {
            // NOTE: assignBusIndices is already called in batchRouteDirtyEdges BEFORE
            // assignSameSidePortSeparation. Calling it again here would overwrite
            // the incomingCount/outgoingCount values set by port separation logic.

            // Use calculatePaths (alias for routeBatch) compatibility
            const results = await this.parallelPool.calculatePaths(jobs, graph);

            if (!results || results.length !== jobs.length) {
                console.error(`[EdgeRoutingCoordinator] Parallel routing returned incomplete results. Expected ${jobs.length}, got ${results?.length}`);
            }


            return results;
        } catch (error) {
            console.error('[P0 Parallel] Failed, falling back to serial:', error);
            return this.routeSerialFallback(jobs, graph);
        }
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

    // [P0] Assign Bus Indices (outgoingIndex, outgoingCount, etc.)
    // Groups edges by (source, target) AND sorts them to ensure deterministic parallel routing.
    // [FIX] Now uses graph.edges to detect bus membership globally, ensuring isolated updates respect the bus.
    // [NEW] Calculates Trunk Geometry centrally to avoid fragmentation in batched workers.
    // [P0] Assign Bus Indices (outgoingIndex, outgoingCount, etc.)
    // Groups edges by (source, target) AND sorts them to ensure deterministic parallel routing.
    // [FIX] Now uses graph.edges to detect bus membership globally, ensuring isolated updates respect the bus.
    // [NEW] Uses centralized processBusGroups for consistent Trunk Geometry.
    private assignBusIndices(jobs: PathFindingJob[], graph: SharedGraphContext): void {
        // [FIX] Consolidate Ground Truth Topology to prevent State Tearing anomaly.
        // During rapid fast-mounting in React (like changing layout/mode), individual 
        // coordinate requests may arrive carrying temporally staggered snapshot graph instances. 
        // We MUST manually ensure that every single job designated for processing in this exact 
        // batch is physically represented within the relational matrix, otherwise siblings will be splintered.
            const rawGraphEdges = (graph.edges || []) as Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
        const consolidatedEdgesMap = new Map<string, typeof rawGraphEdges[number]>();
        
        rawGraphEdges.forEach(e => consolidatedEdgesMap.set(e.id, e));
        jobs.forEach(j => {
            if (!consolidatedEdgesMap.has(j.edgeId)) {
                consolidatedEdgesMap.set(j.edgeId, { 
                    id: j.edgeId, 
                    source: j.source, 
                    target: j.target, 
                    sourceHandle: j.sourceHandle || undefined, 
                    targetHandle: j.targetHandle || undefined 
                });
            }
        });
        const allEdges = Array.from(consolidatedEdgesMap.values());
        const allNodes = graph.nodes as Array<{ id: string; position?: { x: number; y: number }; measured?: { width?: number; height?: number }; width?: number; height?: number; parentId?: string; positionAbsolute?: { x: number; y: number }; computed?: { positionAbsolute?: { x: number; y: number } } }>;
        const defaultConfig = createDefaultRoutingConfig();

        // [FIX] Create Node Map for O(1) lookup and Parent Traversal
            const nodeMap = new Map<string, typeof allNodes[number]>();
        allNodes.forEach(n => {
            nodeMap.set(n.id, n);
            this.nodeParentMap.set(n.id, n.parentId || (n as any).parentNode);
        });

        // [FIX] Helper to get Absolute Position with Parent Traversal
            const getAbsolutePosition = (node: any): { x: number, y: number } => {
            // Priority 1: Manual Parent Traversal (most reliable for nested nodes)
            // During initial layout, computed.positionAbsolute may be stale or not yet updated
            // with parent offsets, so we always traverse manually for child nodes.
            const pId = node.parentId || node.parentNode;
            if (pId && nodeMap.has(pId)) {
                const parent = nodeMap.get(pId);
                const parentAbs = getAbsolutePosition(parent);
                return {
                    x: parentAbs.x + (node.position?.x ?? 0),
                    y: parentAbs.y + (node.position?.y ?? 0)
                };
            }

            // Priority 2: RF Computed Absolute (for root nodes only)
            if (node.computed?.positionAbsolute) return node.computed.positionAbsolute;
            if (node.positionAbsolute) return node.positionAbsolute;

            // Priority 3: Base Case (No parent, return relative)
            return node.position || { x: node.x ?? 0, y: node.y ?? 0 };
        };

        // Helper: Get Node Rect
            const getNodeRect = (id: string): Rectangle | undefined => {
            const n = nodeMap.get(id);
            if (!n) return undefined;
            const w = n.width || n.measured?.width || 150;
            const h = n.height || n.measured?.height || 80;

            // [FIX] Use robust absolute position
            const absPos = getAbsolutePosition(n);
            return { x: absPos.x, y: absPos.y, width: w, height: h };
        };

        // [FIX] Pre-populate Absolute Geometry for Worker
        jobs.forEach(job => {
            job.sourceRect = getNodeRect(job.source);
            job.targetRect = getNodeRect(job.target);
        });

        const trunkCalculator = new TrunkCalculator();
        const layoutDir = (graph as any).layoutDirection || 'LR';

        // [FIX] Build obstacle list for trunk axis collision avoidance
        // Without this, TrunkCalculator places axes blindly through node bodies.
            const CONTAINER_TYPES = new Set(['group', 'subGroup', 'titleGroup', 'domain', 'subDomain', 'swimlane', 'annotation', 'background', 'sticky', 'comment']);
        const trunkObstacles: Rectangle[] = [];
        allNodes.forEach(n => {
            const type = (n as any).type || '';
            if (CONTAINER_TYPES.has(type)) return; // Skip containers
            const rect = getNodeRect(n.id);
            if (rect && rect.width > 0 && rect.height > 0) {
                trunkObstacles.push(rect);
            }
        });

        // 1. One-to-Many Processing (Source Groups)
            const sourceGroups = new Map<string, PathFindingJob[]>();
        jobs.forEach(job => {
            // [FIX] Context flag `job.isOneToMany` might be stale due to React cache optimizations.
            // We use global `allEdges` to establish the Ground Truth.
            const globalOutgoing = allEdges.filter(e => e.source === job.source);
            job.isOneToMany = globalOutgoing.length > 1;
            
            if (!sourceGroups.has(job.source)) sourceGroups.set(job.source, []);
            sourceGroups.get(job.source)?.push(job);
        });

        // [FIX-port-conflict] 鏀堕泦姣忎釜 hub 鍦?O2M 闃舵宸蹭娇鐢ㄧ殑绔彛缁勶紝
        // 渚?M2O 闃舵鍋氬悓渚х鍙ｆ帓搴忋€傝涓氶噷閫氬父鎶婃暣鏉?bus/trunk 褰撴垚
        // 涓€涓鍙ｅ崰鐢ㄥ璞★紝鑰屼笉鏄寜鍗曟潯杈归€愪釜鎺掑簭銆?
            const hubOutPortGroups = new Map<string, Map<string, HubPortGroupInfo>>();

        sourceGroups.forEach((groupJobs, sourceId) => {
            const busJobs = groupJobs.filter(j => j.isOneToMany);
            if (busJobs.length > 0) {
                const globalOutgoing = allEdges.filter(e => e.source === sourceId);
                this.processBusGroups(
                    sourceId,
                    busJobs,
                    globalOutgoing,
                    getNodeRect,
                    trunkCalculator,
                    defaultConfig,
                    layoutDir,
                    false, // isManyToOne = false
                    trunkObstacles
                );

                // 鏀堕泦 O2M 宸插崰鐢ㄧ殑绔彛缁勫強鍏跺垏绾挎柟鍚戣川蹇冦€?
            const usedPorts = new Map<string, HubPortGroupInfo>();
                busJobs.forEach(j => {
                    const port = (j as any).trunkPort;
                    if (!port) return;
                    const tangent = typeof (j as any).trunkPortTangent === 'number'
                        ? (j as any).trunkPortTangent
                        : (typeof (j as any).trunkBranchCoord === 'number' ? (j as any).trunkBranchCoord : 0);
                    const prev = usedPorts.get(port);
                    if (!prev) {
                        usedPorts.set(port, { tangent, jobs: [j] });
                    } else {
                        const nextCount = prev.jobs.length + 1;
                        prev.tangent = (prev.tangent * prev.jobs.length + tangent) / nextCount;
                        prev.jobs.push(j);
                    }
                });
                if (usedPorts.size > 0) hubOutPortGroups.set(sourceId, usedPorts);
            }
        });

        // 2. Many-to-One Processing (Target Groups)
            const targetGroups = new Map<string, PathFindingJob[]>();
        jobs.forEach(job => {
            // [FIX] Establish Ground Truth for N:1 relationships
            const globalIncoming = allEdges.filter(e => e.target === job.target);
            job.isManyToOne = globalIncoming.length > 1;
            
            if (!targetGroups.has(job.target)) targetGroups.set(job.target, []);
            targetGroups.get(job.target)?.push(job);
        });

        targetGroups.forEach((groupJobs, targetId) => {
            const busJobs = groupJobs.filter(j => j.isManyToOne);
            if (busJobs.length > 0) {
                const globalIncoming = allEdges.filter(e => e.target === targetId);
                const usedPorts = hubOutPortGroups.get(targetId);
                this.processBusGroups(
                    targetId,
                    busJobs,
                    globalIncoming,
                    getNodeRect,
                    trunkCalculator,
                    defaultConfig,
                    layoutDir,
                    true, // isManyToOne = true
                    trunkObstacles,
                    usedPorts // 浼犲叆璇?hub 鐨?O2M 宸插崰绔彛
                );
            } else {
                // Fallback for non-bus incoming groups.
                // [FIX] 鎸夈€岀鍙ｄ晶銆嶅垎缁勶紝淇濊瘉涓嶅悓渚у叆杈瑰悇鑷眳涓紝浜掍笉骞叉壈銆?
                // 鍘熷厛鎸夎妭鐐瑰叏閲忚鏁帮紝瀵艰嚧浠庝笉鍚屼晶杩涘叆鐨勮竟琚敊璇湴鎵╂暎绂讳腑蹇冦€?
            const sideBuckets = new Map<string, PathFindingJob[]>();
                for (const job of groupJobs) {
                    const side = (job.sourceRect && job.targetRect)
                        ? EdgeRoutingCoordinator.inferPortSide(job.sourceRect, job.targetRect, 'target')
                        : 'unknown';
                    if (!sideBuckets.has(side)) sideBuckets.set(side, []);
                    sideBuckets.get(side)!.push(job);
                }
                sideBuckets.forEach(sideJobs => {
                    sideJobs.sort((a, b) => (a.sourceY || 0) - (b.sourceY || 0));
                    sideJobs.forEach((job, index) => {
                        job.incomingIndex = index;
                        job.incomingCount = sideJobs.length;
                    });
                });
            }
        });

        // 3. Parallel Groups (Non-Bus)
        // Ensure basic indexing for parallel edges not handled by bus logic
            const parallelGroups = new Map<string, PathFindingJob[]>();
        jobs.forEach(job => {
            if (job.isOneToMany || job.isManyToOne) return; // Already handled
            const key = `${job.source}->${job.target}`;
            if (!parallelGroups.has(key)) parallelGroups.set(key, []);
            parallelGroups.get(key)?.push(job);
        });

        parallelGroups.forEach(group => {
            if (group.length <= 1) return;
            group.sort((a, b) => {
                // @ts-expect-error
            const diff = (a.targetPos?.y || a.targetY || 0) - (b.targetPos?.y || b.targetY || 0);
                return diff;
            });
            // We don't explicitly assign indices here as PortSelector handles it, but good to sort.
        });
    }

    /**
     * [P0] Assign Global Channels
     * Sorts edges globally within spatial bands to minimize crossings for parallel routes.
     */
    private assignGlobalChannels(jobs: PathFindingJob[]): void {
        // [FIX Phase 2] First detect and separate bidirectional edge pairs
        this.assignBidirectionalChannels(jobs);

        const horizontalGroups = new Map<number, PathFindingJob[]>();
        const verticalGroups = new Map<number, PathFindingJob[]>();
        // [FIX P3] Config-driven group size: based on gridSize * 10 to adapt to different grid configs.
        // Default 150px (= 10px grid * 10). Users with larger grids get proportionally larger bands.
            const gridSize = (jobs[0] as any)?._graphConfig?.algorithm?.gridSize ?? 15;
        const GROUP_SIZE = Math.max(100, gridSize * 10);

        jobs.forEach(job => {
            const dx = Math.abs(job.targetX - job.sourceX);
            const dy = Math.abs(job.targetY - job.sourceY);
            // Determine dominant direction
            if (dx > dy) {
                // Horizontal: Group by Y band
            const midY = (job.sourceY + job.targetY) / 2;
                const key = Math.floor(midY / GROUP_SIZE);
                if (!horizontalGroups.has(key)) horizontalGroups.set(key, []);
                horizontalGroups.get(key)?.push(job);
            } else {
                // Vertical: Group by X band
            const midX = (job.sourceX + job.targetX) / 2;
                const key = Math.floor(midX / GROUP_SIZE);
                if (!verticalGroups.has(key)) verticalGroups.set(key, []);
                verticalGroups.get(key)?.push(job);
            }
        });

        // Perturbation coefficient: small enough not to override the primary Y/X
        // coordinate ordering, but large enough to disambiguate edges that travel
        // in opposite directions within the same spatial band. Edges going left鈫抮ight
        // and right鈫抣eft with the same average Y would otherwise be assigned
        // arbitrary order, sometimes producing avoidable crossings.
            const directionPerturbation = GROUP_SIZE * 0.08;

        // Process Horizontal Groups
        horizontalGroups.forEach(group => {
            // Sort by Y geometry + small direction perturbation to reduce crossings.
            // Edges going left-to-right get a slight upward bias, right-to-left a
            // slight downward bias, so they naturally separate when Y-coords are close.
            group.sort((a, b) => {
                const dirA = Math.sign(a.targetX - a.sourceX); // +1 LTR, -1 RTL, 0 vertical
            const dirB = Math.sign(b.targetX - b.sourceX);
                const valA = a.sourceY + a.targetY + dirA * directionPerturbation;
                const valB = b.sourceY + b.targetY + dirB * directionPerturbation;
                if (Math.abs(valA - valB) > 1) return valA - valB;
                // Tie-breaker for stable bus ordering
                return (a.outgoingIndex || 0) - (b.outgoingIndex || 0) || (a.incomingIndex || 0) - (b.incomingIndex || 0) || a.edgeId.localeCompare(b.edgeId);
            });
            group.forEach((job, index) => {
                job.globalChannelIndex = index;
                job.globalChannelCount = group.length;
                job.globalChannelType = 'horizontal';
            });
        });

        // Process Vertical Groups
        verticalGroups.forEach(group => {
            // Sort by X geometry + small direction perturbation (top-to-bottom vs bottom-to-top).
            group.sort((a, b) => {
                const dirA = Math.sign(a.targetY - a.sourceY); // +1 TTB, -1 BTT
            const dirB = Math.sign(b.targetY - b.sourceY);
                const valA = a.sourceX + a.targetX + dirA * directionPerturbation;
                const valB = b.sourceX + b.targetX + dirB * directionPerturbation;
                if (Math.abs(valA - valB) > 1) return valA - valB;
                // Tie-breaker
                return (a.outgoingIndex || 0) - (b.outgoingIndex || 0) || (a.incomingIndex || 0) - (b.incomingIndex || 0) || a.edgeId.localeCompare(b.edgeId);
            });
            group.forEach((job, index) => {
                job.globalChannelIndex = index;
                job.globalChannelCount = group.length;
                job.globalChannelType = 'vertical';
            });
        });
    }

    /**
     * [FIX C-4] Assign Bidirectional / Parallel Channels
     * 鍘熸潵鍙鐞?pair.length === 2 鐨勫弻鍚戝锛孨>2 鐨勫悓鍚戝钩琛岃竟鍏ㄩ儴閲嶅彔銆?
     * 鏂伴€昏緫锛氭寜 (source, target) 鍒嗙粍锛堟棤鏂瑰悜锛夛紝瀵圭粍鍐呮瘡鏉¤竟鍒嗛厤鐙珛鐨?channel index銆?
     * 
     * 鍒嗛亾绛栫暐锛?
     *   - 2 鏉¤竟锛歝hannel 0 鍜?1锛岃瑙変笂鍚戜袱渚у悇鍋忕Щ spacing/2
     *   - N 鏉¤竟锛歝hannel 0..N-1锛屽潎鍖€鍒嗛厤锛岃瑙変笂鏁翠綋灞呬腑
     */
    private assignBidirectionalChannels(jobs: PathFindingJob[]): void {
        const defaultConfig = createDefaultRoutingConfig();
        const baseSpacing = defaultConfig.bus.bidirectionalSpacing || 25;

        // 鐢ㄦ棤鏂瑰悜鐨?canonical key 鍒嗙粍锛歬ey(A,B) === key(B,A)
            const pairMap = new Map<string, PathFindingJob[]>();
        jobs.forEach(job => {
            const k1 = `${job.source}\u0000${job.target}`;
            const k2 = `${job.target}\u0000${job.source}`;
            const key = k1 < k2 ? k1 : k2;
            if (!pairMap.has(key)) pairMap.set(key, []);
            pairMap.get(key)!.push(job);
        });

        pairMap.forEach((group) => {
            if (group.length < 2) return; // 鍗曟潯杈逛笉闇€瑕佸垎閬?

            // 纭畾鎬ф帓搴忥細鍏堟寜鏂瑰悜锛坰ource-target 瀛楃涓诧級锛屽啀鎸?edgeId
            group.sort((a, b) => {
                const dirA = `${a.source}鈫?{a.target}`;
                const dirB = `${b.source}鈫?{b.target}`;
                const cmp = dirA.localeCompare(dirB);
                return cmp !== 0 ? cmp : a.edgeId.localeCompare(b.edgeId);
            });

            const n = group.length;
            // 纭亸绉绘ā寮忥細baseSpacing 宸叉槸鏈€缁堝亸绉婚噺锛屾寜杈规暟鏀剁獎
            const spacing = baseSpacing * Math.min(1, 3 / n);

            group.forEach((job, index) => {
                job.bidirectionalChannel = index;
                job.bidirectionalSpacing = spacing;
                // [NEW] 鎬婚€氶亾鏁帮紝渚?Worker 灞呬腑璁＄畻鍋忕Щ
                (job as any).bidirectionalCount = n;
            });
        });
    }


    /**
     * [P2-3] Inject Congestion Context
     * Pass information about OTHER edges in the batch to the worker
     * so it can build a local congestion map.
     */
    private injectCongestionContext(jobs: PathFindingJob[], graph: SharedGraphContext): void {
        const portUsage: Record<string, number> = {};

        // Simple usage count
        jobs.forEach(job => {
            portUsage[job.source] = (portUsage[job.source] || 0) + 1;
            portUsage[job.target] = (portUsage[job.target] || 0) + 1;
        });

        // Attach to graph config? Or job?
        // Since graphConfig is shared, let's put it there.
        if (!graph.config) graph.config = {};
        // @ts-expect-error - dynamic property
        graph.config.portCongestion = portUsage; // Workers can read this
    }

    /**
     * [Phase 3] Unified processing for Bus Groups (1-to-N and N-to-1)
     */
    private processBusGroups(
        hubId: string,
        busGroupJobs: PathFindingJob[],
        globalPeers: any[], // Edges from SharedGraphContext
        getNodeRect: (id: string) => Rectangle | undefined,
        trunkCalculator: TrunkCalculator,
        defaultConfig: any,
        layoutDir: string,
        isManyToOne: boolean,
        obstacles?: Rectangle[],  // [FIX] Node obstacles for trunk axis collision avoidance
        hubUsedPorts?: Map<string, HubPortGroupInfo> // [FIX-port-conflict] Ports already occupied by O2M on this hub
    ): void {
        const hubRect = getNodeRect(hubId);
        if (!hubRect) return;

        const hubCenter = { x: hubRect.x + hubRect.width / 2, y: hubRect.y + hubRect.height / 2 };

        // ==================== [FIX-hemisphere] Flow-Direction Hemisphere Grouping ====================
        // 琛屼笟鏍囧噯锛圗LK/draw.io锛夛細鍏堢畻璐ㄥ績纭畾涓绘祦鏂瑰悜锛屽啀娌夸富娴佹柟鍚戝垎鎴?2 涓?180掳 鍗婄悆銆?
        // 杩欐牱鑷劧鍚堝苟鐩搁偦璞￠檺锛堝"宸︿笂"鍜?宸︿笅"閮藉綊鍏ュ悓涓€鍗婄悆锛夈€?
        // 瀵逛簬鏅€氬墠鍚戣竟锛屽己鐑堝亸绂讳富娴佺殑杈癸紙浜ゅ弶杞?> 2脳 涓昏酱锛夊彲鍗曠嫭鍒嗗埌閫冮€哥鍙ｃ€?
        // 瀵逛簬鍙嶅悜鍙嶉杈癸紝淇濇寔涓ユ牸 180掳 鍗婄悆鍒嗙粍锛岄伩鍏嶅悓涓€鍥炴祦鏉熻鎷嗘垚 left/bottom 绛夊崟杈圭粍銆?
        //
        // 绀轰緥锛堜富娴?涓嬫柟锛夛細
        //   姝ｄ笅鏂圭殑 peer 鈫?bottom 鍗婄悆 鉁?
        //   宸︿笅鏂圭殑 peer 鈫?bottom 鍗婄悆 鉁擄紙閭昏繎璞￠檺鑷劧鍚堝苟锛?
        //   绾彸鏂圭殑 peer 鈫?right 閫冮€哥鍙ｏ紙浜ゅ弶杞磋繙澶т簬涓昏酱锛?

        // Step 1: 璁＄畻 peer 璐ㄥ績锛岀‘瀹氫富娴佹柟鍚?
        let centroidX = 0, centroidY = 0, validCount = 0;
        globalPeers.forEach(peerEdge => {
            const peerId = isManyToOne ? peerEdge.source : peerEdge.target;
            const peerRect = getNodeRect(peerId);
            if (peerRect) {
                centroidX += peerRect.x + peerRect.width / 2;
                centroidY += peerRect.y + peerRect.height / 2;
                validCount++;
            }
        });

        // Fallback: 濡傛灉娌℃湁鏈夋晥 peer锛岀洿鎺ヨ繑鍥?
        if (validCount === 0) return;
        centroidX /= validCount;
        centroidY /= validCount;

        const flowDx = centroidX - hubCenter.x;
        const flowDy = centroidY - hubCenter.y;
        // 涓绘祦鏂瑰悜锛氳川蹇冨亸绉绘洿澶х殑杞?
            const isVerticalFlow = Math.abs(flowDy) >= Math.abs(flowDx);

        // Step 2: 鎸夊崐鐞?+ 鏅€氳竟閫冮€稿垎缁?
            const sideGroups = new Map<string, any[]>();
        const jobByEdgeId = new Map(busGroupJobs.map(job => [job.edgeId, job]));
        const isReverseByGeometry = (edge: any): boolean => {
            const sourceRect = getNodeRect(edge.source);
            const targetRect = getNodeRect(edge.target);
            if (!sourceRect || !targetRect) return false;
            const sourceCenter = { x: sourceRect.x + sourceRect.width / 2, y: sourceRect.y + sourceRect.height / 2 };
            const targetCenter = { x: targetRect.x + targetRect.width / 2, y: targetRect.y + targetRect.height / 2 };
            const dx = targetCenter.x - sourceCenter.x;
            const dy = targetCenter.y - sourceCenter.y;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            switch (layoutDir) {
                case 'RL':
                    return dx > 0 && absDx > absDy;
                case 'TB':
                    return dy < 0 && absDy > absDx;
                case 'BT':
                    return dy > 0 && absDy > absDx;
                case 'LR':
                default:
                    return dx < 0 && absDx > absDy;
            }
        };

        globalPeers.forEach(peerEdge => {
            const peerId = isManyToOne ? peerEdge.source : peerEdge.target;
            const peerRect = getNodeRect(peerId);
            if (!peerRect) return;
            const peerJob = jobByEdgeId.get(peerEdge.id);
            const keepTrueHemisphere = !!peerJob?.isReverseEdge || isReverseByGeometry(peerEdge);

            const peerCenter = { x: peerRect.x + peerRect.width / 2, y: peerRect.y + peerRect.height / 2 };
            const dx = peerCenter.x - hubCenter.x;
            const dy = peerCenter.y - hubCenter.y;

            let side: string;
            if (isVerticalFlow) {
                // 涓绘祦=涓婁笅 鈫?榛樿鎸?y 鍒嗗崐鐞?
                // 閫冮€革細濡傛灉 |dx| > 2*|dy| 涓?|dx| > 50px锛岃鏄?peer 寮虹儓鍋忓悜宸﹀彸
                if (!keepTrueHemisphere && Math.abs(dx) > Math.abs(dy) * 2 && Math.abs(dx) > 50) {
                    side = dx < 0 ? 'left' : 'right';
                } else {
                    side = dy < 0 ? 'top' : 'bottom';
                }
            } else {
                // 涓绘祦=宸﹀彸 鈫?榛樿鎸?x 鍒嗗崐鐞?
                // 閫冮€革細濡傛灉 |dy| > 2*|dx| 涓?|dy| > 50px
                if (!keepTrueHemisphere && Math.abs(dy) > Math.abs(dx) * 2 && Math.abs(dy) > 50) {
                    side = dy < 0 ? 'top' : 'bottom';
                } else {
                    side = dx < 0 ? 'left' : 'right';
                }
            }

            // [Debug] Classification
            const edgeType = peerEdge.type as string | undefined;
            this.trunkDebugData.set(peerEdge.id, {
                edgeId: peerEdge.id,
                edgeType,
                delta: isVerticalFlow ? dy : dx,
                dirSign: 0,
                side: 0,
                typeInfluenced: false
            });

            if (!sideGroups.has(side)) sideGroups.set(side, []);
            sideGroups.get(side)!.push(peerEdge);
        });

        // 閫愬崐鐞冪粍璁＄畻涓诲共绾?
        sideGroups.forEach((groupEdges, _side) => {
            if (groupEdges.length === 0) return;

            // 鍗曟潯杈圭殑缁勶細闄嶇骇涓烘櫘閫?A* 璺敱锛堝彧鍦ㄦ湁澶氫釜缁勬椂锛?
            // [FIX] 淇濈暀 isManyToOne/isOneToMany 鏍囧織涓嶆竻闄わ紝
            // 杩欐牱 Worker 浠嶇煡閬撹繖鏄?bus"杈癸紙isBus=true 鈫?allowTargetSlide=false锛夈€?
            // 濡傛灉娓呴櫎浜嗘爣蹇楋紝Worker 浼氭粦鍔ㄧ鍙ｂ啋绔彛鍋忕涓績銆?
            if (groupEdges.length === 1 && sideGroups.size > 1) {
                const job = busGroupJobs.find(j => j.edgeId === groupEdges[0].id);
                const shouldKeepSingletonBus = !!job?.isReverseEdge || isReverseByGeometry(groupEdges[0]);
                if (job && !shouldKeepSingletonBus) {
                    if (isManyToOne) {
                        // 涓嶆竻闄?job.isManyToOne锛屼繚鎸?isBus=true 璁?Worker 绂佹绔彛婊戝姩
                        job.incomingCount = 1;
                        job.incomingIndex = 0;
                    } else {
                        // 鍚岀悊锛屼繚鎸?job.isOneToMany
                        job.outgoingCount = 1;
                        job.outgoingIndex = 0;
                    }
                }
                if (!shouldKeepSingletonBus) return;
            }

            // 璁＄畻璇ヨ薄闄愮殑 peer 鑺傜偣鐭╁舰鍒楄〃
            const subPeers = groupEdges.map(e =>
                getNodeRect(isManyToOne ? e.source : e.target)
            ).filter((r): r is Rectangle => !!r);

            // 鐩存帴璋冪敤 calculateTreeTrunk 鈥?姣忎釜璞￠檺鐨?peer 澶╃劧鍦ㄥ悓渚э紝
            // 涓嶉渶瑕佸弻骞茬嚎骞惰闂磋窛锛坈alculateParallelTrunks 鐨?forward/backward 鎷嗗垎锛?
            const trunk = trunkCalculator.calculateTreeTrunk(
                hubRect,
                subPeers,
                isManyToOne,
                defaultConfig,
                layoutDir,
                undefined, // 璁?calculateTreeTrunk 鑷璁＄畻璐ㄥ績
                obstacles
            );

            // [FIX-port-spread] 鍚屼晶绔彛鎵╁睍锛圥ort Spreading锛?
            // 褰?M2O 鍜?O2M 鍏变韩鍚屼竴绔彛渚ф椂锛屼笉缈昏浆涔熶笉鍋忕Щ trunk axis锛?
            // 鑰屾槸閫氳繃 hubPortSlot 鍛婅瘔 Worker 鍦ㄨ渚т娇鐢ㄤ笉鍚岀殑杩炴帴鐐逛綅缃€?
            // slot 鎸夌鍙ｅ垏绾挎柟鍚戣川蹇冩帓搴忥細slot 0 鍋忓乏/鍋忎笂锛宻lot 1 鍋忓彸/鍋忎笅銆?
            const currentGroupTangent = (() => {
                let sum = 0;
                let count = 0;
                for (const edge of groupEdges) {
                    const peerRect = getNodeRect(isManyToOne ? edge.source : edge.target);
                    if (!peerRect) continue;
                    const cx = peerRect.x + peerRect.width / 2;
                    const cy = peerRect.y + peerRect.height / 2;
                    sum += (trunk.suggestedPort === 'top' || trunk.suggestedPort === 'bottom') ? cx : cy;
                    count++;
                }
                return count > 0 ? sum / count : 0;
            })();

            const conflictingOutGroup = isManyToOne ? hubUsedPorts?.get(trunk.suggestedPort) : undefined;
            const hasPortConflict = !!conflictingOutGroup;
            let hubPortSlot = hasPortConflict ? 1 : 0;

            if (hasPortConflict && conflictingOutGroup) {
                // Slot 0 is visually upper/left; slot 1 is lower/right. Order the
                // two trunk bundles by their tangent barycenter so the bundles do
                // not cross immediately at the shared hub port.
                hubPortSlot = currentGroupTangent < conflictingOutGroup.tangent ? 0 : 1;
                const outSlot = 1 - hubPortSlot;
                conflictingOutGroup.jobs.forEach(j => {
                    j.outgoingCount = 2;
                    j.outgoingIndex = outSlot;
                });
            }

            // [FIX-dual-lane] 瀵逛晶璧板粖鍒嗙锛圤pposite-Side Corridor Separation锛?
            //
            // 闂锛氬綋 O2M 鍜?M2O 鍏变韩鍚屼竴绔彛渚ф椂锛屼袱鑰呯殑 A* 鍒嗘敮璺緞
            // 閮借杩粫杩囧悓涓€缁勯殰纰嶇墿鍒拌揪鍚屼竴渚ц蛋寤婏紙濡?x鈮?571锛夛紝瀵艰嚧浜ょ粐銆?
            //
            // 琛屼笟鍋氭硶锛圗LK Channel Routing锛夛細
            // O2M 鍜?M2O 浣跨敤涓嶅悓渚х殑璧板粖銆侽2M 璧伴殰纰嶇墿鍙充晶锛孧2O 璧板乏渚с€?
            //
            // 瀹炵幇锛氭妸 M2O 鐨?trunk axis 闀滃儚鍒?hub 鐨勫渚э紝
            // 杩欐牱 M2O 鐨勫垎鏀粠涓€寮€濮嬪氨璧板乏渚э紙鎴栦笂鏂癸級璧板粖銆?
            //
            //   Left corridor 鈫? Hub  鈫?Right corridor
            //        M2O 鈹€鈹€鈹€鈹€鈹? 鈹溾攢鈹€鈹€鈹€ O2M
            //                鈹? 鈹?
            //              peers...
            if (hasPortConflict) {
                if (trunk.direction === 'vertical') {
                    // O2M trunk 鍦?hub 鍙充晶 (axis > hubCenter.x) 鈫?M2O 闀滃儚鍒板乏渚?
                    // O2M trunk 鍦?hub 宸︿晶 (axis < hubCenter.x) 鈫?M2O 闀滃儚鍒板彸渚?
            const hubCenterX = hubRect.x + hubRect.width / 2;
                    const o2mOffset = trunk.axis - hubCenterX; // 姝?鍙? 璐?宸?
                    trunk.axis = hubCenterX - o2mOffset; // 闀滃儚鍒板闈?
                } else {
                    const hubCenterY = hubRect.y + hubRect.height / 2;
                    const o2mOffset = trunk.axis - hubCenterY;
                    trunk.axis = hubCenterY - o2mOffset;
                }
            }

            const groupKey = `${isManyToOne ? 'm2o' : 'o2m'}:${hubId}:${_side}`;
            this.assignTrunkGeometry(groupEdges, busGroupJobs, trunk, layoutDir, getNodeRect, isManyToOne, hasPortConflict, groupKey, hubPortSlot, currentGroupTangent);
        });
    }

    private assignTrunkGeometry(
        edges: any[],
        busGroupJobs: PathFindingJob[],
        trunk: { axis: number; direction: 'horizontal' | 'vertical'; range: { min: number; max: number }; suggestedPort: 'top' | 'bottom' | 'left' | 'right' },
        layoutDir: string,
        getNodeRect: (id: string) => Rectangle | undefined,
        isManyToOne: boolean,
        hubPortConflict: boolean = false,  // [FIX-port-spread] 鏄惁涓庡彟涓€鏂瑰悜鍏变韩绔彛
        peerGroupKeyOverride?: string,
        hubPortSlot: number = 0,
        trunkPortTangent?: number
    ): void {
        // [FIX] Removed dirtyEdges.add + scheduleBatchRouting that caused infinite recursion:
        // assignTrunkGeometry is called FROM batchRouteDirtyEdges, so marking edges dirty here
        // triggers another batchRouteDirtyEdges 鈫?infinite cascade.

        // Debug attachment
        edges.forEach((edge: any) => {
            const debugEntry = this.trunkDebugData.get(edge.id);
            if (debugEntry) {
                debugEntry.trunk = {
                    direction: trunk.direction,
                    axis: trunk.axis,
                    range: trunk.range,
                    port: trunk.suggestedPort
                };
            }
        });

        const trunkProjection = (rect?: Rectangle) => {
            if (!rect) return 0;
            return trunk.direction === 'horizontal'
                ? rect.x + rect.width / 2
                : rect.y + rect.height / 2;
        };

        const peerSecondaryProjection = (rect?: Rectangle) => {
            if (!rect) return 0;
            return trunk.direction === 'horizontal'
                ? rect.y + rect.height / 2
                : rect.x + rect.width / 2;
        };

        // Pre-sort peers once. The baseline is the peer projection onto the trunk,
        // then a greedy adjacent-swap pass reduces mismatches between trunk order
        // and peer spatial order. This is the local equivalent of layered graph
        // crossing minimization's barycenter + greedy-switch stage.
            const sortedGlobal = optimizeHubPortOrder(
            edges.map((edge: any) => {
                const rect = getNodeRect(isManyToOne ? edge.source : edge.target);
                const branchCoord = trunkProjection(rect);
                const secondaryCoord = peerSecondaryProjection(rect);
                return {
                    item: edge,
                    id: edge.id || '',
                    branchCoord,
                    peerCoord: secondaryCoord,
                    secondaryCoord: branchCoord,
                };
            }),
            { primaryWeight: 12, branchOrderWeight: 8, secondaryWeight: 2 }
        );
        const sortedEdgeIds = sortedGlobal.map((e: any) => e.id);

        edges.forEach((edge: any) => {
            const job = busGroupJobs.find(j => j.edgeId === edge.id);
            if (!job) return;

            const index = sortedGlobal.findIndex((e: any) => e.id === job.edgeId);
            (job as any).busIndex = index; // Store branching order for trunk calculation
            (job as any).trunkOrderIndex = index;
            (job as any).trunkOrderCount = sortedGlobal.length;
            const peerRect = getNodeRect(isManyToOne ? edge.source : edge.target);
            (job as any).trunkBranchCoord = trunkProjection(peerRect);

            if (isManyToOne) {
                // Hub is Target. All M2O edges coalesce to ONE shared trunk port.
                // When O2M also uses this side, the two trunk bundles are ordered by tangent barycenter.
                job.incomingCount = hubPortConflict ? 2 : 1;
                job.incomingIndex = hubPortConflict ? hubPortSlot : 0;
                // Peer side (Source)
                job.outgoingCount = 1;
                job.outgoingIndex = 0;
            } else {
                // Hub is Source. All O2M edges coalesce to ONE shared trunk port (slot 0).
                job.outgoingCount = hubPortConflict ? 2 : 1;
                job.outgoingIndex = 0;
                // Peer side (Target)
                job.incomingCount = 1;
                job.incomingIndex = 0;
            }


            // [FIX-dual-trunk] Assign direction-specific trunk hints.
            // Worker reads (job as any).o2mTrunk / m2oTrunk to resolve ports independently
            // for each end of a dual-identity edge (both O2M and M2O).
            // Previously only busTrunkSource/Target was written 鈥?M2O phase overwrote O2M data.
            const trunkData = trunk.direction === 'vertical'
                ? { source: { x: trunk.axis, y: trunk.range.min }, target: { x: trunk.axis, y: trunk.range.max } }
                : { source: { x: trunk.range.min, y: trunk.axis }, target: { x: trunk.range.max, y: trunk.axis } };

            if (isManyToOne) {
                (job as any).m2oTrunk = trunkData;
                (job as any).m2oTrunkPort = trunk.suggestedPort;
            } else {
                (job as any).o2mTrunk = trunkData;
                (job as any).o2mTrunkPort = trunk.suggestedPort;
            }

            // Assign Trunk Coordinates (kept for backward compat: isGlobalTrunkMember, trunk segment build)
            if (trunk.direction === 'vertical') {
                job.busTrunkSource = { x: trunk.axis, y: trunk.range.min };
                job.busTrunkTarget = { x: trunk.axis, y: trunk.range.max };
            } else {
                job.busTrunkSource = { x: trunk.range.min, y: trunk.axis };
                job.busTrunkTarget = { x: trunk.range.max, y: trunk.axis };
            }

            // [Trunk Vis] 娉ㄥ叆 peerGroup 淇℃伅锛屼緵璋冭瘯闈㈡澘鐨?Canvas 鍙鍖?
            (job as any).peerGroupMembers = sortedEdgeIds;
            // [FIX] hubId 鍦?assignTrunkGeometry 浣滅敤鍩熷唴涓嶅彲鐢紝鏀圭敤鍙帹瀵肩殑 hub 鑺傜偣 ID
            const peerGroupKey = peerGroupKeyOverride ?? (isManyToOne
                ? (edge.target as string)   // M2O: hub 鏄叕鍏?target
                : (edge.source as string));  // O2M: hub 鏄叕鍏?source
            (job as any).peerGroupKey = peerGroupKey;
            (job as any).peerGroupSize = edges.length;
            (job as any).trunkPort = trunk.suggestedPort; // Pass suggested port direction
            (job as any).trunkPortTangent = trunkPortTangent;

            // [S4] Port 娉ㄥ叆宸茬Щ鑷?Worker 鍐呴儴锛堝嚑浣曟帹绠楋級銆?
            // Coordinator 浠呬紶閫?busTrunkSource/busTrunkTarget + o2mTrunk/m2oTrunk 鍑犱綍鍏冩暟鎹紝
            // 绔彛鏂瑰悜鐢?Worker 鐨勫嚑浣曢€昏緫鑷富鍐冲畾锛屾秷闄ゅ弻灞傚喅绛栧啿绐併€?

            job.layoutDirection = layoutDir;
        });
    }

    /**
     * [SharedTrunk] Public accessor 鈥?returns the latest shared trunk segments.
     * Called by useSmartPathWorker to pass trunk data to the canvas rendering layer.
     */
    public getSharedTrunks(): SharedTrunkSegment[] {
        return Array.from(this.sharedTrunks.values());
    }

    /**
     * [SharedTrunk] Extract shared trunk segments from M2O/O2M buddy groups.
     *
     * For each group of N edges sharing a common trunk axis:
     *  1. Identify the trunk junction points in each edge's path.
     *  2. Build ONE shared trunk path covering the full span (min_branch_x 鈫?hub).
     *  3. Trim each edge's path to the branch-only portion (source 鈫?junction).
     *
     * Visual result:
     *  Before: N overlapping SVG paths each drawing source 鈫?trunk 鈫?hub
     *  After : N branch-only paths (source 鈫?junction) + 1 shared trunk path (junction 鈫?hub)
     */
    private mergeTrunkSegments(
        results: (PathFindingResult | null)[],
        requests: RoutingRequest[]
    ): Map<string, SharedTrunkSegment> {
        const output = new Map<string, SharedTrunkSegment>();
        // [FIX] Disabled SharedTrunkLayer overlay generation. 
        // Individual edge paths already overlap perfectly on the trunk segment to form a unified visual trunk. 
        // The overlay was starting exactly at the mathematical junction points, drawing sharp straight lines 
        // that protruded out of the filleted (rounded) corners of the underlying edges, creating visual artifacts.
        return output;
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

        const config = graph.config;
        const validResults = results.filter((r): r is PathFindingResult => r !== null && !r.error && !!r.points && r.points.length > 0);
        if (validResults.length === 0) return;

        // [UPGRADE] Include ALL edges in overlap detection, but bus/trunk edges from the
        // same group are treated as "buddies" 鈥?they intentionally share trunk segments
        // and should NOT be separated. Only non-buddy overlaps get channel-routed.

        // Step 1: Clean collinear points from all paths
            const cleanPath = (raw: Point[]): Point[] => {
            if (raw.length < 3) return raw;
            const cleaned: Point[] = [{ x: raw[0].x, y: raw[0].y }];
            for (let i = 1; i < raw.length - 1; i++) {
                const prev = cleaned[cleaned.length - 1];
                const curr = raw[i];
                const next = raw[i + 1];
                const isHorizontal = Math.abs(prev.y - curr.y) < 1 && Math.abs(curr.y - next.y) < 1;
                const isVertical = Math.abs(prev.x - curr.x) < 1 && Math.abs(curr.x - next.x) < 1;
                if (isHorizontal || isVertical) continue;
                cleaned.push({ x: curr.x, y: curr.y });
            }
            cleaned.push({ x: raw[raw.length - 1].x, y: raw[raw.length - 1].y });
            return cleaned;
        };

        // Step 2: Build edgePaths map for globalChannelRouting
            const edgePaths = new Map<string, Point[]>();
        const activeEdgeIds = new Set(validResults.map(r => r.edgeId));
        const fixedContextPaths = graphKey
            ? this.collectFixedPathContext(graphKey, validResults, activeEdgeIds)
            : new Map<string, Point[]>();
        fixedContextPaths.forEach((points, edgeId) => {
            edgePaths.set(edgeId, cleanPath(points));
        });
        for (const r of validResults) {
            edgePaths.set(r.edgeId, cleanPath(r.points));
        }
        const fixedEdgeIds = new Set(fixedContextPaths.keys());

        // Step 3: Build buddy groups 鈥?bus/trunk edges sharing the same normalized
        // direction + hemisphere trunk group.
        // O2M buddy group: protect first segment (shared source trunk)
        // M2O buddy group: protect last segment (shared target trunk)
            const buddyGroupMap = new Map<string, { edgeIds: Set<string>; type: 'o2m' | 'm2o' }>(); // groupKey 鈫?group info
        requests.forEach((req, index) => {
            const job = (assignedJobs?.[index] ?? req.job) as any;
            if (job.isOneToMany) {
                const key = job.peerGroupKey ?? `o2m:${job.source}`;
                if (!buddyGroupMap.has(key)) buddyGroupMap.set(key, { edgeIds: new Set(), type: 'o2m' });
                buddyGroupMap.get(key)!.edgeIds.add(req.edgeId);
            }
            if (job.isManyToOne) {
                const key = job.peerGroupKey ?? `m2o:${job.target}`;
                if (!buddyGroupMap.has(key)) buddyGroupMap.set(key, { edgeIds: new Set(), type: 'm2o' });
                buddyGroupMap.get(key)!.edgeIds.add(req.edgeId);
            }
        });
        // Keep even a single dirty member of a larger bus fixed. Its siblings may be
        // satisfied from cache and absent from this batch, but the trunk segment still
        // must not be nudged away from the shared axis.
            const buddyGroups = [...buddyGroupMap.values()].filter(g => g.edgeIds.size >= 1);



        try {
            // Use globalChannelRouting with position-aware buddy groups.
            // O2M buddies protect first segment only, M2O protect last segment only.
            // Mid-segments of buddy edges still participate in normal channel routing.
            const spacing = config?.postProcessing?.nudgeSpacing ?? 12;
            const nudgedPaths = globalChannelRouting(edgePaths, spacing, buddyGroups, fixedEdgeIds);
            const currentBatchEdgeIds = new Set(requests.map(req => req.edgeId));
            const postProcessing = config?.postProcessing;
            const refinementEnabled = postProcessing?.enableWaypointRefinement !== false;
            const refinementResult = refinementEnabled
                ? refineOrthogonalWaypointsDetailed(nudgedPaths, {
                    buddyGroups,
                    fixedEdgeIds,
                    hardObstacles: (graph.obstacles ?? []) as Rectangle[],
                    softObstacles: this.collectSoftRoutingObstacles(graph, currentBatchEdgeIds),
                    spacing,
                    maxPasses: postProcessing?.waypointRefinementPasses,
                    maxEdgesPerPass: postProcessing?.maxWaypointRefineEdgesPerPass,
                    enableReroute: postProcessing?.enableWaypointReroute,
                    maxRerouteEdges: postProcessing?.maxWaypointRerouteEdges,
                    scoring: {
                        hardCrossingWeight: postProcessing?.waypointHardCrossingWeight,
                        softObstacleWeight: postProcessing?.waypointSoftObstacleWeight,
                        softNearMissWeight: postProcessing?.waypointSoftNearMissWeight,
                        softNearMissPadding: postProcessing?.waypointSoftNearMissPadding,
                        turnbackWeight: postProcessing?.waypointTurnbackWeight,
                        bendWeight: postProcessing?.waypointBendWeight,
                    },
                    candidateAxes: this.buildWaypointCandidateAxes(graph, assignedJobs),
                })
                : null;
            let refinedPaths = refinementResult?.paths ?? nudgedPaths;
            if (refinementResult) {
                this.attachWaypointRefinementDebug(validResults, refinementResult.summary);
            }
            refinedPaths = refineManyToOneFanIn(refinedPaths, this.buildManyToOneFanInGroups(requests, graph, assignedJobs), {
                spacing,
                obstacles: (graph.obstacles ?? []) as Rectangle[],
                ignoredRectsByEdge: this.buildFanInIgnoredRects(requests, assignedJobs),
            });

            // Step 3: Apply back to results
            for (const r of validResults) {
                const newPoints = refinedPaths.get(r.edgeId);
                if (!newPoints || newPoints.length < 2) continue;

                // Check if path actually changed
            const changed = newPoints.length !== r.points.length
                    || newPoints.some((p, i) => {
                        const orig = r.points[i];
                        return !orig || Math.abs(p.x - orig.x) > 0.5 || Math.abs(p.y - orig.y) > 0.5;
                    });
                if (!changed) continue;

                r.points = newPoints;

                // [FIX C-5] Use canonical createFilletedPath instead of hand-rolled Q-bezier.
                // This ensures nudged paths go through micro-jog elimination, collinear collapse,
                // and consistent A-arc rendering 鈥?matching all other edge rendering paths.
            const radius = (config as any)?.borderRadius ?? 8;
                r.path = createFilletedPath(newPoints, radius);

                // Update label position
                if (newPoints.length >= 2) {
                    const midIndex = Math.floor(newPoints.length / 2);
                    const p1 = newPoints[midIndex - 1];
                    const p2 = newPoints[midIndex];
                    r.labelX = (p1.x + p2.x) / 2;
                    r.labelY = (p1.y + p2.y) / 2;
                }
            }
        } catch (err) {
            console.error('[GlobalNudge] Channel routing failed, falling back to original paths:', err);
        }
    }

    private buildManyToOneFanInGroups(
        requests: RoutingRequest[],
        graph: SharedGraphContext,
        assignedJobs?: PathFindingJob[]
    ): ManyToOneFanInGroup[] {
        const requestCountByTarget = new Map<string, number>();
        requests.forEach(req => {
            requestCountByTarget.set(req.job.target, (requestCountByTarget.get(req.job.target) ?? 0) + 1);
        });

        const graphIncomingCountByTarget = new Map<string, number>();
        ((graph.edges ?? []) as Array<{ target?: string }>).forEach(edge => {
            if (!edge.target) return;
            graphIncomingCountByTarget.set(edge.target, (graphIncomingCountByTarget.get(edge.target) ?? 0) + 1);
        });

        const groups = new Map<string, Set<string>>();

        requests.forEach((req, index) => {
            const job = (assignedJobs?.[index] ?? req.job) as any;
            const targetId = job.target ?? req.job.target;
            if (!targetId) return;
            const isManyToOne = !!job.isManyToOne
                || (requestCountByTarget.get(targetId) ?? 0) > 1
                || (graphIncomingCountByTarget.get(targetId) ?? 0) > 1;
            if (!isManyToOne) return;
            const key = `m2o:${targetId}`;
            if (!groups.has(key)) groups.set(key, new Set());
            groups.get(key)!.add(req.edgeId);
        });

        return [...groups.entries()]
            .map(([key, edgeIds]) => ({
                targetId: key.slice('m2o:'.length),
                edgeIds: [...edgeIds],
            }))
            .filter(group => group.edgeIds.length >= 2);
    }

    private buildFanInIgnoredRects(
        requests: RoutingRequest[],
        assignedJobs?: PathFindingJob[]
    ): Map<string, Rectangle[]> {
        const ignored = new Map<string, Rectangle[]>();

        requests.forEach((req, index) => {
            const job = assignedJobs?.[index] ?? req.job;
            const rects = [job.sourceRect, job.targetRect].filter((rect): rect is Rectangle => !!rect);
            if (rects.length > 0) ignored.set(req.edgeId, rects);
        });

        return ignored;
    }

    private attachWaypointRefinementDebug(
        results: PathFindingResult[],
        summary: WaypointRefinementSummary
    ): void {
        const changedEdgeSet = new Set(summary.changedEdgeIds);
        for (const result of results) {
            result.debugInfo = {
                ...(result.debugInfo ?? {}),
                algorithmDebug: {
                    ...((result.debugInfo as any)?.algorithmDebug ?? {}),
                    waypointRefinement: {
                        ...summary,
                        changed: changedEdgeSet.has(result.edgeId),
                    },
                },
            };
        }
    }

    /**
     * [DEV] 寮哄埗娓呯┖鎵€鏈夎矾鐢辩紦瀛樺苟閫掑 graphVersion锛岃鎵€鏈夎竟閲嶆柊璁＄畻璺緞銆?
     * 鐢ㄤ簬淇敼浜嗚矾鐢辩畻娉曞悗鏃犻渶閲嶅惎鍗冲彲楠岃瘉鏁堟灉銆?
     */
    public clearAllCaches(): void {
        this.graphVersion++;
        this.notifyGraphVersionSubscribers();
        this.cache.clear();
        this.routedLabelObstacles.clear();
        this.dirtyEdges.clear();
        this.allEdges.forEach(edge => this.dirtyEdges.add(edge.id));
        this.workerPool.markDirty();
        console.info(`[EdgeRoutingCoordinator] All caches cleared. graphVersion=${this.graphVersion}`);
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
        const eligibleJobs = jobs.filter(j => j.sourceRect && j.targetRect);
        if (eligibleJobs.length === 0) return;

        // Build a rect lookup from the graph so we can reconstruct rects for cached edges.
        // We need this because latestRequests does not persist sourceRect/targetRect.
        const allNodes = (graph.nodes || []) as Array<{
            id: string;
            position?: { x: number; y: number };
            measured?: { width?: number; height?: number };
            width?: number; height?: number;
            parentId?: string; parentNode?: string;
            positionAbsolute?: { x: number; y: number };
            computed?: { positionAbsolute?: { x: number; y: number } };
        }>;
        const nodeMap = new Map(allNodes.map(n => [n.id, n]));

        const getAbsPos = (n: typeof allNodes[number]): { x: number; y: number } => {
            const pId = n.parentId || (n as any).parentNode;
            if (pId) {
                const parent = nodeMap.get(pId);
                if (parent) {
                    const pp = getAbsPos(parent);
                    return { x: pp.x + (n.position?.x || 0), y: pp.y + (n.position?.y || 0) };
                }
            }
            return n.positionAbsolute
                || n.computed?.positionAbsolute
                || n.position
                || { x: 0, y: 0 };
        };

        const getNodeRect = (id: string): Rectangle | undefined => {
            const n = nodeMap.get(id);
            if (!n) return undefined;
            const w = n.width || n.measured?.width || 150;
            const h = n.height || n.measured?.height || 80;
            const pos = getAbsPos(n);
            return { x: pos.x, y: pos.y, width: w, height: h };
        };

        // Step 1: Build buckets from ALL known edges (current batch + latestRequests cache).
        // Routing is batched: when only one edge re-routes, sibling edges on the same node
        // side are already cached. We need global view to detect same-side in/out conflicts.
        //
        // We use latestRequests for cached edges (source/target/isOneToMany/isManyToOne are
        // stored there), and reconstruct rects from the graph nodes.
        // Index re-assignment (Step 2) only touches jobs in the CURRENT batch.
        const currentJobIds = new Set(eligibleJobs.map(j => j.edgeId));

        // Lightweight edge descriptor used for bucket building
        interface EdgeDesc {
            edgeId: string;
            source: string; target: string;
            isOneToMany: boolean; isManyToOne: boolean;
            sourceRect: Rectangle; targetRect: Rectangle;
        }
        const allEdges: EdgeDesc[] = [];

        // Current batch (already have rects)
        for (const j of eligibleJobs) {
            allEdges.push({
                edgeId: j.edgeId, source: j.source, target: j.target,
                isOneToMany: !!j.isOneToMany, isManyToOne: !!j.isManyToOne,
                sourceRect: j.sourceRect!, targetRect: j.targetRect!,
            });
        }
        // Cached edges from latestRequests (reconstruct rects from graph)
        for (const [edgeId, val] of this.latestRequests) {
            if (currentJobIds.has(edgeId)) continue;
            const cj = (val as any)?.request?.job;
            if (!cj) continue;
            const srcRect = getNodeRect(cj.source);
            const tgtRect = getNodeRect(cj.target);
            if (!srcRect || !tgtRect) continue;
            allEdges.push({
                edgeId, source: cj.source, target: cj.target,
                isOneToMany: !!cj.isOneToMany, isManyToOne: !!cj.isManyToOne,
                sourceRect: srcRect, targetRect: tgtRect,
            });
        }

        // key = `${nodeId}::${side}`, value = { outEdges, inEdges }
        const buckets = new Map<string, { outEdges: EdgeDesc[]; inEdges: EdgeDesc[] }>();
        const getBucket = (nodeId: string, side: string) => {
            const k = `${nodeId}::${side}`;
            if (!buckets.has(k)) buckets.set(k, { outEdges: [], inEdges: [] });
            return buckets.get(k)!;
        };
        for (const e of allEdges) {
            const outSide = EdgeRoutingCoordinator.inferPortSide(e.sourceRect, e.targetRect, 'source');
            getBucket(e.source, outSide).outEdges.push(e);
            const inSide = EdgeRoutingCoordinator.inferPortSide(e.sourceRect, e.targetRect, 'target');
            getBucket(e.target, inSide).inEdges.push(e);
        }

        // Step 2: For each (nodeId, side) with BOTH outgoing and incoming edges, separate ports.
        // If a side only has one type (all-out or all-in), skip - no separation needed.
        for (const [key, { outEdges, inEdges }] of buckets) {
            if (outEdges.length === 0 || inEdges.length === 0) continue;

            const colonIdx = key.indexOf('::');
            const nodeId = key.slice(0, colonIdx);
            const side   = key.slice(colonIdx + 2);

            // Slot counting: bus trunk group = 1 slot (shared port preserved), solo = 1 slot each
            const outBusEdges  = outEdges.filter(e => e.isOneToMany);
            const outSoloEdges = outEdges.filter(e => !e.isOneToMany);
            const outSlotCount = (outBusEdges.length > 0 ? 1 : 0) + outSoloEdges.length;

            const inBusEdges  = inEdges.filter(e => e.isManyToOne);
            const inSoloEdges = inEdges.filter(e => !e.isManyToOne);
            const inSlotCount = (inBusEdges.length > 0 ? 1 : 0) + inSoloEdges.length;

            const totalSlots = outSlotCount + inSlotCount;

            // Order groups by peer centroid along the side axis
            const oppCoordE = (e: EdgeDesc, asSource: boolean): number => {
                const r = asSource ? e.targetRect : e.sourceRect;
                return (side === 'top' || side === 'bottom')
                    ? r.x + r.width  / 2
                    : r.y + r.height / 2;
            };
            const outCentroid = outEdges.reduce((s, e) => s + oppCoordE(e, true),  0) / outEdges.length;
            const inCentroid  = inEdges.reduce( (s, e) => s + oppCoordE(e, false), 0) / inEdges.length;
            const outFirst = outCentroid <= inCentroid;
            const outBase  = outFirst ? 0 : inSlotCount;
            const inBase   = outFirst ? outSlotCount : 0;

            // Now apply to CURRENT batch jobs only
            // Helper: find the PathFindingJob for a given edgeId
            const jobFor = (edgeId: string): PathFindingJob | undefined =>
                eligibleJobs.find(j => j.edgeId === edgeId);

            // Assign out-bus edges (they all share one slot - trunk preserved)
            const outBusCurrent = outBusEdges.filter(e => currentJobIds.has(e.edgeId));
            for (const e of outBusCurrent) {
                const j = jobFor(e.edgeId)!;
                const existing = j.outgoingCount || 1;
                if (existing <= 1) {
                    j.outgoingCount = totalSlots;
                    j.outgoingIndex = outBase;
                } else {
                    // hubPortConflict set count=2; overlay separation offset
                    j.outgoingCount = totalSlots;
                    j.outgoingIndex = outBase + (j.outgoingIndex || 0);
                }
            }
            // Assign out-solo edges (stable sort by peer coord)
            const outSoloCurrent = outSoloEdges.filter(e => currentJobIds.has(e.edgeId));
            outSoloCurrent.sort((a, b) =>
                oppCoordE(a, true) - oppCoordE(b, true) || a.edgeId.localeCompare(b.edgeId));
            outSoloCurrent.forEach((e, i) => {
                const j = jobFor(e.edgeId)!;
                j.outgoingCount = totalSlots;
                j.outgoingIndex = outBase + (outBusEdges.length > 0 ? 1 : 0) + i;
            });

            // Assign in-bus edges
            const inBusCurrent = inBusEdges.filter(e => currentJobIds.has(e.edgeId));
            for (const e of inBusCurrent) {
                const j = jobFor(e.edgeId)!;
                const existing = j.incomingCount || 1;
                if (existing <= 1) {
                    j.incomingCount = totalSlots;
                    j.incomingIndex = inBase;
                } else {
                    j.incomingCount = totalSlots;
                    j.incomingIndex = inBase + (j.incomingIndex || 0);
                }
            }
            // Assign in-solo edges
            const inSoloCurrent = inSoloEdges.filter(e => currentJobIds.has(e.edgeId));
            inSoloCurrent.sort((a, b) =>
                oppCoordE(a, false) - oppCoordE(b, false) || a.edgeId.localeCompare(b.edgeId));
            inSoloCurrent.forEach((e, i) => {
                const j = jobFor(e.edgeId)!;
                j.incomingCount = totalSlots;
                j.incomingIndex = inBase + (inBusEdges.length > 0 ? 1 : 0) + i;
            });
        }

        // Clear bidirectional offsets for separated edges to prevent double-displacement
        for (const job of eligibleJobs) {
            if ((job.outgoingCount && job.outgoingCount > 1) || (job.incomingCount && job.incomingCount > 1)) {
                job.bidirectionalChannel = undefined;
                job.bidirectionalSpacing = undefined;
            }
        }
    }
    private static inferPortSide(
        sRect: Rectangle,
        tRect: Rectangle,
        role: 'source' | 'target'
    ): 'left' | 'right' | 'top' | 'bottom' {
        const sCx = sRect.x + sRect.width / 2;
        const sCy = sRect.y + sRect.height / 2;
        const tCx = tRect.x + tRect.width / 2;
        const tCy = tRect.y + tRect.height / 2;
        const dx = tCx - sCx;
        const dy = tCy - sCy;
        if (Math.abs(dx) >= Math.abs(dy)) {
            return role === 'source'
                ? (dx >= 0 ? 'right' : 'left')
                : (dx >= 0 ? 'left' : 'right');
        } else {
            return role === 'source'
                ? (dy >= 0 ? 'bottom' : 'top')
                : (dy >= 0 ? 'top' : 'bottom');
        }
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
    console.info('[Vizly Dev] Routing debug tools available: window.__vizly_routing__.clearCache()');
}

