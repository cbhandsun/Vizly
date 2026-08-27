// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeBaseReactFlowDisplayEdgesInWorker,
  prewarmBaseReactFlowDisplayWorker,
} from '../baseReactFlowDisplayWorkerClient';
import {
  createTestDisplayHardReport,
  withRequiredTestDisplayHardReport,
} from './baseReactFlowDisplayWorkerTestFixtures';

type WorkerHarnessRequest = {
  operation: 'route' | 'repair' | 'validate-or-route' | 'incremental-route';
  requestId: string;
};

const routedEdge = {
  id: 'edge',
  source: 'source',
  target: 'target',
  data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prewarmed display Worker commit response', () => {
  it('accepts a single in-job repaired response from the prewarmed worker', async () => {
    const listeners = new Map<string, Set<EventListener>>();
    let postedCount = 0;
    class TestWorker {
      addEventListener(type: string, listener: EventListener) {
        const entries = listeners.get(type) ?? new Set<EventListener>();
        entries.add(listener);
        listeners.set(type, entries);
      }

      removeEventListener(type: string, listener: EventListener) {
        listeners.get(type)?.delete(listener);
      }

      postMessage(message: WorkerHarnessRequest) {
        postedCount += 1;
        queueMicrotask(() => {
          for (const listener of listeners.get('message') ?? []) {
            listener({
              data: withRequiredTestDisplayHardReport({
                requestId: message.requestId,
                edges: [routedEdge],
                hardClean: true,
                hardReport: createTestDisplayHardReport(),
                routeResolution: 'full-route-repaired',
              }, message),
            } as MessageEvent);
          }
        });
      }

      terminate() {}
    }
    vi.stubGlobal('Worker', TestWorker);
    const workerRef = { current: null };

    expect(prewarmBaseReactFlowDisplayWorker(workerRef)).toBe(true);
    const warmedWorker = workerRef.current;
    await expect(computeBaseReactFlowDisplayEdgesInWorker({
      workerRef,
      requestId: 'prewarmed',
      edges: [routedEdge],
      nodes: [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 100, y: 0 }, data: {} },
      ],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
    })).resolves.toMatchObject({
      edges: [routedEdge],
      hardClean: true,
      routeResolution: 'full-route-repaired',
    });
    expect(workerRef.current).toBe(warmedWorker);
    expect(postedCount).toBe(1);
  });
});
