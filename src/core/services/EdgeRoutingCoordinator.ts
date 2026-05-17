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
    /** Unified deadzone threshold for side classification (±30px) */
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

    private graphVersion: number = 0;
    // [P0-2] graphVersion 订阅者集合，用于 useSyncExternalStore 响应式订阅
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

    // [COLD-START] 冷启动保护：freeze 期间所有 scheduleBatchRouting 调用被挂起
    // 直到 unfreeze() 被调用，再一次性批量触发，避免节点测量不稳定时 A* 大量无效迭代
    private isFrozen: boolean = false;
    private frozenDuringColdStart: boolean = false;

    /**
     * [COLD-START] 冻结路由调度。
     * 在从缓存加载数据时调用，防止节点尺寸未稳定前触发大量 A* 计算。
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
     * [COLD-START] 解冻路由调度，并立即触发一次批量计算。
     * 在节点测量稳定后（RF measured.width > 0）调用。
     */
    public unfreeze(): void {
        if (!this.isFrozen) return;
        this.isFrozen = false;
        this.frozenDuringColdStart = false;
        // 立即触发一次批量路由（所有积压的请求都在 latestRequests 里）
        if (this.latestRequests.size > 0) {
            this.markAllDirty();
            this.scheduleBatchRouting();
        }
    }

    /** [COLD-START] 将所有已知边标记为脏 */
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
        // [COLD-START] 冻结期间挂起所有调度，等 unfreeze() 统一触发
        if (this.isFrozen) return;

        // [FIX C-1] 标准防抖：每次调用先清除旧计时器再重新设置。
        // [H-10] 拖拽中提升去抖到 60ms，减少 ~75% 的路由触发次数，
        //        释放 Worker pool 给交互响应使用。拖拽结束后恢复 16ms。
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
     * [P0-2] 订阅 graphVersion 变化。
     * 返回取消订阅函数，配合 useSyncExternalStore 使用。
     * 这样 useSmartPathWorker 可以响应式地追踪版本变化，
     * 而不需要把 getGraphVersion() 函数调用放进 deps array。
     */
    public subscribeGraphVersion(callback: () => void): () => void {
        this.graphVersionSubscribers.add(callback);
        return () => this.graphVersionSubscribers.delete(callback);
    }

    /** [P0-2] 通知所有 graphVersion 订阅者 */
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

        // Build dependency map: edge → nodes it depends on
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
            
            if (isNudgeEnabled && results.length > 1) {
                this.applyGlobalNudge(results, group.requests, group.graph);
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
                // permanently unresolved — the component's Promise.then() never fires.
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

                // [FIX] Track Performance — 含策略名称 + 路径质量指标
                this.monitor.track({
                    edgeId: req.edgeId,
                    routingTime: performance.now() - startTime,
                    cacheHit: false,
                    workerTime: result.metadata?.executionTime,
                    strategy: result.metadata?.strategy,       // 传递策略名，供分布图使用
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
                        // [Trunk Vis] 注入 trunkAxis/trunkVertical/peerGroupMembers
                        // 让 VisualizerTab 可以在 Canvas 上绘制主干轴虚线和 Peer Group 包围框
                        const trunkVisualization = trunkData?.trunk ? {
                            trunkAxis: trunkData.trunk.axis,
                            trunkVertical: trunkData.trunk.direction === 'vertical',
                            trunkRange: trunkData.trunk.range,
                        } : {};
                        // 从 jobs 中尝试提取 peerGroup 信息
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
                            // [Trunk Vis] 将 trunk/peer 数据注入 portSelection，让 VisualizerTab 可读取
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
                if (pendingEdges.length >= maxSegments) {
                    return pendingEdges;
                }
            }
        }
        return pendingEdges;
    }

    /**
     * [P0] Perform incremental routing for dirty edges.
     * Called by UI loop or scheduler.
     */
    public async routeIncremental(context: SharedGraphContext): Promise<Map<string, PathFindingResult>> {
        // [FIX C-9] 使用真实的节点变化检测（取代原来的空函数）
        const changedNodeIds = this.identifyChangedNodes(context.nodes as any[], this.allEdges);
        if (changedNodeIds.length > 0) {
            // 将检测到的移动节点标记为 dirty，使外部无需手动调用 markNodesChanged
            this.markNodesChanged(changedNodeIds);
        }

        return this.batchRouteDirtyEdges();
    }


    // [FIX C-9] 节点位置快照，用于增量检测
    private _nodePositionSnapshot = new Map<string, { x: number; y: number }>();

    /**
     * [FIX C-9] 基于位置快照检测显著移动的节点。
     * 与上次路由时的坐标对比，超过阈值（2px）则标记为"已变化"。
     * 同时更新快照以备下次对比。
     */
    private identifyChangedNodes(allNodes: any[], _allEdges: Edge[]): string[] {
        const MOVE_THRESHOLD = 2; // px，小于此值认为是数值噪声
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

        // 清理已删除的节点快照（防内存泄漏）
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
            // [FIX] Assign Bus Indices for Nudge
            this.assignBusIndices(jobs, graph);

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
            // Priority 1: RF Computed Absolute (Fastest)
            if (node.computed?.positionAbsolute) return node.computed.positionAbsolute;
            if (node.positionAbsolute) return node.positionAbsolute;

            // Priority 2: Manual Parent Traversal
            const pId = node.parentId || node.parentNode;
            if (pId && nodeMap.has(pId)) {
                const parent = nodeMap.get(pId);
                const parentAbs = getAbsolutePosition(parent);
                return {
                    x: parentAbs.x + (node.position?.x ?? 0),
                    y: parentAbs.y + (node.position?.y ?? 0)
                };
            }

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

        // [FIX-port-conflict] 收集每个 hub 在 O2M 阶段已使用的端口，
        // 供 M2O 阶段做冲突检测——确保入边和出边不共享同一端口。
        const hubOutPorts = new Map<string, Set<string>>();

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

                // 收集 O2M 已占用的端口
                const usedPorts = new Set<string>();
                busJobs.forEach(j => {
                    const port = (j as any).trunkPort;
                    if (port) usedPorts.add(port);
                });
                if (usedPorts.size > 0) hubOutPorts.set(sourceId, usedPorts);
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
                    hubOutPorts.get(targetId) // 传入该 hub 的 O2M 已占端口
                );
            } else {
                // Fallback for non-bus incoming groups
                groupJobs.sort((a, b) => (a.sourceY || 0) - (b.sourceY || 0));
                groupJobs.forEach((job, index) => {
                    job.incomingIndex = index;
                    job.incomingCount = groupJobs.length;
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

        // Process Horizontal Groups
        horizontalGroups.forEach(group => {
            // Sort by specific Y geometry (Source Y + Target Y)
            group.sort((a, b) => {
                const valA = a.sourceY + a.targetY;
                const valB = b.sourceY + b.targetY;
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
            // Sort by specific X geometry
            group.sort((a, b) => {
                const valA = a.sourceX + a.targetX;
                const valB = b.sourceX + b.targetX;
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
     * 原来只处理 pair.length === 2 的双向对，N>2 的同向平行边全部重叠。
     * 新逻辑：按 (source, target) 分组（无方向），对组内每条边分配独立的 channel index。
     * 
     * 分道策略：
     *   - 2 条边：channel 0 和 1，视觉上向两侧各偏移 spacing/2
     *   - N 条边：channel 0..N-1，均匀分配，视觉上整体居中
     */
    private assignBidirectionalChannels(jobs: PathFindingJob[]): void {
        const defaultConfig = createDefaultRoutingConfig();
        const baseSpacing = defaultConfig.bus.bidirectionalSpacing || 25;

        // 用无方向的 canonical key 分组：key(A,B) === key(B,A)
        const pairMap = new Map<string, PathFindingJob[]>();
        jobs.forEach(job => {
            const k1 = `${job.source}\u0000${job.target}`;
            const k2 = `${job.target}\u0000${job.source}`;
            const key = k1 < k2 ? k1 : k2;
            if (!pairMap.has(key)) pairMap.set(key, []);
            pairMap.get(key)!.push(job);
        });

        pairMap.forEach((group) => {
            if (group.length < 2) return; // 单条边不需要分道

            // 确定性排序：先按方向（source-target 字符串），再按 edgeId
            group.sort((a, b) => {
                const dirA = `${a.source}→${a.target}`;
                const dirB = `${b.source}→${b.target}`;
                const cmp = dirA.localeCompare(dirB);
                return cmp !== 0 ? cmp : a.edgeId.localeCompare(b.edgeId);
            });

            const n = group.length;
            // 硬偏移模式：baseSpacing 已是最终偏移量，按边数收窄
            const spacing = baseSpacing * Math.min(1, 3 / n);

            group.forEach((job, index) => {
                job.bidirectionalChannel = index;
                job.bidirectionalSpacing = spacing;
                // [NEW] 总通道数，供 Worker 居中计算偏移
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
        hubUsedPorts?: Set<string> // [FIX-port-conflict] Ports already occupied by O2M on this hub
    ): void {
        const hubRect = getNodeRect(hubId);
        if (!hubRect) return;

        const hubCenter = { x: hubRect.x + hubRect.width / 2, y: hubRect.y + hubRect.height / 2 };

        // ==================== [FIX-hemisphere] Flow-Direction Hemisphere Grouping ====================
        // 行业标准（ELK/draw.io）：先算质心确定主流方向，再沿主流方向分成 2 个 180° 半球。
        // 这样自然合并相邻象限（如"左上"和"左下"都归入同一半球）。
        // 对于强烈偏离主流的边（交叉轴 > 2× 主轴），单独分到垂直端口（"逃逸"）。
        //
        // 示例（主流=下方）：
        //   正下方的 peer → bottom 半球 ✓
        //   左下方的 peer → bottom 半球 ✓（邻近象限自然合并）
        //   纯右方的 peer → right 逃逸端口（交叉轴远大于主轴）

        // Step 1: 计算 peer 质心，确定主流方向
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

        // Fallback: 如果没有有效 peer，直接返回
        if (validCount === 0) return;
        centroidX /= validCount;
        centroidY /= validCount;

        const flowDx = centroidX - hubCenter.x;
        const flowDy = centroidY - hubCenter.y;
        // 主流方向：质心偏移更大的轴
        const isVerticalFlow = Math.abs(flowDy) >= Math.abs(flowDx);

        // Step 2: 按半球 + 垂直逃逸分组
        const sideGroups = new Map<string, any[]>();

        globalPeers.forEach(peerEdge => {
            const peerId = isManyToOne ? peerEdge.source : peerEdge.target;
            const peerRect = getNodeRect(peerId);
            if (!peerRect) return;

            const peerCenter = { x: peerRect.x + peerRect.width / 2, y: peerRect.y + peerRect.height / 2 };
            const dx = peerCenter.x - hubCenter.x;
            const dy = peerCenter.y - hubCenter.y;

            let side: string;
            if (isVerticalFlow) {
                // 主流=上下 → 默认按 y 分半球
                // 逃逸：如果 |dx| > 2*|dy| 且 |dx| > 50px，说明 peer 强烈偏向左右
                if (Math.abs(dx) > Math.abs(dy) * 2 && Math.abs(dx) > 50) {
                    side = dx < 0 ? 'left' : 'right';
                } else {
                    side = dy < 0 ? 'top' : 'bottom';
                }
            } else {
                // 主流=左右 → 默认按 x 分半球
                // 逃逸：如果 |dy| > 2*|dx| 且 |dy| > 50px
                if (Math.abs(dy) > Math.abs(dx) * 2 && Math.abs(dy) > 50) {
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

        // 逐半球组计算主干线
        sideGroups.forEach((groupEdges, _side) => {
            if (groupEdges.length === 0) return;

            // 单条边的组：降级为普通 A* 路由（只在有多个组时）
            if (groupEdges.length === 1 && sideGroups.size > 1) {
                const job = busGroupJobs.find(j => j.edgeId === groupEdges[0].id);
                if (job) {
                    if (isManyToOne) {
                        job.isManyToOne = false;
                        job.incomingCount = 1;
                        job.incomingIndex = 0;
                    } else {
                        job.isOneToMany = false;
                        job.outgoingCount = 1;
                        job.outgoingIndex = 0;
                    }
                }
                return;
            }

            // 计算该象限的 peer 节点矩形列表
            const subPeers = groupEdges.map(e =>
                getNodeRect(isManyToOne ? e.source : e.target)
            ).filter((r): r is Rectangle => !!r);

            // 直接调用 calculateTreeTrunk — 每个象限的 peer 天然在同侧，
            // 不需要双干线并行间距（calculateParallelTrunks 的 forward/backward 拆分）
            const trunk = trunkCalculator.calculateTreeTrunk(
                hubRect,
                subPeers,
                isManyToOne,
                defaultConfig,
                layoutDir,
                undefined, // 让 calculateTreeTrunk 自行计算质心
                obstacles
            );

            // [FIX-port-spread] 同侧端口扩展（Port Spreading）
            // 当 M2O 和 O2M 共享同一端口侧时，不翻转也不偏移 trunk axis，
            // 而是通过 hubPortSlot 告诉 Worker 在该侧使用不同的连接点位置。
            // O2M slot=0 (偏左/偏上), M2O slot=1 (偏右/偏下)。
            const hasPortConflict = isManyToOne && hubUsedPorts && hubUsedPorts.has(trunk.suggestedPort);

            // [FIX-dual-lane] 对侧走廊分离（Opposite-Side Corridor Separation）
            //
            // 问题：当 O2M 和 M2O 共享同一端口侧时，两者的 A* 分支路径
            // 都被迫绕过同一组障碍物到达同一侧走廊（如 x≈1571），导致交织。
            //
            // 行业做法（ELK Channel Routing）：
            // O2M 和 M2O 使用不同侧的走廊。O2M 走障碍物右侧，M2O 走左侧。
            //
            // 实现：把 M2O 的 trunk axis 镜像到 hub 的对侧，
            // 这样 M2O 的分支从一开始就走左侧（或上方）走廊。
            //
            //   Left corridor ←  Hub  → Right corridor
            //        M2O ────┤  ├──── O2M
            //                │  │
            //              peers...
            if (hasPortConflict) {
                if (trunk.direction === 'vertical') {
                    // O2M trunk 在 hub 右侧 (axis > hubCenter.x) → M2O 镜像到左侧
                    // O2M trunk 在 hub 左侧 (axis < hubCenter.x) → M2O 镜像到右侧
                    const hubCenterX = hubRect.x + hubRect.width / 2;
                    const o2mOffset = trunk.axis - hubCenterX; // 正=右, 负=左
                    trunk.axis = hubCenterX - o2mOffset; // 镜像到对面
                } else {
                    const hubCenterY = hubRect.y + hubRect.height / 2;
                    const o2mOffset = trunk.axis - hubCenterY;
                    trunk.axis = hubCenterY - o2mOffset;
                }
            }

            this.assignTrunkGeometry(groupEdges, busGroupJobs, trunk, layoutDir, getNodeRect, isManyToOne, hasPortConflict);
        });
    }

    private assignTrunkGeometry(
        edges: any[],
        busGroupJobs: PathFindingJob[],
        trunk: { axis: number; direction: 'horizontal' | 'vertical'; range: { min: number; max: number }; suggestedPort: 'top' | 'bottom' | 'left' | 'right' },
        layoutDir: string,
        getNodeRect: (id: string) => Rectangle | undefined,
        isManyToOne: boolean,
        hubPortConflict: boolean = false  // [FIX-port-spread] 是否与另一方向共享端口
    ): void {
        // [FIX] Removed dirtyEdges.add + scheduleBatchRouting that caused infinite recursion:
        // assignTrunkGeometry is called FROM batchRouteDirtyEdges, so marking edges dirty here
        // triggers another batchRouteDirtyEdges → infinite cascade.

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

        // Pre-sort peers ONCE outside the loop (O(NlogN) instead of O(N²logN))
        const sortedGlobal = [...edges].sort((a: any, b: any) => {
            const rectA = getNodeRect(isManyToOne ? a.source : a.target);
            const rectB = getNodeRect(isManyToOne ? b.source : b.target);

            const valA = trunk.direction === 'horizontal' ? (rectA?.x || 0) : (rectA?.y || 0);
            const valB = trunk.direction === 'horizontal' ? (rectB?.x || 0) : (rectB?.y || 0);
            const diff = valA - valB;
            if (Math.abs(diff) > 1.0) return diff;

            const secA = trunk.direction === 'horizontal' ? (rectA?.y || 0) : (rectA?.x || 0);
            const secB = trunk.direction === 'horizontal' ? (rectB?.y || 0) : (rectB?.x || 0);
            const diffSec = secA - secB;
            if (Math.abs(diffSec) > 1.0) return diffSec;

            return (a.id || '').localeCompare(b.id || '');
        });

        edges.forEach((edge: any) => {
            const job = busGroupJobs.find(j => j.edgeId === edge.id);
            if (!job) return;

            const index = sortedGlobal.findIndex((e: any) => e.id === job.edgeId);
            (job as any).busIndex = index; // Store branching order for trunk calculation

            if (isManyToOne) {
                // Hub is Target. Multiple sources merge into one target port.
                // [FIX-port-spread] 如果与 O2M 共享端口，用 slot=1 (偏右/偏下)
                // O2M 已占 slot=0，M2O 用 slot=1，两者在同一侧但位置错开
                job.incomingCount = hubPortConflict ? 2 : 1;
                job.incomingIndex = hubPortConflict ? 1 : 0;
                // Peer side (Source)
                job.outgoingCount = 1;
                job.outgoingIndex = 0;
            } else {
                // Hub is Source. One source splits into multiple target ports.
                // [FIX-port-spread] O2M 始终占 slot=0（偏左/偏上），保持不变
                job.outgoingCount = 1;
                job.outgoingIndex = 0;
                // Peer side (Target)
                job.incomingCount = 1; 
                job.incomingIndex = 0;
            }

            // Assign Trunk Coordinates
            if (trunk.direction === 'vertical') {
                job.busTrunkSource = { x: trunk.axis, y: trunk.range.min };
                job.busTrunkTarget = { x: trunk.axis, y: trunk.range.max };
            } else {
                job.busTrunkSource = { x: trunk.range.min, y: trunk.axis };
                job.busTrunkTarget = { x: trunk.range.max, y: trunk.axis };
            }

            // [Trunk Vis] 注入 peerGroup 信息，供调试面板的 Canvas 可视化
            (job as any).peerGroupMembers = edges.map((e: any) => e.id);
            // [FIX] hubId 在 assignTrunkGeometry 作用域内不可用，改用可推导的 hub 节点 ID
            const peerGroupKey = isManyToOne
                ? (edge.target as string)   // M2O: hub 是公共 target
                : (edge.source as string);  // O2M: hub 是公共 source
            (job as any).peerGroupKey = peerGroupKey;
            (job as any).peerGroupSize = edges.length;
            (job as any).trunkPort = trunk.suggestedPort; // Pass suggested port direction

            // [S4] Port 注入已移至 Worker 内部（几何推算）。
            // Coordinator 仅传递 busTrunkSource/busTrunkTarget 几何元数据，
            // 端口方向由 Worker 的 L263-305 几何逻辑自主决定，消除双层决策冲突。

            job.layoutDirection = layoutDir;
        });
    }

    /**
     * [SharedTrunk] Public accessor — returns the latest shared trunk segments.
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
     *  2. Build ONE shared trunk path covering the full span (min_branch_x → hub).
     *  3. Trim each edge's path to the branch-only portion (source → junction).
     *
     * Visual result:
     *  Before: N overlapping SVG paths each drawing source → trunk → hub
     *  After : N branch-only paths (source → junction) + 1 shared trunk path (junction → hub)
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
    private applyGlobalNudge(results: (PathFindingResult | null)[], requests: RoutingRequest[], graph: SharedGraphContext): void {

        const config = graph.config;
        const validResults = results.filter((r): r is PathFindingResult => r !== null && !r.error && !!r.points && r.points.length > 0);
        if (validResults.length <= 1) return;

        // [UPGRADE] Include ALL edges in overlap detection, but bus/trunk edges from the
        // same group are treated as "buddies" — they intentionally share trunk segments
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
        for (const r of validResults) {
            edgePaths.set(r.edgeId, cleanPath(r.points));
        }

        // Step 3: Build buddy groups — bus/trunk edges sharing same source (O2M) or target (M2O)
        // O2M buddy group: protect first segment (shared source trunk)
        // M2O buddy group: protect last segment (shared target trunk)
        const buddyGroupMap = new Map<string, { edgeIds: Set<string>; type: 'o2m' | 'm2o' }>(); // groupKey → group info
        for (const req of requests) {
            const job = req.job as any;
            if (job.isOneToMany) {
                const key = `o2m:${job.source}`;
                if (!buddyGroupMap.has(key)) buddyGroupMap.set(key, { edgeIds: new Set(), type: 'o2m' });
                buddyGroupMap.get(key)!.edgeIds.add(req.edgeId);
            }
            if (job.isManyToOne) {
                const key = `m2o:${job.target}`;
                if (!buddyGroupMap.has(key)) buddyGroupMap.set(key, { edgeIds: new Set(), type: 'm2o' });
                buddyGroupMap.get(key)!.edgeIds.add(req.edgeId);
            }
        }
        // Only keep groups with 2+ members
        const buddyGroups = [...buddyGroupMap.values()].filter(g => g.edgeIds.size >= 2);



        try {
            // Use globalChannelRouting with position-aware buddy groups.
            // O2M buddies protect first segment only, M2O protect last segment only.
            // Mid-segments of buddy edges still participate in normal channel routing.
            const spacing = config?.postProcessing?.nudgeSpacing ?? 12;
            const nudgedPaths = globalChannelRouting(edgePaths, spacing, buddyGroups);

            // Step 3: Apply back to results
            for (const r of validResults) {
                const newPoints = nudgedPaths.get(r.edgeId);
                if (!newPoints || newPoints.length < 2) continue;

                // Check if path actually changed
                const changed = newPoints.some((p, i) => {
                    const orig = r.points[i];
                    return !orig || Math.abs(p.x - orig.x) > 0.5 || Math.abs(p.y - orig.y) > 0.5;
                });
                if (!changed) continue;

                r.points = newPoints;

                // [FIX C-5] Use canonical createFilletedPath instead of hand-rolled Q-bezier.
                // This ensures nudged paths go through micro-jog elimination, collinear collapse,
                // and consistent A-arc rendering — matching all other edge rendering paths.
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

    /**
     * [DEV] 强制清空所有路由缓存并递增 graphVersion，让所有边重新计算路径。
     * 用于修改了路由算法后无需重启即可验证效果。
     */
    public clearAllCaches(): void {
        this.graphVersion++;
        this.notifyGraphVersionSubscribers();
        this.cache.clear();
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
        EdgeRoutingCoordinator.instance = null;
    }
}

// [DEV] 在 window 上挂载调试工具，开发模式下可在控制台直接调用
if (typeof window !== 'undefined' && import.meta.env.DEV) {
    (window as any).__vizly_routing__ = {
        /** 清空所有路由缓存，强制下一次渲染重新计算所有连线路径 */
        clearCache: () => EdgeRoutingCoordinator.getInstance().clearAllCaches(),
        /** 获取 Coordinator 实例 */
        coordinator: () => EdgeRoutingCoordinator.getInstance(),
    };
    console.info('[Vizly Dev] Routing debug tools available: window.__vizly_routing__.clearCache()');
}


