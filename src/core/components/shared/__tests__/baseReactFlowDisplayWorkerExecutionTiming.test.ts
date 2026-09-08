// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDisplayWorkerExecutionTiming } from '../baseReactFlowDisplayWorkerExecutionTiming';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('display Worker execution timing', () => {
  it('projects only monotonic numeric milestones and supports prewarmed long-lived workers', () => {
    expect(parseDisplayWorkerExecutionTiming({ readyAt: 1, receivedAt: 3_600_000,
      finishedAt: 3_600_012.5, token: 'private' })).toEqual({
      readyAt: 1, receivedAt: 3_600_000, finishedAt: 3_600_012.5,
    });
    expect(parseDisplayWorkerExecutionTiming({ readyAt: 0, receivedAt: 0, finishedAt: 600_000 }))
      .toEqual({ readyAt: 0, receivedAt: 0, finishedAt: 600_000 });
  });

  it('rejects missing, malformed, non-finite, reversed and excessive execution times', () => {
    for (const value of [undefined, null, '', [], {}, { readyAt: 1 },
      ...['readyAt', 'receivedAt', 'finishedAt'].flatMap(key =>
        [NaN, Infinity, -1, '2', Number.MAX_SAFE_INTEGER + 1].map(invalid => ({
          readyAt: 1, receivedAt: 2, finishedAt: 3, [key]: invalid,
        }))),
      { readyAt: 3, receivedAt: 2, finishedAt: 4 },
      { readyAt: 1, receivedAt: 3, finishedAt: 2 },
      { readyAt: 1, receivedAt: 2, finishedAt: 600_003 },
    ]) expect(parseDisplayWorkerExecutionTiming(value)).toBeNull();
  });

  it('records handler readiness once and distinct receive/finish times for reused requests', async () => {
    vi.resetModules();
    const workerScope: { postMessage: ReturnType<typeof vi.fn>;
      onmessage: ((event: MessageEvent<unknown>) => void) | null } = {
      postMessage: vi.fn(), onmessage: null,
    };
    vi.stubGlobal('self', workerScope);
    const { installBaseReactFlowDisplayWorkerTransport } = await import('../baseReactFlowDisplayWorkerTransport');
    const origin = performance.timeOrigin;
    vi.spyOn(performance, 'now').mockReturnValueOnce(20).mockReturnValueOnce(30)
      .mockReturnValueOnce(40).mockReturnValueOnce(50).mockReturnValueOnce(60);
    installBaseReactFlowDisplayWorkerTransport(() => ({ requestId: 'request', edges: [] }));
    expect(workerScope.onmessage).not.toBeNull();
    workerScope.onmessage?.(new MessageEvent('message', { data: { requestId: 'request' } }));
    workerScope.onmessage?.(new MessageEvent('message', { data: { requestId: 'request' } }));
    expect(workerScope.postMessage.mock.calls.map(call => call[0])).toEqual([
      { requestId: 'request', edges: [], workerDurationMs: 10,
        workerExecutionTiming: { readyAt: origin + 20, receivedAt: origin + 30, finishedAt: origin + 40 } },
      { requestId: 'request', edges: [], workerDurationMs: 10,
        workerExecutionTiming: { readyAt: origin + 20, receivedAt: origin + 50, finishedAt: origin + 60 } },
    ]);
  });
});
