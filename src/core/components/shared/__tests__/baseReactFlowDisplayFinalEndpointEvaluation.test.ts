import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { createBaseReactFlowFinalEndpointEvaluation } from '../baseReactFlowDisplayFinalEndpointEvaluation';
import { startBaseReactFlowObstacleClosureTrace } from '../baseReactFlowDisplayObstacleClosureTrace';
import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';
import { createBaseReactFlowFinalEndpointResidualRepair } from '../baseReactFlowDisplayFinalEndpointResidualRepair';
import { commercialEdgeDetoursDoNotRegress } from '../baseReactFlowDisplayCommercialDetourGuard';
import { createDisplayWorkerFinalEvaluation } from '../baseReactFlowDisplayWorkerFinalEvaluation';

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
      generatedCandidateCount: 10,
      uniqueCandidateCount: 7,
    });

    const trace = traces[0];
    expect(trace).toMatchObject({
      candidateCount: 10,
      cacheHitCount: 3,
      changedEdgeCount: 0,
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

  it('does not reuse metadata-sensitive order evidence for a copied candidate', () => {
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
    const candidate = edges.map(edge => ({
      ...edge,
      data: edge.data ? { ...edge.data } : undefined,
    }));

    expect(evaluation.endpointOrder(candidate)).not.toBe(evaluation.endpointOrder(edges));
    expect(evaluation.passageOrder(candidate)).not.toBe(evaluation.passageOrder(edges));
    expect(evaluation.endpointOrder(candidate)).toEqual(evaluation.endpointOrder(edges));
    expect(evaluation.passageOrder(candidate)).toEqual(evaluation.passageOrder(edges));
    expect(evaluation.hardReport(candidate)).toBe(evaluation.hardReport(edges));
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
