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
import { finalSameSideTrueTrunksDoNotRegress } from '../baseReactFlowDisplayTrueTrunkContract';
import { finalizeBaseReactFlowExactCommercialClearance } from '../baseReactFlowDisplayFinalCommercialClearanceTransaction';
import { getExactDisplayHardReport } from '../baseReactFlowDisplayWorkerResponse';
import { withDisplayAbsolutePositions } from '../baseReactFlowDisplayEdgeCore';
import { collectDisplayEndpointRoleSlideGroups, buildDisplayEndpointRoleSlideCandidates } from '../baseReactFlowDisplayEndpointRoleSlide';
import { withDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import { auditFinalSameSideEndpointOrder } from '../../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import enterpriseGridDualRoleClearance from './fixtures/enterpriseGridDualRoleClearance.json';

const sharedSlideFixture = (turns = 0, targetRole = false) => {
  const rotate = (point: { x: number; y: number }) => {
    let result = point;
    for (let turn = 0; turn < turns; turn++) result = { x: -result.y, y: result.x };
    return result;
  };
  const sides = ['right', 'bottom', 'left', 'top'];
  const routeNodes: Node[] = [
    { id: 'hub', position: { x: 0, y: 0 }, width: 100, height: 120, data: {} },
    { id: 'obstacle', position: { x: 200, y: 88 }, width: 50, height: 60, data: {} },
    ...[0, 1, 2].map(index => ({ id: `leaf-${index}`, position: { x: 400 + index * 200, y: 300 + index * 120 }, width: 80, height: 80, data: {} })),
  ].map(node => {
    const corners = [node.position, { x: node.position.x + node.width, y: node.position.y + node.height }].map(rotate);
    const position = { x: Math.min(...corners.map(p => p.x)), y: Math.min(...corners.map(p => p.y)) };
    return { ...node, position, width: Math.abs(corners[1].x - corners[0].x), height: Math.abs(corners[1].y - corners[0].y) };
  });
  const routeEdges: Edge[] = [0, 1, 2].map(index => {
    const path = [{ x: 100, y: 60 }, { x: 440 + index * 200, y: 60 }, { x: 440 + index * 200, y: 300 + index * 120 }].map(rotate);
    const sourceHandle = sides[turns];
    const targetHandle = sides[(turns + 3) % 4];
    return {
      id: `edge-${index}`, source: targetRole ? `leaf-${index}` : 'hub', target: targetRole ? 'hub' : `leaf-${index}`,
      sourceHandle: targetRole ? targetHandle : sourceHandle, targetHandle: targetRole ? sourceHandle : targetHandle,
      data: { computedPath: targetRole ? path.reverse() : path },
    };
  });
  return { routeNodes, routeEdges };
};

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
  it('atomically closes the real Grid dual-role ports without moving the lane layout', () => {
    const projected: Node[] = enterpriseGridDualRoleClearance.nodes;
    const routeNodes = withDisplayAbsolutePositions(projected, new Map(projected.map(node => [node.id, node])));
    const routeEdges: Edge[] = enterpriseGridDualRoleClearance.edges;
    const original = structuredClone({ routeNodes, routeEdges });
    const baseline = getExactDisplayHardReport(routeEdges, routeNodes);
    expect(baseline.commercialClearanceViolations).toBe(1);
    expect(baseline.obstacleHits).toBe(0);
    const single = routeEdges.map((edge, index) => index === 27
      ? withDisplayComputedPath(edge, getDisplayComputedPath(edge).map((point, i) => i < 2 ? { ...point, y: 1592 } : point)) : edge);
    expect(getExactDisplayHardReport(single, routeNodes).quality.reverseOverlap).toBeGreaterThan(0);

    const result = finalizeBaseReactFlowExactCommercialClearance({
      exactBaseline: { requestId: 'grid-dual-role', edges: routeEdges, hardReport: baseline, hardClean: false, routeResolution: 'full-route' },
      repairNodes: routeNodes,
    });
    expect(result.hardClean).toBe(true);
    expect(result.hardReport?.commercialClearanceViolations).toBe(0);
    expect(result.hardReport?.quality.totalLength).toBe(baseline.quality.totalLength);
    expect(result.hardReport?.quality.crossingCost).toBe(baseline.quality.crossingCost);
    expect(result.edges).toBeDefined();
    if (!result.edges) throw new Error('Expected a complete atomic candidate');
    expect(result.edges.flatMap((edge, index) => JSON.stringify(getDisplayComputedPath(edge))
      === JSON.stringify(getDisplayComputedPath(routeEdges[index])) ? [] : [index])).toEqual([20, 27]);
    expect(finalSameSideTrueTrunksDoNotRegress(routeEdges, result.edges, routeNodes)).toBe(true);
    const endpoint = auditFinalSameSideEndpointOrder(result.edges, routeNodes);
    expect([endpoint.inversions, endpoint.ambiguousLaneTies, endpoint.collapsedLanePairs]).toEqual([0, 0, 0]);
    expect(result.edges.map(e => [e.id, e.source, e.target, e.sourceHandle, e.targetHandle]))
      .toEqual(routeEdges.map(e => [e.id, e.source, e.target, e.sourceHandle, e.targetHandle]));
    expect({ routeNodes, routeEdges }).toEqual(original);

    const reversed = repairBaseReactFlowDisplayEndpointTrunkClearance([...routeEdges].reverse(), [...routeNodes].reverse(), { maxGroups: 1 });
    expect(getExactDisplayHardReport(reversed, routeNodes).hardClean).toBe(true);
    expect(new Map(reversed.map(edge => [edge.id, getDisplayComputedPath(edge)])))
      .toEqual(new Map(result.edges.map(edge => [edge.id, getDisplayComputedPath(edge)])));
  });

  it('keeps dual-role groups complete, bounded, and closed around fixed ports', () => {
    const projected: Node[] = enterpriseGridDualRoleClearance.nodes;
    const routeNodes = withDisplayAbsolutePositions(projected, new Map(projected.map(node => [node.id, node])));
    const routeEdges: Edge[] = enterpriseGridDualRoleClearance.edges;
    const groups = collectDisplayEndpointRoleSlideGroups(routeEdges, routeNodes);
    const group = groups.find(entry => entry.edgeIds.includes('edge-27'));
    expect(group).toBeDefined();
    if (!group) throw new Error('Expected the full dual-role group');
    expect([...group.edgeIds].sort()).toEqual(['edge-20', 'edge-27']);
    expect(buildDisplayEndpointRoleSlideCandidates(routeEdges, routeNodes, group).length).toBeLessThanOrEqual(8);
    expect(repairBaseReactFlowDisplayEndpointTrunkClearance(routeEdges, routeNodes, { eligibleEdgeIds: new Set(['edge-27']) })).toBe(routeEdges);
    for (const [index, key] of [[20, 'targetPortPolicy'], [27, 'sourcePortPolicy']] as const) {
      const fixed = routeEdges.map((edge, i) => i === index ? { ...edge, data: { ...edge.data, [key]: 'fixed-pos' } } : edge);
      expect(repairBaseReactFlowDisplayEndpointTrunkClearance(fixed, routeNodes)).toBe(fixed);
    }
    const sideFixed = routeEdges.map((edge, index) => index === 27
      ? { ...edge, data: { ...edge.data, sourcePortPolicy: 'fixed-side' } } : edge);
    const sideResult = repairBaseReactFlowDisplayEndpointTrunkClearance(sideFixed, routeNodes, {
      eligibleEdgeIds: new Set(['edge-20', 'edge-27']),
    });
    expect(getExactDisplayHardReport(sideResult, routeNodes).hardClean).toBe(true);
    expect(sideResult[27].sourceHandle).toBe(sideFixed[27].sourceHandle);
    expect(sideResult.filter((_, index) => index !== 20 && index !== 27))
      .toEqual(sideFixed.filter((_, index) => index !== 20 && index !== 27));
    const straight = routeEdges.map((edge, index) => index === 27
      ? withDisplayComputedPath(edge, getDisplayComputedPath(edge).slice(0, 2)) : edge);
    expect(collectDisplayEndpointRoleSlideGroups(straight, routeNodes).some(entry => entry.edgeIds.includes('edge-27'))).toBe(false);
    expect(collectDisplayEndpointRoleSlideGroups([], routeNodes)).toEqual([]);
    expect(collectDisplayEndpointRoleSlideGroups(routeEdges, [])).toEqual([]);
    expect(buildDisplayEndpointRoleSlideCandidates(routeEdges, routeNodes, { ...group, edgeIds: ['edge-27'] })).toEqual([]);
    const hidden = routeNodes.map(node => node.id === group.nodeId ? { ...node, hidden: true } : node);
    expect(collectDisplayEndpointRoleSlideGroups(routeEdges, hidden).some(entry => entry.nodeId === group.nodeId)).toBe(false);
    const invalid = routeEdges.map((edge, index) => index === 27
      ? withDisplayComputedPath(edge, [{ x: Number.NaN, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 100 }]) : edge);
    expect(collectDisplayEndpointRoleSlideGroups(invalid, routeNodes).some(entry => entry.edgeIds.includes('edge-27'))).toBe(false);
  });

  it.each([0, 1, 2, 3])('slides opposite endpoint roles together on side rotation %i', turns => {
    const rotate = (point: { x: number; y: number }) => {
      let result = point;
      for (let turn = 0; turn < turns; turn++) result = { x: -result.y, y: result.x };
      return result;
    };
    const sides = ['right', 'bottom', 'left', 'top'];
    const routeNodes: Node[] = [
      { id: 'hub', position: { x: 0, y: 0 }, width: 100, height: 96, data: {} },
      { id: 'out', position: { x: 1000, y: 1056 }, width: 100, height: 96, data: {} },
      { id: 'in', position: { x: 1200, y: -200 }, width: 100, height: 96, data: {} },
      { id: 'obstacle', position: { x: 220, y: 96 }, width: 100, height: 96, data: {} },
    ].map(node => {
      const corners = [node.position, { x: node.position.x + node.width, y: node.position.y + node.height }].map(rotate);
      return { ...node, position: { x: Math.min(...corners.map(p => p.x)), y: Math.min(...corners.map(p => p.y)) },
        width: Math.abs(corners[1].x - corners[0].x), height: Math.abs(corners[1].y - corners[0].y) };
    });
    const routeEdges: Edge[] = [
      { id: 'outgoing', source: 'hub', target: 'out', sourceHandle: sides[turns], targetHandle: sides[(turns + 2) % 4],
        data: { computedPath: [{ x: 100, y: 72 }, { x: 944, y: 72 }, { x: 944, y: 1104 }, { x: 1000, y: 1104 }].map(rotate) } },
      { id: 'incoming', source: 'in', target: 'hub', sourceHandle: sides[(turns + 2) % 4], targetHandle: sides[turns],
        data: { computedPath: [{ x: 1200, y: -152 }, { x: 1144, y: -152 }, { x: 1144, y: 48 }, { x: 100, y: 48 }].map(rotate) } },
    ];
    expect(getExactDisplayHardReport(routeEdges, routeNodes).commercialClearanceViolations).toBe(1);
    const result = repairBaseReactFlowDisplayEndpointTrunkClearance(routeEdges, routeNodes, { maxGroups: 1 });
    expect(getExactDisplayHardReport(result, routeNodes).hardClean).toBe(true);
    expect(getDisplayComputedPath(result[0])[0]).toEqual(rotate({ x: 100, y: 48 }));
    expect(getDisplayComputedPath(result[1]).at(-1)).toEqual(rotate({ x: 100, y: 24 }));
    expect(getDisplayComputedPath(result[0]).at(-1)).toEqual(getDisplayComputedPath(routeEdges[0]).at(-1));
    expect(getDisplayComputedPath(result[1])[0]).toEqual(getDisplayComputedPath(routeEdges[1])[0]);
    const blockedNodes = routeNodes.map(node => node.id === 'hub'
      ? { ...node, ...((turns % 2) === 0 ? { height: 48 } : { width: 48 }) } : node);
    expect(repairBaseReactFlowDisplayEndpointTrunkClearance(routeEdges, blockedNodes)).toBe(routeEdges);
  });

  it('does not spend the group budget on earlier clean trunks', () => {
    const cleanNodes = nodes.filter(node => node.id !== 'obstacle').map(node => ({
      ...node, id: `a-${node.id}`, position: { x: node.position.x - 2000, y: node.position.y },
    }));
    const cleanEdges = edges.map(item => ({
      ...item, id: `a-${item.id}`, source: `a-${item.source}`, target: `a-${item.target}`,
      data: { computedPath: getDisplayComputedPath(item).map(point => ({ x: point.x - 2000, y: point.y })) },
    }));
    const input = [...cleanEdges, edges[0], edges[2]];
    const allNodes = [...cleanNodes, ...nodes];
    const result = repairBaseReactFlowDisplayEndpointTrunkClearance(input, allNodes, { maxGroups: 1 });
    expect(getExactDisplayHardReport(result, allNodes).hardClean).toBe(true);
    expect(result.slice(0, cleanEdges.length)).toEqual(cleanEdges);
    expect(finalSameSideTrueTrunksDoNotRegress(input, result, allNodes)).toBe(true);
  });

  it('closes a two-member trunk using its safe peer lane', () => {
    const pair = [edges[0], edges[2]];
    const result = repairBaseReactFlowDisplayEndpointTrunkClearance(pair, nodes);
    expect(result).not.toBe(pair);
    expect(totalRisk(result, COMMERCIAL_BUSINESS_NODE_CLEARANCE)).toBe(0);
    expect(getExactDisplayHardReport(result, nodes).hardClean).toBe(true);
    expect(finalSameSideTrueTrunksDoNotRegress(pair, result, nodes)).toBe(true);
    expect(result[1]).toBe(pair[1]);
  });

  it.each([0, 1, 2, 3])('slides a complete source or target trunk with rotation %i', turns => {
    for (const targetRole of [false, true]) {
      const { routeNodes, routeEdges } = sharedSlideFixture(turns, targetRole);
      const before = structuredClone(routeEdges);
      const baseline = getExactDisplayHardReport(routeEdges, routeNodes);
      expect(baseline.commercialClearanceViolations).toBe(3);
      const result = finalizeBaseReactFlowExactCommercialClearance({
        exactBaseline: { requestId: 'trunk-slide', edges: routeEdges, hardReport: baseline, hardClean: false, routeResolution: 'full-route' },
        repairNodes: routeNodes,
      });
      expect(result.hardClean, JSON.stringify(result.hardReport)).toBe(true);
      expect(result.hardReport?.commercialClearanceViolations).toBe(0);
      expect(result.edges).toBeDefined();
      if (!result.edges) throw new Error('Expected an atomic route');
      expect(finalSameSideTrueTrunksDoNotRegress(routeEdges, result.edges, routeNodes)).toBe(true);
      expect(result.edges.map(e => [e.id, e.source, e.target, e.sourceHandle, e.targetHandle]))
        .toEqual(routeEdges.map(e => [e.id, e.source, e.target, e.sourceHandle, e.targetHandle]));
      expect(routeEdges).toEqual(before);
    }
  });

  it('keeps fixed or frozen trunk members and rejects an unavailable port interval', () => {
    const { routeNodes, routeEdges } = sharedSlideFixture();
    expect(repairBaseReactFlowDisplayEndpointTrunkClearance(routeEdges, routeNodes, {
      eligibleEdgeIds: new Set(['edge-0', 'edge-1']),
    })).toBe(routeEdges);
    const fixed = routeEdges.map((edge, index) => index === 0
      ? { ...edge, data: { ...edge.data, sourcePortPolicy: 'fixed-pos' } } : edge);
    expect(repairBaseReactFlowDisplayEndpointTrunkClearance(fixed, routeNodes)).toBe(fixed);
    const blocked = routeNodes.map(node => node.id === 'hub'
      ? { ...node, position: { x: 0, y: 58 }, height: 4 } : node);
    expect(repairBaseReactFlowDisplayEndpointTrunkClearance(routeEdges, blocked)).toBe(routeEdges);
  });

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
