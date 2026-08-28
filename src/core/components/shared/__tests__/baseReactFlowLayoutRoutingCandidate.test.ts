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

import {
  clearBaseReactFlowDisplayCommittedSnapshots,
  readBaseReactFlowDisplayCommittedSnapshot,
} from '../baseReactFlowDisplayCommittedSnapshot';
import {
  seedBaseReactFlowStagedLayoutEdges,
  stageBaseReactFlowLayoutRouting,
  type BaseReactFlowLayoutRoutingCommit,
} from '../baseReactFlowLayoutRoutingTransaction';
import { createBaseReactFlowRoutingSessionRuntime } from '../baseReactFlowRoutingSessionRuntime';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import { createBaseReactFlowDisplayEdgePatches } from '../baseReactFlowDisplayWorkerClient';
import { computeBaseReactFlowDisplayOutputRouteSignature } from '../baseReactFlowDisplayCache';
import { createDisplayRoutingWorkerCommitReceipt } from '../baseReactFlowDisplayWorkerCommitReceipt';
import { createDisplayRoutingIdentity } from '../baseReactFlowDisplayRoutingSession';
import { computeBaseReactFlowDisplayInputIdentityBundle } from '../baseReactFlowDisplayInputIdentity';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerProjection';
import { createTestDisplayHardReport } from './baseReactFlowDisplayWorkerTestFixtures';
import { readDisplayRoutingDebugState } from '../baseReactFlowDisplayRoutingDebug';
import {
  shouldSkipBaseReactFlowLayoutCandidateRepair,
  type BaseReactFlowLayoutCandidateSeedAudit,
} from '../baseReactFlowLayoutCandidateSeedAudit';
import * as layoutCandidateSeedAudit from '../baseReactFlowLayoutCandidateSeedAudit';

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

const commitLayoutSnapshot = (commit: BaseReactFlowLayoutRoutingCommit): boolean => {
  const runtime = createBaseReactFlowRoutingSessionRuntime();
  const job = runtime.beginJob('layout');
  const result = runtime.commitJob(job, () => commit.commitSnapshot(runtime));
  return result.committed && result.value;
};

const edges: Edge[] = [{
  id: 'source-target',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  type: 'advanced-smart-step',
  data: {},
}];

const successfulResult = (
  candidateEdges: Edge[],
  request: Readonly<{ inputSignature: string; inputGeometryDigest: string }>,
  projectedEdges: Edge[] = candidateEdges,
) => {
  const identity = createDisplayRoutingIdentity(
    request.inputSignature,
    request.inputGeometryDigest,
  );
  const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(candidateEdges);
  if (!outputRouteSignature) throw new Error('expected route signature');
  const sessionRef = {
    sessionId: 'display-session-v1:1',
    identity,
    outputRouteSignature,
  } as const;
  const hardReport = createTestDisplayHardReport();
  const commitReceipt = createDisplayRoutingWorkerCommitReceipt({
    identity,
    outputRouteSignature,
    hardReport,
    sessionRef,
  });
  if (!commitReceipt) throw new Error('expected commit receipt');
  return {
    edges: candidateEdges,
    routingPatches: createBaseReactFlowDisplayEdgePatches(projectedEdges, candidateEdges),
    projectedEdges,
    hardClean: true,
    hardReport,
    routeResolution: 'repair' as const,
    phaseTrace: [],
    commitReceipt,
  };
};

const successfulCanonicalResult = (request: Readonly<{
  edges: Edge[];
  cachedCandidateEdges?: Edge[];
  inputSignature: string;
  inputGeometryDigest: string;
}>) => successfulResult(
  request.cachedCandidateEdges ?? request.edges,
  request,
  request.edges,
);

describe('baseReactFlow layout routing candidate sequence', () => {
  beforeEach(() => {
    clearBaseReactFlowDisplayCommittedSnapshots();
    workerMocks.compute.mockReset();
    workerMocks.repair.mockReset();
    (window as Window & { __vizlyDisplayRoutingDiagnosticsEnabled?: boolean })
      .__vizlyDisplayRoutingDiagnosticsEnabled = false;
  });

  it('records bounded seed-stage audits only when diagnostics are enabled', () => {
    (window as Window & { __vizlyDisplayRoutingDiagnosticsEnabled?: boolean })
      .__vizlyDisplayRoutingDiagnosticsEnabled = true;

    seedBaseReactFlowStagedLayoutEdges({ sourceEdges: edges, sourceNodes: nodes });

    expect(readDisplayRoutingDebugState()?.layoutSeedStageAudits).toEqual({
      raw: expect.objectContaining({ terminalsAttached: true, terminalsAnchored: true }),
      anchored: expect.objectContaining({ terminalsAttached: true, terminalsAnchored: true }),
      'detached-fallback': expect.objectContaining({
        terminalsAttached: true,
        terminalsAnchored: true,
      }),
      'axis-repaired': expect.objectContaining({ terminalsAttached: true, terminalsAnchored: true }),
      'geometry-normalized': expect.objectContaining({ terminalsAttached: true, terminalsAnchored: true }),
      final: expect.objectContaining({ terminalsAttached: true, terminalsAnchored: true }),
    });
  });

  it('replaces a detached compound ELK path with a node-anchored fallback', () => {
    const [seeded] = seedBaseReactFlowStagedLayoutEdges({
      sourceNodes: nodes,
      sourceEdges: [{
        ...edges[0],
        data: {
          layoutRoutingCandidate: true,
          elkPath: [
            { x: 1_000, y: 1_000 },
            { x: 1_200, y: 1_000 },
          ],
        },
      }],
    });

    expect(seeded).toMatchObject({
      type: 'stablePath',
      data: {
        algorithm: 'display-stable-fallback',
        layoutPathLocked: true,
      },
    });
    const projected = projectBaseReactFlowDisplayWorkerInput({
      edges: [seeded],
      nodes,
    });
    expect(getDisplayHardQualityGateReport(
      projected.edges,
      projected.nodes,
      'polished',
    )).toMatchObject({
      terminalsAttached: true,
      terminalsAnchored: true,
    });
  });

  it.each([
    ['equal strict count', false, false, 44, true],
    ['one fewer crossing', false, false, 43, false],
    ['attached terminal', true, false, 59, false],
    ['anchored terminal', false, true, 59, false],
  ] as const)(
    'classifies the compound seed boundary: %s',
    (_label, terminalsAttached, terminalsAnchored, strictCrossings, expected) => {
      const audit: BaseReactFlowLayoutCandidateSeedAudit = {
        terminalsAttached,
        terminalsAnchored,
        obstacleHits: 13,
        strictCrossings,
      };
      expect(shouldSkipBaseReactFlowLayoutCandidateRepair(44, audit)).toBe(expected);
    },
  );

  it('sends a compound-dirty seed directly through the canonical exact request', async () => {
    const seedAuditSpy = vi.spyOn(
      layoutCandidateSeedAudit,
      'auditBaseReactFlowLayoutCandidateSeed',
    ).mockReturnValue({
      terminalsAttached: false,
      terminalsAnchored: false,
      obstacleHits: 13,
      strictCrossings: edges.length,
    });
    workerMocks.compute.mockImplementation(successfulCanonicalResult);

    await stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:compound-seed',
      sourceEdges: edges,
      sourceNodes: nodes,
      isLargeGraph: true,
    });

    expect(seedAuditSpy).toHaveBeenCalledOnce();
    expect(workerMocks.repair).not.toHaveBeenCalled();
    expect(workerMocks.compute).toHaveBeenCalledOnce();
    expect(workerMocks.compute.mock.calls[0][0]).toMatchObject({
      requestId: 'layout:compound-seed',
      cachedCandidateEdges: expect.any(Array),
      candidateSource: 'persistent',
      qualityMode: 'full',
    });
    expect(workerMocks.compute.mock.calls[0][0].cachedCandidateEdges)
      .toBe(seedAuditSpy.mock.calls[0][0]);
    expect(workerMocks.compute.mock.calls[0][0].cachedCandidateEdges[0]).toMatchObject({
      type: 'stablePath',
      data: { algorithm: 'display-stable-fallback' },
    });
    seedAuditSpy.mockRestore();
  });

  it('validates an exact precompiled layout candidate without measured seed repair', async () => {
    const precompiledCandidate = seedBaseReactFlowStagedLayoutEdges({
      sourceEdges: edges,
      sourceNodes: nodes,
    });
    const loadPrecompiledCandidate = vi.fn().mockResolvedValue(precompiledCandidate);
    workerMocks.compute.mockImplementation(successfulCanonicalResult);

    await stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:precompiled',
      sourceEdges: edges,
      sourceNodes: nodes,
      isLargeGraph: false,
      loadPrecompiledCandidate,
    });

    expect(loadPrecompiledCandidate).toHaveBeenCalledOnce();
    expect(workerMocks.repair).not.toHaveBeenCalled();
    expect(workerMocks.compute).toHaveBeenCalledOnce();
    expect(workerMocks.compute.mock.calls[0][0]).toMatchObject({
      requestId: 'layout:precompiled',
      cachedCandidateEdges: precompiledCandidate,
      candidateSource: 'precompiled',
      qualityMode: 'full',
    });
  });

  it('bypasses precompiled layout assets during fresh route generation', async () => {
    const loadPrecompiledCandidate = vi.fn().mockResolvedValue([]);
    workerMocks.repair.mockImplementation(async (request: {
      edges: Edge[];
      inputSignature: string;
      inputGeometryDigest: string;
    }) => successfulResult(request.edges, request));
    workerMocks.compute.mockImplementation(successfulCanonicalResult);

    await stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:fresh-generation',
      sourceEdges: edges,
      sourceNodes: nodes,
      isLargeGraph: false,
      forceFreshFullRoute: true,
      loadPrecompiledCandidate,
    });

    expect(loadPrecompiledCandidate).not.toHaveBeenCalled();
    expect(workerMocks.repair).toHaveBeenCalledOnce();
  });

  it('canonically validates and publishes a fresh layout artifact with the capture timeout', async () => {
    window.history.replaceState(
      null,
      '',
      '/?precompiledLayoutRegenerate=wms-process-flow-v1&precompiledLayoutVariant=domain-compound-elk-lr#/?diagram=wms-process-flow-v1',
    );
    const loadPrecompiledCandidate = vi.fn().mockResolvedValue([]);
    workerMocks.repair.mockImplementation(async (request: {
      edges: Edge[];
      inputSignature: string;
      inputGeometryDigest: string;
    }) => successfulResult(request.edges, request));
    workerMocks.compute.mockImplementation((request: {
      edges: Edge[];
      cachedCandidateEdges?: Edge[];
      inputSignature: string;
      inputGeometryDigest: string;
    }) => ({
      ...successfulCanonicalResult(request),
      routeResolution: 'validated-candidate' as const,
    }));

    const result = await stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:fresh-capture',
      sourceEdges: edges,
      sourceNodes: nodes,
      isLargeGraph: false,
      forceFreshFullRoute: true,
      fullRouteTimeoutMs: 120_000,
      precompiledLayoutRegeneration: {
        presetId: 'wms-process-flow-v1',
        variantId: 'domain-compound-elk-lr',
      },
      loadPrecompiledCandidate,
    });

    expect(workerMocks.repair).toHaveBeenCalledOnce();
    expect(workerMocks.compute).toHaveBeenCalledOnce();
    expect(workerMocks.compute.mock.calls[0][0]).toMatchObject({
      candidateSource: 'persistent',
      timeoutMs: 120_000,
    });
    expect(commitLayoutSnapshot(result)).toBe(true);
    expect((window as Window & {
      __vizlyPrecompiledCommittedRoute?: {
        presetId: string;
        variantId?: string;
        provenance?: string;
      };
    }).__vizlyPrecompiledCommittedRoute).toMatchObject({
      presetId: 'wms-process-flow-v1',
      variantId: 'domain-compound-elk-lr',
      provenance: 'fresh-layout-repair-validated',
    });
  });

  it('promotes a hard-clean bounded candidate through the canonical Worker identity', async () => {
    workerMocks.repair.mockImplementation(async (request: {
      edges: Edge[];
      inputSignature: string;
      inputGeometryDigest: string;
    }) => successfulResult(request.edges, request));
    workerMocks.compute.mockImplementation(successfulCanonicalResult);

    const result = await stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:1',
      sourceEdges: edges,
      sourceNodes: nodes,
      isLargeGraph: false,
    });

    expect(result.routedEdges[0].type).toBe('stablePath');
    expect(commitLayoutSnapshot(result)).toBe(true);
    expect(workerMocks.repair).toHaveBeenCalledOnce();
    expect(workerMocks.repair.mock.calls[0][0]).toMatchObject({
      requestId: 'layout:1:candidate-repair',
      requireHardClean: false,
      timeoutMs: 12_000,
    });
    expect(workerMocks.compute).toHaveBeenCalledOnce();
    expect(workerMocks.compute.mock.calls[0][0]).toMatchObject({
      requestId: 'layout:1',
      cachedCandidateEdges: expect.any(Array),
      candidateSource: 'persistent',
    });
    expect(readDisplayRoutingDebugState()).toMatchObject({
      layoutSeedTerminalsAttached: true,
      layoutSeedTerminalsAnchored: true,
      layoutSeedObstacleHits: 0,
      layoutSeedStrictCrossings: 0,
    });

    const projected = projectBaseReactFlowDisplayWorkerInput({
      edges: result.committedSourceEdges,
      nodes,
    });
    const identity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: projected.nodes,
      edges: projected.edges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    const replay = readBaseReactFlowDisplayCommittedSnapshot({
      inputSignature: identity.cacheSignature,
      inputGeometryDigest: identity.geometryDigest,
      sourceEdges: result.committedSourceEdges,
    });
    expect(replay?.edges[0]).toMatchObject({
      id: result.routedEdges[0].id,
      type: result.routedEdges[0].type,
      data: { computedPath: result.routedEdges[0].data?.computedPath },
    });
    expect(replay?.baseline.workerSessionRef).toMatchObject({
      identity: {
        inputSignature: identity.cacheSignature,
        inputGeometryDigest: identity.geometryDigest,
      },
      outputRouteSignature: replay?.outputRouteSignature,
    });
    expect(replay?.baseline.projectedSourceGeometry).toEqual(projected);
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
    workerMocks.repair.mockImplementation(async (request: {
      edges: Edge[];
      inputSignature: string;
      inputGeometryDigest: string;
    }) => successfulResult(request.edges, request));
    workerMocks.compute.mockImplementation(successfulCanonicalResult);

    const first = await stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:cached-first',
      sourceEdges: edges,
      sourceNodes: nodes,
      isLargeGraph: false,
    });
    expect(commitLayoutSnapshot(first)).toBe(true);
    const second = await stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:cached-second',
      sourceEdges: edges,
      sourceNodes: nodes,
      isLargeGraph: false,
    });
    expect(workerMocks.repair).toHaveBeenCalledOnce();
    expect(workerMocks.compute).toHaveBeenCalledOnce();
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
    expect(workerMocks.compute).toHaveBeenCalledTimes(2);
  });

  it('keeps a structurally dirty hard-clean repair on the canonical fallback path', async () => {
    workerMocks.repair.mockImplementation(async (request: {
      edges: Edge[];
      inputSignature: string;
      inputGeometryDigest: string;
    }) => {
      const candidate = request.edges.map(edge => ({
        ...edge,
        data: {
          ...edge.data,
          computedPath: [
            { x: 100, y: 30 }, { x: 120, y: 30 }, { x: 120, y: 60 },
            { x: 140, y: 60 }, { x: 140, y: 90 }, { x: 160, y: 90 },
            { x: 160, y: 60 }, { x: 180, y: 60 }, { x: 180, y: 30 },
            { x: 240, y: 30 },
          ],
        },
      }));
      return successfulResult(candidate, request, request.edges);
    });
    workerMocks.compute.mockImplementation(successfulCanonicalResult);

    await stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:commercial-fallback',
      sourceEdges: edges,
      sourceNodes: nodes,
      isLargeGraph: false,
    });

    expect(workerMocks.repair).toHaveBeenCalledOnce();
    expect(workerMocks.compute).toHaveBeenCalledOnce();
    expect(workerMocks.compute.mock.calls[0][0]).toMatchObject({
      requestId: 'layout:commercial-fallback',
      candidateSource: 'persistent',
      qualityMode: 'full',
    });
  });

  it('falls through to the unchanged full-quality route when the bounded candidate is rejected', async () => {
    workerMocks.repair.mockImplementationOnce(async (request: {
      edges: Edge[];
      inputSignature: string;
      inputGeometryDigest: string;
    }) => ({
      ...successfulResult(request.edges, request),
      hardClean: false,
      hardReport: createTestDisplayHardReport(false),
      commitReceipt: undefined,
    }));
    workerMocks.compute.mockImplementation(async (request: {
      edges: Edge[];
      cachedCandidateEdges?: Edge[];
      inputSignature: string;
      inputGeometryDigest: string;
    }) => ({
      ...successfulCanonicalResult(request),
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
      inputSignature: expect.stringMatching(/^\d+$/),
      inputGeometryDigest: expect.stringMatching(/^geometry-v1:[0-9a-f]{32}$/),
      qualityMode: 'full',
      timeoutMs: 30_000,
    });
    expect(workerMocks.compute.mock.calls[0][0]).toHaveProperty('cachedCandidateEdges');
    expect(workerMocks.compute.mock.calls[0][0].edges[0]).toMatchObject({
      type: 'advanced-smart-step',
      data: {},
    });
    expect(workerMocks.compute.mock.calls[0][0].cachedCandidateEdges[0]).toMatchObject({
      type: 'stablePath',
      data: { algorithm: 'display-stable-fallback' },
    });
  });

  it('rejects an obstacle-dirty bounded lane candidate before the expensive full route', async () => {
    workerMocks.repair.mockImplementationOnce(async (request: {
      edges: Edge[];
      inputSignature: string;
      inputGeometryDigest: string;
    }) => ({
      ...successfulResult(request.edges, request),
      hardClean: false,
      hardReport: {
        ...createTestDisplayHardReport(false),
        obstacleHits: 1,
      },
      commitReceipt: undefined,
    }));

    await expect(stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:lane-obstacle-failure',
      sourceEdges: edges,
      sourceNodes: nodes,
      isLargeGraph: false,
      rejectObstacleDirtyBoundedCandidate: true,
    })).rejects.toThrow('layout-routing-hard-quality-rejected');

    expect(workerMocks.repair).toHaveBeenCalledOnce();
    expect(workerMocks.compute).not.toHaveBeenCalled();
  });

  it('keeps the canonical lane route when bounded repair cleared every obstacle', async () => {
    workerMocks.repair.mockImplementationOnce(async (request: {
      edges: Edge[];
      inputSignature: string;
      inputGeometryDigest: string;
    }) => ({
      ...successfulResult(request.edges, request),
      hardClean: false,
      hardReport: {
        ...createTestDisplayHardReport(false),
        obstacleHits: 0,
        commercialClearanceViolations: 1,
      },
      commitReceipt: undefined,
    }));
    workerMocks.compute.mockImplementation(successfulCanonicalResult);

    await stageBaseReactFlowLayoutRouting({
      workerRef: { current: null },
      requestId: 'layout:lane-obstacle-clean',
      sourceEdges: edges,
      sourceNodes: nodes,
      isLargeGraph: false,
      rejectObstacleDirtyBoundedCandidate: true,
    });

    expect(workerMocks.repair).toHaveBeenCalledOnce();
    expect(workerMocks.compute).toHaveBeenCalledOnce();
  });

  it('rejects a failed full route without starting a second expensive repair pass', async () => {
    workerMocks.repair.mockImplementationOnce(async (request: {
      edges: Edge[];
      inputSignature: string;
      inputGeometryDigest: string;
    }) => ({
      ...successfulResult(request.edges, request),
      hardClean: false,
      hardReport: createTestDisplayHardReport(false),
      commitReceipt: undefined,
    }));
    workerMocks.compute.mockImplementation(async (request: {
      edges: Edge[];
      cachedCandidateEdges?: Edge[];
      inputSignature: string;
      inputGeometryDigest: string;
    }) => ({
      ...successfulCanonicalResult(request),
      hardClean: false,
      hardReport: createTestDisplayHardReport(false),
      commitReceipt: undefined,
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
