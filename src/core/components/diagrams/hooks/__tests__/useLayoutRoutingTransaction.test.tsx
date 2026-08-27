// @vitest-environment jsdom

import type React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  disposeWorker: vi.fn(),
  flushObstacles: vi.fn(),
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

import { useLayoutRoutingTransaction } from '../useLayoutRoutingTransaction';
import { createBaseReactFlowRoutingSessionRuntime } from '../../../shared/baseReactFlowRoutingSessionRuntime';

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
  };
};

describe('useLayoutRoutingTransaction shared routing runtime', () => {
  beforeEach(() => {
    mocks.disposeWorker.mockReset();
    mocks.flushObstacles.mockReset();
    mocks.stageLayoutRouting.mockReset();
    mocks.stageLayoutRouting.mockResolvedValue({
      routedEdges,
      commitSnapshot: vi.fn(() => true),
    });
  });

  it('preempts display work and routes through the Canvas Worker ref', async () => {
    const options = createOptions();
    const displayJob = options.routingSessionRuntime.beginJob('display');
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));

    await act(async () => result.current({ nodes, edges }));

    expect(displayJob.signal.aborted).toBe(true);
    expect(mocks.stageLayoutRouting).toHaveBeenCalledWith(expect.objectContaining({
      workerRef: options.routingSessionRuntime.workerRef,
      signal: expect.any(AbortSignal),
    }));
    expect(options.takeSnapshot).toHaveBeenCalledWith(nodes, edges);
    expect(options.setNodes).toHaveBeenCalledWith(nodes);
    expect(options.setEdges).toHaveBeenCalledWith(routedEdges);
    expect(options.setLayoutStable).toHaveBeenNthCalledWith(1, false);
    expect(options.setLayoutStable).toHaveBeenLastCalledWith(true);
  });

  it('rejects a layout response whose routing epoch was superseded', async () => {
    let resolveStage: ((value: {
      routedEdges: Edge[];
      commitSnapshot: () => boolean;
    }) => void) | undefined;
    mocks.stageLayoutRouting.mockReturnValueOnce(new Promise((resolve) => {
      resolveStage = resolve;
    }));
    const options = createOptions();
    const { result } = renderHook(() => useLayoutRoutingTransaction(options));
    let layoutPromise: Promise<void> | undefined;

    act(() => {
      layoutPromise = result.current({ nodes, edges });
    });
    await waitFor(() => expect(mocks.stageLayoutRouting).toHaveBeenCalled());
    options.routingSessionRuntime.beginJob('display');
    resolveStage?.({ routedEdges, commitSnapshot: vi.fn(() => true) });

    await act(async () => {
      await expect(layoutPromise).rejects.toThrow('layout-routing-cancelled');
    });
    expect(options.takeSnapshot).not.toHaveBeenCalled();
    expect(options.setNodes).not.toHaveBeenCalled();
    expect(options.setEdges).not.toHaveBeenCalled();
    expect(options.setLayoutStable).toHaveBeenLastCalledWith(true);
  });
});
