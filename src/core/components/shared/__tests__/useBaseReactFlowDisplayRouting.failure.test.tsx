// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBaseReactFlowDisplayRouting } from '../useBaseReactFlowDisplayRouting';
import { computeBaseReactFlowDisplayEdgesInWorker, type BaseReactFlowDisplayWorkerResult } from '../baseReactFlowDisplayWorkerClient';
import { createBaseReactFlowRoutingSessionRuntime } from '../baseReactFlowRoutingSessionRuntime';
import { clearBaseReactFlowDisplayCommittedSnapshots } from '../baseReactFlowDisplayCommittedSnapshot';
import { resolveBaseReactFlowDisplayCandidate } from '../baseReactFlowDisplayCandidateResolver';
import { readDisplayRoutingDebugState } from '../baseReactFlowDisplayRoutingDebug';
import type { UseBaseReactFlowDisplayRoutingOptions } from '../baseReactFlowDisplayRoutingTypes';

vi.mock('../baseReactFlowDisplayWorkerClient', async (original) => ({
  ...await original<typeof import('../baseReactFlowDisplayWorkerClient')>(),
  prewarmBaseReactFlowDisplayWorker: vi.fn(),
  computeBaseReactFlowDisplayEdgesInWorker: vi.fn(),
}));
vi.mock('../baseReactFlowDisplayCandidateResolver', () => ({
  resolveBaseReactFlowDisplayCandidate: vi.fn(async () => ({ candidateEdges: null, source: 'miss' })),
}));
vi.mock('../baseReactFlowDisplayGeometryBarrier', async (original) => ({
  ...await original<typeof import('../baseReactFlowDisplayGeometryBarrier')>(),
  scheduleBaseReactFlowStableGeometry: ({ run }: { run: (result: { resolution: 'stable'; durationMs: number; sampleCount: number }) => void }) => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) run({ resolution: 'stable', durationMs: 0, sampleCount: 2 }); });
    return () => { cancelled = true; };
  },
}));

const edges: Edge[] = [{ id: 'sb', source: 's', target: 'b', type: 'advanced-smart-step' }];
const nodes: Node[] = [
  { id: 's', position: { x: 0, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
  { id: 'b', position: { x: 200, y: 0 }, measured: { width: 100, height: 60 }, data: {} },
];
const rejected: BaseReactFlowDisplayWorkerResult = {
  edges, projectedEdges: edges, routingPatches: [{ id: 'sb', source: 's', target: 'b', type: 'advanced-smart-step' }],
  hardClean: false, routeResolution: 'full-route', phaseTrace: [],
};

const setup = () => {
  const runtime = createBaseReactFlowRoutingSessionRuntime();
  const onNodeDragFallbackResolved = vi.fn();
  const options: UseBaseReactFlowDisplayRoutingOptions = {
    edges, routingNodes: nodes, routingGeometryReady: true, isContainerReady: true,
    enableSmartEdges: true, smartEdgePadding: 24, isLargeGraph: false,
    isNodeDragging: false, isNodeDragFallbackPending: true, nodeDragFallbackIds: ['b'],
    onNodeDragFallbackResolved, routingSessionRuntime: runtime,
  };
  const hook = renderHook((props: UseBaseReactFlowDisplayRoutingOptions) => useBaseReactFlowDisplayRouting(props), { initialProps: options });
  return { hook, runtime, options, onNodeDragFallbackResolved };
};

beforeEach(() => {
  vi.clearAllMocks();
  clearBaseReactFlowDisplayCommittedSnapshots();
});
afterEach(() => vi.clearAllMocks());

describe('display routing rejection lifecycle', () => {
  it('drops a display intent rejected during a synchronous layout commit before candidate loading', async () => {
    const { hook, runtime } = setup();
    const beginJob = runtime.beginJob;
    const layoutJob = beginJob('layout');
    vi.spyOn(runtime, 'beginJob').mockImplementation(owner => {
      const result = runtime.commitJob(layoutJob, () => beginJob(owner));
      if (!result.committed) throw Error('expected current layout commit');
      return result.value;
    });
    await act(async () => { await Promise.resolve(); });
    expect(resolveBaseReactFlowDisplayCandidate).not.toHaveBeenCalled();
    expect(computeBaseReactFlowDisplayEdgesInWorker).not.toHaveBeenCalled();
    expect(hook.result.current.failure).toBeNull();
    hook.unmount();
  });

  it('starts a fresh job when runtime changes with identical geometry after failure', async () => {
    vi.mocked(computeBaseReactFlowDisplayEdgesInWorker).mockResolvedValue(rejected);
    const { hook, options } = setup();
    await waitFor(() => expect(hook.result.current.failure?.reason).toBe('quality-rejected'));
    const nextRuntime = createBaseReactFlowRoutingSessionRuntime();
    hook.rerender({ ...options, routingSessionRuntime: nextRuntime });
    await waitFor(() => expect(computeBaseReactFlowDisplayEdgesInWorker).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hook.result.current.failure?.reason).toBe('quality-rejected'));
    hook.unmount();
    nextRuntime.dispose();
  });

  it('settles a current rejection once and blocks fallback after drag pending clears', async () => {
    vi.mocked(computeBaseReactFlowDisplayEdgesInWorker).mockResolvedValue(rejected);
    const { hook, options, onNodeDragFallbackResolved } = setup();
    await waitFor(() => expect(hook.result.current.failure?.reason).toBe('quality-rejected'));
    expect(hook.result.current.edges).toEqual([]);
    expect(onNodeDragFallbackResolved).toHaveBeenCalledOnce();
    expect(readDisplayRoutingDebugState()?.error).toBe('quality-rejected');
    hook.rerender({ ...options, isNodeDragFallbackPending: false, nodeDragFallbackIds: [] });
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current.edges).toEqual([]);
    expect(computeBaseReactFlowDisplayEdgesInWorker).toHaveBeenCalledOnce();
    hook.unmount();
  });

  it('ignores a rejected response from a superseded session', async () => {
    let complete: ((result: BaseReactFlowDisplayWorkerResult) => void) | undefined;
    vi.mocked(computeBaseReactFlowDisplayEdgesInWorker).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const { hook, runtime, onNodeDragFallbackResolved } = setup();
    await waitFor(() => expect(complete).toBeDefined());
    runtime.beginJob('layout');
    await act(async () => { complete?.(rejected); });
    expect(hook.result.current.failure).toBeNull();
    expect(onNodeDragFallbackResolved).not.toHaveBeenCalled();
    hook.unmount();
  });

  it.each([
    ['display-edge-worker-timeout', 'worker-timeout'],
    ['display-edge-worker-post-failed', 'worker-failed'],
    ['display-edge-worker-invalid-response', 'worker-failed'],
    ['private token=user-content', 'worker-failed'],
    ['display-edge-worker-cancelled', null],
  ] as const)('handles worker error %s without untrusted feedback', async (message, expected) => {
    vi.mocked(computeBaseReactFlowDisplayEdgesInWorker).mockRejectedValue(new Error(message));
    const { hook } = setup();
    await waitFor(() => expect(computeBaseReactFlowDisplayEdgesInWorker).toHaveBeenCalledOnce());
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current.failure?.reason ?? null).toBe(expected);
    if (expected) {
      expect(hook.result.current.edges).toEqual([]);
      expect(JSON.stringify(hook.result.current.failure)).not.toContain('private');
      expect(hook.result.current.failure?.workerFailureCode).toBe(message.startsWith('private') ? undefined : message);
    }
    hook.unmount();
  });
});
