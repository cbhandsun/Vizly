/**
 * Pathfinding Worker Pool
 * 
 * Manages a pool of Web Workers for parallel edge routing.
 * Uses event-driven worker acquisition (no polling/busy-wait).
 */

import type { PathFindingJob, PathFindingResult, SharedGraphContext } from '../types/routing';
import PathfindingWorker from './pathfinding.worker?worker&inline';
import {
    logPathfindingWorkerBatchTimeout,
    logPathfindingWorkerCreateError,
    logPathfindingWorkerExecutionError,
    logPathfindingWorkerPostMessageError,
    logPathfindingWorkerStartupError,
} from '../utils/routingLogging';

export interface WorkerTask {
    job: PathFindingJob;
    graph: SharedGraphContext;
    priority: number;
}

export interface PoolStats {
    poolSize: number;
    activeWorkers: number;
    queuedTasks: number;
    completedTasks: number;
    averageTaskTime: number;
}

interface WrappedPathFindingResult {
    result: PathFindingResult;
    jobId?: string;
}

type PathFindingBatchItem = PathFindingResult | WrappedPathFindingResult;

const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

// Global counter for uniqueness
let fileIdCounter = 0;
const WORKER_TASK_TIMEOUT_MS = 10000;

const hasFiniteEndpoint = (job: PathFindingJob): boolean =>
    Number.isFinite(job.sourceX) &&
    Number.isFinite(job.sourceY) &&
    Number.isFinite(job.targetX) &&
    Number.isFinite(job.targetY);

const createFallbackResult = (job: PathFindingJob, error?: string): PathFindingResult => {
    const sourceX = Number.isFinite(job.sourceX) ? job.sourceX : 0;
    const sourceY = Number.isFinite(job.sourceY) ? job.sourceY : 0;
    const targetX = Number.isFinite(job.targetX) ? job.targetX : sourceX;
    const targetY = Number.isFinite(job.targetY) ? job.targetY : sourceY;

    return {
        jobId: job.jobId,
        edgeId: job.edgeId,
        path: `M ${sourceX},${sourceY} L ${targetX},${targetY}`,
        points: [
            { x: sourceX, y: sourceY },
            { x: targetX, y: targetY },
        ],
        labelX: (sourceX + targetX) / 2,
        labelY: (sourceY + targetY) / 2,
        error,
    };
};

export class PathfindingWorkerPool {
    private workers: Worker[] = [];
    private availableWorkers: Set<number> = new Set();
    private taskQueue: WorkerTask[] = [];
    private activeTasks: Map<number, WorkerTask> = new Map();
    private completedTasks: number = 0;
    private totalTaskTime: number = 0;
    private readonly maxPoolSize: number;

    // [H-8] Priority-aware waiter queue — entries with lower priority number are served first
    private workerWaiters: Array<{ resolve: (workerIndex: number) => void; reject: (err: Error) => void; priority: number }> = [];

    constructor(poolSize?: number) {
        const cpuCores = (navigator.hardwareConcurrency || 4);
        this.maxPoolSize = poolSize || Math.min(6, Math.max(2, Math.ceil(cpuCores / 2)));
    }

    private initialized = false;

    private initializePool(targetSize = 1): void {
        const desiredSize = Math.max(1, Math.min(this.maxPoolSize, targetSize));
        if (this.workers.length >= desiredSize) {
            this.initialized = this.workers.length > 0;
            return;
        }

        for (let i = this.workers.length; i < desiredSize; i++) {
            try {
                const worker = new PathfindingWorker();
                // [FIX] Catch startup crashes. If worker dies on load, it won't trigger later event listeners.
                worker.addEventListener('error', (e: ErrorEvent) => {
                    logPathfindingWorkerStartupError(i, {
                        message: e.message,
                        filename: e.filename,
                        lineno: e.lineno,
                    });
                });
                this.workers.push(worker);
                this.availableWorkers.add(i);
            } catch (error) {
                logPathfindingWorkerCreateError(i, error);
            }
        }

        this.initialized = true;
    }

    private ensurePoolSizeForJobs(jobCount: number): void {
        this.initializePool(this.getDesiredWorkerCount(jobCount));
    }

    private getDesiredWorkerCount(jobCount: number): number {
        if (jobCount <= 0) return 1;
        if (jobCount <= 30) return Math.min(2, this.maxPoolSize);
        if (jobCount <= 80) return Math.min(3, this.maxPoolSize);
        return this.maxPoolSize;
    }

    /**
     * [P1.1] Acquire a worker index, waiting if none available.
     * Uses a promise queue instead of setTimeout polling.
     */
    private acquireWorker(): Promise<number> {
        this.initializePool(1);
        // Fast path: worker immediately available
        if (this.availableWorkers.size > 0) {
            const workerIndex = this.availableWorkers.values().next().value!;
            this.availableWorkers.delete(workerIndex);
            return Promise.resolve(workerIndex);
        }

        // Slow path: enqueue and wait for release
        // [H-8] Default priority 1 (normal). Use acquireWorkerWithPriority for interactive tasks.
        return new Promise<number>((resolve, reject) => {
            // [K-5] Binary-search sorted insertion instead of push+sort.
            // workerWaiters is always maintained sorted by priority.
            // splice position found via binary search in O(log N), total O(N) for element shifts.
            // For pool sizes < 8 this is essentially O(1) vs O(N log N) for sort.
            this.insertWaiterSorted({ resolve, reject, priority: 1 });
        });
    }

    /**
     * [H-8] Acquire a worker with explicit priority (0 = interactive, 1 = normal, 2 = background)
     */
    private acquireWorkerWithPriority(priority: number): Promise<number> {
        this.initializePool(1);
        if (this.availableWorkers.size > 0) {
            const workerIndex = this.availableWorkers.values().next().value!;
            this.availableWorkers.delete(workerIndex);
            return Promise.resolve(workerIndex);
        }
        return new Promise<number>((resolve, reject) => {
            this.insertWaiterSorted({ resolve, reject, priority });
        });
    }

    /** [K-5] Insert a waiter into the sorted workerWaiters array using binary search. */
    private insertWaiterSorted(waiter: { resolve: (idx: number) => void; reject: (err: Error) => void; priority: number }): void {
        let lo = 0, hi = this.workerWaiters.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (this.workerWaiters[mid].priority <= waiter.priority) lo = mid + 1;
            else hi = mid;
        }
        this.workerWaiters.splice(lo, 0, waiter);
    }

    /**
     * [P1.1] Release a worker back to the pool.
     * If waiters exist, hand off directly (zero-latency).
     */
    private releaseWorker(workerIndex: number): void {
        this.activeTasks.delete(workerIndex);

        if (this.workerWaiters.length > 0) {
            // [H-8] Always serve highest-priority waiter first (already sorted by priority)
            const waiter = this.workerWaiters.shift()!;
            waiter.resolve(workerIndex);
        } else {
            this.availableWorkers.add(workerIndex);
        }
    }

    /**
     * Route multiple edges in parallel (True Batch Mode)
     */
    async routeBatch(
        jobs: PathFindingJob[],
        graph: SharedGraphContext,
        onProgress?: (completed: number, total: number) => void
    ): Promise<PathFindingResult[]> {
        if (jobs.length === 0) return [];
        const results: PathFindingResult[] = new Array(jobs.length);
        const validJobs: PathFindingJob[] = [];

        jobs.forEach((job, index) => {
            if (!job.edgeId || !hasFiniteEndpoint(job)) {
                results[index] = createFallbackResult(job, 'Invalid pathfinding job');
                return;
            }
            validJobs.push(job);
        });

        if (validJobs.length === 0) {
            onProgress?.(jobs.length, jobs.length);
            return results;
        }

        this.ensurePoolSizeForJobs(jobs.length);

        const groups = this.groupJobs(validJobs, graph);
        let completedCount = jobs.length - validJobs.length;

        // [OPT-P1⑤] Pre-build O(1) lookup index — avoids O(N²) findIndex inside forEach
        const idToIdx = new Map<string, number>();
        jobs.forEach((j, i) => {
            if (j.edgeId) idToIdx.set(j.edgeId, i);
            if (j.jobId && j.jobId !== j.edgeId) idToIdx.set(j.jobId, i);
        });

        await Promise.all(
            groups.map(async (group) => {
                const batchTasks = group.map(g => g.job);
                const batchResults = await this.executeBatchTask({
                    jobs: batchTasks,
                    graph: graph
                });

                batchResults.forEach(item => {
                    const wrapper = item as Partial<WrappedPathFindingResult>;
                    const res = wrapper.result ?? item as PathFindingResult;
                    const jobId = wrapper.jobId || res.jobId || res.edgeId;

                    // O(1) lookup instead of O(N) findIndex
                    const originalIdx = idToIdx.get(res.edgeId) ?? idToIdx.get(jobId) ?? -1;
                    if (originalIdx !== -1) {
                        results[originalIdx] = res;
                    }
                    completedCount++;
                });

                if (onProgress) {
                    onProgress(completedCount, jobs.length);
                }
            })
        );

        return results;
    }

    /**
     * [Compatibility] Route multiple edges (Alias)
     */
    async calculatePaths(
        jobs: PathFindingJob[],
        graph: SharedGraphContext
    ): Promise<PathFindingResult[]> {
        return this.routeBatch(jobs, graph);
    }

    /**
     * Execute a BATCH task on an available worker
     */
    private async executeBatchTask(payload: { jobs: PathFindingJob[], graph: SharedGraphContext }, priority = 1): Promise<PathFindingBatchItem[]> {
        // [H-8] Use priority-aware acquisition: interactive jobs (priority 0) jump the queue
        const workerIndex = await this.acquireWorkerWithPriority(priority);
        this.activeTasks.set(workerIndex, { job: payload.jobs[0], graph: payload.graph, priority: 0 });

        const worker = this.workers[workerIndex];
        const startTime = performance.now();

        return new Promise((resolve, reject) => {
            // [FIX] Fallback timeout to prevent indefinite hanging if worker silently dies
            const timeoutId = setTimeout(() => {
                logPathfindingWorkerBatchTimeout(workerIndex, WORKER_TASK_TIMEOUT_MS, payload.jobs.length);
                worker.removeEventListener('message', messageHandler);
                worker.removeEventListener('error', errorHandler);
                this.releaseWorker(workerIndex);
                reject(new Error(`Worker ${workerIndex} Batch Timeout (silently failed or stuck).`));
            }, WORKER_TASK_TIMEOUT_MS);

            const messageHandler = (event: MessageEvent) => {
                const data = event.data;

                if (data.type === 'BATCH_RESULT' || (Array.isArray(data) && data[0]?.edgeId)) {
                    clearTimeout(timeoutId);
                    const batchResults = data.results || data;

                    this.totalTaskTime += (performance.now() - startTime);
                    this.completedTasks += payload.jobs.length;

                    worker.removeEventListener('message', messageHandler);
                    worker.removeEventListener('error', errorHandler);
                    this.releaseWorker(workerIndex);

                    resolve(batchResults);
                }
            };

            const errorHandler = (error: ErrorEvent) => {
                clearTimeout(timeoutId);
                logPathfindingWorkerExecutionError({ message: error.message });
                worker.removeEventListener('message', messageHandler);
                worker.removeEventListener('error', errorHandler);
                this.releaseWorker(workerIndex);
                reject(new Error(`Worker ${workerIndex} batch failed: ${error.message}`));
            };

            worker.addEventListener('message', messageHandler);
            worker.addEventListener('error', errorHandler);

            try {
                worker.postMessage({
                    mode: 'batch',
                    jobId: `batch-${Date.now()}-${fileIdCounter++}`,
                    tasks: payload.jobs,
                    context: payload.graph
                });
            } catch (error: unknown) {
                logPathfindingWorkerPostMessageError({ message: getErrorMessage(error) });
                worker.removeEventListener('message', messageHandler);
                worker.removeEventListener('error', errorHandler);
                this.releaseWorker(workerIndex);
                reject(error);
            }
        });
    }

    /**
     * Execute a single task on an available worker
     */
    async calculatePath(job: PathFindingJob, graph: SharedGraphContext): Promise<PathFindingResult> {
        const workerIndex = await this.acquireWorker();
        this.activeTasks.set(workerIndex, { job, graph, priority: 0 });

        const worker = this.workers[workerIndex];
        const startTime = performance.now();

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                worker.removeEventListener('message', messageHandler);
                worker.removeEventListener('error', errorHandler);
                this.releaseWorker(workerIndex);
                reject(new Error(`Worker ${workerIndex} path calculation timed out.`));
            }, WORKER_TASK_TIMEOUT_MS);

            const messageHandler = (event: MessageEvent) => {
                const data = event.data;
                if (data?.error) {
                    clearTimeout(timeoutId);
                    this.totalTaskTime += (performance.now() - startTime);
                    worker.removeEventListener('message', messageHandler);
                    worker.removeEventListener('error', errorHandler);
                    this.releaseWorker(workerIndex);
                    reject(new Error(String(data.error)));
                    return;
                }

                const result = data?.type === 'PATH_RESULT' ? data.result : data;
                if (result?.edgeId && result?.path) {
                    clearTimeout(timeoutId);
                    this.totalTaskTime += (performance.now() - startTime);
                    this.completedTasks++;

                    worker.removeEventListener('message', messageHandler);
                    worker.removeEventListener('error', errorHandler);
                    this.releaseWorker(workerIndex);

                    resolve(result);
                }
            };

            const errorHandler = (error: ErrorEvent) => {
                clearTimeout(timeoutId);
                worker.removeEventListener('message', messageHandler);
                worker.removeEventListener('error', errorHandler);
                this.releaseWorker(workerIndex);
                reject(new Error(`Worker ${workerIndex} failed: ${error.message}`));
            };

            worker.addEventListener('message', messageHandler);
            worker.addEventListener('error', errorHandler);

            try {
                worker.postMessage({
                    type: 'CALCULATE_PATH',
                    job,
                    graph
                });
            } catch (error) {
                clearTimeout(timeoutId);
                worker.removeEventListener('message', messageHandler);
                worker.removeEventListener('error', errorHandler);
                this.releaseWorker(workerIndex);
                reject(error);
            }
        });
    }

    /**
     * Group jobs for optimal parallel execution.
     * [P3] Bus 优化：将相同 hub（source/target）的边聚合到同一 batch，
     * 最大化 Worker 内部 prebuiltGrid 的共享率。
     */
    private groupJobs(jobs: PathFindingJob[], graph: SharedGraphContext): WorkerTask[][] {
        const BATCH_SIZE = 50;
        const activePoolSize = Math.max(1, this.workers.length);
        const chunkSize = Math.min(Math.ceil(jobs.length / activePoolSize), BATCH_SIZE);
        const effectiveChunkSize = Math.max(chunkSize, 20);

        // [P3] 先按 hub 分组：相同 source（O2M）或 target（M2O）的 bus 边放入同一组
        const hubGroups = new Map<string, PathFindingJob[]>();
        const nonBusJobs: PathFindingJob[] = [];

        for (const job of jobs) {
            if (job.isOneToMany && job.source) {
                const list = hubGroups.get(job.source) ?? [];
                list.push(job);
                hubGroups.set(job.source, list);
            } else if (job.isManyToOne && job.target) {
                const list = hubGroups.get(job.target) ?? [];
                list.push(job);
                hubGroups.set(job.target, list);
            } else {
                nonBusJobs.push(job);
            }
        }

        // 将 hub 分组按 effectiveChunkSize 切片后合并到 orderedJobs
        const orderedJobs: PathFindingJob[] = [];
        for (const busGroup of hubGroups.values()) {
            orderedJobs.push(...busGroup);
        }
        orderedJobs.push(...nonBusJobs);

        // 按 effectiveChunkSize 切片分组
        const groups: WorkerTask[][] = [];
        for (let i = 0; i < orderedJobs.length; i += effectiveChunkSize) {
            const chunk = orderedJobs.slice(i, i + effectiveChunkSize);
            groups.push(
                chunk.map((job, idx) => ({
                    job,
                    graph,
                    priority: i + idx
                }))
            );
        }

        return groups;
    }

    /**
     * Get pool statistics
     */
    getStats(): PoolStats {
        return {
            poolSize: this.workers.length,
            activeWorkers: this.activeTasks.size,
            queuedTasks: this.taskQueue.length,
            completedTasks: this.completedTasks,
            averageTaskTime: this.completedTasks > 0
                ? this.totalTaskTime / this.completedTasks
                : 0
        };
    }

    /**
     * Terminate all workers
     */
    terminate(): void {
        this.workers.forEach(worker => worker.terminate());
        this.workers = [];
        this.availableWorkers.clear();
        this.activeTasks.clear();
        this.taskQueue = [];
        // [FIX T-4] + [H-8] Reject all priority-sorted waiters on terminate
        const terminationError = new Error('[WorkerPool] Pool terminated — all pending tasks rejected.');
        this.workerWaiters.forEach(({ reject }) => reject(terminationError));
        this.workerWaiters = [];
    }

    /**
     * Reset statistics
     */
    resetStats(): void {
        this.completedTasks = 0;
        this.totalTaskTime = 0;
    }
}
