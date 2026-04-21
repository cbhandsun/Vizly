/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Pathfinding Worker Pool
 * 
 * Manages a pool of Web Workers for parallel edge routing.
 * Uses event-driven worker acquisition (no polling/busy-wait).
 */

import type { PathFindingJob, PathFindingResult, SharedGraphContext } from '../types/routing';
import PathfindingWorker from './pathfinding.worker?worker&inline';

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

// Global counter for uniqueness
let fileIdCounter = 0;

export class PathfindingWorkerPool {
    private workers: Worker[] = [];
    private availableWorkers: Set<number> = new Set();
    private taskQueue: WorkerTask[] = [];
    private activeTasks: Map<number, WorkerTask> = new Map();
    private completedTasks: number = 0;
    private totalTaskTime: number = 0;
    private readonly poolSize: number;

    // [H-8] Priority-aware waiter queue — entries with lower priority number are served first
    private workerWaiters: Array<{ resolve: (workerIndex: number) => void; reject: (err: Error) => void; priority: number }> = [];

    constructor(poolSize?: number) {
        const cpuCores = (navigator.hardwareConcurrency || 4);
        this.poolSize = poolSize || Math.min(cpuCores, 8);
        this.initializePool();
    }

    private initialized = false;

    private initializePool(): void {
        if (this.initialized) return;

        for (let i = 0; i < this.poolSize; i++) {
            try {
                const worker = new PathfindingWorker();
                // [FIX] Catch startup crashes. If worker dies on load, it won't trigger later event listeners.
                worker.addEventListener('error', (e: ErrorEvent) => {
                    console.error(`[WorkerPool] Worker ${i} startup error:`, e.message, e.filename, e.lineno);
                });
                this.workers.push(worker);
                this.availableWorkers.add(i);
            } catch (error) {
                console.error(`Failed to create worker ${i}:`, error);
            }
        }

        this.initialized = true;
    }

    /**
     * [P1.1] Acquire a worker index, waiting if none available.
     * Uses a promise queue instead of setTimeout polling.
     */
    private acquireWorker(): Promise<number> {
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

        const groups = this.groupJobs(jobs, graph);
        const results: PathFindingResult[] = new Array(jobs.length);
        let completedCount = 0;

        await Promise.all(
            groups.map(async (group) => {
                const batchTasks = group.map(g => g.job);
                const batchResults = await this.executeBatchTask({
                    jobs: batchTasks,
                    graph: graph
                });

                (batchResults as any[]).forEach(wrapper => {
                    const res = (wrapper.result || wrapper) as PathFindingResult;
                    const jobId = wrapper.jobId || (res as any).jobId || (res as any).edgeId;

                    const originalIdx = jobs.findIndex(j => j.edgeId === res.edgeId || j.jobId === jobId);
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
    private async executeBatchTask(payload: { jobs: PathFindingJob[], graph: SharedGraphContext }, priority = 1): Promise<PathFindingResult[]> {
        // [H-8] Use priority-aware acquisition: interactive jobs (priority 0) jump the queue
        const workerIndex = await this.acquireWorkerWithPriority(priority);
        this.activeTasks.set(workerIndex, { job: payload.jobs[0], graph: payload.graph, priority: 0 });

        const worker = this.workers[workerIndex];
        const startTime = performance.now();

        return new Promise((resolve, reject) => {
            // [FIX] Fallback timeout to prevent indefinite hanging if worker silently dies
            const timeoutId = setTimeout(() => {
                console.error(`[DEBUG-WORKER-POOL] Worker ${workerIndex} batch execution timed out (>10s).`);
                worker.removeEventListener('message', messageHandler);
                worker.removeEventListener('error', errorHandler);
                this.releaseWorker(workerIndex);
                reject(new Error(`Worker ${workerIndex} Batch Timeout (silently failed or stuck).`));
            }, 10000);

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
                console.error('[DEBUG-WORKER-POOL] Worker Execution Error:', error.message);
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
            } catch (error: any) {
                console.error('[WorkerPool] postMessage Error:', error.message);
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
            const messageHandler = (event: MessageEvent) => {
                if (event.data.type === 'PATH_RESULT') {
                    this.totalTaskTime += (performance.now() - startTime);
                    this.completedTasks++;

                    worker.removeEventListener('message', messageHandler);
                    worker.removeEventListener('error', errorHandler);
                    this.releaseWorker(workerIndex);

                    resolve(event.data.result);
                }
            };

            const errorHandler = (error: ErrorEvent) => {
                worker.removeEventListener('message', messageHandler);
                worker.removeEventListener('error', errorHandler);
                this.releaseWorker(workerIndex);
                reject(new Error(`Worker ${workerIndex} failed: ${error.message}`));
            };

            worker.addEventListener('message', messageHandler);
            worker.addEventListener('error', errorHandler);

            worker.postMessage({
                type: 'CALCULATE_PATH',
                job,
                graph
            });
        });
    }

    /**
     * Group jobs for optimal parallel execution
     */
    private groupJobs(jobs: PathFindingJob[], graph: SharedGraphContext): WorkerTask[][] {
        const BATCH_SIZE = 50;
        const chunkSize = Math.min(Math.ceil(jobs.length / Math.max(1, this.poolSize)), BATCH_SIZE);
        const effectiveChunkSize = Math.max(chunkSize, 20);

        const groups: WorkerTask[][] = [];

        for (let i = 0; i < jobs.length; i += effectiveChunkSize) {
            const chunk = jobs.slice(i, i + effectiveChunkSize);
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
            poolSize: this.poolSize,
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
