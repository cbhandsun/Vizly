import { describe, expect, it, vi } from 'vitest';

import { scheduleDataRegistryWarmup, type WarmupWindowLike } from '../bootstrapApplication';

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('scheduleDataRegistryWarmup', () => {
  it('loads immediately outside a browser runtime', async () => {
    const loadDataRegistry = vi.fn().mockResolvedValue(undefined);

    scheduleDataRegistryWarmup({
      windowLike: null,
      loadDataRegistry,
    });
    await flushPromises();

    expect(loadDataRegistry).toHaveBeenCalledTimes(1);
  });

  it('waits for paint and idle time when the document is already complete', async () => {
    let afterPaint: (() => void) | undefined;
    let idleWork: (() => void) | undefined;
    const loadDataRegistry = vi.fn().mockResolvedValue(undefined);
    const windowLike: WarmupWindowLike = {
      setTimeout: vi.fn((callback) => {
        afterPaint = callback;
        return 1;
      }),
      requestIdleCallback: vi.fn((callback) => {
        idleWork = callback;
        return 1;
      }),
    };

    scheduleDataRegistryWarmup({ windowLike, documentReadyState: 'complete', loadDataRegistry });

    expect(loadDataRegistry).not.toHaveBeenCalled();
    expect(afterPaint).toBeTypeOf('function');
    afterPaint?.();
    expect(idleWork).toBeTypeOf('function');
    idleWork?.();
    await flushPromises();

    expect(loadDataRegistry).toHaveBeenCalledTimes(1);
  });

  it('waits for the load event before scheduling background work', async () => {
    let onLoad: (() => void) | undefined;
    let afterPaint: (() => void) | undefined;
    const loadDataRegistry = vi.fn().mockResolvedValue(undefined);
    const windowLike: WarmupWindowLike = {
      addEventListener: vi.fn((_event, listener) => {
        onLoad = listener;
      }),
      setTimeout: vi.fn((callback) => {
        afterPaint = callback;
        return 1;
      }),
    };

    scheduleDataRegistryWarmup({ windowLike, documentReadyState: 'loading', loadDataRegistry });

    expect(loadDataRegistry).not.toHaveBeenCalled();
    onLoad?.();
    afterPaint?.();
    afterPaint?.();
    await flushPromises();

    expect(loadDataRegistry).toHaveBeenCalledTimes(1);
  });

  it('reports a failed warmup through the safe bootstrap logger', async () => {
    const failure = new Error('registry unavailable');
    const logFailure = vi.fn();

    scheduleDataRegistryWarmup({
      windowLike: null,
      loadDataRegistry: vi.fn().mockRejectedValue(failure),
      logFailure,
    });
    await flushPromises();

    expect(logFailure).toHaveBeenCalledWith(failure);
  });
});
