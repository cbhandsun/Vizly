import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  MINIMUM_BUSINESS_NODE_CLEARANCE,
} from '../../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { createNodeClearanceGraphEvaluationContext } from '../../../strategies/shared/edgeWaypointCandidateRepair';
import {
  buildBaseReactFlowDisplayEndpointPassageClearanceCandidates,
  repairBaseReactFlowDisplayEndpointPassageClearance,
} from '../baseReactFlowDisplayEndpointPassageClearance';
import { findDisplayStrictCrossingHits, getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';

const nodes: Node[] = [
  { id: 'risk-source', position: { x: 0, y: 210 }, measured: { width: 40, height: 20 }, data: {} },
  { id: 'peer-source', position: { x: 0, y: 270 }, measured: { width: 40, height: 20 }, data: {} },
  { id: 'target', position: { x: 600, y: 100 }, measured: { width: 100, height: 80 }, data: {} },
  { id: 'obstacle', position: { x: 200, y: 150 }, measured: { width: 100, height: 50 }, data: {} },
];

const edges: Edge[] = [
  {
    id: 'risk',
    source: 'risk-source',
    target: 'target',
    sourceHandle: 'right',
    targetHandle: 'left',
    data: {
      computedPath: [
        { x: 40, y: 220 },
        { x: 100, y: 220 },
        { x: 100, y: 240 },
        { x: 500, y: 240 },
        { x: 500, y: 140 },
        { x: 600, y: 140 },
      ],
    },
  },
  {
    id: 'peer',
    source: 'peer-source',
    target: 'target',
    sourceHandle: 'right',
    targetHandle: 'left',
    data: {
      computedPath: [
        { x: 40, y: 280 },
        { x: 100, y: 280 },
        { x: 100, y: 264 },
        { x: 300, y: 264 },
        { x: 400, y: 264 },
        { x: 400, y: 240 },
        { x: 520, y: 240 },
        { x: 520, y: 140 },
        { x: 600, y: 140 },
      ],
    },
  },
];

const totalRisk = (items: Edge[], minimumClearance: number): number => {
  const clearance = createNodeClearanceGraphEvaluationContext(nodes);
  return items.reduce((total, edge) => (
    total + clearance.score(getDisplayComputedPath(edge), edge, minimumClearance)
  ), 0);
};

describe('baseReactFlowDisplayEndpointPassageClearance', () => {
  it.each([0, 1, 2, 3])('relocates a peer step when collapsing it would restore unsafe clearance, rotation %s', (turns) => {
    const point = (x: number, y: number) => {
      for (let turn = 0; turn < turns; turn += 1) [x, y] = [-y, x];
      return { x: x + 127, y: y - 91 };
    };
    const rect = (id: string, x: number, y: number, width: number, height: number): Node => {
      const first = point(x, y), last = point(x + width, y + height);
      return { id, position: { x: Math.min(first.x, last.x), y: Math.min(first.y, last.y) },
        width: Math.abs(first.x - last.x), height: Math.abs(first.y - last.y), data: {} };
    };
    const localNodes = [rect('a', 0, -30, 40, 80), rect('b', 0, 280, 40, 80),
      rect('target', 1060, 60, 100, 80), rect('obstacle', 800, 50, 80, 118)];
    const transfer = (id: string, source: string, coordinates: number[][]): Edge => ({
      id, source, target: 'target', sourceHandle: ['right', 'bottom', 'left', 'top'][turns],
      targetHandle: ['left', 'top', 'right', 'bottom'][turns],
      data: { computedPath: coordinates.map(([x, y]) => point(x, y)) },
    });
    const localEdges = [
      transfer('main', 'a', [[40, 10], [100, 10], [100, 188], [760, 188], [760, 216], [950, 216], [950, 100], [1060, 100]]),
      transfer('peer', 'b', [[40, 320], [100, 320], [100, 260], [240, 260], [240, 205], [760, 205], [760, 229], [960, 229], [960, 100], [1060, 100]]),
    ];
    const clearance = createNodeClearanceGraphEvaluationContext(localNodes);
    const risk = (candidate: Edge[]) => candidate.reduce((total, edge) => (
      total + clearance.score(getDisplayComputedPath(edge), edge, 48)
    ), 0);
    const initialReport = getDisplayHardQualityGateReport(localEdges, localNodes, 'polished');
    expect(initialReport.hardClean, JSON.stringify(initialReport)).toBe(true);
    expect(risk(localEdges)).toBeGreaterThan(0.5);
    expect(repairBaseReactFlowDisplayEndpointPassageClearance(localEdges, localNodes, {
      eligibleEdgeIds: new Set(['main']),
    })).toBe(localEdges);
    const repaired = repairBaseReactFlowDisplayEndpointPassageClearance(localEdges, localNodes);
    expect(repaired).not.toBe(localEdges);
    expect(risk(repaired), JSON.stringify({before:risk(localEdges), paths:repaired.map(edge=>({id:edge.id,path:getDisplayComputedPath(edge),risk:clearance.score(getDisplayComputedPath(edge),edge,48)}))})).toBe(0);
    expect(getDisplayHardQualityGateReport(repaired, localNodes, 'polished').hardClean).toBe(true);
    expect(getDisplayComputedPath(repaired[1]).slice(0, 5)).toEqual(getDisplayComputedPath(localEdges[1]).slice(0, 5));
    expect(getDisplayComputedPath(repaired[1]).slice(-2)).toEqual(getDisplayComputedPath(localEdges[1]).slice(-2));
  });

  it.each([0, 1, 2, 3])('clears an isolated node corner without requiring a peer crossing, rotation %s', (turns) => {
    const point = (x: number, y: number) => {
      for (let turn = 0; turn < turns; turn += 1) [x, y] = [-y, x];
      return { x: x + 719, y: y - 311 };
    };
    const rect = (id: string, x: number, y: number, width: number, height: number): Node => {
      const first = point(x, y), last = point(x + width, y + height);
      return { id, position: { x: Math.min(first.x, last.x), y: Math.min(first.y, last.y) },
        width: Math.abs(first.x - last.x), height: Math.abs(first.y - last.y), data: {} };
    };
    const localNodes = [rect('a', -100, -40, 100, 80), rect('b', 400, 160, 100, 80), rect('corner', 340, 20, 60, 60)];
    const localEdges: Edge[] = [{
      id: 'arbitrary-transfer', source: 'a', target: 'b',
      sourceHandle: ['right', 'bottom', 'left', 'top'][turns],
      targetHandle: ['left', 'top', 'right', 'bottom'][turns],
      data: { computedPath: [point(0, 0), point(100, 0), point(100, 100), point(300, 100), point(300, 200), point(400, 200)] },
    }];
    const clearance = createNodeClearanceGraphEvaluationContext(localNodes);
    const risk = (candidate: Edge[]) => clearance.score(getDisplayComputedPath(candidate[0]), candidate[0], 48);
    expect(getDisplayHardQualityGateReport(localEdges, localNodes, 'polished').hardClean).toBe(true);
    expect(risk(localEdges)).toBeGreaterThan(0.5);
    const repaired = repairBaseReactFlowDisplayEndpointPassageClearance(localEdges, localNodes);
    expect(repaired).not.toBe(localEdges);
    expect(risk(repaired)).toBe(0);
    expect(getDisplayHardQualityGateReport(repaired, localNodes, 'polished').hardClean).toBe(true);
  });

  it('rejects a dirty baseline before attempting an endpoint transaction', () => {
    const diagnostics = {
      acceptedCandidateCount: 0,
      commercialImprovementCount: 0,
      generatedShiftCandidateCount: 0,
      ladderCandidateCount: 0,
      maximumShiftedCrossingCount: 0,
      sharedEndpointCandidateCount: 0,
      singlePeerCrossingCandidateCount: 0,
    };
    const candidates = buildBaseReactFlowDisplayEndpointPassageClearanceCandidates(edges, nodes, {
      diagnostics,
    });
    expect(candidates).toEqual([]);
    expect(diagnostics.generatedShiftCandidateCount).toBe(0);
    expect(totalRisk(edges, COMMERCIAL_BUSINESS_NODE_CLEARANCE)).toBe(8);
    expect(totalRisk(edges, MINIMUM_BUSINESS_NODE_CLEARANCE)).toBe(0);
    expect(findDisplayStrictCrossingHits(edges)).toEqual([]);
    expect(getDisplayHardQualityGateReport(edges, nodes, 'polished').hardClean).toBe(false);
  });

  it('fails closed for malformed, ineligible, unbounded, and non-ladder inputs', () => {
    expect(buildBaseReactFlowDisplayEndpointPassageClearanceCandidates([], nodes)).toEqual([]);
    expect(buildBaseReactFlowDisplayEndpointPassageClearanceCandidates(edges, [])).toEqual([]);
    expect(buildBaseReactFlowDisplayEndpointPassageClearanceCandidates(edges, nodes, {
      eligibleEdgeIds: new Set(),
    })).toEqual([]);
    expect(repairBaseReactFlowDisplayEndpointPassageClearance(edges, nodes, {
      eligibleEdgeIds: new Set(['peer']),
    })).toBe(edges);
    const nonFinite = edges.map((edge, index) => index === 0 ? {
      ...edge,
      data: { ...edge.data, computedPath: [{ x: 40, y: 220 }, { x: Number.NaN, y: 220 }] },
    } : edge);
    expect(buildBaseReactFlowDisplayEndpointPassageClearanceCandidates(nonFinite, nodes))
      .toEqual([]);
    const excessivePath = edges.map((edge, index) => index === 0 ? {
      ...edge,
      data: {
        ...edge.data,
        computedPath: Array.from({ length: 129 }, (_, pointIndex) => ({
          x: pointIndex,
          y: 220,
        })),
      },
    } : edge);
    expect(buildBaseReactFlowDisplayEndpointPassageClearanceCandidates(excessivePath, nodes))
      .toEqual([]);
    const withoutLadder = edges.map((edge, index) => index === 1 ? {
      ...edge,
      data: {
        ...edge.data,
        computedPath: [
          { x: 40, y: 280 },
          { x: 520, y: 280 },
          { x: 520, y: 140 },
          { x: 600, y: 140 },
        ],
      },
    } : edge);
    expect(buildBaseReactFlowDisplayEndpointPassageClearanceCandidates(withoutLadder, nodes))
      .toEqual([]);
    expect(buildBaseReactFlowDisplayEndpointPassageClearanceCandidates(
      edges,
      Array.from({ length: 257 }, (_, index) => ({
        id: `node-${index}`,
        position: { x: index, y: index },
        data: {},
      })),
    )).toEqual([]);
  });
});
