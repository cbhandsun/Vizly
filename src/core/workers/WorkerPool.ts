/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Worker 池管理器 (性能优化)
 * 
 * 目的：
 * - 并行处理多条边的路径计算
 * - 相比单一 Worker 可获得 2-4x 加速
 * 
 * 使用方式：
 * ```typescript
 * const pool = WorkerPool.getInstance();
 * const result = await pool.calculatePath(data);
 * ```
 */

// [NEW] Imports
import { PathFindingJob, PathFindingResult, PathFindingRequest, SharedGraphContext } from '../types/routing';
import PathfindingWorker from './pathfinding.worker?worker&inline';
import { serializeObstacles } from './core/BinarySerializer';

// [NEW] Interfaces
interface PendingRequest {
    jobId: string;
    request: PathFindingRequest;
    resolve: (result: PathFindingResult) => void;
    reject: (err: unknown) => void;
    graphKey: string;
}


interface WorkerJob {
    // For Batch: resolve/reject map needed? No, the worker just has "jobs".
    // Actually, a WorkerJob represents a Batch Job now.
    batchId: string;
    subJobs: Map<string, PendingRequest>; // Map<subJobId, PendingRequest>
    timestamp: number;
}

interface PoolWorker {
    worker: Worker;
    busy: boolean;
    jobs: Map<string, WorkerJob>;
}

/**
 * Worker 池管理器
 * 支持并行处理多个路径计算任务
 */
class WorkerPool {
    private static instance: WorkerPool;
    private workers: PoolWorker[] = [];

    private pendingRequestBuffers: Map<string, PendingRequest[]> = new Map();
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly BATCH_WINDOW_MS = 16; // 1 frame
    private readonly MAX_BATCH_SIZE = 100; // Cap to prevent blocking worker too long

    private poolSize: number;
    private initialized = false;
    private jobTimeout = 30000; // Increased for batch
    // Incremental version for cache invalidation
    private graphVersion: number = 0;
    // Simple cache of results keyed by input data and version
    private resultCache: Map<string, PathFindingResult> = new Map();
    private cacheHits = 0;
    private cacheMisses = 0;

    // [P2-2] Dynamic Worker Pool Configuration
    private readonly MAX_WORKERS: number;
    private readonly MIN_WORKERS = 1;
    private readonly TASKS_PER_WORKER = 50; // Each worker ideally handles 50 tasks
    private graphKeyMap = new WeakMap<SharedGraphContext, string>();
    private graphKeySeed = 0;


    private constructor(poolSize?: number) {
        // [P2-2] 根据 CPU 核心数确定最大池大小
        const cpuCores = navigator.hardwareConcurrency || 4;
        this.MAX_WORKERS = Math.min(8, cpuCores); // Cap at 8 to prevent excessive memory usage

        // Initial pool size: conservative start
        this.poolSize = poolSize ?? Math.min(4, Math.max(2, Math.floor(cpuCores / 2)));
    }


    public static getInstance(poolSize?: number): WorkerPool {
        if (!WorkerPool.instance) {
            WorkerPool.instance = new WorkerPool(poolSize);
        }
        return WorkerPool.instance;
    }

    /**
     * 初始化 Worker 池
     */
    private initPool(): void {
        if (this.initialized) return;

        try {
            //            for (let i = 0; i < this.poolSize; i++) {
                const worker = new PathfindingWorker();
                const poolWorker: PoolWorker = {
                    worker,
                    busy: false,
                    jobs: new Map()
                };

                worker.onmessage = (e: MessageEvent) => {
                    // [NEW] Handle Batch Result
                    const data = e.data as {
                        batchId?: string;
                        results?: Array<{ jobId?: string; result?: PathFindingResult; error?: string }>;
                        error?: string;
                        jobId?: string;
                        path?: unknown;
                        result?: PathFindingResult;
                    };
                    const { batchId, results, error } = data;

                    if (batchId && poolWorker.jobs.has(batchId)) {
                        const batchJob = poolWorker.jobs.get(batchId);
                        if (!batchJob) return;

                        if (error) {
                            // Batch failed
                            for (const sub of batchJob.subJobs.values()) {
                                sub.reject(new Error(error));
                            }
                        } else if (results && Array.isArray(results)) {
                            // Success
                            results.forEach((res) => {
                                const jobId = res.jobId;
                                if (!jobId) return;
                                const sub = batchJob.subJobs.get(jobId);
                                if (sub) {
                                    if (res.error) sub.reject(new Error(res.error));
                                    else if (res.result) sub.resolve(res.result);
                                    else sub.reject(new Error('Worker returned empty result'));
                                    batchJob.subJobs.delete(jobId);
                                }
                            });
                            // Reject any that weren't returned (shouldn't happen)
                            for (const sub of batchJob.subJobs.values()) {
                                sub.reject(new Error("Worker dropped job"));
                            }
                        }

                        poolWorker.jobs.delete(batchId);
                    }
                    else if (data.jobId && poolWorker.jobs.has(data.jobId)) {
                        // [LEGACY] Single Job Handling (mapped to Batch-of-1)
                        const legacyJobId = data.jobId;
                        const job = poolWorker.jobs.get(legacyJobId);
                        if (!job) return;
                        const sub = job.subJobs.get(legacyJobId);

                        if (sub) {
                            if (data.error) sub.reject(new Error(data.error));
                            else if (data.path) sub.resolve(data as PathFindingResult);
                            else if (data.result) sub.resolve(data.result);
                            else sub.reject(new Error('Worker returned empty result'));
                        }
                        poolWorker.jobs.delete(legacyJobId);
                    }

                    // 标记为非繁忙并处理队列
                    poolWorker.busy = false;
                    this.processQueue(); // Keep checking buffer
                };

                worker.onerror = (err) => {
                    console.error(`Worker [initPool] error:`, err);
                    // 拒绝所有待处理的任务
                    for (const job of poolWorker.jobs.values()) {
                        for (const sub of job.subJobs.values()) {
                            sub.reject(err);
                        }
                    }
                    poolWorker.jobs.clear();
                    poolWorker.busy = false;
                    this.processQueue();
                };

                this.workers.push(poolWorker);

            this.initialized = true;
        } catch (e) {
            console.error('Failed to initialize worker pool:', e);
        }
    }

    /**
     * [P2-2] Calculate optimal worker count based on workload
     */
    private calculateOptimalWorkerCount(taskCount: number): number {
        if (taskCount === 0) return this.MIN_WORKERS;

        // Ideal: taskCount / TASKS_PER_WORKER workers
        const idealWorkerCount = Math.ceil(taskCount / this.TASKS_PER_WORKER);

        // Constrain to [MIN_WORKERS, MAX_WORKERS]
        return Math.max(
            this.MIN_WORKERS,
            Math.min(this.MAX_WORKERS, idealWorkerCount)
        );
    }

    private getGraphKey(graph: SharedGraphContext): string {
        const existing = this.graphKeyMap.get(graph);
        if (existing) return existing;
        const key = `g${++this.graphKeySeed}`;
        this.graphKeyMap.set(graph, key);
        return key;
    }

    private getPendingCount(): number {
        let total = 0;
        for (const buffer of this.pendingRequestBuffers.values()) {
            total += buffer.length;
        }
        return total;
    }

    /**
     * [P2-2] Ensure worker pool size matches requirement
     * Dynamically expand or shrink the pool
     */
    private ensureWorkerPool(requiredCount: number): void {
        // Expand pool if needed
        while (this.workers.length < requiredCount) {
            const workerIndex = this.workers.length;
            const worker = new PathfindingWorker();
            const poolWorker: PoolWorker = {
                worker,
                busy: false,
                jobs: new Map()
            };

            // Setup handlers (same as initPool)
            worker.onmessage = (e: MessageEvent) => {
                const data = e.data as {
                    batchId?: string;
                    results?: Array<{ jobId?: string; result?: PathFindingResult; error?: string }>;
                    error?: string;
                    jobId?: string;
                    path?: unknown;
                    result?: PathFindingResult;
                };
                const { batchId, results, error } = data;

                if (batchId && poolWorker.jobs.has(batchId)) {
                    const batchJob = poolWorker.jobs.get(batchId);
                    if (!batchJob) return;

                    if (error) {
                        for (const sub of batchJob.subJobs.values()) {
                            sub.reject(new Error(error));
                        }
                    } else if (results && Array.isArray(results)) {
                        results.forEach((res) => {
                            const jobId = res.jobId;
                            if (!jobId) return;
                            const sub = batchJob.subJobs.get(jobId);
                            if (sub) {
                                if (res.error) sub.reject(new Error(res.error));
                                else if (res.result) sub.resolve(res.result);
                                else sub.reject(new Error('Worker returned empty result'));
                                batchJob.subJobs.delete(jobId);
                            }
                        });
                        for (const sub of batchJob.subJobs.values()) {
                            sub.reject(new Error("Worker dropped job"));
                        }
                    }

                    poolWorker.jobs.delete(batchId);
                }
                else if (data.jobId && poolWorker.jobs.has(data.jobId)) {
                    const legacyJobId = data.jobId;
                    const job = poolWorker.jobs.get(legacyJobId);
                    if (!job) return;
                    const sub = job.subJobs.get(legacyJobId);

                    if (sub) {
                        if (data.error) sub.reject(new Error(data.error));
                        else if (data.path) sub.resolve(data as PathFindingResult);
                        else if (data.result) sub.resolve(data.result);
                        else sub.reject(new Error('Worker returned empty result'));
                    }
                    poolWorker.jobs.delete(legacyJobId);
                }

                poolWorker.busy = false;
                this.processQueue();
            };

            worker.onerror = (err) => {
                console.error(`Worker ${workerIndex} error:`, err);
                for (const job of poolWorker.jobs.values()) {
                    for (const sub of job.subJobs.values()) {
                        sub.reject(err);
                    }
                }
                poolWorker.jobs.clear();
                poolWorker.busy = false;
                this.processQueue();
            };

            this.workers.push(poolWorker);
        }

        // Shrink pool if over-provisioned (but keep at least MIN_WORKERS)
        // Only terminate idle workers to avoid disrupting active jobs
        while (this.workers.length > requiredCount && this.workers.length > this.MIN_WORKERS) {
            const idleWorkerIndex = this.workers.findIndex(w => !w.busy && w.jobs.size === 0);

            if (idleWorkerIndex === -1) break; // No idle workers, stop shrinking

            const removedWorker = this.workers.splice(idleWorkerIndex, 1)[0];
            removedWorker.worker.terminate();
        }

        // Update poolSize to reflect actual count
        this.poolSize = this.workers.length;
    }


    /**
     * 获取空闲 Worker
     */
    private getIdleWorker(): PoolWorker | null {
        return this.workers.find(w => !w.busy) || null;
    }

    /**
     * 处理队列中的任务 (Flush Buffer)
     */
    private processQueue(): void {
        if (this.pendingRequestBuffers.size === 0) return;

        const totalPending = this.getPendingCount();
        if (totalPending === 0) return;

        const optimalWorkerCount = this.calculateOptimalWorkerCount(totalPending);

        if (this.initialized && optimalWorkerCount !== this.workers.length) {
            this.ensureWorkerPool(optimalWorkerCount);
        }

        for (let idleWorker = this.getIdleWorker(); idleWorker; idleWorker = this.getIdleWorker()) {
            if (this.pendingRequestBuffers.size === 0) return;

            let selectedKey: string | null = null;
            let selectedBuffer: PendingRequest[] | null = null;
            for (const [key, buffer] of this.pendingRequestBuffers.entries()) {
                if (!selectedBuffer || buffer.length > selectedBuffer.length) {
                    selectedKey = key;
                    selectedBuffer = buffer;
                }
            }

            if (!selectedBuffer || !selectedKey || selectedBuffer.length === 0) return;

            const batchSize = Math.min(selectedBuffer.length, this.MAX_BATCH_SIZE);
            const batchTasks = selectedBuffer.splice(0, batchSize);

            if (selectedBuffer.length === 0) {
                this.pendingRequestBuffers.delete(selectedKey);
            }

            if (batchTasks.length === 0) return;

            this.executeBatchOnWorker(idleWorker, batchTasks);
        }
    }



    /**
     * [P2-3] Execute Batch on Worker with separate Graph Context
     */
    private executeBatchOnWorker(
        poolWorker: PoolWorker,
        tasks: PendingRequest[]
    ) {
        const batchId = Math.random().toString(36).slice(2, 11);
        const subJobs = new Map<string, PendingRequest>();
        tasks.forEach(t => subJobs.set(t.jobId, t));

        poolWorker.busy = true;
        poolWorker.jobs.set(batchId, {
            batchId,
            subJobs,
            timestamp: Date.now()
        });

        // Use the graph context from the first task (all tasks in a batch share common graph)
        const refRequest = tasks[0].request;

        // Map requests to simple jobs
        const taskJobs: PathFindingJob[] = tasks.map(t => ({
            ...t.request.job,
            jobId: t.jobId
        }));

        poolWorker.worker.postMessage({
            mode: 'batch',
            jobId: batchId,
            context: { ...refRequest.graph, graphVersion: this.graphVersion },
            tasks: taskJobs
        });

        // Timeout
        setTimeout(() => {
            if (poolWorker.jobs.has(batchId)) {
                const job = poolWorker.jobs.get(batchId);
                if (job) {
                    for (const sub of job.subJobs.values()) {
                        sub.reject(new Error("Worker timeout"));
                    }
                }
                poolWorker.jobs.delete(batchId);
                poolWorker.busy = false; // Reset
                this.processQueue();
            }
        }, this.jobTimeout);
    }


    /**
     * 在指定 Worker 上执行任务 (Legacy / Single Mode Wrapper)
     */
    private executeOnWorker(
        poolWorker: PoolWorker,
        request: PathFindingRequest,
        resolve: (r: PathFindingResult) => void,
        reject: (e: unknown) => void
    ): void {
        const jobId = Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
        const graphKey = this.getGraphKey(request.graph);

        const subJobs = new Map<string, PendingRequest>();
        subJobs.set(jobId, {
            jobId,
            request,
            resolve,
            reject,
            graphKey
        });

        poolWorker.busy = true;
        poolWorker.jobs.set(jobId, {
            batchId: jobId, // Use jobId as batchId
            subJobs,
            timestamp: Date.now()
        });

        // [Phase 6] Zero-Copy Optimization: specific support for binary obstacles
        const useZeroCopy = true; // Feature flag
        const transferList: Transferable[] = [];

        if (useZeroCopy && request.graph.obstacles && Array.isArray(request.graph.obstacles)) {
            // Convert obstacles to Float32Array
            const obstaclesBuffer = serializeObstacles(request.graph.obstacles);

            // Replace the object array with the buffer in the message
            // We need to clone the context shallowly to avoid mutating the shared state
            const serializedGraph = {
                ...request.graph,
                obstacles: obstaclesBuffer
            };

            transferList.push(obstaclesBuffer.buffer);

            poolWorker.worker.postMessage({
                ...serializedGraph, // Spread modified graph
                ...request.job,
                jobId
            }, transferList);
        } else {
            // standard structured clone
            poolWorker.worker.postMessage({
                ...request.graph,
                ...request.job,
                jobId
            });
        }


        // 设置超时
        setTimeout(() => {
            if (poolWorker.jobs.has(jobId)) {
                const job = poolWorker.jobs.get(jobId);
                if (job) {
                    for (const sub of job.subJobs.values()) {
                        sub.reject(new Error('Worker timeout'));
                    }
                }
                poolWorker.jobs.delete(jobId);
                poolWorker.busy = false;
                this.processQueue();
            }
        }, this.jobTimeout);
    }

    /**
     * 计算路径 (Public API)
     * [P2-3] Refactored to separate Edge Job and Graph Context
     */
    public calculatePath(
        job: PathFindingJob,
        graph: SharedGraphContext,
        dirty: boolean = true
    ): Promise<PathFindingResult> {
        return new Promise((resolve, reject) => {
            // Check cache if not dirty
            // Cache by job data + graph state identifier (version)
            if (!dirty) {
                const cacheKey = JSON.stringify({ job, version: this.graphVersion });
                const cached = this.resultCache.get(cacheKey);
                if (cached) {
                    this.cacheHits++;
                    resolve(cached);
                    return;
                }
            }
            this.cacheMisses++;

            if (!this.initialized) {
                this.initPool();
            }

            if (!this.initialized) {
                reject(new Error('Worker pool not available'));
                return;
            }

            // Wrap resolve to cache result
            const cachedResolve = (result: PathFindingResult) => {
                const cacheKey = JSON.stringify({ job, version: this.graphVersion });
                this.resultCache.set(cacheKey, result);
                resolve(result);
            };

            const graphKey = this.getGraphKey(graph);
            const jobId = job.jobId || Math.random().toString(36).slice(2, 11);
            const buffer = this.pendingRequestBuffers.get(graphKey) ?? [];
            buffer.push({
                jobId,
                request: { job, graph },
                resolve: cachedResolve,
                reject,
                graphKey
            });
            this.pendingRequestBuffers.set(graphKey, buffer);

            if (!this.flushTimer) {
                this.flushTimer = setTimeout(() => {
                    this.flushTimer = null;
                    this.processQueue();
                }, this.BATCH_WINDOW_MS);
            }

            if (buffer.length >= this.MAX_BATCH_SIZE) {
                if (this.flushTimer) {
                    clearTimeout(this.flushTimer);
                    this.flushTimer = null;
                }
                this.processQueue();
            }
        });
    }

    /**
     * 批量计算路径
     * @param jobs 待运行的任务列表
     * @param graph 共享的图上下文（所有任务共享同一个图快照）
     */
    public async calculatePaths(
        jobs: PathFindingJob[],
        graph: SharedGraphContext
    ): Promise<PathFindingResult[]> {
        return Promise.all(jobs.map(job => this.calculatePath(job, graph)));
    }


    /**
     * 获取池状态
     */
    public getStats(): { poolSize: number; busyCount: number; queueLength: number; cacheHits: number; cacheMisses: number } {
        return {
            poolSize: this.workers.length,
            busyCount: this.workers.filter(w => w.busy).length,
            queueLength: this.getPendingCount(),
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
        };
    }

    /**
     * Mark the graph as dirty, incrementing the version to invalidate cache.
     */
    public markDirty(): void {
        this.graphVersion++;
        this.resultCache.clear();
    }

    /**
     * 终止所有 Worker
     */
    public terminate(): void {
        for (const poolWorker of this.workers) {
            // 拒绝所有待处理任务
            for (const job of poolWorker.jobs.values()) {
                for (const sub of job.subJobs.values()) {
                    sub.reject(new Error('Pool terminated'));
                }
            }
            poolWorker.jobs.clear();
            poolWorker.worker.terminate();
        }
        this.workers = [];
        this.pendingRequestBuffers.clear();
        if (this.flushTimer) clearTimeout(this.flushTimer);
        this.initialized = false;
        WorkerPool.instance = null as unknown as WorkerPool;
    }
}

export default WorkerPool;
