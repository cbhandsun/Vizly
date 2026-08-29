// @vitest-environment jsdom

import type React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calculateLayeredLayoutWithReverse: vi.fn(),
  createLazyElkLayoutExecutor: vi.fn(),
  disposeElkLayoutExecutor: vi.fn(),
  disposeWorker: vi.fn(),
  flushObstacles: vi.fn(),
  loadDomainCompoundElkStrategy: vi.fn(),
  loadDomainElkStrategy: vi.fn(),
  stageLayoutRouting: vi.fn(),
}));

vi.mock('@/core/config/DiagramConfig', () => ({
  diagramConfigManager: { getConfig: () => ({ performance: {} }) },
}));

vi.mock('../../../shared/baseReactFlowDisplayWorkerClient', () => ({
  disposeBaseReactFlowDisplayWorker: mocks.disposeWorker,
}));

vi.mock('../../../shared/baseReactFlowLayoutRoutingTransaction', () => ({
  clearBaseReactFlowLayoutNodeRuntimeGeometry: (nodes: Node[]) => nodes,
  stageBaseReactFlowLayoutRouting: mocks.stageLayoutRouting,
}));

vi.mock('../../../../utils/animateLayoutTransition', () => ({
  runAfterLayoutRenderFrames: (callback: () => void) => {
    callback();
    return Promise.resolve();
  },
}));

vi.mock('../../../custom-edges/obstacleContext', () => ({
  flushObstacles: mocks.flushObstacles,
}));

vi.mock('../layoutStrategyRuntime', () => ({
  createLazyElkLayoutExecutor: mocks.createLazyElkLayoutExecutor,
  LAYERED_TREE_ROUTING_SPACING: { levelSpacing: 120, nodeSpacing: 120 },
  loadDomainCompoundElkStrategy: mocks.loadDomainCompoundElkStrategy,
  loadDomainElkStrategy: mocks.loadDomainElkStrategy,
}));

vi.mock('../reverseLayeredLayoutGeometry', () => ({
  calculateLayeredLayoutWithReverse: mocks.calculateLayeredLayoutWithReverse,
}));

vi.mock('../../../../strategies/DomainDagreLayoutStrategy', () => ({
  DomainDagreLayoutStrategy: class {
    getName = () => 'domain-dagre';
  },
}));

import { useLayoutRoutingTransaction } from '../useLayoutRoutingTransaction';
import { useLayoutStrategy } from '../useLayoutStrategy';
import { createBaseReactFlowRoutingSessionRuntime } from '../../../shared/baseReactFlowRoutingSessionRuntime';
import { readDisplayRoutingDebugState } from '../../../shared/baseReactFlowDisplayRoutingDebug';

const nodes: Node[] = [
  { id: 'source', position: { x: 0, y: 0 }, data: {} },
  { id: 'target', position: { x: 100, y: 0 }, data: {} },
];
const edges: Edge[] = [{ id: 'edge', source: 'source', target: 'target' }];
const routedEdges: Edge[] = [{
  ...edges[0],
  data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
}];

const createOptions = () => {
  const routingSessionRuntime = createBaseReactFlowRoutingSessionRuntime();
  return {
    routingSessionRuntime,
    setNodes: vi.fn() as React.Dispatch<React.SetStateAction<Node[]>>,
    setEdges: vi.fn() as React.Dispatch<React.SetStateAction<Edge[]>>,
    setLayoutStable: vi.fn() as React.Dispatch<React.SetStateAction<boolean>>,
    nodesRef: { current: nodes },
    edgesRef: { current: edges },
    takeSnapshot: vi.fn(),
    publishLayoutPreview: vi.fn(),
    clearLayoutPreview: vi.fn(),
  };
};

describe('useLayoutRoutingTransaction shared routing runtime', () => {
  beforeEach(() => {
    mocks.disposeWorker.mockReset();
    mocks.createLazyElkLayoutExecutor.mockReset();
    mocks.disposeElkLayoutExecutor.mockReset();
    mocks.flushObstacles.mockReset();
    mocks.calculateLayeredLayoutWithReverse.mockReset();
    mocks.loadDomainCompoundElkStrategy.mockReset();
    mocks.loadDomainElkStrategy.mockReset();
    mocks.stageLayoutRouting.mockReset();
    const elkStrategy = { getName: () => 'elk-layered' };
    mocks.createLazyElkLayoutExecutor.mockReturnValue({
      run: vi.fn(),
      dispose: mocks.disposeElkLayoutExecutor,
    });
    mocks.loadDomainCompoundElkStrategy.mockResolvedValue(elkStrategy);
    mocks.loadDomainElkStrategy.mockResolvedValue(elkStrategy);
    mocks.stageLayoutRouting.mockResolvedValue({
      committedSourceEdges: edges,
      routedEdges,
      commitSnapshot: vi.fn(() => true),
    });
    document.documentElement.removeAttribute('data-vizly-display-routing');
    delete (window as Window & { __vizlyBaseReactFlowDisplayRouting?: unknown })
      .__vizlyBaseReactFlowDisplayRouting;
  });

  it('publishes a committed job-level outcome after layout routing succeeds', async () => {
    mocks.calculateLayeredLayoutWithReverse.mockResolvedValueOnce({ nodes, edges });
    const options = createOptions();
    const { result } = renderHook(() => useLayoutStrategy({
      ...options,
      reactFlowInstance: null,
    }));

    await act(async () => {
      await expect(result.current.handleStrategyLayout('domain-elk')).resolves.toBe(true);
    });

    expect(readDisplayRoutingDebugState()).toMatchObject({
      layoutTransactionJobId: 1,
      layoutTransactionStatus: 'committed',
      layoutTransactionAttemptCount: 1,
      layoutTransactionErrorCode: undefined,
    });
  });

  it('keeps layout stability paused across a rejected lane attempt and compound fallback', async () => {
    const groupedNodes = nodes.map(node => ({
      ...node,
      data: { ...node.data, domain: 'operations' },
    }));
    mocks.calculateLayeredLayoutWithReverse
      .mockResolvedValueOnce({ nodes: groupedNodes, edges })
      .mockResolvedValueOnce({ nodes: groupedNodes, edges });
    mocks.stageLayoutRouting
      .mockRejectedValueOnce(new Error('layout-routing-hard-quality-rejected'))
      .mockResolvedValueOnce({
        committedSourceEdges: edges,
        routedEdges,
        commitSnapshot: vi.fn(() => true),
      });
    const options = createOptions();
    options.nodesRef.current = groupedNodes;
    options.clearLayoutPreview
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const { result } = renderHook(() => useLayoutStrategy({
      ...options,
      reactFlowInstance: null,
    }));

    await act(async () => {
      await expect(result.current.handleStrategyLayout('domain-lanes', undefined, 'LR'))
        .resolves.toBe(true);
    });

    expect(mocks.stageLayoutRouting).toHaveBeenCalledTimes(2);
    expect(options.setLayoutStable).toHaveBeenCalledTimes(3);
    expect(options.setLayoutStable).toHaveBeenNthCalledWith(1, false);
    expect(options.setLayoutStable).toHaveBeenNthCalledWith(2, false);
    expect(options.setLayoutStable).toHaveBeenNthCalledWith(3, true);
    expect(readDisplayRoutingDebugState()).toMatchObject({
      layoutTransactionJobId: 1,
      layoutTransactionStatus: 'committed',
      layoutTransactionAttemptCount: 2,
      layoutTransactionErrorCode: undefined,
    });
  });

  it('preempts display work and routes through the Canvas Worker ref', async () => {
    const options = createOptions();
    const displayJob = options.routingSessionRuntime.beginJob('display');
    const routingJob = options.routingSessionRuntime.beginJob('layout');
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));

    await act(async () => result.current({
      nodes,
      edges,
      routingJob,
      candidateRepairPolicy: 'skip-exact-clean',
    }));

    expect(displayJob.signal.aborted).toBe(true);
    expect(mocks.stageLayoutRouting).toHaveBeenCalledWith(expect.objectContaining({
      workerRef: options.routingSessionRuntime.workerRef,
      signal: expect.any(AbortSignal),
      candidateRepairPolicy: 'skip-exact-clean',
    }));
    expect(options.takeSnapshot).toHaveBeenCalledWith(nodes, edges);
    expect(options.setNodes).toHaveBeenCalledWith(nodes);
    expect(options.setEdges).toHaveBeenCalledWith(edges);
    expect(options.setLayoutStable).toHaveBeenNthCalledWith(1, false);
    expect(options.setLayoutStable).toHaveBeenLastCalledWith(true);
    expect(options.publishLayoutPreview).toHaveBeenCalledWith({ nodes, routingJob });
    expect(options.clearLayoutPreview).toHaveBeenCalledWith(routingJob);
  });

  it('publishes target geometry before routing finishes without authoritative writes', async () => {
    let resolveStage: ((value: {
      committedSourceEdges: Edge[];
      routedEdges: Edge[];
      commitSnapshot: () => boolean;
    }) => void) | undefined;
    mocks.stageLayoutRouting.mockReturnValueOnce(new Promise((resolve) => {
      resolveStage = resolve;
    }));
    const options = createOptions();
    const routingJob = options.routingSessionRuntime.beginJob('layout');
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));
    let layoutPromise: Promise<void> | undefined;

    act(() => {
      layoutPromise = result.current({ nodes, edges, routingJob });
    });

    await waitFor(() => expect(options.publishLayoutPreview).toHaveBeenCalledWith({
      nodes,
      routingJob,
    }));
    expect(mocks.stageLayoutRouting).toHaveBeenCalledTimes(1);
    expect(options.setNodes).not.toHaveBeenCalled();
    expect(options.setEdges).not.toHaveBeenCalled();
    expect(options.takeSnapshot).not.toHaveBeenCalled();

    resolveStage?.({ committedSourceEdges: edges, routedEdges, commitSnapshot: () => true });
    await act(async () => layoutPromise);
  });

  it('keeps the preview barrier until the committed viewport is painted', async () => {
    let releaseViewport: (() => void) | undefined;
    const beforePreviewRelease = vi.fn(() => new Promise<void>(resolve => {
      releaseViewport = resolve;
    }));
    const options = createOptions();
    const routingJob = options.routingSessionRuntime.beginJob('layout');
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));
    let layoutPromise: Promise<void> | undefined;

    act(() => {
      layoutPromise = result.current({
        nodes,
        edges,
        routingJob,
        beforePreviewRelease,
      });
    });

    await waitFor(() => expect(beforePreviewRelease).toHaveBeenCalledOnce());
    expect(options.setNodes).toHaveBeenCalledWith(nodes);
    expect(options.setEdges).toHaveBeenCalledWith(edges);
    expect(options.clearLayoutPreview).not.toHaveBeenCalled();
    expect(options.setLayoutStable).not.toHaveBeenLastCalledWith(true);

    releaseViewport?.();
    await act(async () => layoutPromise);

    expect(options.clearLayoutPreview).toHaveBeenCalledWith(routingJob);
    expect(options.setLayoutStable).toHaveBeenLastCalledWith(true);
  });

  it('fails open for the current preview when viewport painting fails', async () => {
    const options = createOptions();
    const routingJob = options.routingSessionRuntime.beginJob('layout');
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));

    await act(async () => {
      await expect(result.current({
        nodes,
        edges,
        routingJob,
        beforePreviewRelease: () => Promise.reject(new Error('fit failed')),
      })).rejects.toThrow('fit failed');
    });

    expect(options.clearLayoutPreview).toHaveBeenCalledWith(routingJob);
    expect(options.setLayoutStable).toHaveBeenLastCalledWith(true);
  });

  it('restores the old graph when current-job routing fails', async () => {
    mocks.stageLayoutRouting.mockRejectedValueOnce(new Error('routing failed'));
    const options = createOptions();
    const routingJob = options.routingSessionRuntime.beginJob('layout');
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));

    await act(async () => {
      await expect(result.current({ nodes, edges, routingJob })).rejects.toThrow('routing failed');
    });

    expect(options.publishLayoutPreview).toHaveBeenCalledTimes(1);
    expect(options.clearLayoutPreview).toHaveBeenCalledWith(routingJob);
    expect(options.setNodes).not.toHaveBeenCalled();
    expect(options.setEdges).not.toHaveBeenCalled();
    expect(options.takeSnapshot).not.toHaveBeenCalled();
  });

  it('keeps one job preview paused while a fallback attempt is pending', async () => {
    mocks.stageLayoutRouting.mockRejectedValueOnce(
      new Error('layout-routing-hard-quality-rejected'),
    );
    const options = createOptions();
    const routingJob = options.routingSessionRuntime.beginJob('layout');
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));

    await act(async () => {
      await expect(result.current({
        nodes,
        edges,
        routingJob,
        retainLayoutPreviewOnFailure: true,
      })).rejects.toThrow('layout-routing-hard-quality-rejected');
    });

    expect(options.publishLayoutPreview).toHaveBeenCalledWith({ nodes, routingJob });
    expect(options.clearLayoutPreview).not.toHaveBeenCalled();
    expect(options.setLayoutStable).toHaveBeenCalledWith(false);
    expect(options.setLayoutStable).not.toHaveBeenCalledWith(true);
  });

  it('rejects a layout response whose routing epoch was superseded', async () => {
    let resolveStage: ((value: {
      committedSourceEdges: Edge[];
      routedEdges: Edge[];
      commitSnapshot: () => boolean;
    }) => void) | undefined;
    mocks.stageLayoutRouting.mockReturnValueOnce(new Promise((resolve) => {
      resolveStage = resolve;
    }));
    const options = createOptions();
    const routingJob = options.routingSessionRuntime.beginJob('layout');
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));
    let layoutPromise: Promise<void> | undefined;

    act(() => {
      layoutPromise = result.current({ nodes, edges, routingJob });
    });
    await waitFor(() => expect(mocks.stageLayoutRouting).toHaveBeenCalled());
    options.routingSessionRuntime.beginJob('display');
    resolveStage?.({ committedSourceEdges: edges, routedEdges, commitSnapshot: vi.fn(() => true) });

    await act(async () => {
      await expect(layoutPromise).rejects.toThrow('layout-routing-cancelled');
    });
    expect(options.takeSnapshot).not.toHaveBeenCalled();
    expect(options.setNodes).not.toHaveBeenCalled();
    expect(options.setEdges).not.toHaveBeenCalled();
    expect(options.clearLayoutPreview).not.toHaveBeenCalled();
    expect(options.setLayoutStable).not.toHaveBeenCalledWith(true);
  });

  it('does not start staging for a layout intent superseded before the transaction', async () => {
    const options = createOptions();
    const routingJob = options.routingSessionRuntime.beginJob('layout');
    options.routingSessionRuntime.beginJob('display');
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));

    await act(async () => {
      await expect(result.current({ nodes, edges, routingJob }))
        .rejects.toThrow('layout-routing-cancelled');
    });

    expect(mocks.stageLayoutRouting).not.toHaveBeenCalled();
    expect(options.takeSnapshot).not.toHaveBeenCalled();
    expect(options.setNodes).not.toHaveBeenCalled();
    expect(options.setEdges).not.toHaveBeenCalled();
    expect(options.setLayoutStable).not.toHaveBeenCalled();
  });

  it('drops a deferred ELK result superseded before routing staging', async () => {
    let resolveLayout: ((value: { nodes: Node[]; edges: Edge[] }) => void) | undefined;
    mocks.calculateLayeredLayoutWithReverse.mockReturnValueOnce(new Promise((resolve) => {
      resolveLayout = resolve;
    }));
    const options = createOptions();
    const { result, unmount } = renderHook(() => useLayoutStrategy({
      ...options,
      reactFlowInstance: null,
    }));
    let layoutPromise: Promise<boolean> | undefined;

    act(() => {
      layoutPromise = result.current.handleStrategyLayout('domain-elk');
    });
    await waitFor(
      () => expect(mocks.calculateLayeredLayoutWithReverse).toHaveBeenCalled(),
      { timeout: 3_000 },
    );
    const elkLayoutRunner = mocks.createLazyElkLayoutExecutor.mock.results[0]?.value;
    expect(mocks.calculateLayeredLayoutWithReverse).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Array),
      expect.any(Array),
      expect.any(Object),
      expect.any(String),
      expect.any(Boolean),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        elkLayoutRunner,
      }),
    );

    options.nodesRef.current = nodes.map(node => ({
      ...node,
      position: { x: node.position.x + 25, y: node.position.y },
    }));
    options.edgesRef.current = edges.map(edge => ({ ...edge, label: 'newer graph' }));
    const displayJob = options.routingSessionRuntime.beginJob('display');
    resolveLayout?.({ nodes, edges });

    await act(async () => {
      await expect(layoutPromise).resolves.toBe(false);
    });

    expect(readDisplayRoutingDebugState()).toMatchObject({
      layoutTransactionJobId: 1,
      layoutTransactionStatus: 'failed',
      layoutTransactionAttemptCount: 1,
      layoutTransactionErrorCode: 'cancelled',
    });

    expect(mocks.stageLayoutRouting).not.toHaveBeenCalled();
    expect(options.takeSnapshot).not.toHaveBeenCalled();
    expect(options.setNodes).not.toHaveBeenCalled();
    expect(options.setEdges).not.toHaveBeenCalled();
    expect(options.routingSessionRuntime.isCurrentJob(displayJob)).toBe(true);
    unmount();
    expect(mocks.disposeElkLayoutExecutor).toHaveBeenCalledOnce();
  });
});
