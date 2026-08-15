// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  computeBaseReactFlowDisplayEdgesInWorker,
  prewarmBaseReactFlowDisplayWorker,
} from '../baseReactFlowDisplayWorkerClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('baseReactFlowDisplayWorkerClient cancellation', () => {
  it('terminates a cancelled worker and allows its replacement to be prewarmed', async () => {
    const listeners = new Map<string, Set<EventListener>>();
    const terminate = vi.fn();
    let workerCount = 0;
    class TestWorker {
      constructor() {
        workerCount += 1;
      }

      addEventListener(type: string, listener: EventListener) {
        const entries = listeners.get(type) ?? new Set<EventListener>();
        entries.add(listener);
        listeners.set(type, entries);
      }

      removeEventListener(type: string, listener: EventListener) {
        listeners.get(type)?.delete(listener);
      }

      postMessage() {}

      terminate() {
        terminate();
      }
    }
    vi.stubGlobal('Worker', TestWorker);
    const workerRef = { current: null };
    const controller = new AbortController();
    const pending = computeBaseReactFlowDisplayEdgesInWorker({
      workerRef,
      requestId: 'cancel-me',
      edges: [{ id: 'edge', source: 'source', target: 'target' }],
      nodes: [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 100, y: 0 }, data: {} },
      ],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      qualityMode: 'full',
      timeoutMs: 300_000,
      signal: controller.signal,
    });

    controller.abort();

    await expect(pending).rejects.toThrow('display-edge-worker-cancelled');
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(workerRef.current).toBeNull();

    expect(prewarmBaseReactFlowDisplayWorker(workerRef)).toBe(true);
    expect(workerRef.current).not.toBeNull();
    expect(workerCount).toBe(2);
  });
});
