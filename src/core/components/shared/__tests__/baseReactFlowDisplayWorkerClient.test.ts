import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeBaseReactFlowDisplayOutputRouteSignature } from '../baseReactFlowDisplayEdgeCore';

import {
  computeBaseReactFlowDisplayEdgesInWorker,
  createBaseReactFlowDisplayEdgePatches,
  mergeBaseReactFlowDisplayEdgePatches,
  mergeTrustedBaseReactFlowDisplayCacheEntry,
  prewarmBaseReactFlowDisplayWorker,
  projectBaseReactFlowDisplayWorkerInput,
  resolveBaseReactFlowDisplayedEdges,
  resolveBaseReactFlowDisplayQualityPolicy,
  scheduleBaseReactFlowDisplayCacheWrite,
  scheduleBaseReactFlowDisplayQuality,
} from '../baseReactFlowDisplayWorkerClient';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('baseReactFlowDisplayWorkerClient', () => {
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
    })).resolves.toEqual({
      edges: [{ id: 'edge', source: 'source', target: 'target' }],
      hardClean: true,
    });
    expect(workerRef.current).toBe(warmedWorker);
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

  it('runs complex standard diagrams on the cancellable full-quality worker path', () => {
    expect(resolveBaseReactFlowDisplayQualityPolicy({
      nodeCount: 45,
      edgeCount: 44,
      isLargeGraph: false,
    })).toEqual({ mode: 'full', timeoutMs: 300_000 });
  });

  it('runs medium standard diagrams on the cancellable full-quality worker path', () => {
    expect(resolveBaseReactFlowDisplayQualityPolicy({
      nodeCount: 32,
      edgeCount: 33,
      isLargeGraph: false,
    })).toEqual({ mode: 'full', timeoutMs: 300_000 });
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
      policyMode: 'full',
      deferred: null,
      cached: null,
      immediate,
    })).toEqual([]);
    expect(resolveBaseReactFlowDisplayedEdges({
      signature: 'graph-a',
      policyMode: 'full',
      deferred: { signature: 'graph-a', edges: immediate, hardClean: true },
      cached: null,
      immediate: [],
    })).toBe(immediate);
  });

  it('uses a matching cached final result before any immediate edge fallback', () => {
    const cached = [{ id: 'cached', source: 'source', target: 'target' }];
    const immediate = [{ id: 'immediate', source: 'source', target: 'target' }];

    expect(resolveBaseReactFlowDisplayedEdges({
      signature: 'graph-a',
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

  it('stores only routing changes and merges them onto the latest edge metadata', () => {
    const routedFrom = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      type: 'advanced-smart-step',
      sourceHandle: 'bottom-source',
      targetHandle: 'top-target',
      className: 'old-class',
      style: { stroke: 'red' },
      data: {
        label: 'old label',
        businessMetadata: { owner: 'old' },
        treeRouting: { points: [{ x: 0, y: 0 }], mode: 'bus' },
      },
    }];
    const routed = [{
      ...routedFrom[0],
      type: 'stablePath',
      sourceHandle: 'right-source',
      data: {
        ...(routedFrom[0].data || {}),
        computedPath: [{ x: 10, y: 20 }, { x: 100, y: 20 }],
        treeRouting: { points: [{ x: 10, y: 20 }, { x: 100, y: 20 }], mode: 'bus' },
        __baseDisplayFinalizedSignature: 'signature',
      },
    }];
    const latest = [{
      ...routedFrom[0],
      className: 'latest-class',
      hidden: true,
      selectable: false,
      style: { stroke: 'blue', strokeWidth: 4 },
      markerEnd: { type: 'arrowclosed', color: 'blue' },
      data: {
        ...(routedFrom[0].data || {}),
        label: 'latest label',
        businessMetadata: { owner: 'latest' },
      },
    }];

    const patches = createBaseReactFlowDisplayEdgePatches(routedFrom, routed);
    expect(patches).not.toBeNull();
    if (!patches) throw new Error('expected matching routed edge patches');
    const merged = mergeBaseReactFlowDisplayEdgePatches(latest, patches);

    expect(patches[0]).not.toHaveProperty('className');
    expect(patches[0]).not.toHaveProperty('style');
    expect((patches[0].data as Record<string, unknown>)).not.toHaveProperty('businessMetadata');
    expect(merged?.[0]).toMatchObject({
      type: 'stablePath',
      sourceHandle: 'right-source',
      targetHandle: 'top-target',
      className: 'latest-class',
      hidden: true,
      selectable: false,
      style: { stroke: 'blue', strokeWidth: 4 },
      markerEnd: { type: 'arrowclosed', color: 'blue' },
    });
    expect((merged?.[0].data as any).label).toBe('latest label');
    expect((merged?.[0].data as any).businessMetadata).toEqual({ owner: 'latest' });
    expect((merged?.[0].data as any).computedPath).toEqual([{ x: 10, y: 20 }, { x: 100, y: 20 }]);
    expect((merged?.[0].data as any).treeRouting).toEqual({
      points: [{ x: 10, y: 20 }, { x: 100, y: 20 }],
      mode: 'bus',
    });
  });

  it('reuses a signed hard report only for the exact merged route and keeps latest business metadata', () => {
    const source = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      className: 'old-class',
      data: {
        businessMetadata: { owner: 'old' },
        computedPath: [{ x: 10, y: 0 }, { x: 10, y: 100 }],
      },
    }];
    const routed = [{
      ...source[0],
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        ...source[0].data,
        computedPath: [{ x: 100, y: 40 }, { x: 180, y: 40 }],
        treeRouting: {
          effectiveSourceHandle: 'right',
          effectiveTargetHandle: 'left',
          points: [{ x: 100, y: 40 }, { x: 180, y: 40 }],
        },
      },
    }];
    const latest = [{
      ...source[0],
      className: 'latest-class',
      style: { stroke: 'purple' },
      data: {
        ...source[0].data,
        businessMetadata: { owner: 'latest', revision: 2 },
      },
    }];
    const patches = createBaseReactFlowDisplayEdgePatches(source, routed);
    expect(patches).not.toBeNull();
    if (!patches) throw new Error('expected routing patches');
    const expectedMerged = mergeBaseReactFlowDisplayEdgePatches(latest, patches);
    expect(expectedMerged).not.toBeNull();
    const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(expectedMerged!);
    expect(outputRouteSignature).not.toBeNull();
    const entry = { edges: patches, hardClean: true, outputRouteSignature: outputRouteSignature! };

    const trusted = mergeTrustedBaseReactFlowDisplayCacheEntry(latest, entry);
    expect(trusted?.[0].className).toBe('latest-class');
    expect(trusted?.[0].style).toEqual({ stroke: 'purple' });
    expect((trusted?.[0].data as any).businessMetadata).toEqual({ owner: 'latest', revision: 2 });
    expect((trusted?.[0].data as any).computedPath).toEqual([{ x: 100, y: 40 }, { x: 180, y: 40 }]);

    const latestIntentChanged = [{
      ...latest[0],
      data: { ...(latest[0].data || {}), sharedTrunkAware: true },
    }];
    expect(mergeTrustedBaseReactFlowDisplayCacheEntry(latestIntentChanged, entry)).toBeNull();

    const tamperedPathEntry = {
      ...entry,
      edges: patches.map(patch => ({
        ...patch,
        data: {
          ...(patch.data || {}),
          computedPath: [{ x: 100, y: 40 }, { x: 220, y: 40 }],
        },
      })),
    };
    expect(mergeTrustedBaseReactFlowDisplayCacheEntry(latest, tamperedPathEntry)).toBeNull();

    const tamperedHandleEntry = {
      ...entry,
      edges: patches.map(patch => ({ ...patch, sourceHandle: 'left' })),
    };
    expect(mergeTrustedBaseReactFlowDisplayCacheEntry(latest, tamperedHandleEntry)).toBeNull();
    const tamperedIntentEntry = {
      ...entry,
      edges: patches.map(patch => ({
        ...patch,
        data: { ...(patch.data || {}), isTreeBus: true },
      })),
    };
    expect(mergeTrustedBaseReactFlowDisplayCacheEntry(latest, tamperedIntentEntry)).toBeNull();
    expect(mergeTrustedBaseReactFlowDisplayCacheEntry(latest, {
      ...entry,
      outputRouteSignature: '',
    })).toBeNull();
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
