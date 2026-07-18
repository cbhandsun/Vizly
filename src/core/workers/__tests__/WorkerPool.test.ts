// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PathFindingJob, PathFindingResult, SharedGraphContext } from '../../types/routing';

const workerMockState = vi.hoisted(() => ({
  instances: [] as MockPathfindingWorker[],
  failNextBatch: false,
  dropNextBatch: false,
  malformedNextBatch: false,
}));

class MockPathfindingWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn((message: {
    mode?: string;
    jobId?: string;
    tasks?: PathFindingJob[];
  }) => {
    setTimeout(() => {
      if (workerMockState.failNextBatch) {
        workerMockState.failNextBatch = false;
        this.onerror?.(new ErrorEvent('error', { message: 'worker failed' }));
        return;
      }

      if (workerMockState.dropNextBatch) {
        workerMockState.dropNextBatch = false;
        this.onmessage?.({
          data: {
            batchId: message.jobId,
            results: [],
          },
        } as MessageEvent);
        return;
      }

      if (workerMockState.malformedNextBatch) {
        workerMockState.malformedNextBatch = false;
        this.onmessage?.({
          data: {
            batchId: message.jobId,
          },
        } as MessageEvent);
        return;
      }

      this.onmessage?.({
        data: {
          batchId: message.jobId,
          results: (message.tasks ?? []).map(job => ({
            jobId: job.jobId,
            result: createResult(job),
          })),
        },
      } as MessageEvent);
    }, 0);
  });
  terminate = vi.fn();

  constructor() {
    workerMockState.instances.push(this);
  }
}

vi.mock('../pathfinding.worker?worker&inline', () => ({
  default: MockPathfindingWorker,
}));

const baseGraph = (): SharedGraphContext => ({
  nodes: [],
  edges: [],
  obstacles: [],
  config: {},
});

const job = (id: string): PathFindingJob => ({
  jobId: id,
  edgeId: id,
  source: 'source',
  target: 'target',
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
});

const createResult = (input: PathFindingJob): PathFindingResult => ({
  jobId: input.jobId,
  edgeId: input.edgeId,
  path: `M ${input.sourceX},${input.sourceY} L ${input.targetX},${input.targetY}`,
  points: [
    { x: input.sourceX, y: input.sourceY },
    { x: input.targetX, y: input.targetY },
  ],
  labelX: (input.sourceX + input.targetX) / 2,
  labelY: (input.sourceY + input.targetY) / 2,
});

const importFreshPool = async () => {
  const module = await import('../WorkerPool');
  return module.default;
};

const flushWorkerBatch = async () => {
  await vi.advanceTimersByTimeAsync(16);
  await vi.runOnlyPendingTimersAsync();
};

describe('WorkerPool', () => {
  let activePool: { terminate: () => void } | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    workerMockState.instances.length = 0;
    workerMockState.failNextBatch = false;
    workerMockState.dropNextBatch = false;
    workerMockState.malformedNextBatch = false;
    activePool = null;
  });

  afterEach(() => {
    activePool?.terminate();
    vi.useRealTimers();
    vi.resetModules();
  });

  it('batches queued path calculations onto a worker and resolves by job id', async () => {
    const WorkerPool = await importFreshPool();
    const pool = WorkerPool.getInstance(1);
    activePool = pool;
    const graph = baseGraph();

    const first = pool.calculatePath(job('edge-a'), graph);
    const second = pool.calculatePath(job('edge-b'), graph);

    expect(pool.getStats().queueLength).toBe(2);

    await flushWorkerBatch();

    await expect(first).resolves.toMatchObject({ jobId: 'edge-a', edgeId: 'edge-a' });
    await expect(second).resolves.toMatchObject({ jobId: 'edge-b', edgeId: 'edge-b' });

    expect(workerMockState.instances).toHaveLength(1);
    expect(workerMockState.instances[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'batch',
      tasks: expect.arrayContaining([
        expect.objectContaining({ jobId: 'edge-a' }),
        expect.objectContaining({ jobId: 'edge-b' }),
      ]),
    }));
    expect(pool.getStats()).toMatchObject({ poolSize: 1, busyCount: 0, queueLength: 0 });
  });

  it('serves clean repeat requests from cache until marked dirty', async () => {
    const WorkerPool = await importFreshPool();
    const pool = WorkerPool.getInstance(1);
    activePool = pool;
    const graph = baseGraph();
    const repeatedJob = job('edge-cache');

    const first = pool.calculatePath(repeatedJob, graph);
    await flushWorkerBatch();
    await expect(first).resolves.toMatchObject({ jobId: 'edge-cache' });

    const second = pool.calculatePath(repeatedJob, graph, false);
    await expect(second).resolves.toMatchObject({ jobId: 'edge-cache' });
    expect(workerMockState.instances[0].postMessage).toHaveBeenCalledTimes(1);
    expect(pool.getStats()).toMatchObject({ cacheHits: 1 });

    pool.markDirty();
    const third = pool.calculatePath(repeatedJob, graph, false);
    await flushWorkerBatch();
    await expect(third).resolves.toMatchObject({ jobId: 'edge-cache' });
    expect(workerMockState.instances[0].postMessage).toHaveBeenCalledTimes(2);
  });

  it('rejects all jobs in a failed batch and recovers worker availability', async () => {
    const WorkerPool = await importFreshPool();
    const pool = WorkerPool.getInstance(1);
    activePool = pool;
    workerMockState.failNextBatch = true;

    const rejection = pool.calculatePath(job('edge-fail'), baseGraph()).catch(error => error);
    await flushWorkerBatch();

    await expect(rejection).resolves.toMatchObject({ message: 'worker failed' });
    expect(pool.getStats()).toMatchObject({ busyCount: 0, queueLength: 0 });
  });

  it('rejects dropped worker results instead of hanging', async () => {
    const WorkerPool = await importFreshPool();
    const pool = WorkerPool.getInstance(1);
    activePool = pool;
    workerMockState.dropNextBatch = true;

    const pending = pool.calculatePath(job('edge-dropped'), baseGraph());
    const rejection = expect(pending).rejects.toThrow('Worker dropped job');
    await flushWorkerBatch();

    await rejection;
    expect(pool.getStats()).toMatchObject({ busyCount: 0, queueLength: 0 });
  });

  it('rejects malformed worker batch messages instead of hanging', async () => {
    const WorkerPool = await importFreshPool();
    const pool = WorkerPool.getInstance(1);
    activePool = pool;
    workerMockState.malformedNextBatch = true;

    const pending = pool.calculatePath(job('edge-malformed'), baseGraph());
    const rejection = expect(pending).rejects.toThrow('Worker returned malformed batch result');
    await flushWorkerBatch();

    await rejection;
    expect(pool.getStats()).toMatchObject({ busyCount: 0, queueLength: 0 });
  });

  it('terminates workers and rejects queued jobs', async () => {
    const WorkerPool = await importFreshPool();
    const pool = WorkerPool.getInstance(1);
    activePool = pool;

    const pending = pool.calculatePath(job('edge-terminated'), baseGraph());
    const rejection = expect(pending).rejects.toThrow('Pool terminated');
    await vi.advanceTimersByTimeAsync(16);

    pool.terminate();
    activePool = null;

    await rejection;
    expect(workerMockState.instances[0].terminate).toHaveBeenCalledTimes(1);
    expect(pool.getStats()).toMatchObject({ poolSize: 0, queueLength: 0 });
  });
});
