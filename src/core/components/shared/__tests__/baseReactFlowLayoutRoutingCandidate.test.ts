import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workerMocks = vi.hoisted(() => ({
  compute: vi.fn(),
  repair: vi.fn(),
}));

vi.mock('../baseReactFlowDisplayWorkerClient', async importOriginal => {
  const original = await importOriginal<
    typeof import('../baseReactFlowDisplayWorkerClient')
  >();
  return {
    ...original,
    computeBaseReactFlowDisplayEdgesInWorker: workerMocks.compute,
    repairBaseReactFlowDisplayEdgesInWorker: workerMocks.repair,
  };
});

import { clearBaseReactFlowDisplayCommittedSnapshots } from '../baseReactFlowDisplayCommittedSnapshot';
import { stageBaseReactFlowLayoutRouting } from '../baseReactFlowLayoutRoutingTransaction';

const nodes: Node[] = [
  {
    id: 'source',
    position: { x: 0, y: 0 },
    measured: { width: 100, height: 60 },
    data: {},
  },
  {
    id: 'target',
    position: { x: 240, y: 0 },
    measured: { width: 100, height: 60 },
    data: {},
  },
];

const edges: Edge[] = [{
  id: 'source-target',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  type: 'advanced-smart-step',
  data: {},
}];

const successfulResult = (candidateEdges: Edge[]) => ({
  edges: candidateEdges,
  projectedEdges: candidateEdges,
  hardClean: true,
  routeResolution: 'repair' as const,
  phaseTrace: [],
});

describe('baseReactFlow layout routing candidate sequence', () => {
  beforeEach(() => {
    clearBaseReactFlowDisplayCommittedSnapshots();
    workerMocks.compute.mockReset();
    workerMocks.repair.mockReset();
  });

  it('commits a hard-clean bounded candidate without starting a full route', async () => {
    workerMocks.repair.mockImplementation(async ({ edges: candidateEdges }: { edges: Edge[] }) => (
      successfulResult(candidateEdges)
    ));

    const result = await stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:1',
      sourceEdges: edges,
      sourceNodes: nodes,
      isLargeGraph: false,
    });

    expect(result.routedEdges[0].type).toBe('stablePath');
    expect(workerMocks.repair).toHaveBeenCalledOnce();
    expect(workerMocks.repair.mock.calls[0][0]).toMatchObject({
      requestId: 'layout:1:candidate-repair',
      requireHardClean: false,
    });
    expect(workerMocks.compute).not.toHaveBeenCalled();
  });

  it('falls through to the unchanged full-quality route when the bounded candidate is rejected', async () => {
    workerMocks.repair.mockImplementationOnce(async ({ edges: candidateEdges }: { edges: Edge[] }) => ({
      ...successfulResult(candidateEdges),
      hardClean: false,
    }));
    workerMocks.compute.mockImplementation(async ({ edges: candidateEdges }: {
      edges: Edge[];
    }) => ({
      ...successfulResult(candidateEdges),
      routeResolution: 'full-route' as const,
    }));

    const sourceEdgesWithElkCandidate: Edge[] = [{
      ...edges[0],
      data: {
        elkPath: [
          { x: 100, y: 30 },
          { x: 170, y: 30 },
          { x: 170, y: 80 },
          { x: 240, y: 80 },
        ],
        useElkRouting: true,
        layoutRoutingCandidate: true,
      },
    }];

    await stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:2',
      sourceEdges: sourceEdgesWithElkCandidate,
      sourceNodes: nodes,
      isLargeGraph: false,
    });

    expect(workerMocks.repair).toHaveBeenCalledOnce();
    expect(workerMocks.compute).toHaveBeenCalledOnce();
    expect(workerMocks.compute.mock.calls[0][0]).toMatchObject({
      requestId: 'layout:2',
      qualityMode: 'full',
    });
    expect(workerMocks.compute.mock.calls[0][0]).not.toHaveProperty('cachedCandidateEdges');
    expect(workerMocks.compute.mock.calls[0][0].edges[0]).toMatchObject({
      type: 'stablePath',
      data: { algorithm: 'display-stable-fallback' },
    });
  });
});
