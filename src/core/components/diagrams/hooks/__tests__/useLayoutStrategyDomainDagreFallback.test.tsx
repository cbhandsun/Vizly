// @vitest-environment jsdom

import type React from 'react';
import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { beforeEach, expect, it, vi } from 'vitest';

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

import { useLayoutStrategy } from '../useLayoutStrategy';
import { createBaseReactFlowRoutingSessionRuntime } from '../../../shared/baseReactFlowRoutingSessionRuntime';
import { readDisplayRoutingDebugState } from '../../../shared/baseReactFlowDisplayRoutingDebug';

const nodes: Node[] = [
  { id: 'source', position: { x: 0, y: 0 }, width: 60, height: 40, data: { domain: 'operations' } },
  { id: 'target', position: { x: 100, y: 0 }, width: 60, height: 40, data: { domain: 'operations' } },
];

const edges: Edge[] = [{ id: 'edge', source: 'source', target: 'target' }];
const routedEdges: Edge[] = [{
  ...edges[0],
  data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
}];

const createOptions = () => ({
  routingSessionRuntime: createBaseReactFlowRoutingSessionRuntime(),
  setNodes: vi.fn() as React.Dispatch<React.SetStateAction<Node[]>>,
  setEdges: vi.fn() as React.Dispatch<React.SetStateAction<Edge[]>>,
  setLayoutStable: vi.fn() as React.Dispatch<React.SetStateAction<boolean>>,
  nodesRef: { current: nodes },
  edgesRef: { current: edges },
  takeSnapshot: vi.fn(),
  publishLayoutPreview: vi.fn(),
  clearLayoutPreview: vi.fn(),
});

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
  document.documentElement.removeAttribute('data-vizly-display-routing');
});

it('falls back to domain-preserving compound ELK when a standard domain-dagre route is hard rejected', async () => {
  const compoundNodes = nodes.map(node => ({
    ...node,
    position: { x: node.position.x + 240, y: node.position.y + 80 },
  }));
  mocks.calculateLayeredLayoutWithReverse
    .mockResolvedValueOnce({ nodes, edges })
    .mockResolvedValueOnce({ nodes: compoundNodes, edges });
  mocks.stageLayoutRouting
    .mockRejectedValueOnce(new Error('layout-routing-hard-quality-rejected'))
    .mockResolvedValueOnce({
      committedSourceEdges: edges,
      routedEdges,
      commitSnapshot: vi.fn(() => true),
    });
  const options = createOptions();
  options.clearLayoutPreview.mockReturnValueOnce(true).mockReturnValueOnce(false);
  const { result } = renderHook(() => useLayoutStrategy({ ...options, reactFlowInstance: null }));

  await act(async () => {
    await expect(result.current.handleStrategyLayout('domain-dagre', 'dagre', 'TB'))
      .resolves.toBe(true);
  });

  expect(mocks.calculateLayeredLayoutWithReverse).toHaveBeenCalledTimes(2);
  expect(mocks.loadDomainCompoundElkStrategy).toHaveBeenCalledTimes(1);
  expect(mocks.stageLayoutRouting).toHaveBeenCalledTimes(2);
  expect(options.setNodes).toHaveBeenCalledWith(compoundNodes);
  expect(result.current.layoutSelection).toMatchObject({
    strategy: 'domain-compound-elk',
    direction: 'TB',
  });
  expect(readDisplayRoutingDebugState()).toMatchObject({
    layoutTransactionJobId: 1,
    layoutTransactionStatus: 'committed',
    layoutTransactionAttemptCount: 2,
    layoutTransactionErrorCode: undefined,
  });
});
