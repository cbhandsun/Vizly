import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  MINIMUM_BUSINESS_NODE_CLEARANCE,
} from '../../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { createNodeClearanceGraphEvaluationContext } from '../../../strategies/shared/edgeWaypointCandidateRepair';
import {
  buildBaseReactFlowDisplayEndpointTrunkClearanceCandidates,
  repairBaseReactFlowDisplayEndpointTrunkClearance,
} from '../baseReactFlowDisplayEndpointTrunkClearance';
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';

const nodes: Node[] = [
  { id: 'hub', position: { x: 300, y: 0 }, measured: { width: 100, height: 120 }, data: {} },
  { id: 'first', position: { x: 0, y: 180 }, measured: { width: 50, height: 60 }, data: {} },
  { id: 'second', position: { x: 0, y: 300 }, measured: { width: 50, height: 60 }, data: {} },
  { id: 'third', position: { x: 0, y: 420 }, measured: { width: 50, height: 60 }, data: {} },
  { id: 'obstacle', position: { x: 100, y: 100 }, measured: { width: 44, height: 60 }, data: {} },
];

const edge = (id: string, target: string, lane: number, targetY: number): Edge => ({
  id,
  source: 'hub',
  target,
  sourceHandle: 'left',
  targetHandle: 'right',
  data: {
    computedPath: [
      { x: 300, y: 60 },
      { x: lane, y: 60 },
      { x: lane, y: targetY },
      { x: 50, y: targetY },
    ],
  },
});

const edges = [
  edge('risk-a', 'first', 180, 210),
  edge('risk-b', 'second', 180, 330),
  edge('safe-peer', 'third', 196, 450),
];

const totalRisk = (items: Edge[], minimum: number): number => {
  const evaluation = createNodeClearanceGraphEvaluationContext(nodes);
  return items.reduce((total, item) => (
    total + evaluation.score(getDisplayComputedPath(item), item, minimum)
  ), 0);
};

describe('baseReactFlowDisplayEndpointTrunkClearance', () => {
  it('atomically absorbs a risky nested pair into an existing safe superset trunk', () => {
    const candidates = buildBaseReactFlowDisplayEndpointTrunkClearanceCandidates(edges, nodes);
    const candidate = candidates[0];

    expect(candidate).toBeDefined();
    if (!candidate) throw new Error('expected a safe endpoint-trunk candidate');
    expect(candidate.flatMap((item, index) => item === edges[index] ? [] : [item.id])).toEqual([
      'risk-a',
      'risk-b',
    ]);
    expect(candidate[2]).toBe(edges[2]);
    expect(totalRisk(edges, COMMERCIAL_BUSINESS_NODE_CLEARANCE)).toBeGreaterThan(0);
    expect(totalRisk(candidate, COMMERCIAL_BUSINESS_NODE_CLEARANCE)).toBe(0);
    expect(totalRisk(candidate, MINIMUM_BUSINESS_NODE_CLEARANCE)).toBe(0);
    expect(getDisplayHardQualityGateReport(candidate, nodes, 'polished').hardClean).toBe(true);
  });

  it('fails closed for empty, ineligible, invalid, non-finite, and oversized inputs', () => {
    expect(buildBaseReactFlowDisplayEndpointTrunkClearanceCandidates([], nodes)).toEqual([]);
    expect(buildBaseReactFlowDisplayEndpointTrunkClearanceCandidates(edges, [])).toEqual([]);
    expect(buildBaseReactFlowDisplayEndpointTrunkClearanceCandidates(edges, nodes, {
      eligibleEdgeIds: new Set(['risk-a', 'risk-b']),
    })).toEqual([]);
    expect(buildBaseReactFlowDisplayEndpointTrunkClearanceCandidates(edges, nodes, {
      maxGroups: 0,
    })).toEqual([]);
    expect(buildBaseReactFlowDisplayEndpointTrunkClearanceCandidates(edges, nodes, {
      maxGroups: Number.NaN,
    })).toEqual([]);
    const nonFinite = edges.map((item, index) => index === 0 ? {
      ...item,
      data: { ...item.data, computedPath: [{ x: 300, y: 60 }, { x: Number.NaN, y: 60 }] },
    } : item);
    expect(buildBaseReactFlowDisplayEndpointTrunkClearanceCandidates(nonFinite, nodes)).toEqual([]);
    const excessivePath = edges.map((item, index) => index === 0 ? {
      ...item,
      data: {
        ...item.data,
        computedPath: Array.from({ length: 129 }, (_, pointIndex) => ({
          x: pointIndex,
          y: 60,
        })),
      },
    } : item);
    expect(buildBaseReactFlowDisplayEndpointTrunkClearanceCandidates(excessivePath, nodes))
      .toEqual([]);
    expect(buildBaseReactFlowDisplayEndpointTrunkClearanceCandidates(
      edges,
      Array.from({ length: 257 }, (_, index) => ({
        id: `node-${index}`,
        position: { x: index, y: index },
        data: {},
      })),
    )).toEqual([]);
    expect(repairBaseReactFlowDisplayEndpointTrunkClearance(edges, nodes, {
      eligibleEdgeIds: new Set(['risk-a']),
    })).toBe(edges);
  });
});
