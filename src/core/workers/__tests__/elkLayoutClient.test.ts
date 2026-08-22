// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const elkState = vi.hoisted(() => ({
  layout: vi.fn(),
  terminateWorker: vi.fn(),
  constructorOptions: [] as Array<Record<string, unknown>>,
}));

vi.mock('elkjs/lib/elk-api', () => ({
  default: class FakeElk {
    constructor(options: Record<string, unknown>) {
      elkState.constructorOptions.push(options);
    }

    layout = elkState.layout;
    terminateWorker = elkState.terminateWorker;
  },
}));

vi.mock('virtual:vizly-elk-engine-worker-url', () => ({
  default: '/assets/elk-engine-worker.js',
}));

import { runElkLayout } from '../elkLayoutClient';

const graph = { id: 'root', children: [] };

beforeEach(() => {
  vi.clearAllMocks();
  elkState.constructorOptions.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('runElkLayout', () => {
  it('resolves a valid result and terminates its worker', async () => {
    elkState.layout.mockResolvedValue({ id: 'root', children: [] });

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
