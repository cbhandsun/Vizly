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
