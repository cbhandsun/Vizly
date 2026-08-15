import { MarkerType, type Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { computeBaseReactFlowDisplayOutputRouteSignature } from '../baseReactFlowDisplayEdgeCore';
import {
  createBaseReactFlowDisplayEdgePatches,
  doBaseReactFlowDisplayRoutesMatchExactly,
  mergeBaseReactFlowDisplayEdgePatches,
  mergeBaseReactFlowDisplayRoutingTransactions,
  mergeTrustedBaseReactFlowDisplayCacheEntry,
  resolveBaseReactFlowDisplayCacheReplaySignature,
  sanitizeBaseReactFlowDisplayCachePatches,
  sanitizeBaseReactFlowTrustedDisplayPatches,
} from '../baseReactFlowDisplayRoutingTransaction';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerClient';

describe('baseReactFlowDisplayRoutingTransaction', () => {
  it('uses projected route and repair baselines without overwriting latest metadata', () => {
    const longLabel = `latest-${'x'.repeat(25_000)}`;
    const deeplyNestedMetadata = {
      level1: { level2: { level3: { level4: { level5: { level6: { level7: { level8: 'kept' } } } } } } },
    };
    const latest = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      label: longLabel,
      className: 'latest-class',
      data: {
        businessMetadata: deeplyNestedMetadata,
        computedPath: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
      },
    }];
    const routeProjection = projectBaseReactFlowDisplayWorkerInput({ edges: latest, nodes: [] });
    const routedResponse = [{
      ...routeProjection.edges[0],
      sourceHandle: 'right',
      data: {
        ...(routeProjection.edges[0].data || {}),
        computedPath: [{ x: 0, y: 0 }, { x: 80, y: 0 }],
      },
    }];
    const routePatches = createBaseReactFlowDisplayEdgePatches(routeProjection.edges, routedResponse);
    expect(routePatches).not.toBeNull();
    const mergedRoute = mergeBaseReactFlowDisplayEdgePatches(latest, routePatches!);
    expect(mergedRoute).not.toBeNull();

    const repairProjection = projectBaseReactFlowDisplayWorkerInput({ edges: mergedRoute!, nodes: [] });
    const repairedResponse = [{
      ...repairProjection.edges[0],
      targetHandle: 'left',
      data: {
        ...(repairProjection.edges[0].data || {}),
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      },
    }];
    const repairPatches = createBaseReactFlowDisplayEdgePatches(repairProjection.edges, repairedResponse);
    expect(repairPatches).not.toBeNull();
    const mergedRepair = mergeBaseReactFlowDisplayEdgePatches(mergedRoute!, repairPatches!);

    expect(mergedRepair?.[0]).toMatchObject({
      label: longLabel,
      className: 'latest-class',
      sourceHandle: 'right',
      targetHandle: 'left',
    });
    expect((mergedRepair?.[0].data as any).businessMetadata).toEqual(deeplyNestedMetadata);
    expect((mergedRepair?.[0].data as any).computedPath).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it('replays a trusted route that clears stale terminal handles', () => {
    const source: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      type: 'advanced-smart-step',
      data: { computedPath: [{ x: 50, y: 100 }, { x: 50, y: 300 }] },
    }];
    const routed: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      type: 'stablePath',
      data: { computedPath: [{ x: 50, y: 100 }, { x: 50, y: 300 }] },
    }];

    const patches = createBaseReactFlowDisplayEdgePatches(source, routed);
    const safePatches = patches
      ? sanitizeBaseReactFlowTrustedDisplayPatches(source, patches)
      : null;
    const replayed = safePatches
      ? mergeBaseReactFlowDisplayEdgePatches(source, safePatches)
      : null;

    expect(replayed).not.toBeNull();
    expect(replayed?.[0].sourceHandle).toBeUndefined();
    expect(replayed?.[0].targetHandle).toBeUndefined();
    expect(computeBaseReactFlowDisplayOutputRouteSignature(replayed ?? []))
      .toBe(computeBaseReactFlowDisplayOutputRouteSignature(routed));
  });

  it('matches valid protocol-sized routes independently of the cache edge limit', () => {
    const routes = Array.from({ length: 301 }, (_, index) => ({
      id: `edge-${index}`,
      source: `source-${index}`,
      target: `target-${index}`,
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { computedPath: [{ x: 0, y: index }, { x: 100, y: index }] },
    }));
    const merged = routes.map(edge => ({
      ...edge,
      label: 'latest metadata',
      data: { ...edge.data, businessMetadata: { revision: 2 } },
    }));

    expect(computeBaseReactFlowDisplayOutputRouteSignature(merged)).toBeNull();
    expect(doBaseReactFlowDisplayRoutesMatchExactly(routes, merged)).toBe(true);
    merged[300] = {
      ...merged[300],
      data: {
        ...merged[300].data,
        computedPath: [{ x: 0, y: 300 }, { x: 101, y: 300 }],
      },
    };
    expect(doBaseReactFlowDisplayRoutesMatchExactly(routes, merged)).toBe(false);
  });

  it('rejects malformed routes even when both sides contain the same values', () => {
    const malformedCases = [
      [{ x: 0, y: 0 }],
      [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }],
      [{ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 0 }],
    ];
    for (const computedPath of malformedCases) {
      const edges = [{ id: 'edge', source: 'source', target: 'target', data: { computedPath } }];
      expect(doBaseReactFlowDisplayRoutesMatchExactly(edges, edges)).toBe(false);
    }
    const malformedTree = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        treeRouting: null,
      },
    }];
    expect(doBaseReactFlowDisplayRoutesMatchExactly(malformedTree, malformedTree)).toBe(false);
    const malformedIntent = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        sharedTrunkAware: 'yes',
      },
    }];
    expect(doBaseReactFlowDisplayRoutesMatchExactly(malformedIntent, malformedIntent)).toBe(false);
  });

  it('preserves one final worker transaction without requiring a repair delta', () => {
    const source = [{ id: 'edge', source: 'source', target: 'target', data: { label: 'old' } }];
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
    const merged = mergeBaseReactFlowDisplayRoutingTransactions({
      latestSourceEdges: latest,
      workerRoutingPatches: createBaseReactFlowDisplayEdgePatches(source, workerEdges)!,
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
    const source = [{ id: 'edge', source: 'source', target: 'target', data: { label: 'old' } }];
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
    const merged = mergeBaseReactFlowDisplayRoutingTransactions({
      latestSourceEdges: latest,
      workerRoutingPatches: createBaseReactFlowDisplayEdgePatches(source, workerEdges)!,
      repairRoutingPatches: createBaseReactFlowDisplayEdgePatches(workerEdges, repairedEdges)!,
    });
    const replayed = merged?.cachePatches
      ? mergeBaseReactFlowDisplayEdgePatches(latest, merged.cachePatches)
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
    const finalSignature = computeBaseReactFlowDisplayOutputRouteSignature(merged!.edges);
    expect(resolveBaseReactFlowDisplayCacheReplaySignature({
      sourceEdges: latest,
      finalEdges: merged!.edges,
      cachePatches: merged!.cachePatches!,
      finalOutputRouteSignature: finalSignature,
    })).toBe(finalSignature);
  });

  it('skips persistence when routing-only cache patches cannot replay the exact final intent', () => {
    const source = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { computedPath: [{ x: 100, y: 30 }, { x: 300, y: 30 }] },
    }];
    const finalEdges = [{
      ...source[0],
      data: {
        ...source[0].data,
        isTreeBus: true,
        treeRouting: {
          type: 'tree-out',
          trunkId: 'worker-created',
          effectiveSourceHandle: 'right',
          effectiveTargetHandle: 'left',
          points: [{ x: 100, y: 30 }, { x: 300, y: 30 }],
        },
      },
    }];
    const merged = mergeBaseReactFlowDisplayRoutingTransactions({
      latestSourceEdges: source,
      workerRoutingPatches: createBaseReactFlowDisplayEdgePatches(source, finalEdges)!,
      repairRoutingPatches: createBaseReactFlowDisplayEdgePatches(finalEdges, finalEdges)!,
    })!;
    const finalSignature = computeBaseReactFlowDisplayOutputRouteSignature(merged.edges);

    expect(merged.cachePatches).not.toBeNull();
    expect((merged.cachePatches![0].data as any)?.treeRouting).toBeUndefined();
    expect((merged.cachePatches![0].data as any)?.isTreeBus).toBeUndefined();
    expect(resolveBaseReactFlowDisplayCacheReplaySignature({
      sourceEdges: source,
      finalEdges: merged.edges,
      cachePatches: merged.cachePatches!,
      finalOutputRouteSignature: finalSignature,
    })).toBeNull();
  });

  it('keeps a hard-clean display transaction when an explicit routing deletion is not cacheable', () => {
    const source = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      style: { stroke: 'red' },
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 50, y: 0 }],
        elkPath: [{ x: 0, y: 0 }, { x: 50, y: 0 }],
        businessMetadata: { revision: 1 },
      },
    }];
    const finalEdges = [{
      ...source[0],
      type: 'stablePath',
      data: {
        ...source[0].data,
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        elkPath: undefined,
      },
    }];
    const merged = mergeBaseReactFlowDisplayRoutingTransactions({
      latestSourceEdges: source,
      workerRoutingPatches: createBaseReactFlowDisplayEdgePatches(source, finalEdges)!,
      repairRoutingPatches: createBaseReactFlowDisplayEdgePatches(finalEdges, finalEdges)!,
    });

    expect(merged).not.toBeNull();
    expect(merged!.cachePatches).toBeNull();
    expect((merged!.edges[0].data as any).computedPath).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(Object.prototype.hasOwnProperty.call(merged!.edges[0].data, 'elkPath')).toBe(true);
    expect((merged!.edges[0].data as any).elkPath).toBeUndefined();

    const latest: Edge[] = [{
      ...source[0],
      style: { stroke: 'blue' },
      selected: true,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: 'blue' },
      data: {
        ...source[0].data,
        businessMetadata: { revision: 2 },
      },
    }];
    const displayed = mergeBaseReactFlowDisplayEdgePatches(latest, merged!.displayPatches);
    expect(displayed?.[0]).toMatchObject({
      type: 'stablePath',
      style: { stroke: 'blue' },
      selected: true,
      animated: true,
      markerEnd: { type: 'arrowclosed', color: 'blue' },
    });
    expect((displayed?.[0].data as any).businessMetadata).toEqual({ revision: 2 });
    expect((displayed?.[0].data as any).elkPath).toBeUndefined();
  });

  it('keeps manual and fixed terminal sides source-owned while allowing automatic handles to move', () => {
    const basePatch = {
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    };
    const manualSource: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { manualHandleSides: ['source'] },
    }];
    expect(sanitizeBaseReactFlowDisplayCachePatches(manualSource, [{
      ...basePatch,
      sourceHandle: 'left',
      targetHandle: 'top',
    }])).toBeNull();

    const fixedTarget: Edge[] = [{
      ...manualSource[0],
      data: { targetPortPolicy: 'fixed' },
    }];
    expect(sanitizeBaseReactFlowDisplayCachePatches(fixedTarget, [{
      ...basePatch,
      sourceHandle: 'bottom',
      targetHandle: 'right',
    }])).toBeNull();

    const automatic: Edge[] = [{
      ...manualSource[0],
      data: {},
    }];
    expect(sanitizeBaseReactFlowDisplayCachePatches(automatic, [{
      ...basePatch,
      sourceHandle: 'bottom',
      targetHandle: 'top',
    }])).toEqual([{
      ...basePatch,
      sourceHandle: 'bottom',
      targetHandle: 'top',
    }]);
  });

  it.each([
    ['manualHandles=true', { manualHandles: true }],
    ['manualHandles role', { manualHandles: { source: true } }],
    ['legacy manualHandles', { _manualHandles: { source: true } }],
    ['manual handle position', { manualHandlePositions: ['source'] }],
    ['handle lock', { sourceHandleLocked: true }],
    ['handle position lock', { sourceHandlePositionLocked: true }],
    ['runtime lock=true', { runtimeHandleLock: true }],
    ['runtime lock role', { runtimeHandleLock: { source: true } }],
    ['legacy runtime lock', { _runtimeHandleLock: { source: true } }],
    ['fixed position policy', { sourcePortPolicy: 'fixed-pos' }],
  ] as const)('rejects a same-side handle-id rewrite for the exact %s lock', (_name, data) => {
    const source: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'right-port-1',
      targetHandle: 'left',
      data,
    }];

    expect(sanitizeBaseReactFlowDisplayCachePatches(source, [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'right-port-2',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    }])).toBeNull();
  });

  it('lets validated router output refine runtime locks without trusting persistent replay', () => {
    const source: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { runtimeHandleLock: { source: true, target: true } },
    }];
    const patch: Edge = {
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [{ x: 50, y: 60 }, { x: 50, y: 160 }],
        treeRouting: {
          effectiveSourceHandle: 'bottom',
          effectiveTargetHandle: 'top',
          points: [{ x: 50, y: 60 }, { x: 50, y: 160 }],
        },
      },
    };

    expect(sanitizeBaseReactFlowDisplayCachePatches(source, [patch])).toBeNull();
    expect(sanitizeBaseReactFlowTrustedDisplayPatches(source, [patch])).toEqual([patch]);

    const workerEdges = mergeBaseReactFlowDisplayEdgePatches(source, [patch])!;
    const transaction = mergeBaseReactFlowDisplayRoutingTransactions({
      latestSourceEdges: source,
      workerRoutingPatches: [patch],
      repairRoutingPatches: createBaseReactFlowDisplayEdgePatches(workerEdges, workerEdges)!,
    });
    expect(transaction?.edges[0]).toMatchObject({
      sourceHandle: 'bottom',
      targetHandle: 'top',
    });
    expect(transaction?.displayPatches).toEqual([patch]);
    expect(transaction?.cachePatches).toBeNull();
  });

  it.each([
    ['manual handle', { manualHandles: { source: true } }],
    ['manual handle over runtime lock', {
      manualHandles: { source: true },
      runtimeHandleLock: { source: true },
    }],
    ['position lock', { sourceHandlePositionLocked: true }],
    ['fixed position policy', { sourcePortPolicy: 'fixed-pos' }],
  ] as const)('keeps the source-authored %s immutable for trusted router output', (_name, data) => {
    const source: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data,
    }];
    expect(sanitizeBaseReactFlowTrustedDisplayPatches(source, [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 0, y: 100 }] },
    }])).toBeNull();
  });

  it('allows side-only declarations to retain the side while changing an automatic handle id', () => {
    const source: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'right-port-1',
      targetHandle: 'left',
      data: { manualHandleSides: ['source'] },
    }];
    const patch: Edge = {
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'right-port-2',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    };

    expect(sanitizeBaseReactFlowDisplayCachePatches(source, [patch])).toEqual([patch]);
  });

  it('projects trusted worker output to routing-only patches while retaining final trunk intent', () => {
    const source: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      type: 'advanced-smart-step',
      sourceHandle: 'right',
      targetHandle: 'left',
      label: 'current label',
      className: 'current-class',
      style: { stroke: 'green', strokeWidth: 2 },
      data: {
        businessMetadata: { owner: 'current' },
        computedPath: [{ x: 0, y: 0 }, { x: 50, y: 0 }],
        elkPath: [{ x: 0, y: 0 }, { x: 50, y: 0 }],
        sharedTrunkAware: false,
        sharedTrunkSynthesized: false,
        isTreeBus: false,
      },
    }];
    const workerEdges: Edge[] = [{
      ...source[0],
      type: 'stablePath',
      label: 'worker label must not persist',
      className: 'worker-class',
      style: { stroke: 'red', strokeWidth: 100 },
      selected: true,
      data: {
        ...(source[0].data || {}),
        businessMetadata: { owner: 'worker' },
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        elkPath: undefined,
        sharedTrunkAware: true,
        sharedTrunkSynthesized: true,
        isTreeBus: true,
        treeRouting: {
          type: 'tree-out',
          trunkId: 'worker-trunk',
          effectiveSourceHandle: 'right',
          effectiveTargetHandle: 'left',
          points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        },
        unexpectedWorkerMetadata: 'must not persist',
      },
    }];
    const merged = mergeBaseReactFlowDisplayRoutingTransactions({
      latestSourceEdges: source,
      workerRoutingPatches: createBaseReactFlowDisplayEdgePatches(source, workerEdges)!,
      repairRoutingPatches: createBaseReactFlowDisplayEdgePatches(workerEdges, workerEdges)!,
    });

    expect(merged).not.toBeNull();
    expect(merged!.cachePatches).toBeNull();
    expect(merged!.displayPatches[0]).not.toHaveProperty('label');
    expect(merged!.displayPatches[0]).not.toHaveProperty('className');
    expect(merged!.displayPatches[0]).not.toHaveProperty('style');
    expect(merged!.displayPatches[0]).not.toHaveProperty('selected');
    expect(merged!.displayPatches[0].data).toEqual({
      computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      elkPath: undefined,
      treeRouting: {
        effectiveSourceHandle: 'right',
        effectiveTargetHandle: 'left',
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      },
      sharedTrunkAware: true,
      sharedTrunkSynthesized: true,
      isTreeBus: true,
    });
    expect(Object.prototype.hasOwnProperty.call(merged!.displayPatches[0].data, 'elkPath')).toBe(true);

    const replayed = mergeBaseReactFlowDisplayEdgePatches(source, merged!.displayPatches);
    expect(replayed?.[0]).toMatchObject({
      label: 'current label',
      className: 'current-class',
      style: { stroke: 'green', strokeWidth: 2 },
    });
    expect((replayed?.[0].data as any).businessMetadata).toEqual({ owner: 'current' });
    expect((replayed?.[0].data as any).unexpectedWorkerMetadata).toBeUndefined();
    expect((replayed?.[0].data as any).sharedTrunkAware).toBe(true);
    expect((replayed?.[0].data as any).sharedTrunkSynthesized).toBe(true);
    expect((replayed?.[0].data as any).isTreeBus).toBe(true);
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
        ...routedFrom[0].data,
        computedPath: [{ x: 10, y: 20 }, { x: 100, y: 20 }],
        treeRouting: { points: [{ x: 10, y: 20 }, { x: 100, y: 20 }], mode: 'bus' },
        __baseDisplayFinalizedSignature: 'signature',
      },
    }];
    const latest: Edge[] = [{
      ...routedFrom[0],
      className: 'latest-class',
      hidden: true,
      selectable: false,
      style: { stroke: 'blue', strokeWidth: 4 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'blue' },
      data: {
        ...routedFrom[0].data,
        label: 'latest label',
        businessMetadata: { owner: 'latest' },
      },
    }];

    const patches = createBaseReactFlowDisplayEdgePatches(routedFrom, routed)!;
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
  });

  it('reuses a signed hard report only for the exact merged route', () => {
    const source = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [{ x: 10, y: 0 }, { x: 10, y: 100 }],
        treeRouting: {
          type: 'tree-out',
          trunkId: 'source-owned-trunk',
          effectiveSourceHandle: 'bottom',
          effectiveTargetHandle: 'top',
          points: [{ x: 10, y: 0 }, { x: 10, y: 100 }],
        },
      },
    }];
    const routed = [{
      ...source[0],
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
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
      data: { ...source[0].data, businessMetadata: { revision: 2 } },
    }];
    const patches = createBaseReactFlowDisplayEdgePatches(source, routed)!;
    const expectedMerged = mergeBaseReactFlowDisplayEdgePatches(latest, patches)!;
    const entry = {
      edges: patches,
      hardClean: true,
      outputRouteSignature: computeBaseReactFlowDisplayOutputRouteSignature(expectedMerged)!,
    };

    expect(mergeTrustedBaseReactFlowDisplayCacheEntry(latest, entry)).toEqual(expectedMerged);
    expect(mergeTrustedBaseReactFlowDisplayCacheEntry(latest, {
      ...entry,
      edges: patches.map(patch => ({ ...patch, sourceHandle: 'left' })),
    })).toBeNull();
    expect(mergeTrustedBaseReactFlowDisplayCacheEntry(latest, {
      ...entry,
      hardClean: false,
    })).toBeNull();
  });

  it('drops cached labels, metadata, and forged routing intent before merging', () => {
    const source: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      label: 'current label',
      className: 'current-class',
      style: { stroke: 'green', strokeWidth: 2 },
      markerStart: { type: MarkerType.Arrow, color: 'green' },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'green' },
      data: {
        businessMetadata: { owner: 'current' },
        sharedTrunkAware: false,
        sharedTrunkSynthesized: false,
        isTreeBus: false,
      },
    }];
    const expected: Edge[] = [{
      ...source[0],
      type: 'stablePath',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        ...source[0].data,
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      },
    }];
    const maliciousPatch: Edge = {
      id: 'edge',
      source: 'source',
      target: 'target',
      type: 'stablePath',
      sourceHandle: 'right',
      targetHandle: 'left',
      label: 'injected label',
      className: 'injected-class',
      style: { stroke: 'red', strokeWidth: 100 },
      markerStart: { type: MarkerType.ArrowClosed, color: 'red' },
      markerEnd: { type: MarkerType.Arrow, color: 'red' },
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        businessMetadata: { owner: 'attacker' },
        sharedTrunkAware: true,
        sharedTrunkSynthesized: true,
        isTreeBus: true,
        treeRouting: {
          type: 'tree-out',
          trunkId: 'forged-trunk',
          points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        },
      },
    };
    const merged = mergeTrustedBaseReactFlowDisplayCacheEntry(source, {
      edges: [maliciousPatch],
      hardClean: true,
      outputRouteSignature: computeBaseReactFlowDisplayOutputRouteSignature(expected)!,
    });

    expect(merged).toEqual(expected);
    expect(merged?.[0].label).toBe('current label');
    expect(merged?.[0].className).toBe('current-class');
    expect(merged?.[0].style).toEqual({ stroke: 'green', strokeWidth: 2 });
    expect(merged?.[0].markerStart).toEqual({ type: 'arrow', color: 'green' });
    expect(merged?.[0].markerEnd).toEqual({ type: 'arrowclosed', color: 'green' });
    expect((merged?.[0].data as any).businessMetadata).toEqual({ owner: 'current' });
    expect((merged?.[0].data as any).sharedTrunkAware).toBe(false);
    expect((merged?.[0].data as any).sharedTrunkSynthesized).toBe(false);
    expect((merged?.[0].data as any).isTreeBus).toBe(false);
    expect((merged?.[0].data as any).treeRouting).toBeUndefined();
    expect(mergeTrustedBaseReactFlowDisplayCacheEntry(source, {
      edges: [{ ...maliciousPatch, type: 'attacker-renderer' }],
      hardClean: true,
      outputRouteSignature: computeBaseReactFlowDisplayOutputRouteSignature(expected)!,
    })).toBeNull();
  });

  it('rejects mismatched route outputs and stale patch graphs', () => {
    const source = [{ id: 'edge', source: 'source', target: 'target' }];
    expect(createBaseReactFlowDisplayEdgePatches(source, [])).toBeNull();
    expect(createBaseReactFlowDisplayEdgePatches(source, [{
      id: 'other-edge', source: 'source', target: 'target',
    }])).toBeNull();
    expect(mergeBaseReactFlowDisplayEdgePatches([], source)).toBeNull();
    expect(mergeBaseReactFlowDisplayEdgePatches([{
      id: 'edge', source: 'source', target: 'different-target',
    }], source)).toBeNull();
  });
});
