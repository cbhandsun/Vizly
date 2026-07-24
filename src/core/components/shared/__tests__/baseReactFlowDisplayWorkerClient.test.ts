// @vitest-environment jsdom

import type { Edge } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeBaseReactFlowDisplayEdgesInWorker,
  createBaseReactFlowDisplayEdgePatches,
  doesBaseReactFlowDisplayWorkerResolutionMatchOperation,
  disposeBaseReactFlowDisplayWorker,
  mergeBaseReactFlowDisplayEdgePatches,
  mergeBaseReactFlowDisplayRoutingTransactions,
  prewarmBaseReactFlowDisplayWorker,
  projectBaseReactFlowDisplayWorkerInput,
  repairBaseReactFlowDisplayEdgesInWorker,
  resolveBaseReactFlowDisplayedEdges,
  resolveBaseReactFlowDisplayQualityPolicy,
  scheduleBaseReactFlowDisplayCacheWrite,
  scheduleBaseReactFlowDisplayQuality,
} from '../baseReactFlowDisplayWorkerClient';
import { parseDisplayEdgesWorkerResponse } from '../baseReactFlowDisplayWorkerProtocol';

type WorkerHarnessRequest = {
  operation: 'route' | 'repair' | 'validate-or-route';
  requestId: string;
  candidateEdges?: Array<Record<string, unknown>> | null;
  candidatePatches?: Array<Record<string, unknown>> | null;
};

const installWorkerHarness = (
  onPost: (
    request: WorkerHarnessRequest,
    emit: (response: unknown) => void,
    listenerCount: (type: string) => number,
  ) => void,
) => {
  const terminate = vi.fn();
  const posted: WorkerHarnessRequest[] = [];
  const workers: TestWorker[] = [];
  let workerCount = 0;
  class TestWorker {
    private readonly listeners = new Map<string, Set<EventListener>>();

    constructor() {
      workerCount += 1;
      workers.push(this);
    }

    addEventListener(type: string, listener: EventListener) {
      const entries = this.listeners.get(type) ?? new Set<EventListener>();
      entries.add(listener);
      this.listeners.set(type, entries);
    }

    removeEventListener(type: string, listener: EventListener) {
      this.listeners.get(type)?.delete(listener);
    }

    postMessage(request: WorkerHarnessRequest) {
      posted.push(request);
      onPost(request, (response) => {
        queueMicrotask(() => {
          this.emit('message', { data: response } as MessageEvent);
        });
      }, type => this.listenerCount(type));
    }

    terminate() {
      terminate();
    }

    emit(type: string, event: Event = new Event(type)) {
      for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
    }

    listenerCount(type: string) {
      return this.listeners.get(type)?.size ?? 0;
    }
  }
  vi.stubGlobal('Worker', TestWorker);
  return {
    terminate,
    posted,
    getWorkerCount: () => workerCount,
    emitFromLatest: (type: string, event?: Event) => workers.at(-1)?.emit(type, event),
    getLatestListenerCount: (type: string) => workers.at(-1)?.listenerCount(type) ?? 0,
  };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('baseReactFlowDisplayWorkerClient', () => {
  it.each([
    ['route', 'full-route', true],
    ['route', 'validated-candidate', false],
    ['route', 'repair', false],
    ['repair', 'repair', true],
    ['repair', 'full-route', false],
    ['validate-or-route', 'validated-candidate', true],
    ['validate-or-route', 'full-route', true],
    ['validate-or-route', 'repair', false],
  ] as const)(
    'binds %s requests to the %s resolution (%s)',
    (operation, resolution, expected) => {
      expect(doesBaseReactFlowDisplayWorkerResolutionMatchOperation(
        operation,
        resolution,
      )).toBe(expected);
    },
  );

  it('rejects conflicting and unsafe worker response variants', () => {
    const validEdges = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    }];
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      edges: validEdges,
      hardClean: true,
      routeResolution: 'repair',
    }, 'repair-1')).not.toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      edges: validEdges,
      hardClean: true,
      routeResolution: 'repair',
      error: 'conflict',
    }, 'repair-1')).toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      edges: [{
        ...validEdges[0],
        data: { computedPath: [{ x: 1e100, y: 0 }] },
      }],
      hardClean: true,
      routeResolution: 'repair',
    }, 'repair-1')).toBeNull();
    const quality = {
      nonOrthogonalSegments: 0,
      strictCrossings: 0,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
      relatedOverlap: 0,
      unexplainedRelatedOverlap: 0,
      shortEndpointStubs: 0,
      tinyInteriorDoglegs: 0,
      hairpins: 0,
      backtrackPenalty: 0,
      detourPenalty: 0,
      bends: 2,
      totalLength: 100,
    };
    const boundedCandidate = {
      candidate: 'polished',
      hardClean: false,
      obstacleHits: 0,
      terminalsAttached: true,
      terminalsAnchored: true,
      quality,
      unrelatedOverlapPairs: [{ firstId: 'a', secondId: 'b', overlap: 10 }],
    };
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      boundedCandidate,
    }, 'repair-1')).not.toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      boundedCandidate: {
        ...boundedCandidate,
        quality: { ...quality, totalLength: Number.NaN },
      },
    }, 'repair-1')).toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      boundedCandidate: {
        ...boundedCandidate,
        unrelatedOverlapPairs: [{ firstId: 'a', secondId: 'b', overlap: Number.POSITIVE_INFINITY }],
      },
    }, 'repair-1')).toBeNull();
    expect(parseDisplayEdgesWorkerResponse({
      requestId: 'repair-1',
      boundedCandidate,
      edges: validEdges,
      hardClean: true,
      routeResolution: 'repair',
    }, 'repair-1')).toBeNull();
  });

  it.each(['error', 'messageerror'] as const)(
    'retires an idle prewarmed worker after a %s event and creates a fresh replacement',
    (eventType) => {
      const harness = installWorkerHarness(() => {});
      const workerRef = { current: null };

      expect(prewarmBaseReactFlowDisplayWorker(workerRef)).toBe(true);
      const failedWorker = workerRef.current;
      expect(harness.getLatestListenerCount('error')).toBe(1);
      expect(harness.getLatestListenerCount('messageerror')).toBe(1);

      harness.emitFromLatest(eventType);

      expect(harness.terminate).toHaveBeenCalledTimes(1);
      expect(workerRef.current).toBeNull();
      expect(prewarmBaseReactFlowDisplayWorker(workerRef)).toBe(true);
      expect(workerRef.current).not.toBe(failedWorker);
      expect(harness.getWorkerCount()).toBe(2);
    },
  );

  it('disposes an idle prewarmed worker and detaches its health listeners', () => {
    const harness = installWorkerHarness(() => {});
    const workerRef = { current: null };

    expect(prewarmBaseReactFlowDisplayWorker(workerRef)).toBe(true);
    expect(harness.getLatestListenerCount('error')).toBe(1);
    expect(harness.getLatestListenerCount('messageerror')).toBe(1);

    disposeBaseReactFlowDisplayWorker(workerRef);

    expect(harness.terminate).toHaveBeenCalledOnce();
    expect(workerRef.current).toBeNull();
    expect(harness.getLatestListenerCount('error')).toBe(0);
    expect(harness.getLatestListenerCount('messageerror')).toBe(0);
    disposeBaseReactFlowDisplayWorker(workerRef);
    expect(harness.terminate).toHaveBeenCalledOnce();
  });

  it('fails prewarm closed when the worker constructor is blocked', () => {
    class BlockedWorker {
      constructor() {
        throw new Error('blocked by CSP');
      }
    }
    vi.stubGlobal('Worker', BlockedWorker);
    const workerRef = { current: null };

    expect(prewarmBaseReactFlowDisplayWorker(workerRef)).toBe(false);
    expect(workerRef.current).toBeNull();
  });

  it('prewarms one worker and preserves trusted hard-clean response metadata', async () => {
    const listeners = new Map<string, Set<EventListener>>();
    class TestWorker {
      addEventListener(type: string, listener: EventListener) {
        const entries = listeners.get(type) ?? new Set<EventListener>();
        entries.add(listener);
        listeners.set(type, entries);
      }

      removeEventListener(type: string, listener: EventListener) {
        listeners.get(type)?.delete(listener);
      }

      postMessage(message: { requestId: string }) {
        queueMicrotask(() => {
          for (const listener of listeners.get('message') ?? []) {
            listener({
              data: {
                requestId: message.requestId,
                edges: [{ id: 'edge', source: 'source', target: 'target' }],
                hardClean: true,
                routeResolution: 'full-route',
              },
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
      edges: [{ id: 'edge', source: 'source', target: 'target' }],
      nodes: [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 100, y: 0 }, data: {} },
      ],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
    })).resolves.toMatchObject({
      edges: [{ id: 'edge', source: 'source', target: 'target' }],
      hardClean: true,
    });
    expect(workerRef.current).toBe(warmedWorker);
  });

  it('reuses the prewarmed worker for a route request and its repair-only follow-up', async () => {
    const routeEdges = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 50, y: 0 }] },
    }];
    const repairedEdges = [{
      ...routeEdges[0],
      data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    }];
    const requestErrorListenerCounts: number[] = [];
    const harness = installWorkerHarness((request, emit, listenerCount) => {
      requestErrorListenerCounts.push(listenerCount('error'));
      emit({
        requestId: request.requestId,
        edges: request.operation === 'route' ? routeEdges : repairedEdges,
        hardClean: request.operation === 'repair',
        routeResolution: request.operation === 'repair' ? 'repair' : 'full-route',
      });
    });
    const workerRef = { current: null };
    expect(prewarmBaseReactFlowDisplayWorker(workerRef)).toBe(true);
    const warmedWorker = workerRef.current;
    const nodes = [
      { id: 'source', position: { x: 0, y: 0 }, data: {} },
      { id: 'target', position: { x: 100, y: 0 }, data: {} },
    ];

    await expect(computeBaseReactFlowDisplayEdgesInWorker({
      workerRef,
      requestId: 'route-then-repair',
      edges: routeEdges,
      nodes,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
    })).resolves.toMatchObject({ edges: routeEdges, hardClean: false });
    await expect(repairBaseReactFlowDisplayEdgesInWorker({
      workerRef,
      requestId: 'route-then-repair:repair',
      edges: routeEdges,
      nodes,
    })).resolves.toMatchObject({ edges: repairedEdges, hardClean: true });

    expect(workerRef.current).toBe(warmedWorker);
    expect(harness.getWorkerCount()).toBe(1);
    expect(harness.posted.map(request => request.operation)).toEqual(['route', 'repair']);
    expect(requestErrorListenerCounts).toEqual([1, 1]);
    expect(harness.getLatestListenerCount('error')).toBe(1);
    expect(harness.getLatestListenerCount('messageerror')).toBe(1);
  });

  it('terminates a worker that reports a resolution belonging to another operation', async () => {
    const edges = [{ id: 'edge', source: 'source', target: 'target', data: {} }];
    const harness = installWorkerHarness((request, emit) => emit({
      requestId: request.requestId,
      edges,
      hardClean: true,
      routeResolution: 'repair',
    }));
    const workerRef = { current: null };

    await expect(computeBaseReactFlowDisplayEdgesInWorker({
      workerRef,
      requestId: 'route-resolution-mismatch',
      edges,
      nodes: [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 100, y: 0 }, data: {} },
      ],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
    })).rejects.toThrow('display-edge-worker-resolution-mismatch');
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(workerRef.current).toBeNull();
  });

  it('requires a validated-candidate response to exactly match the submitted candidate', async () => {
    const edges = [{ id: 'edge', source: 'source', target: 'target', data: {} }];
    const candidateEdges = [{
      ...edges[0],
      type: 'stablePath',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    }];
    const harness = installWorkerHarness((request, emit) => {
      expect(request.operation).toBe('validate-or-route');
      emit({
        requestId: request.requestId,
        edges: [{
          ...candidateEdges[0],
          data: { computedPath: [{ x: 0, y: 0 }, { x: 120, y: 0 }] },
        }],
        hardClean: true,
        routeResolution: 'validated-candidate',
      });
    });
    const workerRef = { current: null };

    await expect(computeBaseReactFlowDisplayEdgesInWorker({
      workerRef,
      requestId: 'candidate-response-mismatch',
      edges,
      nodes: [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 100, y: 0 }, data: {} },
      ],
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
      displayEdgeEpoch: 1,
      cachedCandidateEdges: candidateEdges,
      candidateSource: 'precompiled',
    })).rejects.toThrow('display-edge-worker-candidate-mismatch');
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(workerRef.current).toBeNull();
  });

  it('rejects a repair-only response that remains non-clean', async () => {
    const edges = [{ id: 'edge', source: 'source', target: 'target' }];
    installWorkerHarness((request, emit) => emit({
      requestId: request.requestId,
      edges,
      hardClean: false,
      routeResolution: 'repair',
    }));

    await expect(repairBaseReactFlowDisplayEdgesInWorker({
      workerRef: { current: null },
      requestId: 'repair-non-clean',
      edges,
      nodes: [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 100, y: 0 }, data: {} },
      ],
    })).rejects.toThrow('display-edge-worker-final-quality-failed');
  });

  it('fails closed and replaces a worker that sends an unsafe repair response', async () => {
    const harness = installWorkerHarness((request, emit) => emit({
      requestId: request.requestId,
      edges: [{
        id: 'edge',
        source: 'source',
        target: 'target',
        data: { computedPath: [{ x: Number.NaN, y: 0 }] },
      }],
      hardClean: true,
      routeResolution: 'repair',
    }));
    const workerRef = { current: null };

    await expect(repairBaseReactFlowDisplayEdgesInWorker({
      workerRef,
      requestId: 'repair-invalid-response',
      edges: [{ id: 'edge', source: 'source', target: 'target' }],
      nodes: [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 100, y: 0 }, data: {} },
      ],
    })).rejects.toThrow('display-edge-worker-invalid-response');
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(workerRef.current).toBeNull();
  });

  it('aborts stale repair-only work and terminates its worker', async () => {
    const harness = installWorkerHarness(() => {});
    const workerRef = { current: null };
    const controller = new AbortController();
    const pending = repairBaseReactFlowDisplayEdgesInWorker({
      workerRef,
      requestId: 'repair-stale',
      edges: [{ id: 'edge', source: 'source', target: 'target' }],
      nodes: [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 100, y: 0 }, data: {} },
      ],
      signal: controller.signal,
    });

    controller.abort();

    await expect(pending).rejects.toThrow('display-edge-worker-cancelled');
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(workerRef.current).toBeNull();
  });

  it('times out repair-only work with the same bounded worker lifecycle', async () => {
    vi.useFakeTimers();
    const harness = installWorkerHarness(() => {});
    const workerRef = { current: null };
    const pending = repairBaseReactFlowDisplayEdgesInWorker({
      workerRef,
      requestId: 'repair-timeout',
      edges: [{ id: 'edge', source: 'source', target: 'target' }],
      nodes: [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 100, y: 0 }, data: {} },
      ],
      timeoutMs: 1_000,
    });
    const rejection = expect(pending).rejects.toThrow('display-edge-worker-timeout');

    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(harness.terminate).toHaveBeenCalledTimes(1);
    expect(workerRef.current).toBeNull();
  });

  it('skips deferred display routing when there is no graph to improve', () => {
    expect(resolveBaseReactFlowDisplayQualityPolicy({
      nodeCount: 0,
      edgeCount: 10,
      isLargeGraph: false,
    })).toEqual({ mode: 'skip', timeoutMs: 0 });
    expect(resolveBaseReactFlowDisplayQualityPolicy({
      nodeCount: 10,
      edgeCount: 0,
      isLargeGraph: false,
    })).toEqual({ mode: 'skip', timeoutMs: 0 });
  });

  it('keeps complex standard diagrams on the bounded interactive worker path', () => {
    expect(resolveBaseReactFlowDisplayQualityPolicy({
      nodeCount: 45,
      edgeCount: 44,
      isLargeGraph: false,
    })).toEqual({ mode: 'interactive', timeoutMs: 12_000 });
  });

  it('keeps medium standard diagrams on the bounded interactive worker path', () => {
    expect(resolveBaseReactFlowDisplayQualityPolicy({
      nodeCount: 32,
      edgeCount: 33,
      isLargeGraph: false,
    })).toEqual({ mode: 'interactive', timeoutMs: 12_000 });
  });

  it('keeps small diagrams on the full quality worker path', () => {
    expect(resolveBaseReactFlowDisplayQualityPolicy({
      nodeCount: 13,
      edgeCount: 16,
      isLargeGraph: false,
    })).toEqual({ mode: 'full', timeoutMs: 60_000 });
  });

  it('does not expose provisional edges before the final worker result is ready', () => {
    const immediate = [{ id: 'edge', source: 'source', target: 'target' }];
    expect(resolveBaseReactFlowDisplayedEdges({
      signature: 'graph-a',
      geometryDigest: 'digest-a',
      policyMode: 'full',
      deferred: null,
      cached: null,
      immediate,
    })).toEqual([]);
    const routed = [{
      ...immediate[0],
      data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    }];
    const displayPatches = createBaseReactFlowDisplayEdgePatches(immediate, routed)!;
    expect(resolveBaseReactFlowDisplayedEdges({
      signature: 'graph-a',
      geometryDigest: 'digest-a',
      policyMode: 'full',
      deferred: {
        signature: 'graph-a',
        geometryDigest: 'digest-a',
        displayPatches,
        hardClean: true,
      },
      cached: null,
      immediate,
    })).toEqual(routed);
  });

  it('keeps source edges visible while bounded interactive routing is pending', () => {
    const immediate = [{ id: 'edge', source: 'source', target: 'target' }];

    expect(resolveBaseReactFlowDisplayedEdges({
      signature: 'graph-a',
      geometryDigest: 'digest-a',
      policyMode: 'interactive',
      deferred: null,
      cached: null,
      immediate,
    })).toBe(immediate);
  });

  it('replays deferred routing patches onto current metadata and fails closed for stale shapes', () => {
    const source: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      style: { stroke: 'red' },
      selected: false,
      animated: false,
      markerEnd: { type: 'arrow' },
      data: { businessMetadata: { revision: 1 } },
    }];
    const routed = [{
      ...source[0],
      type: 'stablePath',
      data: {
        ...source[0].data,
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      },
    }];
    const deferred = {
      signature: 'colliding-signature',
      geometryDigest: 'digest-a',
      displayPatches: createBaseReactFlowDisplayEdgePatches(source, routed)!,
      hardClean: true,
    };
    const latest: Edge[] = [{
      ...source[0],
      style: { stroke: 'blue', strokeWidth: 4 },
      selected: true,
      animated: true,
      markerEnd: { type: 'arrowclosed', color: 'blue' },
      data: { businessMetadata: { revision: 2 } },
    }];

    const displayed = resolveBaseReactFlowDisplayedEdges({
      signature: 'colliding-signature',
      geometryDigest: 'digest-a',
      policyMode: 'full',
      deferred,
      cached: null,
      immediate: latest,
    });
    expect(displayed[0]).toMatchObject({
      type: 'stablePath',
      style: { stroke: 'blue', strokeWidth: 4 },
      selected: true,
      animated: true,
      markerEnd: { type: 'arrowclosed', color: 'blue' },
    });
    expect((displayed[0].data as any).businessMetadata).toEqual({ revision: 2 });
    expect((displayed[0].data as any).computedPath).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);

    expect(resolveBaseReactFlowDisplayedEdges({
      signature: 'colliding-signature',
      geometryDigest: 'digest-b',
      policyMode: 'full',
      deferred,
      cached: null,
      immediate: latest,
    })).toEqual([]);
    expect(resolveBaseReactFlowDisplayedEdges({
      signature: 'colliding-signature',
      geometryDigest: 'digest-a',
      policyMode: 'full',
      deferred,
      cached: null,
      immediate: [],
    })).toEqual([]);
  });

  it('uses a matching cached final result before any immediate edge fallback', () => {
    const cached = [{ id: 'cached', source: 'source', target: 'target' }];
    const immediate = [{ id: 'immediate', source: 'source', target: 'target' }];

    expect(resolveBaseReactFlowDisplayedEdges({
      signature: 'graph-a',
      geometryDigest: 'digest-a',
      policyMode: 'full',
      deferred: null,
      cached,
      immediate,
    })).toBe(cached);
  });

  it('uses the bounded interactive policy for large graph rendering', () => {
    expect(resolveBaseReactFlowDisplayQualityPolicy({
      nodeCount: 160,
      edgeCount: 120,
      isLargeGraph: true,
    })).toEqual({ mode: 'interactive', timeoutMs: 12_000 });
  });

  it('projects only node fields consumed by display routing', () => {
    const projected = projectBaseReactFlowDisplayWorkerInput({
      edges: [{ id: 'edge', source: 'source', target: 'target' }],
      nodes: [{
        id: 'source',
        type: 'group',
        parentId: 'parent',
        position: { x: 10, y: 20 },
        measured: { width: 120, height: 80 },
        style: { width: 140, height: 90, background: 'red' },
        data: {
          layoutDirection: 'LR',
          content: 'x'.repeat(10_000),
          domain: { nested: Array.from({ length: 100 }, (_, index) => index) },
        },
      }],
    });

    expect(projected.nodes[0]).toMatchObject({
      id: 'source',
      type: 'group',
      parentId: 'parent',
      position: { x: 10, y: 20 },
      measured: { width: 120, height: 80 },
      style: { width: 140, height: 90 },
      data: { layoutDirection: 'LR' },
    });
    expect((projected.nodes[0].style as Record<string, unknown>).background).toBeUndefined();
    expect((projected.nodes[0].data as Record<string, unknown>).content).toBeUndefined();
    expect((projected.nodes[0].data as Record<string, unknown>).domain).toBeUndefined();
  });

  it('preserves full-route patches when a hard-clean result has no repair delta', () => {
    const source = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { label: 'old' },
    }];
    const workerEdges = [{
      ...source[0],
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        ...source[0].data,
        computedPath: [{ x: 20, y: 40 }, { x: 180, y: 40 }],
      },
    }];
    const latest = [{
      ...source[0],
      className: 'latest-class',
      data: { label: 'latest', businessMetadata: { revision: 2 } },
    }];
    const workerRoutingPatches = createBaseReactFlowDisplayEdgePatches(source, workerEdges)!;
    const repairRoutingPatches = createBaseReactFlowDisplayEdgePatches(workerEdges, workerEdges)!;

    const merged = mergeBaseReactFlowDisplayRoutingTransactions({
      latestSourceEdges: latest,
      workerRoutingPatches,
      repairRoutingPatches,
    });

    expect((merged?.edges[0].data as any).computedPath).toEqual([
      { x: 20, y: 40 },
      { x: 180, y: 40 },
    ]);
    expect((merged?.edges[0].data as any).businessMetadata).toEqual({ revision: 2 });
    expect(merged?.edges[0]).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'left',
      className: 'latest-class',
    });
  });

  it('composes full-route and measured-repair patches before deriving cache patches', () => {
    const source = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { label: 'old' },
    }];
    const workerEdges = [{
      ...source[0],
      sourceHandle: 'right',
      data: {
        ...source[0].data,
        computedPath: [{ x: 20, y: 40 }, { x: 100, y: 40 }, { x: 100, y: 80 }],
      },
    }];
    const repairedEdges = [{
      ...workerEdges[0],
      targetHandle: 'left',
      data: {
        ...workerEdges[0].data,
        computedPath: [{ x: 20, y: 40 }, { x: 180, y: 40 }],
      },
    }];
    const latest = [{
      ...source[0],
      className: 'latest-class',
      style: { stroke: 'purple' },
      data: { label: 'latest', businessMetadata: { revision: 3 } },
    }];
    const workerRoutingPatches = createBaseReactFlowDisplayEdgePatches(source, workerEdges)!;
    const repairRoutingPatches = createBaseReactFlowDisplayEdgePatches(workerEdges, repairedEdges)!;

    const merged = mergeBaseReactFlowDisplayRoutingTransactions({
      latestSourceEdges: latest,
      workerRoutingPatches,
      repairRoutingPatches,
    });
    const cachePatches = merged?.cachePatches ?? null;
    expect(cachePatches).not.toBeNull();
    const replayed = cachePatches
      ? mergeBaseReactFlowDisplayEdgePatches(latest, cachePatches)
      : null;

    expect((merged?.edges[0].data as any).computedPath).toEqual([
      { x: 20, y: 40 },
      { x: 180, y: 40 },
    ]);
    expect(merged?.edges[0]).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'left',
      className: 'latest-class',
      style: { stroke: 'purple' },
    });
    expect((merged?.edges[0].data as any).businessMetadata).toEqual({ revision: 3 });
    expect(replayed).toEqual(merged?.edges);
  });

  it('rejects mismatched worker output while creating routing patches', () => {
    const source = [{ id: 'edge', source: 'source', target: 'target' }];

    expect(createBaseReactFlowDisplayEdgePatches(source, [])).toBeNull();
    expect(createBaseReactFlowDisplayEdgePatches(source, [{
      id: 'other-edge',
      source: 'source',
      target: 'target',
    }])).toBeNull();
    expect(createBaseReactFlowDisplayEdgePatches(source, [{
      id: 'edge',
      source: 'different-source',
      target: 'target',
    }])).toBeNull();
  });

  it('rejects routing patches that no longer match the latest source graph', () => {
    const patches = [{ id: 'edge', source: 'source', target: 'target' }];

    expect(mergeBaseReactFlowDisplayEdgePatches([], patches)).toBeNull();
    expect(mergeBaseReactFlowDisplayEdgePatches([{
      id: 'edge',
      source: 'source',
      target: 'different-target',
    }], patches)).toBeNull();
  });

  it('waits for geometry to settle and cancels stale routing work', () => {
    vi.useFakeTimers();
    const staleRun = vi.fn();
    const cancelStale = scheduleBaseReactFlowDisplayQuality(staleRun, 240);

    vi.advanceTimersByTime(239);
    expect(staleRun).not.toHaveBeenCalled();
    cancelStale();
    vi.advanceTimersByTime(1);
    expect(staleRun).not.toHaveBeenCalled();

    const stableRun = vi.fn();
    scheduleBaseReactFlowDisplayQuality(stableRun, 240);
    vi.advanceTimersByTime(240);
    expect(stableRun).toHaveBeenCalledTimes(1);
  });

  it('uses the default settle window and clamps invalid scheduling delays', () => {
    vi.useFakeTimers();
    const defaultRun = vi.fn();
    scheduleBaseReactFlowDisplayQuality(defaultRun);
    vi.advanceTimersByTime(319);
    expect(defaultRun).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(defaultRun).toHaveBeenCalledTimes(1);

    const immediateRun = vi.fn();
    scheduleBaseReactFlowDisplayQuality(immediateRun, -100);
    vi.advanceTimersByTime(0);
    expect(immediateRun).toHaveBeenCalledTimes(1);

    const invalidRun = vi.fn();
    scheduleBaseReactFlowDisplayQuality(invalidRun, Number.NaN);
    vi.advanceTimersByTime(319);
    expect(invalidRun).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(invalidRun).toHaveBeenCalledTimes(1);

    const cappedRun = vi.fn();
    scheduleBaseReactFlowDisplayQuality(cappedRun, 10_000);
    vi.advanceTimersByTime(999);
    expect(cappedRun).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cappedRun).toHaveBeenCalledTimes(1);
  });

  it('defers cache serialization to an idle window and supports cancellation', () => {
    const run = vi.fn();
    const requestIdleCallback = vi.fn(() => 41);
    const cancelIdleCallback = vi.fn();
    Object.assign(window, { requestIdleCallback, cancelIdleCallback });

    const cancel = scheduleBaseReactFlowDisplayCacheWrite(run, 900);

    expect(requestIdleCallback).toHaveBeenCalledWith(run, { timeout: 900 });
    expect(run).not.toHaveBeenCalled();
    cancel();
    expect(cancelIdleCallback).toHaveBeenCalledWith(41);

    delete (window as any).requestIdleCallback;
    delete (window as any).cancelIdleCallback;
  });

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
