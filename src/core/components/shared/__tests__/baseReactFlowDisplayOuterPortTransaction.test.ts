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
import { outerCorridorGraph } from './fixtures/outerCorridorGraph';
import {
  buildBoundedOuterCorridorCandidates,
  buildOuterTerminalCorridorPaths,
} from '../baseReactFlowDisplayOuterCorridorCandidates';
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';

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

  it('escapes a blocked exterior return without requiring a clean local port seed', () => {
    const { edges, nodes } = outerCorridorGraph();
    const before = getDisplayHardQualityGateReport(edges, nodes, 'polished');
    expect(before.quality.strictCrossings).toBe(1);
    const candidates = buildBoundedOuterPortTransactionCandidates(edges, nodes, {
      includeStrictCrossings: true, maxCandidates: 12,
    });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(12);
    expect(candidates.some(candidate => getDisplayHardQualityGateReport(
      candidate.edges, nodes, 'polished',
    ).hardClean)).toBe(true);
    expect(candidates.every(candidate => edges.filter(
      (edge, index) => candidate.edges[index] !== edge,
    ).length === 1)).toBe(true);
    const repaired = repairResidualOuterPortTransactionWithHardGate(edges, nodes);
    expect(getDisplayHardQualityGateReport(repaired, nodes, 'polished').hardClean).toBe(true);
    expect(repaired.map(edge => [edge.id, edge.source, edge.target]))
      .toEqual(edges.map(edge => [edge.id, edge.source, edge.target]));
  });

  it.each([1, 2, 3])('retains the exterior escape after %i quarter turns', turns => {
    const { edges, nodes } = outerCorridorGraph();
    const rotate = (point: { x: number; y: number }) => {
      let { x, y } = point;
      for (let turn = 0; turn < turns; turn += 1) [x, y] = [-y, x];
      return { x, y };
    };
    const sides = ['top', 'right', 'bottom', 'left'];
    const rotatedNodes = nodes.map(node => {
      const width = node.width ?? 0;
      const height = node.height ?? 0;
      const first = rotate(node.position);
      const last = rotate({ x: node.position.x + width, y: node.position.y + height });
      const nextWidth = Math.abs(last.x - first.x);
      const nextHeight = Math.abs(last.y - first.y);
      return { ...node, position: { x: Math.min(first.x, last.x), y: Math.min(first.y, last.y) },
        width: nextWidth, height: nextHeight, measured: { width: nextWidth, height: nextHeight } };
    });
    const rotatedEdges = edges.map(edge => ({ ...edge,
      sourceHandle: sides[(sides.indexOf(edge.sourceHandle ?? '') + turns) % 4],
      targetHandle: sides[(sides.indexOf(edge.targetHandle ?? '') + turns) % 4],
      data: { ...edge.data, computedPath: getDisplayComputedPath(edge).map(rotate) },
    }));
    const candidates = buildBoundedOuterPortTransactionCandidates(rotatedEdges, rotatedNodes, {
      includeStrictCrossings: true, maxCandidates: 12,
    });
    expect(candidates.some(candidate => getDisplayHardQualityGateReport(
      candidate.edges, rotatedNodes, 'polished',
    ).hardClean)).toBe(true);
  });

  it('retains exact manual source positions and never mutates the source graph', () => {
    const graph = outerCorridorGraph();
    const edges = graph.edges.map(edge => ({ ...edge, data: { ...edge.data,
      manualHandles: { source: true }, label: '<img src=x onerror=alert(1)>',
    } }));
    const before = JSON.stringify({ edges, nodes: graph.nodes });
    const candidates = buildBoundedOuterCorridorCandidates(edges, graph.nodes, [2, 6], 48, 64);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      candidate.edges.forEach((edge, index) => {
        expect(edge.sourceHandle).toBe(edges[index].sourceHandle);
        expect(getDisplayComputedPath(edge)[0]).toEqual(getDisplayComputedPath(edges[index])[0]);
        expect(edge.data?.label).toBe(edges[index].data?.label);
      });
    }
    expect(JSON.stringify({ edges, nodes: graph.nodes })).toBe(before);
  });

  it('fails closed when both residual edges forbid terminal routing', () => {
    const graph = outerCorridorGraph();
    const edges = graph.edges.map(edge => ({ ...edge, data: { ...edge.data,
      sourcePortPolicy: 'forbidden', targetPortPolicy: 'forbidden',
    } }));
    expect(buildBoundedOuterCorridorCandidates(edges, graph.nodes, [2, 6], 48, 64)).toEqual([]);
    expect(repairResidualOuterPortTransactionWithHardGate(edges, graph.nodes)).toBe(edges);
  });

  it('bounds corridor candidates and rejects invalid budgets and graph references', () => {
    const { edges, nodes } = outerCorridorGraph();
    for (const limit of [NaN, Infinity, -1, 0, 1.5]) {
      expect(buildBoundedOuterCorridorCandidates(edges, nodes, [2, 6], 48, limit)).toEqual([]);
    }
    for (const stub of [NaN, Infinity, -1, 0, 47]) {
      expect(buildBoundedOuterCorridorCandidates(edges, nodes, [2, 6], stub, 12)).toEqual([]);
    }
    expect(buildBoundedOuterCorridorCandidates([], nodes, [2], 48, 12)).toEqual([]);
    expect(buildBoundedOuterCorridorCandidates(edges, [], [2], 48, 12)).toEqual([]);
    expect(buildBoundedOuterCorridorCandidates(edges, nodes, [NaN, -1], 48, 12)).toEqual([]);
    const candidates = buildBoundedOuterCorridorCandidates(edges, nodes, [2, 6], 48, 1);
    expect(candidates).toHaveLength(1);
    expect(buildBoundedOuterCorridorCandidates(edges, nodes, [2, 6], 48, 1)).toEqual(candidates);
  });

  it('derives two return corridors from the complete blocker wall', () => {
    const source = { x: 826.5, y: 313 };
    const stub = { x: 778.5, y: 313 };
    const target = { x: 1259, y: 1322 };
    const targetStub = { x: 1259, y: 1370 };
    const ring = { x: 144, y: 1844 };
    const wall = [{ x: 1149.5, y: 1678, width: 219, height: 73 }];
    const candidates = buildOuterTerminalCorridorPaths(source, stub, target, targetStub, ring, wall, 48);
    expect(candidates).toHaveLength(2);
    expect(candidates.map(candidate => candidate.transitionLane)).toEqual([1101.5, 1416.5]);
    expect(buildOuterTerminalCorridorPaths(source, stub, target, targetStub, ring, [], 48)).toEqual([]);
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(buildOuterTerminalCorridorPaths({ x: value, y: 0 }, stub, target, targetStub, ring, wall, 48)).toEqual([]);
      expect(buildOuterTerminalCorridorPaths(source, stub, target, targetStub, ring,
        [{ ...wall[0], width: value }], 48)).toEqual([]);
    }
    expect(buildOuterTerminalCorridorPaths(source, stub, target, targetStub, ring,
      [{ ...wall[0], width: 0 }], 48)).toEqual([]);
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
