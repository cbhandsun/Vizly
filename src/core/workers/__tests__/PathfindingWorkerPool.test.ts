import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PathFindingJob, PathFindingResult, SharedGraphContext } from '../../types/routing';
import type { PathfindingWorkerPool as PathfindingWorkerPoolType } from '../PathfindingWorkerPool';

const workerMockState = vi.hoisted(() => ({
  instances: [] as MockPathfindingWorker[],
  failNext: false,
  hangNext: false,
  legacyNextSingle: false,
  errorNextSingle: false,
}));

class MockPathfindingWorker {
  private listeners = new Map<string, Set<(event: MessageEvent | ErrorEvent) => void>>();
  postMessage = vi.fn((message: {
    type?: string;
    mode?: string;
    job?: PathFindingJob;
    tasks?: PathFindingJob[];
  }) => {
    if (workerMockState.hangNext) {
      workerMockState.hangNext = false;
      return;
    }

    setTimeout(() => {
      if (workerMockState.failNext) {
        workerMockState.failNext = false;
        this.dispatch('error', new ErrorEvent('error', { message: 'worker exploded' }));
        return;
      }

      if (message.type === 'CALCULATE_PATH' && message.job) {
        if (workerMockState.errorNextSingle) {
          workerMockState.errorNextSingle = false;
          this.dispatch('message', {
            data: {
              jobId: message.job.jobId,
              error: 'Invalid pathfinding request',
            },
          } as MessageEvent);
          return;
        }

        if (workerMockState.legacyNextSingle) {
          workerMockState.legacyNextSingle = false;
          this.dispatch('message', {
            data: createResult(message.job),
          } as MessageEvent);
          return;
        }

        this.dispatch('message', {
          data: {
            type: 'PATH_RESULT',
            result: createResult(message.job),
          },
        } as MessageEvent);
        return;
      }

      this.dispatch('message', {
        data: {
          type: 'BATCH_RESULT',
          results: (message.tasks ?? []).map(createResult),
        },
      } as MessageEvent);
    }, 0);
  });
  terminate = vi.fn();

  constructor() {
    workerMockState.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent | ErrorEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: MessageEvent | ErrorEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  private dispatch(type: string, event: MessageEvent | ErrorEvent): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

vi.mock('../pathfinding.worker?worker&inline', () => ({
  default: MockPathfindingWorker,
}));

const graph = (): SharedGraphContext => ({
  nodes: [],
  edges: [],
  obstacles: [],
  config: {},
});

const job = (id: string, overrides: Partial<PathFindingJob> = {}): PathFindingJob => ({
  jobId: id,
  edgeId: id,
  source: `source-${id}`,
  target: `target-${id}`,
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
  ...overrides,
});

const createResult = (input: PathFindingJob): PathFindingResult => ({
  jobId: input.jobId,
  edgeId: input.edgeId,
  path: `M ${input.sourceX},${input.sourceY} L ${input.targetX},${input.targetY}`,
  points: [
    { x: input.sourceX, y: input.sourceY },
    { x: input.targetX, y: input.targetY },
  ],
  labelX: 50,
  labelY: 50,
});

const flushWorkerResponse = async () => {
  await vi.runOnlyPendingTimersAsync();
};

describe('PathfindingWorkerPool', () => {
  let pool: PathfindingWorkerPoolType;

  beforeEach(async () => {
    vi.useFakeTimers();
    workerMockState.instances.length = 0;
    workerMockState.failNext = false;
    workerMockState.hangNext = false;
    workerMockState.legacyNextSingle = false;
    workerMockState.errorNextSingle = false;
    const { PathfindingWorkerPool } = await import('../PathfindingWorkerPool');
    pool = new PathfindingWorkerPool(2);
  });

  afterEach(() => {
    pool.terminate();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('routes a batch, preserves original job order, and reports progress', async () => {
    const progress = vi.fn();
    const jobs = [
      job('a', { isOneToMany: true, source: 'hub' }),
      job('b', { isOneToMany: true, source: 'hub' }),
      job('c'),
    ];

    const pending = pool.routeBatch(jobs, graph(), progress);
    await flushWorkerResponse();

    await expect(pending).resolves.toEqual([
      expect.objectContaining({ edgeId: 'a' }),
      expect.objectContaining({ edgeId: 'b' }),
      expect.objectContaining({ edgeId: 'c' }),
    ]);
    expect(progress).toHaveBeenCalledWith(3, 3);
    expect(pool.getStats()).toMatchObject({ poolSize: 2, activeWorkers: 0, completedTasks: 3 });
    expect(workerMockState.instances[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'batch',
      tasks: expect.arrayContaining([
        expect.objectContaining({ jobId: 'a' }),
        expect.objectContaining({ jobId: 'b' }),
      ]),
    }));
  });

  it('short-circuits invalid batch jobs without starting a worker', async () => {
    const progress = vi.fn();
    const pending = pool.routeBatch([
      job('missing-edge', { edgeId: '' }),
      job('bad-coordinate', { sourceX: Number.NaN }),
    ], graph(), progress);

    await expect(pending).resolves.toEqual([
      expect.objectContaining({
        edgeId: '',
        error: 'Invalid pathfinding job',
        path: 'M 0,0 L 100,100',
      }),
      expect.objectContaining({
        edgeId: 'bad-coordinate',
        error: 'Invalid pathfinding job',
        path: 'M 0,0 L 100,100',
      }),
    ]);
    expect(workerMockState.instances).toHaveLength(0);
    expect(progress).toHaveBeenCalledWith(2, 2);
  });

  it('keeps mixed valid and invalid large batches ordered while only routing valid jobs', async () => {
    const progress = vi.fn();
    const jobs = Array.from({ length: 64 }, (_, index) => {
      const id = `large-${index}`;
      if (index === 5) return job(id, { sourceX: Number.POSITIVE_INFINITY });
      if (index === 40) return job(id, { edgeId: '' });
      return job(id, {
        source: index < 32 ? 'hub-a' : `source-${id}`,
        isOneToMany: index < 32,
      });
    });

    const pending = pool.routeBatch(jobs, graph(), progress);
    await flushWorkerResponse();

    const results = await pending;
    expect(results).toHaveLength(jobs.length);
    expect(results[0]).toMatchObject({ edgeId: 'large-0' });
    expect(results[5]).toMatchObject({ edgeId: 'large-5', error: 'Invalid pathfinding job' });
    expect(results[40]).toMatchObject({ edgeId: '', error: 'Invalid pathfinding job' });
    expect(results[63]).toMatchObject({ edgeId: 'large-63' });
    expect(results.every(Boolean)).toBe(true);

    const routedTasks = workerMockState.instances.flatMap(instance =>
      instance.postMessage.mock.calls.flatMap(([message]) => message.tasks ?? [])
    );
    expect(routedTasks).toHaveLength(62);
    expect(routedTasks.some(task => task.jobId === 'large-5')).toBe(false);
    expect(routedTasks.some(task => task.jobId === 'large-40')).toBe(false);
    expect(progress).toHaveBeenLastCalledWith(64, 64);
    expect(pool.getStats()).toMatchObject({ activeWorkers: 0, completedTasks: 62 });
  });

  it('calculates a single path and releases the worker for the next queued task', async () => {
    const first = pool.calculatePath(job('single-a'), graph());
    const second = pool.calculatePath(job('single-b'), graph());

    await flushWorkerResponse();
    await expect(first).resolves.toMatchObject({ edgeId: 'single-a' });

    await flushWorkerResponse();
    await expect(second).resolves.toMatchObject({ edgeId: 'single-b' });

    expect(pool.getStats()).toMatchObject({ activeWorkers: 0, completedTasks: 2 });
  });

  it('accepts legacy flat single-worker path results', async () => {
    workerMockState.legacyNextSingle = true;

    const pending = pool.calculatePath(job('legacy-single'), graph());
    await flushWorkerResponse();

    await expect(pending).resolves.toMatchObject({ edgeId: 'legacy-single' });
    expect(pool.getStats()).toMatchObject({ activeWorkers: 0, completedTasks: 1 });
  });

  it('rejects single-worker error messages and releases the worker', async () => {
    workerMockState.errorNextSingle = true;

    const pending = pool.calculatePath(job('invalid-single'), graph());
    const rejection = expect(pending).rejects.toThrow('Invalid pathfinding request');
    await flushWorkerResponse();

    await rejection;
    expect(pool.getStats()).toMatchObject({ activeWorkers: 0 });
  });

  it('serves interactive priority waiters before normal queued waiters', async () => {
    const first = pool.calculatePath(job('active'), graph());
    await Promise.resolve();

    const normal = pool.calculatePath(job('normal'), graph());
    const interactive = (pool as any).executeBatchTask({ jobs: [job('interactive')], graph: graph() }, 0);

    await flushWorkerResponse();
    await expect(first).resolves.toMatchObject({ edgeId: 'active' });

    await flushWorkerResponse();
    await expect(interactive).resolves.toEqual([
      expect.objectContaining({ edgeId: 'interactive' }),
    ]);

    await flushWorkerResponse();
    await expect(normal).resolves.toMatchObject({ edgeId: 'normal' });

    const routedOrder = workerMockState.instances[0].postMessage.mock.calls.map(([message]) =>
      message.job?.jobId ?? message.tasks?.[0]?.jobId
    );
    expect(routedOrder).toEqual(['active', 'interactive', 'normal']);
  });

  it('rejects worker errors and makes the worker available again', async () => {
    workerMockState.failNext = true;

    const rejection = pool.calculatePath(job('bad'), graph()).catch(error => error);
    await flushWorkerResponse();

    await expect(rejection).resolves.toMatchObject({ message: 'Worker 0 failed: worker exploded' });
    expect(pool.getStats()).toMatchObject({ activeWorkers: 0 });
  });

  it('rejects a batch that times out silently', async () => {
    workerMockState.hangNext = true;

    const pending = pool.routeBatch([job('stuck')], graph());
    const rejection = expect(pending).rejects.toThrow('Batch Timeout');

    await vi.advanceTimersByTimeAsync(10_000);

    await rejection;
    expect(pool.getStats()).toMatchObject({ activeWorkers: 0 });
  });

  it('rejects a single path request that times out silently and releases the worker', async () => {
    workerMockState.hangNext = true;

    const pending = pool.calculatePath(job('stuck-single'), graph());
    const rejection = expect(pending).rejects.toThrow('path calculation timed out');

    await vi.advanceTimersByTimeAsync(10_000);

    await rejection;
    expect(pool.getStats()).toMatchObject({ activeWorkers: 0 });

    const next = pool.calculatePath(job('after-timeout'), graph());
    await flushWorkerResponse();
    await expect(next).resolves.toMatchObject({ edgeId: 'after-timeout' });
  });

  it('terminates workers, rejects queued waiters, and resets stats', async () => {
    const first = pool.calculatePath(job('active'), graph());
    await Promise.resolve();
    const queued = pool.calculatePath(job('queued'), graph());
    const rejection = expect(queued).rejects.toThrow('Pool terminated');
    await Promise.resolve();

    pool.terminate();

    await rejection;
    expect(workerMockState.instances[0].terminate).toHaveBeenCalledTimes(1);
    expect(pool.getStats()).toMatchObject({ poolSize: 0, activeWorkers: 0 });

    await flushWorkerResponse();
    await expect(first).resolves.toMatchObject({ edgeId: 'active' });

    pool.resetStats();
    expect(pool.getStats().completedTasks).toBe(0);
  });
});
