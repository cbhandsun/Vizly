import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  computeBaseReactFlowDisplayEdgesInWorker,
  resolveBaseReactFlowDisplayWorkerTimeoutMs,
} from '../baseReactFlowDisplayWorkerClient';

const installWorkerHarness = () => {
  const terminate = vi.fn();
  const posted: unknown[] = [];
  let activeListeners: Map<string, Set<EventListener>> | null = null;
  class TestWorker {
    private readonly listeners = new Map<string, Set<EventListener>>();

    constructor() {
      activeListeners = this.listeners;
    }

    addEventListener(type: string, listener: EventListener) {
      const listeners = this.listeners.get(type) ?? new Set<EventListener>();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type: string, listener: EventListener) {
      this.listeners.get(type)?.delete(listener);
    }

    postMessage(message: unknown) {
      posted.push(message);
    }

    terminate() {
      terminate();
    }
  }
  vi.stubGlobal('Worker', TestWorker);
  return {
    posted,
    terminate,
    emitEvent: (type: 'error' | 'messageerror') => {
      for (const listener of activeListeners?.get(type) ?? []) listener(new Event(type));
    },
  };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('baseReactFlowDisplayWorker lifecycle', () => {
  it.each(['error', 'messageerror'] as const)(
    'terminates and clears a worker after a %s event',
    async (eventType) => {
      const harness = installWorkerHarness();
      const workerRef = { current: null };
      const pending = computeBaseReactFlowDisplayEdgesInWorker({
        workerRef,
        requestId: `worker-${eventType}`,
        edges: [{ id: 'edge', source: 'source', target: 'target' }],
        nodes: [
          { id: 'source', position: { x: 0, y: 0 }, data: {} },
          { id: 'target', position: { x: 100, y: 0 }, data: {} },
        ],
        enableSmartEdges: true,
        smartEdgePadding: 20,
        isLargeGraph: false,
        displayEdgeEpoch: 1,
      });

      harness.emitEvent(eventType);

      await expect(pending).rejects.toThrow(
        eventType === 'error' ? 'display-edge-worker-error' : 'display-edge-worker-message-error',
      );
      expect(harness.terminate).toHaveBeenCalledTimes(1);
      expect(workerRef.current).toBeNull();
    },
  );

  it('falls back and clamps non-finite or out-of-range worker timeouts', () => {
    expect(resolveBaseReactFlowDisplayWorkerTimeoutMs(Number.NaN, 'full')).toBe(60_000);
    expect(resolveBaseReactFlowDisplayWorkerTimeoutMs(Number.POSITIVE_INFINITY, 'interactive')).toBe(12_000);
    expect(resolveBaseReactFlowDisplayWorkerTimeoutMs(-10, 'full')).toBe(1_000);
    expect(resolveBaseReactFlowDisplayWorkerTimeoutMs(900_000, 'full')).toBe(300_000);
  });

  it('projects only routing-owned cache fields into validate-or-route', async () => {
    const harness = installWorkerHarness();
    const workerRef = { current: null };
    const controller = new AbortController();
    const edges = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      label: 'current label',
      className: 'current-class',
      style: { stroke: 'green' },
      markerEnd: { type: 'arrowclosed', color: 'green' },
      data: {
        businessMetadata: { owner: 'current' },
        sharedTrunkAware: false,
      },
    }] as any;
    const cachedCandidateEdges = [{
      ...edges[0],
      type: 'stablePath',
      sourceHandle: 'right',
      targetHandle: 'left',
      label: 'injected label',
      className: 'injected-class',
      style: { stroke: 'red' },
      markerEnd: { type: 'injected', color: 'red' },
      data: {
        computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }],
        businessMetadata: { owner: 'attacker' },
        sharedTrunkAware: true,
        treeRouting: { type: 'tree-out', trunkId: 'forged' },
      },
    }] as any;
    const pending = computeBaseReactFlowDisplayEdgesInWorker({
      workerRef,
      requestId: 'cache-routing-only',
      edges,
      nodes: [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 300, y: 0 }, data: {} },
      ],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      cachedCandidateEdges,
      candidateSource: 'persistent',
      signal: controller.signal,
    });

    const request = harness.posted[0] as any;
    expect(request.operation).toBe('validate-or-route');
    expect(request.candidateSource).toBe('persistent');
    expect(request.candidateEdges[0]).toMatchObject({
      label: 'current label',
      style: { stroke: 'green' },
      markerEnd: { type: 'arrowclosed', color: 'green' },
      type: 'stablePath',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        businessMetadata: { owner: 'current' },
        sharedTrunkAware: false,
        computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }],
      },
    });
    expect(request.candidateEdges[0].className).toBeUndefined();
    expect(request.candidateEdges[0].data.treeRouting).toBeUndefined();
    const rejected = expect(pending).rejects.toThrow('display-edge-worker-cancelled');
    controller.abort();
    await rejected;
  });

  it('preserves only schema-authorized routing intent for a precompiled candidate', async () => {
    const harness = installWorkerHarness();
    const controller = new AbortController();
    const edges = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      type: 'advanced-smart-step',
      data: {
        businessMetadata: { owner: 'current' },
        sharedTrunkAware: false,
      },
    }] as any;
    const precompiledCandidateEdges = [{
      ...edges[0],
      type: 'stablePath',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        ...edges[0].data,
        computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }],
        sharedTrunkAware: true,
      },
    }] as any;
    const pending = computeBaseReactFlowDisplayEdgesInWorker({
      workerRef: { current: null },
      requestId: 'precompiled-routing-intent',
      edges,
      nodes: [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 300, y: 0 }, data: {} },
      ],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      cachedCandidateEdges: precompiledCandidateEdges,
      candidateSource: 'precompiled',
      signal: controller.signal,
    });

    expect(harness.posted[0]).toMatchObject({
      operation: 'validate-or-route',
      candidateSource: 'precompiled',
      candidateEdges: [{
        type: 'stablePath',
        sourceHandle: 'right',
        targetHandle: 'left',
        data: {
          businessMetadata: { owner: 'current' },
          sharedTrunkAware: true,
          computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }],
        },
      }],
    });
    const rejected = expect(pending).rejects.toThrow('display-edge-worker-cancelled');
    controller.abort();
    await rejected;
  });

  it('falls back to a full route when a precompiled candidate changes business data', async () => {
    const harness = installWorkerHarness();
    const controller = new AbortController();
    const edges = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { businessMetadata: { owner: 'current' } },
    }] as any;
    const pending = computeBaseReactFlowDisplayEdgesInWorker({
      workerRef: { current: null },
      requestId: 'precompiled-business-injection',
      edges,
      nodes: [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 300, y: 0 }, data: {} },
      ],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      cachedCandidateEdges: [{
        ...edges[0],
        type: 'stablePath',
        data: {
          businessMetadata: { owner: 'attacker' },
          computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }],
        },
      }],
      candidateSource: 'precompiled',
      signal: controller.signal,
    });

    expect(harness.posted[0]).toMatchObject({ operation: 'route' });
    expect((harness.posted[0] as any).candidateEdges).toBeUndefined();
    expect((harness.posted[0] as any).candidateSource).toBeUndefined();
    const rejected = expect(pending).rejects.toThrow('display-edge-worker-cancelled');
    controller.abort();
    await rejected;
  });

  it('aborts a validate-or-route cache job and clears its worker', async () => {
    const harness = installWorkerHarness();
    const workerRef = { current: null };
    const controller = new AbortController();
    const edges = [{ id: 'edge', source: 'source', target: 'target' }];
    const pending = computeBaseReactFlowDisplayEdgesInWorker({
      workerRef,
      requestId: 'cache-abort',
      edges,
      nodes: [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 100, y: 0 }, data: {} },
      ],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      cachedCandidateEdges: edges,
      signal: controller.signal,
    });

    expect(harness.posted).toHaveLength(1);
    expect(harness.posted[0]).toMatchObject({ operation: 'validate-or-route' });
    const rejected = expect(pending).rejects.toThrow('display-edge-worker-cancelled');
    controller.abort();

    await rejected;
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(workerRef.current).toBeNull();
  });

  it('times out a validate-or-route cache job and clears its worker', async () => {
    vi.useFakeTimers();
    const harness = installWorkerHarness();
    const workerRef = { current: null };
    const edges = [{ id: 'edge', source: 'source', target: 'target' }];
    const pending = computeBaseReactFlowDisplayEdgesInWorker({
      workerRef,
      requestId: 'cache-timeout',
      edges,
      nodes: [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 100, y: 0 }, data: {} },
      ],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      cachedCandidateEdges: edges,
      timeoutMs: 1,
    });

    expect(harness.posted).toHaveLength(1);
    expect(harness.posted[0]).toMatchObject({ operation: 'validate-or-route' });
    const rejected = expect(pending).rejects.toThrow('display-edge-worker-timeout');
    await vi.advanceTimersByTimeAsync(1_000);

    await rejected;
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(workerRef.current).toBeNull();
  });
});
