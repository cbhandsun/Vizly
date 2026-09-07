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
import * as interactionLogging from '../diagramInteractionLogging';
import { createBaseReactFlowRoutingSessionRuntime } from '../../../shared/baseReactFlowRoutingSessionRuntime';
import { readDisplayRoutingDebugState } from '../../../shared/baseReactFlowDisplayRoutingDebug';
import type { LaneRankDecision } from '../../../../types/domainLaneRank';

const nodes: Node[] = [
  { id: 'source', position: { x: 0, y: 0 }, width: 60, height: 40, data: {} },
  { id: 'target', position: { x: 100, y: 0 }, width: 60, height: 40, data: {} },
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

const compactDecision: LaneRankDecision = {
  version: 1, policyVersion: 1, requested: 'auto', applied: 'compact',
  reason: 'compact-benefit', direction: 'TB', connectedInputFingerprint: 'test-connected-flow',
  metrics: { compact: { flowLength: 400, whitespaceRatio: 0.4, backwardTravel: 0, backwardEdgeCount: 0 } },
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

  it.each([
    ['layout-routing-hard-quality-rejected', 'hard-quality-rejected'],
    ['display-edge-worker-timeout', 'worker-timeout'],
    ['private provider payload must not reach the UI', 'strategy-failed'],
  ])('reports %s once without changing the previous canvas or selection', async (error, code) => {
    const logFailure = vi.spyOn(interactionLogging, 'logLayoutStrategyFailure').mockImplementation(() => undefined);
    mocks.calculateLayeredLayoutWithReverse.mockRejectedValueOnce(new Error(error));
    const options = { ...createOptions(), onLayoutFailure: vi.fn() };
    const { result } = renderHook(() => useLayoutStrategy({ ...options, reactFlowInstance: null }));
    const previousSelection = result.current.layoutSelection;
    await act(async () => {
      expect(await result.current.handleStrategyLayout('domain-elk')).toBe(false);
    });
    expect(options.onLayoutFailure).toHaveBeenCalledExactlyOnceWith(code);
    expect(options.setNodes).not.toHaveBeenCalled();
    expect(options.setEdges).not.toHaveBeenCalled();
    expect(result.current.layoutSelection).toEqual(previousSelection);
    expect(logFailure).toHaveBeenCalledExactlyOnceWith('domain-elk', new Error(code));
    logFailure.mockRestore();
  });

  it('reports an empty layout without claiming that a selection committed', async () => {
    const options = { ...createOptions(), onLayoutFailure: vi.fn() };
    options.nodesRef.current = [];
    const { result } = renderHook(() => useLayoutStrategy({ ...options, reactFlowInstance: null }));
    await act(async () => {
      expect(await result.current.handleStrategyLayout('domain-elk')).toBe(false);
    });
    expect(options.onLayoutFailure).toHaveBeenCalledExactlyOnceWith('no-layoutable-nodes');
    expect(options.setNodes).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'aborted', 'dom-aborted', 'superseded', 'unmounted'])(
    'does not notify a %s layout failure', async termination => {
      let rejectLayout: (error: Error) => void = () => undefined;
      mocks.calculateLayeredLayoutWithReverse.mockReturnValueOnce(new Promise((_, reject) => {
        rejectLayout = reject;
      }));
      const options = { ...createOptions(), onLayoutFailure: vi.fn() };
      const { result, unmount } = renderHook(() => useLayoutStrategy({ ...options, reactFlowInstance: null }));
      let pending: Promise<boolean> = Promise.resolve(false);
      act(() => { pending = result.current.handleStrategyLayout('domain-elk'); });
      await waitFor(() => expect(mocks.calculateLayeredLayoutWithReverse).toHaveBeenCalled());
      if (termination === 'superseded') options.routingSessionRuntime.beginJob('layout');
      if (termination === 'unmounted') unmount();
      await act(async () => {
        const standardError = new Error(termination === 'cancelled' ? 'layout-routing-cancelled' : 'failed');
        if (termination === 'aborted') standardError.name = 'AbortError';
        const error = termination === 'dom-aborted'
          ? new DOMException('operation aborted', 'AbortError')
          : standardError;
        rejectLayout(error);
        await pending;
      });
      expect(options.onLayoutFailure).not.toHaveBeenCalled();
    },
  );

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

  it('commits the requested preference and actual decision with the accepted canvas', async () => {
    mocks.calculateLayeredLayoutWithReverse.mockResolvedValue({
      nodes, edges, metadata: { laneRankDecision: compactDecision },
    });
    const options = createOptions();
    const { result } = renderHook(() => useLayoutStrategy({ ...options, reactFlowInstance: null }));
    await act(async () => {
      expect(await result.current.handleStrategyLayout('domain-lanes', 'dagre', 'TB', 'auto')).toBe(true);
    });
    expect(result.current.layoutSelection).toEqual({
      version: 2, strategy: 'domain-lanes', direction: 'TB', nodeLayout: 'dagre',
      laneRankPreference: 'auto', laneRankDecision: compactDecision,
    });
    expect(options.setNodes).toHaveBeenCalledOnce();
    expect(options.setEdges).toHaveBeenCalledOnce();
    mocks.stageLayoutRouting.mockRejectedValueOnce(new Error('layout-routing-hard-quality-rejected'));
    await act(async () => {
      expect(await result.current.handleStrategyLayout('domain-lanes', 'dagre', 'LR', 'global')).toBe(false);
    });
    expect(result.current.layoutSelection.laneRankDecision).toBe(compactDecision);
    expect(result.current.layoutSelection.laneRankPreference).toBe('auto');
    expect(result.current.layoutSelection.direction).toBe('TB');
    expect(mocks.calculateLayeredLayoutWithReverse.mock.lastCall?.[3]).toMatchObject({
      laneRankPreference: 'global', previousLaneRankDecision: compactDecision,
    });
  });

  it('commits selection before post-commit rendering yields to another layout', async () => {
    const options = createOptions();
    const commitSelection = vi.fn();
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));
    const routingJob = options.routingSessionRuntime.beginJob('layout');
    await act(async () => result.current({
      nodes, edges, routingJob, commitSelection,
      beforePreviewRelease: async () => {
        expect(commitSelection).toHaveBeenCalledOnce();
        options.routingSessionRuntime.beginJob('layout');
      },
    }));
    expect(commitSelection).toHaveBeenCalledOnce();
  });

  it('routes cyclic reverse-tree layouts through the shared reverse geometry adapter', async () => {
    const cyclicEdges: Edge[] = [
      ...edges,
      { id: 'return', source: 'target', target: 'source' },
    ];
    mocks.calculateLayeredLayoutWithReverse.mockResolvedValueOnce({
      nodes,
      edges: cyclicEdges,
    });
    const options = createOptions();
    options.edgesRef.current = cyclicEdges;
    const { result } = renderHook(() => useLayoutStrategy({
      ...options,
      reactFlowInstance: null,
    }));

    await act(async () => {
      await expect(result.current.handleStrategyLayout('tree', undefined, 'BT'))
        .resolves.toBe(true);
    });

    expect(mocks.calculateLayeredLayoutWithReverse).toHaveBeenCalledWith(
      expect.objectContaining({ getName: expect.any(Function) }),
      expect.any(Array),
      cyclicEdges,
      expect.objectContaining({ direction: 'BT', edgeRouting: 'ORTHOGONAL' }),
      'BT',
      false,
      expect.any(Object),
    );
    expect(mocks.stageLayoutRouting).toHaveBeenCalledWith(expect.objectContaining({
      candidateRepairPolicy: 'skip-exact-clean',
    }));
  });

  it('keeps layout stability paused across a rejected legacy domain attempt and compound fallback', async () => {
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
      await expect(result.current.handleStrategyLayout('domain-dagre', undefined, 'LR'))
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

  it.each(['TB', 'LR'] as const)('preserves the committed layout when explicit %s swimlanes fail quality', async direction => {
    const groupedNodes = nodes.map(node => ({
      ...node,
      data: { ...node.data, domain: 'operations' },
    }));
    const laneNodes: Node[] = [
      { id: 'operations', type: 'titleGroup', position: { x: 0, y: 0 },
        width: 400, height: 200, data: { domain: 'operations' } },
      ...groupedNodes.map(node => ({ ...node, parentId: 'operations',
        position: { x: node.position.x + 20, y: 60 } })),
    ];
    mocks.calculateLayeredLayoutWithReverse.mockResolvedValueOnce({ nodes: laneNodes, edges });
    mocks.stageLayoutRouting.mockRejectedValueOnce(new Error('layout-routing-hard-quality-rejected'));
    const options = createOptions();
    options.nodesRef.current = groupedNodes;
    // Match the real preview release: only its first owner can release it.
    options.clearLayoutPreview.mockReturnValueOnce(true).mockReturnValue(false);
    const { result } = renderHook(() => useLayoutStrategy({ ...options, reactFlowInstance: null }));
    const previousStrategy = result.current.lastDomainStrategy;
    const previousDirection = result.current.lastDomainDirection;

    await act(async () => {
      await expect(result.current.handleStrategyLayout('domain-lanes', undefined, direction))
        .resolves.toBe(false);
    });

    expect(mocks.stageLayoutRouting).toHaveBeenCalledTimes(1);
    expect(mocks.calculateLayeredLayoutWithReverse).toHaveBeenCalledTimes(1);
    expect(mocks.calculateLayeredLayoutWithReverse.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({
        direction,
        spacing: direction === 'LR'
          ? { horizontal: 96, vertical: 120 }
          : { horizontal: 120, vertical: 96 },
      }),
    );
    expect(mocks.loadDomainCompoundElkStrategy).not.toHaveBeenCalled();
    expect(mocks.loadDomainElkStrategy).not.toHaveBeenCalled();
    expect(options.setNodes).not.toHaveBeenCalled();
    expect(options.setEdges).not.toHaveBeenCalled();
    expect(options.takeSnapshot).not.toHaveBeenCalled();
    expect(options.setLayoutStable).toHaveBeenCalledTimes(2);
    expect(options.setLayoutStable).toHaveBeenNthCalledWith(1, false);
    expect(options.setLayoutStable).toHaveBeenNthCalledWith(2, true);
    expect(options.clearLayoutPreview).toHaveBeenCalledTimes(2);
    expect(result.current.lastDomainStrategy).toBe(previousStrategy);
    expect(result.current.lastDomainDirection).toBe(previousDirection);
    expect(readDisplayRoutingDebugState()).toMatchObject({
      layoutTransactionJobId: 1,
      layoutTransactionStatus: 'failed',
      layoutTransactionAttemptCount: 1,
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

describe('layout geometry at the atomic commit boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stageLayoutRouting.mockResolvedValue({ committedSourceEdges: edges, routedEdges, commitSnapshot: () => true });
  });

  it.each([false, true])('rejects overlapping target nodes before routing, with edges=%s', hasEdges => {
    const options = createOptions();
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));
    const bad = [nodes[0], { ...nodes[1], position: { ...nodes[0].position } }];
    return act(async () => {
      await expect(result.current({ nodes: bad, edges: hasEdges ? edges : [], routingJob: options.routingSessionRuntime.beginJob('layout') }))
        .rejects.toThrow('layout-routing-hard-quality-rejected');
      expect(options.setNodes).not.toHaveBeenCalled();
      expect(options.takeSnapshot).not.toHaveBeenCalled();
      expect(mocks.stageLayoutRouting).not.toHaveBeenCalled();
    });
  });

  it('rejects actual-parent overflow even when no edge can expose the error', async () => {
    const options = createOptions();
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));
    const bad: Node[] = [
      { id: 'D', type: 'titleGroup', position: { x: 0, y: 0 }, width: 100, height: 100, data: {} },
      { ...nodes[0], parentId: 'D', position: { x: 200, y: 200 } },
    ];
    await act(async () => {
      await expect(result.current({ nodes: bad, edges: [], routingJob: options.routingSessionRuntime.beginJob('layout') }))
        .rejects.toThrow('layout-routing-hard-quality-rejected');
    });
    expect(options.setNodes).not.toHaveBeenCalled();
    expect(options.routingSessionRuntime.readLayoutAcceptance()).toBeNull();
  });

  it.each([false, true])('normalizes data-hidden and collapsed descendants before validation and publication, edges=%s', async hasEdges => {
    const options = createOptions();
    const candidate: Node[] = [...nodes,
      { id: 'hidden', position: { x: 0, y: 0 }, data: { hidden: true } },
      { id: 'D', type: 'titleGroup', position: { x: 500, y: 0 }, width: 100, height: 100,
        data: { collapsed: true, domain: 'D' } },
      { id: 'child', parentId: 'D', position: { x: 500, y: 500 }, data: { domain: 'D' } },
    ];
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));
    await act(async () => result.current({
      nodes: candidate, edges: hasEdges ? edges : [], routingJob: options.routingSessionRuntime.beginJob('layout'),
    }));
    const expected = candidate.map(node => ['hidden', 'child'].includes(node.id) ? { ...node, hidden: true } : node);
    expect(options.setNodes).toHaveBeenCalledWith(expected);
    expect(options.publishLayoutPreview).toHaveBeenCalledWith(expect.objectContaining({ nodes: expected }));
    if (hasEdges) expect(mocks.stageLayoutRouting).toHaveBeenCalledWith(expect.objectContaining({ sourceNodes: expected }));
    else expect(options.routingSessionRuntime.readLayoutAcceptance()?.geometry.clean).toBe(true);
    expect(candidate[2].hidden).toBeUndefined();
    expect(candidate[4].hidden).toBeUndefined();
  });

  it('still rejects an invalid visible child of an explicitly hidden structural parent', async () => {
    const options = createOptions();
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));
    const candidate: Node[] = [
      { id: 'D', type: 'titleGroup', position: { x: 0, y: 0 }, width: 100, height: 100, hidden: true, data: {} },
      { ...nodes[0], parentId: 'D', position: { x: 200, y: 0 } },
    ];
    await act(async () => {
      await expect(result.current({ nodes: candidate, edges: [], routingJob: options.routingSessionRuntime.beginJob('layout') }))
        .rejects.toThrow('layout-routing-hard-quality-rejected');
    });
    expect(options.setNodes).not.toHaveBeenCalled();
  });

  it('accepts and retains the exact no-edge geometry with the selection in one current job', async () => {
    const options = createOptions();
    const selection = vi.fn();
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));
    await act(async () => result.current({ nodes, edges: [], routingJob: options.routingSessionRuntime.beginJob('layout'), commitSelection: selection }));
    expect(selection).toHaveBeenCalledOnce();
    expect(options.setNodes).toHaveBeenCalledWith(nodes);
    expect(options.routingSessionRuntime.readLayoutAcceptance()).toMatchObject({ version: 1, geometry: { clean: true }, route: null });
  });

  it('keeps the complete no-edge commit when a state writer starts synchronous routing work', async () => {
    const options = createOptions();
    const writeOrder: string[] = [];
    options.setNodes = () => {
      writeOrder.push('nodes');
      const nested = options.routingSessionRuntime.beginJob('display');
      expect(nested.signal.aborted).toBe(true);
      expect(options.routingSessionRuntime.isCurrentJob(nested)).toBe(false);
      expect(options.routingSessionRuntime.readLayoutAcceptance()).toBeNull();
    };
    options.setEdges = () => { writeOrder.push('edges'); };
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));
    await act(async () => result.current({
      nodes, edges: [], routingJob: options.routingSessionRuntime.beginJob('layout'),
      commitSelection: () => { writeOrder.push('selection'); },
    }));
    expect(writeOrder).toEqual(['nodes', 'edges', 'selection']);
    expect(options.routingSessionRuntime.readLayoutAcceptance()?.geometry.clean).toBe(true);
  });

  it('does not retain the pending envelope when a state writer throws', async () => {
    const options = createOptions();
    options.setNodes = () => { throw Error('state writer failed'); };
    const selection = vi.fn();
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));
    await act(async () => {
      await expect(result.current({
        nodes, edges: [], routingJob: options.routingSessionRuntime.beginJob('layout'), commitSelection: selection,
      })).rejects.toThrow('state writer failed');
    });
    expect(options.setEdges).not.toHaveBeenCalled();
    expect(selection).not.toHaveBeenCalled();
    expect(options.routingSessionRuntime.readLayoutAcceptance()).toBeNull();
  });

  it('rejects geometry changed while the same Worker request was pending', async () => {
    const options = createOptions();
    const target = structuredClone(nodes);
    mocks.stageLayoutRouting.mockImplementationOnce(async () => {
      target[1].position.x += 20;
      return { committedSourceEdges: edges, routedEdges, commitSnapshot: () => true };
    });
    const selection = vi.fn();
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));
    await act(async () => {
      await expect(result.current({ nodes: target, edges, routingJob: options.routingSessionRuntime.beginJob('layout'), commitSelection: selection }))
        .rejects.toThrow('layout-routing-hard-quality-rejected');
    });
    expect(selection).not.toHaveBeenCalled();
    expect(options.setNodes).not.toHaveBeenCalled();
  });

  it('rejects misaligned explicit lane contracts before touching the saved selection', async () => {
    const options = createOptions();
    const laneNodes: Node[] = [
      { id: 'a', type: 'titleGroup', position: { x: 0, y: 0 }, width: 100, height: 200, data: {} },
      { id: 'b', type: 'titleGroup', position: { x: 200, y: 20 }, width: 100, height: 200, data: {} },
    ];
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));
    await act(async () => {
      await expect(result.current({ nodes: laneNodes, edges: [], routingJob: options.routingSessionRuntime.beginJob('layout'), layoutConstraints: { lanes: { direction: 'TB', nodeIds: ['a', 'b'] } } }))
        .rejects.toThrow('layout-routing-hard-quality-rejected');
    });
    expect(options.setNodes).not.toHaveBeenCalled();
  });
});

it('carries explicit final swimlane constraints through the actual strategy command only for lane layouts', async () => {
  vi.clearAllMocks();
  const laneNodes: Node[] = [
    { id: 'lane-a', type: 'titleGroup', position: { x: 0, y: 0 }, width: 250, height: 250, data: { domain: 'A' } },
    { id: 'lane-b', type: 'titleGroup', position: { x: 400, y: 0 }, width: 250, height: 250, data: { domain: 'B' } },
    { ...nodes[0], parentId: 'lane-a', position: { x: 20, y: 50 }, data: { domain: 'A' } },
    { ...nodes[1], parentId: 'lane-b', position: { x: 20, y: 50 }, data: { domain: 'B' } },
  ];
  mocks.calculateLayeredLayoutWithReverse.mockResolvedValue({ nodes: laneNodes, edges });
  mocks.stageLayoutRouting.mockResolvedValue({ committedSourceEdges: edges, routedEdges, commitSnapshot: () => true });
  mocks.loadDomainElkStrategy.mockResolvedValue({ getName: () => 'elk-layered' });
  mocks.loadDomainCompoundElkStrategy.mockResolvedValue({ getName: () => 'compound-elk' });
  const options = createOptions();
  const { result } = renderHook(() => useLayoutStrategy({ ...options, reactFlowInstance: null }));
  await act(async () => {
    expect(await result.current.handleStrategyLayout('domain-lanes', 'grid', 'TB')).toBe(true);
  });
  expect(mocks.stageLayoutRouting.mock.lastCall?.[0].layoutConstraints).toEqual({ lanes: { direction: 'TB', nodeIds: ['lane-a', 'lane-b'] } });
  await act(async () => {
    expect(await result.current.handleStrategyLayout('domain-dagre', 'dagre', 'TB')).toBe(true);
  });
  expect(mocks.stageLayoutRouting.mock.lastCall?.[0].layoutConstraints).toBeUndefined();
});
