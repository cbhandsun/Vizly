// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const elkState = vi.hoisted(() => ({
  constructorError: undefined as unknown,
  layout: vi.fn(),
  terminateWorker: vi.fn(),
  constructorOptions: [] as Array<Record<string, unknown>>,
}));

vi.mock('elkjs/lib/elk-api', () => ({
  default: class FakeElk {
    constructor(options: Record<string, unknown>) {
      elkState.constructorOptions.push(options);
      if (elkState.constructorError) throw elkState.constructorError;
    }

    layout = elkState.layout;
    terminateWorker = elkState.terminateWorker;
  },
}));

vi.mock('virtual:vizly-elk-engine-worker-url', () => ({
  default: '/assets/elk-engine-worker.js',
}));

import { createElkLayoutExecutor, runElkLayout } from '../elkLayoutClient';

const graph = { id: 'root', children: [] };
const layoutResult = { id: 'root', children: [] };

const createDeferred = <T>() => {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: (value: T) => resolvePromise?.(value),
    reject: (reason?: unknown) => rejectPromise?.(reason),
  };
};

beforeEach(() => {
  elkState.constructorError = undefined;
  elkState.layout.mockReset();
  elkState.terminateWorker.mockReset();
  elkState.constructorOptions.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('runElkLayout', () => {
  it('resolves a valid result and terminates its worker', async () => {
    elkState.layout.mockResolvedValue(layoutResult);

    await expect(runElkLayout(graph)).resolves.toMatchObject({ id: 'root' });

    expect(elkState.constructorOptions).toEqual([
      { workerUrl: '/assets/elk-engine-worker.js' },
    ]);
    expect(elkState.terminateWorker).toHaveBeenCalledOnce();
  });

  it('rejects invalid results and sanitizes engine failures', async () => {
    elkState.layout.mockResolvedValueOnce(null);
    await expect(runElkLayout(graph)).rejects.toThrow('invalid result');

    elkState.layout.mockRejectedValue(new Error('Authorization: Bearer live-token'));
    await expect(runElkLayout(graph)).rejects.toThrow('Authorization: [redacted]');
    await expect(runElkLayout(graph)).rejects.not.toThrow('live-token');
  });

  it('rejects non-string layout options before constructing a worker', async () => {
    await expect(runElkLayout(graph, {
      layoutOptions: { 'elk.spacing.nodeNode': 48 },
    })).rejects.toThrow('Invalid ELK layout options');

    expect(elkState.constructorOptions).toHaveLength(0);
    expect(elkState.layout).not.toHaveBeenCalled();
  });

  it('bounds timeouts and supports cancellation', async () => {
    vi.useFakeTimers();
    elkState.layout.mockReturnValue(new Promise(() => undefined));
    const timedOut = runElkLayout(graph, { timeoutMs: 1 });
    const timedOutExpectation = expect(timedOut).rejects.toThrow('timed out after 100ms');
    await vi.advanceTimersByTimeAsync(100);
    await timedOutExpectation;

    const controller = new AbortController();
    const cancelled = runElkLayout(graph, { signal: controller.signal });
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect(elkState.terminateWorker).toHaveBeenCalledTimes(2);
  });
});

describe('createElkLayoutExecutor', () => {
  it('reuses one healthy engine across sequential successful requests', async () => {
    elkState.layout.mockResolvedValue(layoutResult);
    const executor = createElkLayoutExecutor();

    await expect(executor.run(graph, {
      layoutOptions: { 'elk.algorithm': 'layered' },
    })).resolves.toEqual(layoutResult);
    await expect(executor.run(graph)).resolves.toEqual(layoutResult);

    expect(elkState.constructorOptions).toEqual([
      { workerUrl: '/assets/elk-engine-worker.js' },
    ]);
    expect(elkState.layout).toHaveBeenCalledTimes(2);
    expect(elkState.layout).toHaveBeenNthCalledWith(1, graph, {
      layoutOptions: { 'elk.algorithm': 'layered' },
    });
    expect(elkState.terminateWorker).not.toHaveBeenCalled();

    executor.dispose();
    expect(elkState.terminateWorker).toHaveBeenCalledOnce();
  });

  it('rejects malformed and pre-cancelled input before constructing an engine', async () => {
    const executor = createElkLayoutExecutor();
    const controller = new AbortController();
    controller.abort();

    await expect(executor.run(graph, { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    await expect(executor.run(null as never)).rejects.toThrow('Invalid ELK graph');
    await expect(executor.run(graph, {
      layoutOptions: null as never,
    })).rejects.toThrow('Invalid ELK layout options');
    await expect(executor.run(graph, {
      layoutOptions: { 'elk.spacing.nodeNode': 48 },
    })).rejects.toThrow('Invalid ELK layout options');

    expect(elkState.constructorOptions).toHaveLength(0);
    expect(elkState.layout).not.toHaveBeenCalled();
    executor.dispose();
    expect(elkState.terminateWorker).not.toHaveBeenCalled();
  });

  it('retires an aborted engine, recreates it, and ignores its late result', async () => {
    const deferred = createDeferred<typeof layoutResult>();
    elkState.layout
      .mockReturnValueOnce(deferred.promise)
      .mockResolvedValueOnce(layoutResult);
    const executor = createElkLayoutExecutor();
    const controller = new AbortController();
    const cancelled = executor.run(graph, { signal: controller.signal });
    const cancelledExpectation = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });

    controller.abort();
    await cancelledExpectation;
    expect(elkState.terminateWorker).toHaveBeenCalledOnce();

    await expect(executor.run(graph)).resolves.toEqual(layoutResult);
    expect(elkState.constructorOptions).toHaveLength(2);
    expect(elkState.terminateWorker).toHaveBeenCalledOnce();

    deferred.resolve(layoutResult);
    await Promise.resolve();
    await Promise.resolve();
    expect(elkState.terminateWorker).toHaveBeenCalledOnce();

    executor.dispose();
    expect(elkState.terminateWorker).toHaveBeenCalledTimes(2);
  });

  it('closes cancellation that races with abort-listener registration', async () => {
    let abortedReads = 0;
    const signal = {
      get aborted() {
        abortedReads += 1;
        return abortedReads > 1;
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as AbortSignal;
    const executor = createElkLayoutExecutor();

    await expect(executor.run(graph, { signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(signal.addEventListener).toHaveBeenCalledOnce();
    expect(signal.removeEventListener).toHaveBeenCalledOnce();
    expect(elkState.layout).not.toHaveBeenCalled();
    expect(elkState.terminateWorker).toHaveBeenCalledOnce();
  });

  it('retires a timed-out engine and recreates it for the next request', async () => {
    vi.useFakeTimers();
    elkState.layout
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce(layoutResult);
    const executor = createElkLayoutExecutor();
    const timedOut = executor.run(graph, { timeoutMs: 1 });
    const timedOutExpectation = expect(timedOut).rejects.toThrow('timed out after 100ms');

    await vi.advanceTimersByTimeAsync(100);
    await timedOutExpectation;
    expect(elkState.terminateWorker).toHaveBeenCalledOnce();

    await expect(executor.run(graph)).resolves.toEqual(layoutResult);
    expect(elkState.constructorOptions).toHaveLength(2);
    executor.dispose();
    expect(elkState.terminateWorker).toHaveBeenCalledTimes(2);
  });

  it('retires invalid, rejected, and synchronously failing engines with redacted errors', async () => {
    elkState.layout
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('Authorization: Bearer live-token'))
      .mockImplementationOnce(() => {
        throw new Error('api_key=sync-secret');
      })
      .mockResolvedValueOnce(layoutResult);
    const executor = createElkLayoutExecutor();

    await expect(executor.run(graph)).rejects.toThrow('invalid result');
    const rejectedFailure = await executor.run(graph).catch((error: unknown) => error);
    expect(rejectedFailure).toMatchObject({ message: 'Authorization: [redacted]' });
    expect(rejectedFailure).not.toMatchObject({ message: expect.stringContaining('live-token') });
    const synchronousFailure = await executor.run(graph).catch((error: unknown) => error);
    expect(synchronousFailure).not.toMatchObject({
      message: expect.stringContaining('sync-secret'),
    });

    expect(elkState.constructorOptions).toHaveLength(3);
    expect(elkState.terminateWorker).toHaveBeenCalledTimes(3);

    await expect(executor.run(graph)).resolves.toEqual(layoutResult);
    expect(elkState.constructorOptions).toHaveLength(4);
    executor.dispose();
    expect(elkState.terminateWorker).toHaveBeenCalledTimes(4);
  });

  it('sanitizes constructor failures and allows a later engine construction retry', async () => {
    elkState.constructorError = new Error('Authorization: Bearer constructor-token');
    const executor = createElkLayoutExecutor();

    const constructionFailure = await executor.run(graph).catch((error: unknown) => error);
    expect(constructionFailure).toMatchObject({ message: 'Authorization: [redacted]' });
    expect(constructionFailure).not.toMatchObject({
      message: expect.stringContaining('constructor-token'),
    });
    expect(elkState.terminateWorker).not.toHaveBeenCalled();

    elkState.constructorError = undefined;
    elkState.layout.mockResolvedValue(layoutResult);
    await expect(executor.run(graph)).resolves.toEqual(layoutResult);
    expect(elkState.constructorOptions).toHaveLength(2);

    executor.dispose();
    expect(elkState.terminateWorker).toHaveBeenCalledOnce();
  });

  it('rejects overlap, actively settles dispose, and remains idempotently disposed', async () => {
    const deferred = createDeferred<typeof layoutResult>();
    elkState.layout.mockReturnValueOnce(deferred.promise);
    const executor = createElkLayoutExecutor();
    const active = executor.run(graph);
    const activeExpectation = expect(active).rejects.toMatchObject({
      name: 'AbortError',
      message: 'elk-layout-executor-disposed',
    });

    await expect(executor.run(graph)).rejects.toThrow('elk-layout-executor-busy');
    expect(elkState.layout).toHaveBeenCalledOnce();
    expect(elkState.constructorOptions).toHaveLength(1);

    executor.dispose();
    executor.dispose();
    await activeExpectation;
    expect(elkState.terminateWorker).toHaveBeenCalledOnce();
    await expect(executor.run(graph)).rejects.toMatchObject({
      name: 'AbortError',
      message: 'elk-layout-executor-disposed',
    });

    deferred.resolve(layoutResult);
    await Promise.resolve();
    await Promise.resolve();
    expect(elkState.terminateWorker).toHaveBeenCalledOnce();
  });
});
