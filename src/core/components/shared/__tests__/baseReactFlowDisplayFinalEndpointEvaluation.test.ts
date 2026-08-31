import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { calculateEdgePathQualityScoreExact } from '../../../strategies/shared/edgePathQualityFullScan';
import { createBaseReactFlowFinalEndpointEvaluation } from '../baseReactFlowDisplayFinalEndpointEvaluation';
import { startBaseReactFlowObstacleClosureTrace } from '../baseReactFlowDisplayObstacleClosureTrace';
import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';
import { createBaseReactFlowFinalEndpointResidualRepair } from '../baseReactFlowDisplayFinalEndpointResidualRepair';
import { commercialEdgeDetoursDoNotRegress } from '../baseReactFlowDisplayCommercialDetourGuard';
import { isExactSingleImmutableEdgeReplacement } from '../baseReactFlowDisplayFinalEndpointGate';
import { createDisplayWorkerFinalEvaluation } from '../baseReactFlowDisplayWorkerFinalEvaluation';
import { repairRenderSafeEndpointStubs } from '../baseReactFlowDisplayEndpointStubRepair';
import { repairBaseReactFlowFinalCommercialDetours } from '../baseReactFlowDisplayCommercialDetourRepair';

const nodes: Node[] = [
  { id: 'source', position: { x: 0, y: 0 }, width: 100, height: 60, data: {} },
  { id: 'target-a', position: { x: 0, y: 220 }, width: 100, height: 60, data: {} },
  { id: 'target-b', position: { x: 180, y: 220 }, width: 100, height: 60, data: {} },
];

const edges: Edge[] = [
  {
    id: 'a',
    source: 'source',
    target: 'target-a',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data: { computedPath: [{ x: 50, y: 60 }, { x: 50, y: 220 }] },
  },
  {
    id: 'b',
    source: 'source',
    target: 'target-b',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data: {
      computedPath: [
        { x: 50, y: 60 },
        { x: 50, y: 120 },
        { x: 230, y: 120 },
        { x: 230, y: 220 },
      ],
    },
  },
];

describe('createBaseReactFlowFinalEndpointEvaluation', () => {
  it('only treats one fully declared immutable edge replacement as an exact obstacle delta', () => {
    const replacement = { ...edges[0], data: { ...edges[0].data } };
    const candidate = [replacement, edges[1]];

    expect(isExactSingleImmutableEdgeReplacement(edges, candidate, [0])).toBe(true);
    expect(isExactSingleImmutableEdgeReplacement(edges, [...candidate], [0, 0])).toBe(false);
    expect(isExactSingleImmutableEdgeReplacement(edges, [replacement, { ...edges[1] }], [0]))
      .toBe(false);
    expect(isExactSingleImmutableEdgeReplacement(edges, [
      { ...replacement, id: 'different' },
      edges[1],
    ], [0])).toBe(false);
    expect(isExactSingleImmutableEdgeReplacement(edges, candidate, [0.5])).toBe(false);
    expect(isExactSingleImmutableEdgeReplacement(edges, candidate, [2])).toBe(false);
  });

  it('reports duplicate clearance candidates as request-local trace cache hits', () => {
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
    const traces: DisplayRoutingPhaseTrace[] = [];
    const finish = startBaseReactFlowObstacleClosureTrace({
      phase: 'final-endpoint-closure-obstacles-post-trunk',
      candidateCount: edges.length,
      evaluation,
      onPhaseTrace: trace => traces.push(trace),
    });

    evaluation.hardReport(edges);
    finish(edges, edges, {
      candidateCollectionCacheHitCount: 5,
      candidateRankCacheHitCount: 7,
      clearanceScoreCacheHitCount: 0,
      clearanceScannedNodeCount: 0,
      generatedCandidateCount: 10,
      qualityContextBuildCount: 2,
      qualityContextCacheHitCount: 4,
      uniqueCandidateCount: 7,
    });

    const trace = traces[0];
    expect(trace).toMatchObject({
      candidateCount: 10,
      cacheHitCount: 19,
      changedEdgeCount: 0,
      evaluationCount: 3,
      resolution: 'skip',
    });
  });

  it('uses the exact hard report to skip a clean residual strict pass', () => {
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
    expect(evaluation.hardReport(edges).quality.strictCrossings).toBe(0);
    const repairStrict = vi.fn((candidate: Edge[]) => candidate.slice());
    const residualRepair = createBaseReactFlowFinalEndpointResidualRepair({
      nodes,
      evaluation,
      validate: () => true,
      repairStrict,
    });

    expect(residualRepair.strict(edges)).toBe(edges);
    expect(repairStrict).not.toHaveBeenCalled();
  });

  it('evaluates a residual strict candidate from its exact changed indexes', () => {
    const baseline: Edge[] = [
      {
        id: 'horizontal',
        source: 'left',
        target: 'right',
        data: { computedPath: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
      },
      {
        id: 'vertical',
        source: 'top',
        target: 'bottom',
        data: { computedPath: [{ x: 50, y: 0 }, { x: 50, y: 100 }] },
      },
    ];
    const candidate: Edge[] = [
      baseline[0],
      {
        ...baseline[1],
        data: { computedPath: [{ x: 150, y: 0 }, { x: 150, y: 100 }] },
      },
    ];
    const evaluation = createBaseReactFlowFinalEndpointEvaluation([]);
    const changedReportSpy = vi.spyOn(evaluation, 'hardReportChanged');
    const validate = vi.fn(() => true);
    const residualRepair = createBaseReactFlowFinalEndpointResidualRepair({
      nodes: [],
      evaluation,
      validate,
      repairStrict: () => candidate,
    });

    expect(residualRepair.strict(baseline)).toBe(candidate);
    expect(changedReportSpy).toHaveBeenCalledWith(baseline, candidate, [1]);
    expect(validate).toHaveBeenCalledWith(baseline, candidate, [1]);
  });

  it('reuses an exact residual overlap score for the same immutable route', () => {
    const scoreResidualOverlap = vi.fn(() => 0);
    const residualRepair = createBaseReactFlowFinalEndpointResidualRepair({
      nodes,
      evaluation: createBaseReactFlowFinalEndpointEvaluation(nodes),
      validate: () => true,
      scoreResidualOverlap,
    });

    expect(residualRepair.overlap(edges)).toBe(edges);
    expect(residualRepair.overlap(edges)).toBe(edges);
    expect(scoreResidualOverlap).toHaveBeenCalledOnce();
  });

  it('reuses a zero residual score across equivalent route copies but not policy changes', () => {
    const scoreResidualOverlap = vi.fn(() => 0);
    const repairOverlap = vi.fn((candidate: Edge[]) => candidate);
    const repairStrict = vi.fn((candidate: Edge[]) => candidate);
    const residualRepair = createBaseReactFlowFinalEndpointResidualRepair({
      nodes,
      evaluation: createBaseReactFlowFinalEndpointEvaluation(nodes),
      validate: () => true,
      repairOverlap,
      repairStrict,
      scoreResidualOverlap,
    });
    const equivalent = edges.map(edge => ({
      ...edge,
      data: {
        ...edge.data,
        computedPath: (edge.data?.computedPath as Array<{ x: number; y: number }>).map(
          point => ({ ...point }),
        ),
      },
    }));
    const policyChanged = equivalent.map((edge, index) => (
      index === 0 ? { ...edge, sourceHandle: 'left' } : edge
    ));

    expect(residualRepair.fixedPoint(edges)).toBe(edges);
    expect(residualRepair.fixedPoint(equivalent)).toBe(equivalent);
    expect(scoreResidualOverlap).toHaveBeenCalledOnce();
    expect(residualRepair.fixedPoint(policyChanged)).toBe(policyChanged);
    expect(scoreResidualOverlap).toHaveBeenCalledTimes(2);
    expect(repairStrict).not.toHaveBeenCalled();
    expect(repairOverlap).not.toHaveBeenCalled();
  });

  it('does not use the zero-overlap fast path while a strict crossing remains', () => {
    const baseline: Edge[] = [
      {
        id: 'horizontal',
        source: 'left',
        target: 'right',
        data: { computedPath: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
      },
      {
        id: 'vertical',
        source: 'top',
        target: 'bottom',
        data: { computedPath: [{ x: 50, y: 0 }, { x: 50, y: 100 }] },
      },
    ];
    const resolved = [
      baseline[0],
      {
        ...baseline[1],
        data: { computedPath: [{ x: 150, y: 0 }, { x: 150, y: 100 }] },
      },
    ];
    const repairStrict = vi.fn((candidate: Edge[]) => (
      candidate === baseline ? resolved : candidate
    ));
    const residualRepair = createBaseReactFlowFinalEndpointResidualRepair({
      nodes: [],
      evaluation: createBaseReactFlowFinalEndpointEvaluation([]),
      validate: () => true,
      repairStrict,
      scoreResidualOverlap: () => 0,
    });

    expect(residualRepair.fixedPoint(baseline)).toBe(resolved);
    expect(repairStrict).toHaveBeenCalled();
  });

  it('reuses deterministic residual repair outcomes for the same immutable route', () => {
    const repairOverlap = vi.fn((candidate: Edge[]) => candidate);
    const residualRepair = createBaseReactFlowFinalEndpointResidualRepair({
      nodes,
      evaluation: createBaseReactFlowFinalEndpointEvaluation(nodes),
      validate: () => true,
      repairOverlap,
      scoreResidualOverlap: () => 24,
    });

    expect(residualRepair.overlap(edges)).toBe(edges);
    expect(residualRepair.overlap(edges)).toBe(edges);
    expect(repairOverlap).toHaveBeenCalledOnce();
  });

  it('reuses exact request-local evidence for the same immutable route array', () => {
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);

    expect(evaluation.endpointOrder(edges)).toBe(evaluation.endpointOrder(edges));
    expect(evaluation.passageOrder(edges)).toBe(evaluation.passageOrder(edges));
    expect(evaluation.hardReport(edges)).toBe(evaluation.hardReport(edges));
    expect(evaluation.terminalReport(edges)).toBe(evaluation.terminalReport(edges));
    expect(evaluation.unsafeEndpointStubs(edges)).toBe(evaluation.unsafeEndpointStubs(edges));
    expect(evaluation.readMetrics()).toMatchObject({
      evaluationCount: 5,
      cacheHitCount: 5,
    });
  });

  it('reuses an exact render-safe stub repair for copied arrays of the same edges', () => {
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
    const unsafeEdges: Edge[] = [{
      ...edges[1],
      data: {
        ...edges[1].data,
        computedPath: [
          { x: 50, y: 60 },
          { x: 50, y: 108 },
          { x: 230, y: 108 },
          { x: 230, y: 220 },
        ],
      },
    }];

    const repaired = evaluation.repairRenderSafeEndpointStubs(unsafeEdges, 32);
    const metricsBeforeReuse = evaluation.readMetrics();
    const copiedArray = [...unsafeEdges];

    expect(repaired).not.toBe(unsafeEdges);
    expect(evaluation.repairRenderSafeEndpointStubs(copiedArray, 32)).toBe(repaired);
    expect(evaluation.readMetrics()).toMatchObject({
      evaluationCount: metricsBeforeReuse.evaluationCount,
      cacheHitCount: metricsBeforeReuse.cacheHitCount + 1,
    });

    const metricsBeforeCloneReuse = evaluation.readMetrics();
    const copiedEdge = unsafeEdges.map(edge => ({
      ...edge,
      data: edge.data ? { ...edge.data, businessStatus: 'current' } : undefined,
    }));
    const replayed = evaluation.repairRenderSafeEndpointStubs(copiedEdge, 32);
    expect(replayed).not.toBe(repaired);
    expect(replayed[0]?.data?.computedPath).toEqual(repaired[0]?.data?.computedPath);
    expect(replayed[0]?.data?.businessStatus).toBe('current');
    expect(evaluation.readMetrics()).toMatchObject({
      evaluationCount: metricsBeforeCloneReuse.evaluationCount,
      cacheHitCount: metricsBeforeCloneReuse.cacheHitCount + 1,
    });
  });

  it('preserves the caller array identity when a cached stub repair is a no-op', () => {
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
    expect(evaluation.repairRenderSafeEndpointStubs(edges, 32)).toBe(edges);

    const copiedArray = [...edges];
    expect(evaluation.repairRenderSafeEndpointStubs(copiedArray, 32)).toBe(copiedArray);
  });

  it('rejects a local stub preference that shortens a trunk required by the final gate', () => {
    const routeNodes: Node[] = [
      { id: 's', position: { x: -100, y: -40 }, width: 100, height: 80, data: {} },
      { id: 'a', position: { x: 333, y: -40 }, width: 100, height: 80, data: {} },
      { id: 'b', position: { x: 350, y: 193 }, width: 100, height: 80, data: {} },
    ];
    const route: Edge[] = [
      { id: 'straight', source: 's', target: 'a', sourceHandle: 'right', targetHandle: 'left',
        data: { computedPath: [{ x: 0, y: 0 }, { x: 333, y: 0 }] } },
      { id: 'branch', source: 's', target: 'b', sourceHandle: 'right', targetHandle: 'left',
        data: { computedPath: [{ x: 0, y: 0 }, { x: 295, y: 0 }, { x: 295, y: 233 }, { x: 350, y: 233 }] } },
    ];
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(routeNodes);
    const trunks = evaluation.endpointOrder(route).legalSharedTrunks;
    expect(trunks).toHaveLength(1);
    expect(trunks[0].commonStemLength).toBe(295);
    const marginCandidate = repairRenderSafeEndpointStubs(route, routeNodes);
    expect(marginCandidate).not.toBe(route);
    expect(evaluation.endpointOrder(marginCandidate).legalSharedTrunks[0].commonStemLength).toBe(294);
    expect(evaluation.repairRenderSafeEndpointStubs(route)).toBe(route);
    expect(evaluation.endpointOrder(route).legalSharedTrunks).toEqual(trunks);
  });

  it('leaves compound stub searches to endpoint closure during commercial shortening', () => {
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
    const repair = vi.spyOn(evaluation, 'repairRenderSafeEndpointStubs');
    const candidate = repairBaseReactFlowFinalCommercialDetours(edges, nodes, { evaluation });
    expect(repair).toHaveBeenCalledWith(edges, 32, false);
    expect(evaluation.hardReport(candidate).hardClean).toBe(true);
    repair.mockRestore();
  });

  it('reuses exact request-local evidence for a copied immutable route', () => {
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
    const candidate = edges.map(edge => ({
      ...edge,
      data: edge.data ? { ...edge.data } : undefined,
    }));

    expect(evaluation.endpointOrder(candidate)).toBe(evaluation.endpointOrder(edges));
    expect(evaluation.passageOrder(candidate)).toBe(evaluation.passageOrder(edges));
    expect(evaluation.hardReport(candidate)).toBe(evaluation.hardReport(edges));
    expect(evaluation.terminalReport(candidate)).toBe(evaluation.terminalReport(edges));
    evaluation.unsafeEndpointStubs(candidate);
    const metricsBeforeExactClone = evaluation.readMetrics();
    evaluation.unsafeEndpointStubs(edges);
    expect(evaluation.readMetrics().evaluationCount).toBe(metricsBeforeExactClone.evaluationCount);
  });

  it('does not reuse endpoint audit evidence after a terminal-policy-only change', () => {
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
    const candidate = edges.map((edge, index) => index === 1 ? {
      ...edge,
      data: {
        ...edge.data,
        sourcePortPolicy: 'fixed-pos',
      },
    } : edge);

    expect(evaluation.endpointOrder(candidate)).not.toBe(evaluation.endpointOrder(edges));
    expect(evaluation.passageOrder(candidate)).not.toBe(evaluation.passageOrder(edges));
    expect(evaluation.hardReport(candidate)).not.toBe(evaluation.hardReport(edges));
    expect(evaluation.endpointOrder(candidate).movableEndpointCount)
      .toBeLessThan(evaluation.endpointOrder(edges).movableEndpointCount);
  });

  it('does not reuse route-bound evidence after endpoint geometry changes', () => {
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
    const candidate: Edge[] = edges.map((edge, index) => index === 0 ? {
      ...edge,
      targetHandle: 'left',
      data: {
        ...edge.data,
        computedPath: [{ x: 50, y: 60 }, { x: -40, y: 60 }, { x: -40, y: 250 }],
      },
    } : edge);

    expect(evaluation.endpointOrder(candidate)).not.toBe(evaluation.endpointOrder(edges));
    expect(evaluation.passageOrder(candidate)).not.toBe(evaluation.passageOrder(edges));
    expect(evaluation.hardReport(candidate)).not.toBe(evaluation.hardReport(edges));
  });

  it('keeps changed-index hard reports in exact parity with a full evaluation', () => {
    const candidate: Edge[] = edges.map((edge, index) => index === 0 ? {
      ...edge,
      data: {
        ...edge.data,
        computedPath: [
          { x: 50, y: 60 },
          { x: 80, y: 60 },
          { x: 80, y: 220 },
          { x: 50, y: 220 },
        ],
      },
    } : edge);
    const incremental = createBaseReactFlowFinalEndpointEvaluation(nodes);
    const full = createBaseReactFlowFinalEndpointEvaluation(nodes);

    expect(incremental.hardReportChanged(edges, candidate, [0]))
      .toEqual(full.hardReport(candidate));
    expect(incremental.hardReport(candidate))
      .toBe(incremental.hardReportChanged(edges, candidate, [0]));
    expect(incremental.readMetrics().evaluationCount).toBeGreaterThan(0);
  });

  it.each([9, 21])(
    'keeps a bounded %i-edge hard report incremental on a large route',
    (changedEdgeCount) => {
      const baseline = Array.from({ length: 45 }, (_, index): Edge => ({
        id: `dense-${index}`,
        source: `source-${index}`,
        target: `target-${index}`,
        data: {
          computedPath: [
            { x: 0, y: index % 3 },
            { x: 400, y: index % 3 },
          ],
        },
      }));
      const changedIndexes = Array.from({ length: changedEdgeCount }, (_, index) => index);
      const candidate = baseline.map((edge, index) => changedIndexes.includes(index) ? {
        ...edge,
        data: {
          ...edge.data,
          computedPath: [
            { x: 0, y: 20 + index },
            { x: 400, y: 20 + index },
          ],
        },
      } : edge);
      const incremental = createBaseReactFlowFinalEndpointEvaluation([]);
      incremental.hardReport(baseline);
      const before = incremental.readMetrics();

      const report = incremental.hardReportChanged(baseline, candidate, changedIndexes);
      const after = incremental.readMetrics();
      const exactScanMetrics = { scannedEdgePairCount: 0 };
      const exactQuality = calculateEdgePathQualityScoreExact(candidate, exactScanMetrics);
      const fullReport = createBaseReactFlowFinalEndpointEvaluation([]).hardReport(
        candidate.map(edge => ({ ...edge, data: { ...edge.data } })),
      );

      expect(report).toEqual(fullReport);
      expect(report.quality).toEqual(exactQuality);
      expect(after.scannedEdgePairCount - before.scannedEdgePairCount).toBeGreaterThan(0);
      expect(after.scannedEdgePairCount - before.scannedEdgePairCount).toBeLessThan(
        exactScanMetrics.scannedEdgePairCount,
      );
      const beforeReuse = incremental.readMetrics();
      expect(incremental.hardReport(candidate)).toBe(report);
      expect(incremental.readMetrics()).toMatchObject({
        scannedEdgePairCount: beforeReuse.scannedEdgePairCount,
        cacheHitCount: beforeReuse.cacheHitCount + 1,
      });
    },
  );

  it('falls back to a full hard report when immutable changes are not fully declared', () => {
    const candidate = edges.map(edge => ({
      ...edge,
      data: { ...edge.data },
    }));
    const incremental = createBaseReactFlowFinalEndpointEvaluation(nodes);
    const full = createBaseReactFlowFinalEndpointEvaluation(nodes);

    expect(incremental.hardReportChanged(edges, candidate, [0]))
      .toEqual(full.hardReport(candidate));
    expect(incremental.readMetrics()).toMatchObject({ evaluationCount: 1 });
  });

  it('primes only the exact route signature with existing hard-gate evidence', () => {
    const sourceEvaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
    const report = sourceEvaluation.hardReport(edges);
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);

    expect(evaluation.rememberHardReport(edges, report)).toBe(true);
    expect(evaluation.hardReport(edges.map(edge => ({ ...edge })))).toBe(report);
    expect(evaluation.readMetrics()).toMatchObject({
      evaluationCount: 0,
      cacheHitCount: 1,
      scannedNodeCount: 0,
      scannedEdgePairCount: 0,
    });

    const changed = edges.map((edge, index) => index === 0 ? {
      ...edge,
      data: { ...edge.data, computedPath: [{ x: 50, y: 60 }, { x: 60, y: 220 }] },
    } : edge);
    expect(evaluation.hardReport(changed)).not.toBe(report);
  });

  it('reuses an incremental report only when it accompanies the same Worker edge array', () => {
    const report = createBaseReactFlowFinalEndpointEvaluation(nodes).hardReport(edges);
    const primed = createDisplayWorkerFinalEvaluation({
      nodes,
      responseEdges: edges,
      initialHardReport: report,
      initialHardReportEdges: edges,
    });
    expect(primed.hardQualityIsClean(edges)).toBe(report.hardClean);
    expect(primed.evaluation.readMetrics()).toMatchObject({
      evaluationCount: 0,
      cacheHitCount: 1,
      scannedNodeCount: 0,
      scannedEdgePairCount: 0,
    });

    const unprimed = createDisplayWorkerFinalEvaluation({
      nodes,
      responseEdges: edges,
      initialHardReport: report,
      initialHardReportEdges: [...edges],
    });
    unprimed.hardQualityIsClean(edges);
    expect(unprimed.evaluation.readMetrics().evaluationCount).toBe(1);
  });
});

describe('commercialEdgeDetoursDoNotRegress', () => {
  it('rejects a local endpoint-order candidate that sends a clean edge around the canvas', () => {
    const baseline: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target-a',
      data: { computedPath: [{ x: 50, y: 60 }, { x: 50, y: 220 }] },
    }];
    const canvasLoop: Edge[] = [{
      ...baseline[0],
      data: {
        computedPath: [
          { x: 50, y: 60 },
          { x: 50, y: 600 },
          { x: -320, y: 600 },
          { x: -320, y: 220 },
          { x: 50, y: 220 },
        ],
      },
    }];

    expect(commercialEdgeDetoursDoNotRegress(
      baseline,
      canvasLoop,
      [0],
    )).toBe(false);
  });

  it('allows a bounded obstacle skirt and does not tighten an inherited detour', () => {
    const baseline: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target-a',
      data: {
        computedPath: [
          { x: 50, y: 60 }, { x: 50, y: 120 },
          { x: 90, y: 120 }, { x: 90, y: 220 },
        ],
      },
    }];
    const boundedSkirt: Edge[] = [{
      ...baseline[0],
      data: {
        computedPath: [
          { x: 50, y: 60 }, { x: 50, y: 120 },
          { x: 110, y: 120 }, { x: 110, y: 220 },
        ],
      },
    }];

    expect(commercialEdgeDetoursDoNotRegress(
      baseline,
      boundedSkirt,
      [0],
    )).toBe(true);
  });
});
