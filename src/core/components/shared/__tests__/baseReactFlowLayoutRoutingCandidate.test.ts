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
import {
  seedBaseReactFlowStagedLayoutEdges,
  stageBaseReactFlowLayoutRouting,
} from '../baseReactFlowLayoutRoutingTransaction';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import { createBaseReactFlowDisplayEdgePatches } from '../baseReactFlowDisplayWorkerClient';

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
  routingPatches: createBaseReactFlowDisplayEdgePatches(candidateEdges, candidateEdges),
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
      timeoutMs: 12_000,
    });
    expect(workerMocks.compute).not.toHaveBeenCalled();
  });

  it('repairs terminal-axis and hairpin defects before the hidden Worker pass', () => {
    const defectNodes = [
      {
        id: 'check-limit', position: { x: 737, y: 1602 },
        measured: { width: 249, height: 96 }, data: {},
      },
      {
        id: 'pool-a-entry', position: { x: 753, y: 1818 },
        measured: { width: 217, height: 96 }, data: {},
      },
      {
        id: 'task-direct-a', position: { x: 731, y: 3665 },
        measured: { width: 172, height: 96 }, data: {},
      },
      {
        id: 'end-wms', position: { x: 438, y: 3881 },
        measured: { width: 174, height: 96 }, data: {},
      },
    ] as Node[];
    const defectEdges = [
      {
        id: 'e5', source: 'check-limit', target: 'pool-a-entry',
        sourceHandle: 'left', targetHandle: 'left', type: 'advanced-smart-step', data: {},
      },
      {
        id: 'e21', source: 'task-direct-a', target: 'end-wms',
        sourceHandle: 'left', targetHandle: 'left', type: 'advanced-smart-step', data: {},
      },
    ] as Edge[];

    const seeded = seedBaseReactFlowStagedLayoutEdges({
      sourceEdges: defectEdges,
      sourceNodes: defectNodes,
    });
    const report = getDisplayHardQualityGateReport(seeded, defectNodes, 'polished');

    expect(report.terminalsAttached).toBe(true);
    expect(report.terminalsAnchored).toBe(true);
    expect(report.quality.hairpins).toBe(0);
  });

  it('replays an exact hard-clean layout without starting another Worker request', async () => {
    workerMocks.repair.mockImplementation(async ({ edges: candidateEdges }: { edges: Edge[] }) => (
      successfulResult(candidateEdges)
    ));

    const first = await stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:cached-first',
      sourceEdges: edges,
      sourceNodes: nodes,
      isLargeGraph: false,
    });
    const second = await stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:cached-second',
      sourceEdges: edges,
      sourceNodes: nodes,
      isLargeGraph: false,
    });
    expect(workerMocks.repair).toHaveBeenCalledOnce();
    await stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:cached-shifted',
      sourceEdges: edges,
      sourceNodes: nodes.map(node => node.id === 'target'
        ? { ...node, position: { x: 320, y: 0 } }
        : node),
      isLargeGraph: false,
    });

    expect(second.routedEdges[0]).toMatchObject({
      type: 'stablePath',
      data: {
        computedPath: first.routedEdges[0].data?.computedPath,
        layoutPathLocked: true,
        _layoutPathLocked: true,
      },
    });
    expect(workerMocks.repair).toHaveBeenCalledTimes(2);
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
      timeoutMs: 12_000,
    });
    expect(workerMocks.compute.mock.calls[0][0]).not.toHaveProperty('cachedCandidateEdges');
    expect(workerMocks.compute.mock.calls[0][0].edges[0]).toMatchObject({
      type: 'stablePath',
      data: { algorithm: 'display-stable-fallback' },
    });
  });

  it('rejects a failed full route without starting a second expensive repair pass', async () => {
    workerMocks.repair.mockImplementationOnce(async ({ edges: candidateEdges }: {
      edges: Edge[];
    }) => ({
      ...successfulResult(candidateEdges),
      hardClean: false,
    }));
    workerMocks.compute.mockImplementation(async ({ edges: candidateEdges }: {
      edges: Edge[];
    }) => ({
      ...successfulResult(candidateEdges),
      hardClean: false,
      routeResolution: 'full-route' as const,
    }));

    await expect(stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:bounded-failure',
      sourceEdges: edges,
      sourceNodes: nodes,
      isLargeGraph: false,
    })).rejects.toThrow('layout-routing-hard-quality-rejected');

    expect(workerMocks.repair).toHaveBeenCalledOnce();
    expect(workerMocks.compute).toHaveBeenCalledOnce();
  });
});
