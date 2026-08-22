import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Edge } from '@xyflow/react';

import {
  computeBaseReactFlowDisplayEdgesInWorker,
  repairBaseReactFlowDisplayEdgesInWorker,
  resolveBaseReactFlowDisplayWorkerTimeoutMs,
} from '../baseReactFlowDisplayWorkerClient';
import {
  createBaseReactFlowInteractiveFallbackEdges,
  createBaseReactFlowNodeDragFallbackEdges,
  resolveBaseReactFlowNodeDragFallbackIds,
  shouldUseBaseReactFlowNodeDragFallback,
} from '../baseReactFlowDisplayFallback';
import {
  computeBaseReactFlowDisplayCacheSignature,
  computeBaseReactFlowDisplayOutputRouteSignature,
} from '../baseReactFlowDisplayEdgeCore';
import {
  clearBaseReactFlowDisplayCommittedSnapshots,
  doesBaseReactFlowDisplayCommittedBaselineMatchIdentity,
  readBaseReactFlowDisplayCommittedSnapshot,
  writeBaseReactFlowDisplayCommittedSnapshot,
} from '../baseReactFlowDisplayCommittedSnapshot';
import {
  computeBaseReactFlowDisplayGeometryDigest,
  computeBaseReactFlowDisplayInputIdentityBundle,
} from '../baseReactFlowDisplayInputIdentity';
import {
  canCommitBaseReactFlowDisplayResult,
  shouldRepairBaseReactFlowDisplayResult,
} from '../baseReactFlowDisplayCommitPolicy';
import { resolveBaseReactFlowRoutingComputation } from '../baseReactFlowDragRoutingFreeze';
import { createBaseReactFlowDisplayEdgePatches } from '../baseReactFlowDisplayRoutingTransaction';
import {
  createBaseReactFlowRoutingAffectedClosure,
  createBaseReactFlowRoutingChangeSet,
} from '../baseReactFlowDisplayRoutingChangeSet';
import { resolveDisplayRoutingCommittedReuseTiming } from '../baseReactFlowDisplayRoutingDebug';

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
    emitMessage: (data: unknown) => {
      for (const listener of activeListeners?.get('message') ?? []) {
        listener({ data } as MessageEvent);
      }
    },
  };
};

afterEach(() => {
  clearBaseReactFlowDisplayCommittedSnapshots();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('baseReactFlowDisplayWorker lifecycle', () => {
  it('returns a non-clean repair candidate when the layout transaction owns the hard gate', async () => {
    const edges = [{ id: 'edge', source: 'source', target: 'target' }];
    const harness = installWorkerHarness();
    const repair = repairBaseReactFlowDisplayEdgesInWorker({
      workerRef: { current: null },
      requestId: 'repair-caller-gated',
      edges,
      nodes: [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 100, y: 0 }, data: {} },
      ],
      requireHardClean: false,
    });
    harness.emitMessage({
      requestId: 'repair-caller-gated',
      edges,
      hardClean: false,
      routeResolution: 'repair',
    });

    await expect(repair).resolves.toMatchObject({
      edges,
      hardClean: false,
      routeResolution: 'repair',
    });
  });

  it('replays only a copy-isolated hard-clean runtime committed snapshot', () => {
    const sourceEdges: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      label: 'current label',
      data: {
        businessMetadata: { owner: 'current' },
        computedPath: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
      },
    }];
    const routedEdges: Edge[] = [{
      ...sourceEdges[0],
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        ...(sourceEdges[0].data || {}),
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      },
    }];
    const displayPatches = createBaseReactFlowDisplayEdgePatches(sourceEdges, routedEdges);
    const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(routedEdges);
    expect(displayPatches).not.toBeNull();
    expect(outputRouteSignature).not.toBeNull();
    if (!displayPatches || !outputRouteSignature) {
      throw new Error('expected a valid committed display snapshot');
    }
    expect(writeBaseReactFlowDisplayCommittedSnapshot({
      inputSignature: '123',
      inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
      sourceEdges,
      sourceNodes: [],
      displayPatches,
      outputRouteSignature,
    })).toBe(true);

    const mutablePath = (displayPatches?.[0].data as Record<string, unknown>)?.computedPath;
    if (Array.isArray(mutablePath)) mutablePath[1] = { x: 999, y: 999 };
    const firstHit = readBaseReactFlowDisplayCommittedSnapshot({
      inputSignature: '123',
      inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
      sourceEdges,
    });
    expect((firstHit?.edges[0].data as Record<string, unknown>)?.computedPath).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(firstHit?.edges[0].label).toBe('current label');
    expect((firstHit?.edges[0].data as Record<string, unknown>)?.businessMetadata).toEqual({
      owner: 'current',
    });

    const firstHitPath = (firstHit?.edges[0].data as Record<string, unknown>)?.computedPath;
    if (Array.isArray(firstHitPath)) firstHitPath[1] = { x: 777, y: 777 };
    const secondHit = readBaseReactFlowDisplayCommittedSnapshot({
      inputSignature: '123',
      inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
      sourceEdges,
    });
    expect((secondHit?.edges[0].data as Record<string, unknown>)?.computedPath).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(doesBaseReactFlowDisplayCommittedBaselineMatchIdentity(
      secondHit?.baseline ?? null,
      '123',
      `geometry-v1:${'a'.repeat(32)}`,
    )).toBe(true);
    expect(doesBaseReactFlowDisplayCommittedBaselineMatchIdentity(
      secondHit?.baseline ?? null,
      '124',
      `geometry-v1:${'a'.repeat(32)}`,
    )).toBe(false);
  });

  it('rejects invalid committed identities and evicts the oldest bounded entry', () => {
    const sourceEdges: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 20, y: 0 }] },
    }];
    const routedEdges: Edge[] = [{
      ...sourceEdges[0],
      data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    }];
    const displayPatches = createBaseReactFlowDisplayEdgePatches(sourceEdges, routedEdges);
    const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(routedEdges);
    if (!displayPatches || !outputRouteSignature) {
      throw new Error('expected a valid committed display snapshot');
    }
    expect(writeBaseReactFlowDisplayCommittedSnapshot({
      inputSignature: 'invalid',
      inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
      sourceEdges,
      sourceNodes: [],
      displayPatches,
      outputRouteSignature,
    })).toBe(false);
    expect(writeBaseReactFlowDisplayCommittedSnapshot({
      inputSignature: '1',
      inputGeometryDigest: 'invalid-digest',
      sourceEdges,
      sourceNodes: [],
      displayPatches,
      outputRouteSignature,
    })).toBe(false);

    for (let index = 0; index < 17; index += 1) {
      expect(writeBaseReactFlowDisplayCommittedSnapshot({
        inputSignature: String(index + 1),
        inputGeometryDigest: `geometry-v1:${index.toString(16).padStart(32, '0')}`,
        sourceEdges,
        sourceNodes: [],
        displayPatches,
        outputRouteSignature,
      })).toBe(true);
    }
    expect(readBaseReactFlowDisplayCommittedSnapshot({
      inputSignature: '1',
      inputGeometryDigest: `geometry-v1:${'0'.repeat(32)}`,
      sourceEdges,
    })).toBeNull();
    expect(readBaseReactFlowDisplayCommittedSnapshot({
      inputSignature: '17',
      inputGeometryDigest: `geometry-v1:${(16).toString(16).padStart(32, '0')}`,
      sourceEdges,
    })?.outputRouteSignature).toBe(outputRouteSignature);
  });

  it('does not traverse routing inputs while a node is being dragged', () => {
    const compute = vi.fn(() => 'computed');

    expect(resolveBaseReactFlowRoutingComputation({
      isNodeDragging: true,
      pausedValue: 'drag-paused',
      compute,
    })).toBe('drag-paused');
    expect(compute).not.toHaveBeenCalled();
  });

  it('recomputes routing inputs after the drag finishes', () => {
    const compute = vi.fn(() => 'computed');

    expect(resolveBaseReactFlowRoutingComputation({
      isNodeDragging: false,
      pausedValue: 'drag-paused',
      compute,
    })).toBe('computed');
    expect(compute).toHaveBeenCalledOnce();
  });

  it('keeps drag mutation incident-only while siblings remain frozen context', () => {
    const baselineNodes = [
      {
        id: 'tms',
        position: { x: 0, y: 0 },
        measured: { width: 100, height: 60 },
        data: {},
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `target-${index}`,
        position: { x: 300, y: index * 100 },
        measured: { width: 100, height: 60 },
        data: {},
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `peer-${index}`,
        position: { x: 600, y: index * 100 },
        measured: { width: 100, height: 60 },
        data: {},
      })),
    ];
    const nextNodes = baselineNodes.map(node => (
      node.id === 'tms'
        ? { ...node, position: { x: 40, y: 20 } }
        : node
    ));
    const incidentEdges: Edge[] = Array.from({ length: 6 }, (_, index) => ({
      id: `incident-${index}`,
      source: 'tms',
      target: `target-${index}`,
      data: {
        computedPath: [
          { x: 100, y: 30 },
          { x: 300, y: index * 100 + 30 },
        ],
      },
    }));
    const siblingEdges: Edge[] = Array.from({ length: 6 }, (_, index) => ({
      id: `sibling-${index}`,
      source: `peer-${index}`,
      target: `target-${index}`,
      data: {
        computedPath: [
          { x: 600, y: index * 100 + 30 },
          { x: 400, y: index * 100 + 30 },
        ],
      },
    }));
    const allEdges = [...incidentEdges, ...siblingEdges];
    const changeSet = createBaseReactFlowRoutingChangeSet({
      previousNodes: baselineNodes,
      previousEdges: allEdges,
      nextNodes,
      nextEdges: allEdges,
      reasonHint: 'node-drag',
    });
    const closure = createBaseReactFlowRoutingAffectedClosure({
      changeSet,
      previousNodes: baselineNodes,
      nextNodes,
      baselineEdges: allEdges,
      nextEdges: allEdges,
    });

    expect(changeSet).toMatchObject({
      reason: 'node-drag',
      changedNodeIds: ['tms'],
      topologyChanged: false,
      geometryChanged: true,
    });
    expect(closure.mutableEdgeIds).toEqual(incidentEdges.map(edge => edge.id).sort());
    expect(closure.contextEdgeIds).toEqual(siblingEdges.map(edge => edge.id).sort());
  });

  it('classifies resize, port policy, container, and topology changes deterministically', () => {
    const baselineNodes = [
      { id: 'source', position: { x: 0, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
      { id: 'target', position: { x: 300, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
    ];
    const baselineEdges: Edge[] = [{ id: 'edge', source: 'source', target: 'target' }];
    expect(createBaseReactFlowRoutingChangeSet({
      previousNodes: baselineNodes,
      previousEdges: baselineEdges,
      nextNodes: baselineNodes.map(node => node.id === 'source'
        ? { ...node, measured: { width: 140, height: 60 } }
        : node),
      nextEdges: baselineEdges,
    })).toMatchObject({ reason: 'node-resize', topologyChanged: false });
    expect(createBaseReactFlowRoutingChangeSet({
      previousNodes: baselineNodes,
      previousEdges: baselineEdges,
      nextNodes: baselineNodes,
      nextEdges: [{ ...baselineEdges[0], sourceHandle: 'right' }],
    })).toMatchObject({ reason: 'port-policy', topologyChanged: true });
    expect(createBaseReactFlowRoutingChangeSet({
      previousNodes: baselineNodes,
      previousEdges: baselineEdges,
      nextNodes: baselineNodes.map(node => node.id === 'target'
        ? { ...node, parentId: 'container' }
        : node),
      nextEdges: baselineEdges,
    })).toMatchObject({ reason: 'container-change', topologyChanged: true });
    expect(createBaseReactFlowRoutingChangeSet({
      previousNodes: baselineNodes,
      previousEdges: baselineEdges,
      nextNodes: [...baselineNodes, { id: 'new', position: { x: 0, y: 100 }, data: {} }],
      nextEdges: baselineEdges,
    })).toMatchObject({ reason: 'node-add', topologyChanged: true });
  });

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
    expect(resolveBaseReactFlowDisplayWorkerTimeoutMs(900_000, 'full')).toBe(60_000);
    expect(resolveBaseReactFlowDisplayWorkerTimeoutMs(120_000, 'full')).toBe(120_000);
  });

  it('transfers only routing-owned cache patches into validate-or-route', async () => {
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
    expect(request.candidateEdges).toBeUndefined();
    expect(request.candidatePatches[0]).toMatchObject({
      id: 'edge',
      source: 'source',
      target: 'target',
      type: 'stablePath',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }],
      },
    });
    expect(request.candidatePatches[0].label).toBeUndefined();
    expect(request.candidatePatches[0].style).toBeUndefined();
    expect(request.candidatePatches[0].markerEnd).toBeUndefined();
    expect(request.candidatePatches[0].className).toBeUndefined();
    expect(request.candidatePatches[0].data.businessMetadata).toBeUndefined();
    expect(request.candidatePatches[0].data.treeRouting).toBeUndefined();
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
      candidatePatches: [{
        id: 'edge',
        source: 'source',
        target: 'target',
        type: 'stablePath',
        sourceHandle: 'right',
        targetHandle: 'left',
        data: {
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
    expect((harness.posted[0] as any).candidatePatches).toBeUndefined();
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

  it('uses lightweight built-in paths for smart edges during interactive fallback', () => {
    const plain = { id: 'plain', source: 'source', target: 'target', type: 'straight' };
    const smart = { id: 'smart', source: 'source', target: 'target', type: 'advanced-smart-step' };
    const inheritedSmart = { id: 'inherited-smart', source: 'source', target: 'target' };
    const input = [plain, smart, inheritedSmart];
    const fallback = createBaseReactFlowInteractiveFallbackEdges(input);

    expect(fallback).not.toBe(input);
    expect(fallback[0]).toBe(plain);
    expect(fallback[1]).toEqual({
      ...smart,
      type: 'smoothstep',
    });
    expect(fallback[2]).toEqual({
      ...inheritedSmart,
      type: 'smoothstep',
    });
    expect(createBaseReactFlowInteractiveFallbackEdges([plain])[0]).toBe(plain);
  });

  it('computes cache and collision identities in one equivalent traversal', () => {
    const input = {
      nodes: [
        {
          id: 'source',
          type: 'flowchart',
          position: { x: 10.25, y: 20.5 },
          measured: { width: 120, height: 48 },
          data: { layoutDirection: 'LR' },
        },
        {
          id: 'target',
          type: 'flowchart',
          position: { x: 320, y: 120 },
          measured: { width: 140, height: 56 },
          data: {},
        },
      ],
      edges: [{
        id: 'edge',
        source: 'source',
        target: 'target',
        type: 'stablePath',
        sourceHandle: 'right',
        targetHandle: 'left',
        data: {
          computedPath: [
            { x: 130, y: 44 },
            { x: 220, y: 44 },
            { x: 220, y: 148 },
            { x: 320, y: 148 },
          ],
        },
      }],
      enableSmartEdges: true,
      smartEdgePadding: 18,
      isLargeGraph: true,
    };

    expect(computeBaseReactFlowDisplayInputIdentityBundle(input)).toEqual({
      cacheSignature: computeBaseReactFlowDisplayCacheSignature(input),
      geometryDigest: computeBaseReactFlowDisplayGeometryDigest(input),
    });
  });

  it('uses endpoint-driven fallback for stable routes during node dragging', () => {
    const stable = {
      id: 'stable',
      source: 'source',
      target: 'target',
      type: 'stablePath',
      data: {
        computedPath: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      },
    };
    const plain = { id: 'plain', source: 'source', target: 'target', type: 'straight' };

    const fallback = createBaseReactFlowNodeDragFallbackEdges([stable, plain]);

    expect(fallback[0]).toEqual({
      ...stable,
      type: 'smoothstep',
    });
    expect(fallback[1]).toBe(plain);
  });

  it('limits drag fallback conversion to edges touching the dragged nodes', () => {
    const incident = {
      id: 'incident',
      source: 'dragged',
      target: 'target',
      type: 'advanced-smart',
    };
    const unrelated = {
      id: 'unrelated',
      source: 'other-source',
      target: 'other-target',
      type: 'advanced-smart',
    };

    const fallback = createBaseReactFlowNodeDragFallbackEdges(
      [incident, unrelated],
      ['dragged'],
    );

    expect(fallback[0]).toEqual({
      ...incident,
      type: 'smoothstep',
    });
    expect(fallback[1]).toBe(unrelated);
  });

  it('ignores unselected descendants when resolving drag fallback nodes', () => {
    expect(resolveBaseReactFlowNodeDragFallbackIds('primary', [
      { id: 'primary', selected: true },
      { id: 'selected-peer', selected: true },
      { id: 'unselected-descendant', selected: false },
    ])).toEqual(['primary', 'selected-peer']);
  });

  it('keeps drag fallback visible throughout dragging and pending rerouting', () => {
    expect(shouldUseBaseReactFlowNodeDragFallback({
      isNodeDragging: true,
      dragFallbackPending: false,
      hasResolvedEdges: false,
      sourceEdgeCount: 4,
    })).toBe(true);
    expect(shouldUseBaseReactFlowNodeDragFallback({
      isNodeDragging: false,
      dragFallbackPending: true,
      hasResolvedEdges: false,
      sourceEdgeCount: 4,
    })).toBe(true);
    expect(shouldUseBaseReactFlowNodeDragFallback({
      isNodeDragging: false,
      dragFallbackPending: true,
      hasResolvedEdges: true,
      sourceEdgeCount: 4,
    })).toBe(true);
    expect(shouldUseBaseReactFlowNodeDragFallback({
      isNodeDragging: true,
      dragFallbackPending: false,
      hasResolvedEdges: true,
      sourceEdgeCount: 4,
    })).toBe(true);
    expect(shouldUseBaseReactFlowNodeDragFallback({
      isNodeDragging: false,
      dragFallbackPending: false,
      hasResolvedEdges: true,
      sourceEdgeCount: 4,
    })).toBe(false);
    expect(shouldUseBaseReactFlowNodeDragFallback({
      isNodeDragging: true,
      dragFallbackPending: true,
      hasResolvedEdges: false,
      sourceEdgeCount: 0,
    })).toBe(false);
  });

  it('rejects every non-hard-clean result regardless of interactive mode', () => {
    expect(shouldRepairBaseReactFlowDisplayResult({
      qualityMode: 'interactive',
      hardClean: false,
    })).toBe(true);
    expect(shouldRepairBaseReactFlowDisplayResult({
      qualityMode: 'full',
      hardClean: false,
    })).toBe(true);
    expect(canCommitBaseReactFlowDisplayResult({
      qualityMode: 'interactive',
      hardClean: false,
      routeResolution: 'full-route',
      routesMatch: true,
    })).toBe(false);
    expect(canCommitBaseReactFlowDisplayResult({
      qualityMode: 'interactive',
      hardClean: false,
      routeResolution: 'full-route',
      routesMatch: false,
    })).toBe(false);
  });

  it('preserves measured route timing when the committed render reuses the exact route', () => {
    const current = {
      stage: 'final-applied',
      signature: 'input-1',
      inputGeometryDigest: 'geometry-1',
      outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
      scheduledAt: 100,
      workerStartedAt: 180,
      finalAppliedAt: 620,
      routeMs: 440,
      totalRouteMs: 520,
    };

    expect(resolveDisplayRoutingCommittedReuseTiming({
      current,
      signature: 'input-1',
      inputGeometryDigest: 'geometry-1',
      outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
      now: 900,
    })).toMatchObject({
      scheduledAt: 100,
      workerStartedAt: 180,
      finalAppliedAt: 620,
      routeMs: 440,
      totalRouteMs: 520,
    });

    expect(resolveDisplayRoutingCommittedReuseTiming({
      current,
      signature: 'input-2',
      inputGeometryDigest: 'geometry-2',
      outputRouteSignature: 'route-v2:1:2:fedcba9876543210',
      now: 900,
    })).toEqual({
      scheduledAt: undefined,
      workerStartedAt: undefined,
      finalAppliedAt: 900,
      routeMs: undefined,
      totalRouteMs: undefined,
      phaseTrace: undefined,
      workerResolution: undefined,
      hardGateDiagnostics: undefined,
    });
  });
});
