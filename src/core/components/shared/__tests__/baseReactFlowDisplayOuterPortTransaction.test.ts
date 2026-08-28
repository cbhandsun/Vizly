import type { Edge, Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as endpointStubRepair from '../baseReactFlowDisplayEndpointStubRepair';
import * as outerPortCandidates from '../baseReactFlowDisplayOuterPortCandidates';
import { buildBoundedOuterPortTransactionCandidates } from '../baseReactFlowDisplayOuterPortCandidates';
import { countRenderUnsafeEndpointStubs } from '../baseReactFlowDisplayEndpointStubRepair';
import { NEAR_PARALLEL_LANE_TOLERANCE } from '../baseReactFlowDisplayGeometry';
import { repairResidualOuterPortTransactionWithHardGate } from '../baseReactFlowDisplayOuterPortTransaction';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import { createBaseReactFlowFinalEndpointEvaluation } from '../baseReactFlowDisplayFinalEndpointEvaluation';
import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';

const node = (id: string, x: number, y: number): Node => ({
  id,
  position: { x, y },
  width: 80,
  height: 40,
  measured: { width: 80, height: 40 },
  data: {},
});

const graphNodes: Node[] = [
  node('north-west', 0, 0),
  node('north-east', 300, 0),
  node('south-west', 0, 200),
  node('south-east', 300, 200),
];

const overlappingEdges = (): Edge[] => [
  {
    id: 'diagonal-a',
    source: 'north-west',
    target: 'south-east',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data: { computedPath: [
      { x: 40, y: 40 },
      { x: 40, y: 100 },
      { x: 340, y: 100 },
      { x: 340, y: 200 },
    ] },
  },
  {
    id: 'diagonal-b',
    source: 'north-east',
    target: 'south-west',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data: { computedPath: [
      { x: 340, y: 40 },
      { x: 340, y: 100 },
      { x: 40, y: 100 },
      { x: 40, y: 200 },
    ] },
  },
];

const nearParallelResidualEdges = (overlapLength: number, laneOffset = 1): Edge[] => [
  overlappingEdges()[0],
  {
    id: `near-parallel-${overlapLength}`,
    source: 'north-east',
    target: 'south-west',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data: { computedPath: [
      { x: 340, y: 40 },
      { x: 340, y: 60 },
      { x: 360, y: 60 },
      { x: 360, y: 100 + laneOffset },
      { x: 340 - overlapLength, y: 100 + laneOffset },
      { x: 340 - overlapLength, y: 160 },
      { x: 40, y: 160 },
      { x: 40, y: 200 },
    ] },
  },
];

const crossingOnlyEdges = (): Edge[] => [
  {
    id: 'crossing-a',
    source: 'north-west',
    target: 'south-east',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data: { computedPath: [
      { x: 40, y: 40 },
      { x: 40, y: 120 },
      { x: 340, y: 120 },
      { x: 340, y: 200 },
    ] },
  },
  {
    id: 'crossing-b',
    source: 'north-east',
    target: 'south-west',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data: { computedPath: [
      { x: 340, y: 40 },
      { x: 340, y: 80 },
      { x: 200, y: 80 },
      { x: 200, y: 160 },
      { x: 40, y: 160 },
      { x: 40, y: 200 },
    ] },
  },
];

describe('outer port transaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enters the bounded port search for a strict-only residual when explicitly requested', () => {
    expect(buildBoundedOuterPortTransactionCandidates(
      crossingOnlyEdges(),
      graphNodes,
      { maxCandidates: 12 },
    )).toHaveLength(0);
    expect(buildBoundedOuterPortTransactionCandidates(
      crossingOnlyEdges(),
      graphNodes,
      { includeStrictCrossings: true, maxCandidates: 12 },
    ).length).toBeGreaterThan(0);

    const repaired = repairResidualOuterPortTransactionWithHardGate(
      crossingOnlyEdges(),
      graphNodes,
      64,
    );
    expect(getDisplayHardQualityGateReport(repaired, graphNodes, 'polished').hardClean).toBe(true);
  });

  it('builds a bounded, coordinate-derived candidate set for detached overlaps', () => {
    const candidates = buildBoundedOuterPortTransactionCandidates(
      overlappingEdges(),
      graphNodes,
      { maxCandidates: 12 },
    );

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(12);
    expect(candidates.every(candidate => Number.isFinite(candidate.ringLane))).toBe(true);
    expect(candidates.every(candidate => Number.isFinite(candidate.transitionLane))).toBe(true);
  });

  it.each([29, 39, 47])(
    'detects a %ipx residual overlap below the endpoint-stub threshold',
    (overlapLength) => {
      const candidates = buildBoundedOuterPortTransactionCandidates(
        nearParallelResidualEdges(overlapLength),
        graphNodes,
        { maxCandidates: 12 },
      );

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.length).toBeLessThanOrEqual(12);
    },
  );

  it('uses the same inclusive 24px overlap boundary as the rendered audit', () => {
    expect(buildBoundedOuterPortTransactionCandidates(
      nearParallelResidualEdges(23.99),
      graphNodes,
      { maxCandidates: 12 },
    )).toHaveLength(0);
    expect(buildBoundedOuterPortTransactionCandidates(
      nearParallelResidualEdges(24),
      graphNodes,
      { maxCandidates: 12 },
    ).length).toBeGreaterThan(0);
  });

  it.each([
    ['exactly collinear', 0],
    ['one pixel apart', 1],
    ['at the formal near-parallel boundary', NEAR_PARALLEL_LANE_TOLERANCE],
  ])('uses the formal overlap metric for lanes %s', (_label, laneOffset) => {
    const candidates = buildBoundedOuterPortTransactionCandidates(
      nearParallelResidualEdges(39, laneOffset),
      graphNodes,
      { maxCandidates: 12 },
    );

    expect(candidates.length).toBeGreaterThan(0);
  });

  it.each([
    NEAR_PARALLEL_LANE_TOLERANCE + 0.01,
    NEAR_PARALLEL_LANE_TOLERANCE + 1,
  ])('does not classify lanes %fpx apart as overlapping', (laneOffset) => {
    const candidates = buildBoundedOuterPortTransactionCandidates(
      nearParallelResidualEdges(39, laneOffset),
      graphNodes,
      { maxCandidates: 12 },
    );

    expect(candidates).toHaveLength(0);
  });

  it('commits only a complete hard-clean graph', () => {
    const edges = overlappingEdges();
    expect(getDisplayHardQualityGateReport(edges, graphNodes, 'polished').hardClean).toBe(false);

    const repaired = repairResidualOuterPortTransactionWithHardGate(edges, graphNodes, 64);

    expect(repaired).not.toBe(edges);
    expect(getDisplayHardQualityGateReport(repaired, graphNodes, 'polished').hardClean).toBe(true);
  });

  it('does not normalize the full graph when no bounded candidate exists', () => {
    const edges = crossingOnlyEdges();
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(graphNodes);
    const initialReport = evaluation.hardReport(edges);
    const traces: DisplayRoutingPhaseTrace[] = [];
    const candidateSpy = vi.spyOn(
      outerPortCandidates,
      'buildBoundedOuterPortTransactionCandidates',
    ).mockReturnValueOnce([]);
    const shortStubSpy = vi.spyOn(endpointStubRepair, 'repairFinalShortEndpointStubs');
    const renderStubSpy = vi.spyOn(endpointStubRepair, 'repairRenderSafeEndpointStubs');

    const repaired = repairResidualOuterPortTransactionWithHardGate(edges, graphNodes, 64, {
      evaluation,
      initialReport: { edges, report: initialReport },
      onPhaseTrace: trace => traces.push(trace),
    });

    expect(initialReport.hardClean).toBe(false);
    expect(initialReport.quality.strictCrossings).toBeGreaterThan(0);
    expect(candidateSpy).toHaveBeenCalledOnce();
    expect(shortStubSpy).not.toHaveBeenCalled();
    expect(renderStubSpy).not.toHaveBeenCalled();
    expect(repaired).toBe(edges);
    expect(traces).toContainEqual(expect.objectContaining({
      phase: 'finalizer-outer-port',
      resolution: 'fallback',
      candidateCount: 0,
      evaluationCount: 0,
    }));
  });

  it('reuses request-local changed hard reports without changing the selected route', () => {
    const edges = overlappingEdges();
    const expected = repairResidualOuterPortTransactionWithHardGate(edges, graphNodes, 64);
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(graphNodes);
    const initialReport = evaluation.hardReport(edges);
    const traces: DisplayRoutingPhaseTrace[] = [];
    const shortStubSpy = vi.spyOn(endpointStubRepair, 'repairFinalShortEndpointStubs');
    const renderStubSpy = vi.spyOn(endpointStubRepair, 'repairRenderSafeEndpointStubs');

    const repaired = repairResidualOuterPortTransactionWithHardGate(
      edges,
      graphNodes,
      64,
      {
        evaluation,
        initialReport: { edges, report: initialReport },
        onPhaseTrace: trace => traces.push(trace),
      },
    );

    expect(repaired).toEqual(expected);
    expect(getDisplayHardQualityGateReport(repaired, graphNodes, 'polished'))
      .toEqual(getDisplayHardQualityGateReport(expected, graphNodes, 'polished'));
    expect(traces).toContainEqual(expect.objectContaining({
      phase: 'finalizer-outer-port',
      resolution: 'accepted',
    }));
    expect(traces[0]?.candidateCount).toBeGreaterThan(0);
    expect(traces[0]?.evaluationCount).toBeGreaterThan(0);
    expect(shortStubSpy).toHaveBeenCalledOnce();
    expect(renderStubSpy).toHaveBeenCalledOnce();
  });

  it('falls back to full normalization when a bounded edit has an unsafe stub', () => {
    const edges = overlappingEdges();
    const unsafeEdges = edges.map((edge, index) => index === 0
      ? {
        ...edge,
        data: { ...edge.data, computedPath: [
          { x: 40, y: 40 },
          { x: 40, y: 48 },
          { x: 360, y: 48 },
          { x: 360, y: 200 },
        ] },
      }
      : edge);
    vi.spyOn(
      outerPortCandidates,
      'buildBoundedOuterPortTransactionCandidates',
    ).mockReturnValueOnce([{
      edges: unsafeEdges,
      movingEdgeIndex: 0,
      ringAxis: 'y',
      ringLane: 48,
      transitionLane: 360,
      quickScore: 0,
    }]);
    const shortStubSpy = vi.spyOn(endpointStubRepair, 'repairFinalShortEndpointStubs');
    const renderStubSpy = vi.spyOn(endpointStubRepair, 'repairRenderSafeEndpointStubs');
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(graphNodes);

    repairResidualOuterPortTransactionWithHardGate(edges, graphNodes, 64, {
      evaluation,
      initialReport: { edges, report: evaluation.hardReport(edges) },
    });

    expect(shortStubSpy).toHaveBeenCalledTimes(2);
    expect(renderStubSpy).toHaveBeenCalledTimes(2);
  });

  it('repairs subpixel-short stubs in the same atomic outer transaction', () => {
    const nodes = [
      ...graphNodes,
      node('stub-source-a', 500.34, 0),
      node('stub-target-a', 660, 220),
      node('stub-source-b', 800.28, 0),
      node('stub-target-b', 960, 220),
    ];
    const edges: Edge[] = [
      ...overlappingEdges(),
      {
        id: 'subpixel-a',
        source: 'stub-source-a',
        target: 'stub-target-a',
        sourceHandle: 'right',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 580.34, y: 20 },
          { x: 628, y: 20 },
          { x: 628, y: 140 },
          { x: 700, y: 140 },
          { x: 700, y: 220 },
        ] },
      },
      {
        id: 'subpixel-b',
        source: 'stub-source-b',
        target: 'stub-target-b',
        sourceHandle: 'right',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 880.28, y: 20 },
          { x: 928, y: 20 },
          { x: 928, y: 140 },
          { x: 1000, y: 140 },
          { x: 1000, y: 220 },
        ] },
      },
    ];

    const repaired = repairResidualOuterPortTransactionWithHardGate(edges, nodes, 64);
    const report = getDisplayHardQualityGateReport(repaired, nodes, 'polished');

    expect(repaired).not.toBe(edges);
    expect(report.quality.shortEndpointStubs).toBe(0);
    expect(report.terminalsAnchored).toBe(true);
    expect(report.hardClean).toBe(true);
    expect(countRenderUnsafeEndpointStubs(repaired)).toBe(0);
  });

  it('keeps an already clean graph unchanged', () => {
    const cleanEdges = overlappingEdges().slice(0, 1);
    expect(repairResidualOuterPortTransactionWithHardGate(cleanEdges, graphNodes, 64)).toBe(cleanEdges);
  });
});
