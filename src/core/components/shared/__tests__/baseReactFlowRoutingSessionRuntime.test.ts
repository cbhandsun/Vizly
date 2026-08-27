import { describe, expect, it, vi } from 'vitest';

import { createBaseReactFlowRoutingSessionRuntime } from '../baseReactFlowRoutingSessionRuntime';

describe('baseReactFlowRoutingSessionRuntime', () => {
  it('shares one Worker ref and invalidates a prior display job when layout begins', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const displayJob = runtime.beginJob('display');
    const worker = { terminate: vi.fn() } as unknown as Worker;
    runtime.workerRef.current = worker;

    const layoutJob = runtime.beginJob('layout');

    expect(displayJob.signal.aborted).toBe(true);
    expect(runtime.isCurrentJob(displayJob)).toBe(false);
    expect(runtime.isCurrentJob(layoutJob)).toBe(true);
    expect(runtime.workerRef.current).toBe(worker);
  });

  it('allows only the current job to commit and consumes its epoch once', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const staleJob = runtime.beginJob('display');
    const currentJob = runtime.beginJob('layout');
    const commit = vi.fn(() => 'committed');

    expect(runtime.commitJob(staleJob, commit)).toEqual({ committed: false });
    expect(runtime.commitJob(currentJob, commit)).toEqual({
      committed: true,
      value: 'committed',
    });
    expect(runtime.commitJob(currentJob, commit)).toEqual({ committed: false });
    expect(commit).toHaveBeenCalledOnce();
  });

  it('keeps a thrown commit attempt current unless newer work supersedes it', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const retryableJob = runtime.beginJob('layout');
    const failure = new Error('layout-routing-hard-quality-rejected');

    expect(() => runtime.commitJob(retryableJob, () => { throw failure; })).toThrow(failure);
    expect(runtime.isCurrentJob(retryableJob)).toBe(true);

    const displayJob = runtime.beginJob('display');
    expect(retryableJob.signal.aborted).toBe(true);
    expect(runtime.commitJob(retryableJob, () => 'stale-retry')).toEqual({ committed: false });
    expect(runtime.isCurrentJob(displayJob)).toBe(true);
  });

  it('still consumes a non-throwing rejected result', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const job = runtime.beginJob('display');

    expect(runtime.commitJob(job, () => ({ accepted: false }))).toEqual({
      committed: true,
      value: { accepted: false },
    });
    expect(runtime.isCurrentJob(job)).toBe(false);
  });

  it('aborts active work and disposes the shared Worker exactly once', () => {
    const runtime = createBaseReactFlowRoutingSessionRuntime();
    const job = runtime.beginJob('display');
    const disposer = vi.fn((workerRef: { current: Worker | null }) => {
      workerRef.current = null;
    });
    runtime.workerRef.current = { terminate: vi.fn() } as unknown as Worker;
    runtime.registerWorkerDisposer(disposer);

    runtime.dispose();
    runtime.dispose();

    expect(job.signal.aborted).toBe(true);
    expect(disposer).toHaveBeenCalledOnce();
    expect(runtime.workerRef.current).toBeNull();
    expect(() => runtime.beginJob('display')).toThrow('routing-session-runtime-disposed');
  });
});
