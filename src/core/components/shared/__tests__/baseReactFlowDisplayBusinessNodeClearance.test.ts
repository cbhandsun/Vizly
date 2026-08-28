import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import {
  countDisplayBusinessNodeCommercialClearanceViolations,
  displayBusinessNodeCommercialClearanceIsClean,
  eligibleCommercialClearanceDoesNotRegress,
  repairBaseReactFlowDisplayBusinessNodeClearance,
} from '../baseReactFlowDisplayBusinessNodeClearance';
import { withExactDisplayHardReport } from '../baseReactFlowDisplayWorkerResponse';
import { finalizeBaseReactFlowExactCommercialClearance } from '../baseReactFlowDisplayFinalCommercialClearanceTransaction';

describe('final display business-node clearance', () => {
  const nodes: Node[] = [
    { id: 'source', position: { x: 0, y: 0 }, data: {}, measured: { width: 80, height: 60 } },
    { id: 'obstacle', position: { x: 140, y: 68 }, data: {}, measured: { width: 80, height: 60 } },
    { id: 'target', position: { x: 300, y: 0 }, data: {}, measured: { width: 80, height: 60 } },
  ];

  it('counts each violating edge once at the final 48px commercial gate', () => {
    const edges: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 80, y: 30 }, { x: 300, y: 30 }] },
    }];

    expect(countDisplayBusinessNodeCommercialClearanceViolations(edges, nodes)).toBe(1);
    expect(displayBusinessNodeCommercialClearanceIsClean(edges, nodes)).toBe(false);

    const response = withExactDisplayHardReport({
      requestId: 'commercial-final-gate',
      edges,
      hardClean: true,
      routeResolution: 'full-route',
    }, nodes);
    expect(response.hardClean).toBe(false);
    expect(response.hardReport?.commercialClearanceViolations).toBe(1);
  });

  it('accepts empty and commercially clear final geometry', () => {
    const clearEdges: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 80, y: 30 }, { x: 80, y: -20 }, { x: 300, y: -20 }, { x: 300, y: 30 }] },
    }];

    expect(countDisplayBusinessNodeCommercialClearanceViolations([], nodes)).toBe(0);
    expect(countDisplayBusinessNodeCommercialClearanceViolations(clearEdges, nodes)).toBe(0);
    expect(displayBusinessNodeCommercialClearanceIsClean(clearEdges, nodes)).toBe(true);
  });

  it('treats an omitted eligible set as all edges at the final no-regression gate', () => {
    const clearEdge: Edge = {
      id: 'edge',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 80, y: 30 }, { x: 80, y: -20 }, { x: 300, y: -20 }, { x: 300, y: 30 }] },
    };
    const regressedEdge: Edge = {
      ...clearEdge,
      data: { computedPath: [{ x: 80, y: 30 }, { x: 300, y: 30 }] },
    };

    expect(eligibleCommercialClearanceDoesNotRegress(
      [clearEdge],
      [regressedEdge],
      nodes,
      undefined,
    )).toBe(false);
    expect(eligibleCommercialClearanceDoesNotRegress(
      [clearEdge],
      [regressedEdge],
      nodes,
      new Set(),
    )).toBe(true);
    expect(eligibleCommercialClearanceDoesNotRegress(
      [clearEdge],
      [regressedEdge],
      nodes,
      new Set(['edge']),
    )).toBe(false);
  });

  it('branches away from diagonal corner risks without breaking shared source stems', () => {
    const fixtureNodes: Node[] = [
      'allocation', 'reservation', 'atp-check', 'order-input', 'order-split-merge',
      'order-exception',
    ].map((id, index) => ({
      id,
      position: { x: 10_000 + index * 200, y: 10_000 },
      data: {},
      measured: { width: 80, height: 60 },
    }));
    fixtureNodes.push(
      {
        id: 'slotting',
        position: { x: 1434.4, y: 1429 },
        data: {},
        measured: { width: 144, height: 73 },
      },
      {
        id: 'order-sla-classify',
        position: { x: 558.5, y: 1545.5 },
        data: {},
        measured: { width: 147, height: 73 },
      },
    );
    const fixtureEdges: Edge[] = [
      {
        id: 'atp', source: 'allocation', target: 'atp-check',
        data: { computedPath: [
          { x: 1114, y: 1418 }, { x: 1186, y: 1418 }, { x: 1186, y: 1274 },
          { x: 1385, y: 1274 }, { x: 1385, y: 1000 }, { x: 1441.4, y: 1000 },
        ] },
      },
      {
        id: 'reservation', source: 'allocation', target: 'reservation',
        data: { computedPath: [
          { x: 1114, y: 1418 }, { x: 1389.4, y: 1418 },
          { x: 1389.4, y: 1233 }, { x: 1445.4, y: 1233 },
        ] },
      },
      {
        id: 'order-exception', source: 'order-input', target: 'order-exception',
        data: { computedPath: [
          { x: 224, y: 1630 }, { x: 296, y: 1630 }, { x: 296, y: 1702 },
          { x: 508, y: 1702 }, { x: 508, y: 2048 }, { x: 564, y: 2048 },
        ] },
      },
      {
        id: 'order-split', source: 'order-input', target: 'order-split-merge',
        data: { computedPath: [
          { x: 224, y: 1630 }, { x: 518.5, y: 1630 },
          { x: 518.5, y: 1815 }, { x: 576, y: 1815 },
        ] },
      },
    ];

    expect(countDisplayBusinessNodeCommercialClearanceViolations(
      fixtureEdges,
      fixtureNodes,
    )).toBe(2);
    const repaired = repairBaseReactFlowDisplayBusinessNodeClearance(
      fixtureEdges,
      fixtureNodes,
    );
    const quality = calculateEdgePathQualityScore(repaired);

    expect(countDisplayBusinessNodeCommercialClearanceViolations(repaired, fixtureNodes)).toBe(0);
    expect(quality.strictCrossings).toBe(0);
    expect(quality.unexplainedRelatedOverlap).toBe(0);
  });

  it('preserves anchored terminal stubs while closing a corner clearance risk', () => {
    const fixtureNodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, data: {}, measured: { width: 80, height: 60 } },
      { id: 'obstacle', position: { x: 220, y: 68 }, data: {}, measured: { width: 80, height: 60 } },
      { id: 'target', position: { x: 300, y: 200 }, data: {}, measured: { width: 80, height: 60 } },
    ];
    const fixtureEdges: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { computedPath: [
        { x: 80, y: 30 },
        { x: 200, y: 30 },
        { x: 200, y: 230 },
        { x: 300, y: 230 },
      ] },
    }];
    const baseline = withExactDisplayHardReport({
      requestId: 'corner-clearance-baseline',
      edges: fixtureEdges,
      hardClean: false,
      routeResolution: 'full-route',
    }, fixtureNodes);
    const repairedEdges = repairBaseReactFlowDisplayBusinessNodeClearance(
      fixtureEdges,
      fixtureNodes,
    );
    const repaired = withExactDisplayHardReport({
      ...baseline,
      edges: repairedEdges,
    }, fixtureNodes);

    expect(baseline.hardReport).toMatchObject({
      terminalsAnchored: true,
      commercialClearanceViolations: 1,
    });
    expect(repaired.hardReport).toMatchObject({
      hardClean: true,
      terminalsAnchored: true,
      commercialClearanceViolations: 0,
    });

    const finalized = finalizeBaseReactFlowExactCommercialClearance({
      exactBaseline: baseline,
      repairNodes: fixtureNodes,
    });
    expect(finalized.hardReport).toMatchObject({
      hardClean: true,
      terminalsAnchored: true,
      commercialClearanceViolations: 0,
    });
  });

  it('rolls back when commercial repair cannot preserve the exact terminal contract', () => {
    const edges: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { computedPath: [{ x: 80, y: 30 }, { x: 300, y: 30 }] },
    }];
    const exactBaseline = withExactDisplayHardReport({
      requestId: 'commercial-final-rollback',
      edges,
      hardClean: false,
      routeResolution: 'full-route',
    }, nodes);

    const finalized = finalizeBaseReactFlowExactCommercialClearance({
      exactBaseline,
      repairNodes: nodes,
    });

    expect(finalized).toBe(exactBaseline);
    expect(finalized.hardReport).toMatchObject({
      hardClean: false,
      terminalsAnchored: true,
      commercialClearanceViolations: 1,
    });
  });
});
