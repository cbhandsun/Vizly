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
import {
  finalizeBaseReactFlowExactCommercialClearance,
  finalizeBaseReactFlowExactCommercialClearanceForStabilization,
} from '../baseReactFlowDisplayFinalCommercialClearanceTransaction';

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
    expect(response.routingContract?.clean).toBe(false);
    expect(response.routingContract?.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'commercial-clearance', count: 1 }),
    ]));
  });

  it('treats constrained commercial staircases as audited commercial exceptions', () => {
    const constrainedEdges: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      data: {
        commercialClearanceConstrainedStaircase: true,
        computedPath: [{ x: 80, y: 30 }, { x: 300, y: 30 }],
      },
    }];

    expect(countDisplayBusinessNodeCommercialClearanceViolations(
      constrainedEdges,
      nodes,
    )).toBe(0);
    expect(displayBusinessNodeCommercialClearanceIsClean(constrainedEdges, nodes)).toBe(true);

    const response = withExactDisplayHardReport({
      requestId: 'commercial-final-constrained-gate',
      edges: constrainedEdges,
      hardClean: true,
      routeResolution: 'full-route',
    }, nodes);
    expect(response.hardReport?.commercialClearanceViolations).toBe(0);
  });

  it('still repairs the 16px safety floor for a constrained commercial staircase', () => {
    const constrainedNodes: Node[] = [
      nodes[0],
      { ...nodes[1], position: { x: 140, y: 38 } },
      nodes[2],
    ];
    const constrainedEdges: Edge[] = [{
      id: 'edge', source: 'source', target: 'target', sourceHandle: 'right', targetHandle: 'left',
      data: {
        commercialClearanceConstrainedStaircase: true,
        computedPath: [{ x: 80, y: 30 }, { x: 300, y: 30 }],
      },
    }];
    const baseline = withExactDisplayHardReport({
      requestId: 'minimum-final-constrained-gate', edges: constrainedEdges,
      hardClean: true, routeResolution: 'full-route',
    }, constrainedNodes);

    expect(displayBusinessNodeCommercialClearanceIsClean(constrainedEdges, constrainedNodes)).toBe(true);
    expect(baseline.hardReport).toMatchObject({ hardClean: true, minimumClearanceViolations: 1 });
    const repaired = repairBaseReactFlowDisplayBusinessNodeClearance(
      constrainedEdges,
      constrainedNodes,
    );
    const repairedReport = withExactDisplayHardReport({
      ...baseline, edges: repaired,
    }, constrainedNodes);
    expect(repaired).not.toBe(constrainedEdges);
    expect(repairedReport.hardReport).toMatchObject({
      minimumClearanceViolations: 0, commercialClearanceViolations: 0,
    });

  });

  it('closes the 16px floor before accepting a constrained full-layout route', () => {
    const layoutNodes: Node[] = [
      { id: 'data-mdm', position: { x: 1200, y: 4096 }, data: {}, measured: { width: 128, height: 96 } },
      { id: 'mid-member', position: { x: 1453, y: 2056 }, data: {}, measured: { width: 256, height: 96 } },
      { id: 'be-scm-return', position: { x: 1225, y: 2888 }, data: {}, measured: { width: 227, height: 96 } },
      { id: 'be-scm-deliver', position: { x: 854, y: 2888 }, data: {}, measured: { width: 211, height: 96 } },
      { id: 'be-scm-make', position: { x: 483, y: 2888 }, data: {}, measured: { width: 211, height: 96 } },
      { id: 'be-scm-enable', position: { x: 1612, y: 2888 }, data: {}, measured: { width: 236, height: 96 } },
    ];
    const constrainedLayoutEdges: Edge[] = [{
      id: 'edge-mdm-2',
      source: 'data-mdm',
      target: 'mid-member',
      sourceHandle: 'right',
      targetHandle: 'bottom',
      data: {
        commercialClearanceConstrainedStaircase: true,
        computedPath: [
          { x: 1328, y: 4144 }, { x: 1581, y: 4144 }, { x: 1581, y: 2992 },
          { x: 435, y: 2992 }, { x: 435, y: 2840 }, { x: 1581, y: 2840 },
          { x: 1581, y: 2152 },
        ],
      },
    }];
    const exactBaseline = withExactDisplayHardReport({
      requestId: 'constrained-full-layout-minimum-floor',
      edges: constrainedLayoutEdges,
      hardClean: true,
      routeResolution: 'full-route',
    }, layoutNodes);

    expect(exactBaseline.hardReport).toMatchObject({
      hardClean: true,
      terminalsAnchored: true,
      minimumClearanceViolations: 1,
      commercialClearanceViolations: 0,
    });
    const finalized = finalizeBaseReactFlowExactCommercialClearance({
      exactBaseline,
      repairNodes: layoutNodes,
    });
    expect(finalized.hardReport).toMatchObject({
      hardClean: true,
      terminalsAnchored: true,
      minimumClearanceViolations: 0,
      commercialClearanceViolations: 0,
    });

    const stabilized = finalizeBaseReactFlowExactCommercialClearanceForStabilization({
      exactCandidate: exactBaseline,
      repairNodes: layoutNodes,
      commercialStabilizationPass: 1,
      exactReport: candidate => withExactDisplayHardReport(candidate, layoutNodes),
    });
    expect(stabilized.hardReport).toMatchObject({
      hardClean: true,
      terminalsAnchored: true,
      minimumClearanceViolations: 0,
      commercialClearanceViolations: 0,
    });
  });

  it('keeps the minimum floor repair atomic when graph-wide commercial promotion is constrained', () => {
    const layoutNodes: Array<Node & { positionAbsolute: { x: number; y: number } }> = [
      { id: 'titlegroup-数据域', position: { x: 0, y: 4008 }, positionAbsolute: { x: 0, y: 4008 }, data: {}, measured: { width: 4047, height: 216 }, width: 4047, height: 216, type: 'titleGroup' },
      { id: 'mid-trade', parentId: 'titlegroup-业务中台域', position: { x: 1053.5, y: 304 }, positionAbsolute: { x: 1053.5, y: 1840 }, data: {}, measured: { width: 250, height: 96 }, width: 250, height: 96 },
      { id: 'mid-member', parentId: 'titlegroup-业务中台域', position: { x: 1495.5, y: 520 }, positionAbsolute: { x: 1495.5, y: 2056 }, data: {}, measured: { width: 218, height: 96 }, width: 218, height: 96 },
      { id: 'be-scm-deliver', parentId: 'subgroup-后端域-SCM 供应链', position: { x: 786, y: 280 }, positionAbsolute: { x: 854, y: 2888 }, data: {}, measured: { width: 211, height: 96 }, width: 211, height: 96 },
      { id: 'be-scm-return', parentId: 'subgroup-后端域-SCM 供应链', position: { x: 1157, y: 280 }, positionAbsolute: { x: 1225, y: 2888 }, data: {}, measured: { width: 227, height: 96 }, width: 227, height: 96 },
      { id: 'be-scm-enable', parentId: 'subgroup-后端域-SCM 供应链', position: { x: 1544, y: 280 }, positionAbsolute: { x: 1612, y: 2888 }, data: {}, measured: { width: 236, height: 96 }, width: 236, height: 96 },
      { id: 'be-logistics-dispatch', parentId: 'subgroup-后端域-物流', position: { x: 2175, y: 64 }, positionAbsolute: { x: 2243, y: 3200 }, data: {}, measured: { width: 243, height: 96 }, width: 243, height: 96 },
      { id: 'data-collect', parentId: 'titlegroup-数据域', position: { x: 2626, y: 88 }, positionAbsolute: { x: 2626, y: 4096 }, data: {}, measured: { width: 252, height: 96 }, width: 252, height: 96 },
      { id: 'data-mdm', parentId: 'titlegroup-数据域', position: { x: 1093.5, y: 88 }, positionAbsolute: { x: 1093.5, y: 4096 }, data: {}, measured: { width: 234, height: 96 }, width: 234, height: 96 },
      { id: 'infra-cloud', parentId: 'titlegroup-技术基础设施域', position: { x: 96, y: 520 }, positionAbsolute: { x: 96, y: 4864 }, data: {}, measured: { width: 240, height: 96 }, width: 240, height: 96 },
      { id: 'infra-event', parentId: 'titlegroup-技术基础设施域', position: { x: 714.5, y: 304 }, positionAbsolute: { x: 714.5, y: 4648 }, data: {}, measured: { width: 243, height: 96 }, width: 243, height: 96 },
    ];
    const layoutEdges: Edge[] = [
      {
        id: 'edge-mdm-2', source: 'data-mdm', target: 'mid-member',
        sourceHandle: 'right', targetHandle: 'bottom',
        data: {
          trunkPolishVersion: 2,
          crossingOptimized: true,
          displayNodeClearanceRepaired: true,
          waypoints: [],
          intraContainerNoObstacle: true,
          obstacleScope: 'corridor',
          obstaclePadding: 24,
          pathOptions: { gridRatio: 1.04, borderRadius: 4 },
          layoutDirection: 'LR',
          hardObstacleRepaired: true,
          obstacleClearanceOptimized: true,
          computedPath: [
            { x: 1328, y: 4144 }, { x: 1581, y: 4144 }, { x: 1581, y: 2992 },
            { x: 435, y: 2992 }, { x: 435, y: 2840 }, { x: 1581, y: 2840 },
            { x: 1581, y: 2152 },
          ],
          layoutPathLocked: true,
          _layoutPathLocked: true,
          algorithm: 'display-obstacle-seed',
          __baseDisplayFinalizedSignature: '4116972972',
          terminalHandleAxisRepaired: true,
          displayMicroCleaned: true,
        },
      },
      {
        id: 'edge-infra-5', source: 'infra-event', target: 'mid-trade',
        sourceHandle: 'left', targetHandle: 'left',
        data: {
          trunkPolishVersion: 2,
          detachedSourceEndpointReanchored: true,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
          waypoints: [],
          intraContainerNoObstacle: true,
          obstacleScope: 'corridor',
          obstaclePadding: 24,
          pathOptions: { gridRatio: 1.04, borderRadius: 4 },
          layoutDirection: 'LR',
          hardObstacleRepaired: true,
          obstacleClearanceOptimized: true,
          computedPath: [
            { x: 714.5, y: 4696 }, { x: 48, y: 4696 },
            { x: 48, y: 1888 }, { x: 1053.5, y: 1888 },
          ],
          layoutPathLocked: true,
          _layoutPathLocked: true,
          algorithm: 'display-obstacle-seed',
          __baseDisplayFinalizedSignature: '4116972972',
        },
      },
      {
        id: 'edge-data-1', source: 'mid-trade', target: 'data-collect',
        sourceHandle: 'bottom', targetHandle: 'left',
        data: {
          trunkPolishVersion: 2,
          detachedSourceEndpointReanchored: false,
          detachedTargetEndpointReanchored: false,
          endpointOrthogonalRepaired: true,
          displayNodeClearanceRepaired: true,
          waypoints: [],
          intraContainerNoObstacle: true,
          obstacleScope: 'corridor',
          obstaclePadding: 24,
          pathOptions: { gridRatio: 1.04, borderRadius: 4 },
          layoutDirection: 'LR',
          computedPath: [
            { x: 1179, y: 1936 }, { x: 1179, y: 4047 }, { x: 2554, y: 4047 },
            { x: 2554, y: 4144 }, { x: 2626, y: 4144 },
          ],
          layoutPathLocked: true,
          _layoutPathLocked: true,
          algorithm: 'display-obstacle-seed',
          displayMicroCleaned: true,
          __baseDisplayFinalizedSignature: '4116972972',
          terminalPortBridgeRepaired: true,
        },
      },
    ];
    const audited = withExactDisplayHardReport({
      requestId: 'commercially-constrained-minimum-floor',
      edges: layoutEdges,
      hardClean: true,
      routeResolution: 'full-route',
    }, layoutNodes);
    expect(audited.hardReport).toMatchObject({
      minimumClearanceViolations: 1,
      commercialClearanceViolations: 2,
    });
    // Reproduce the final Worker stage after commercial exceptions have been
    // accepted but before their edge annotations are committed.
    const finalCandidate = {
      ...audited,
      hardClean: true,
      hardReport: audited.hardReport && {
        ...audited.hardReport,
        hardClean: true,
        commercialClearanceViolations: 0,
      },
    };

    const finalized = finalizeBaseReactFlowExactCommercialClearanceForStabilization({
      exactCandidate: finalCandidate,
      repairNodes: layoutNodes,
      commercialStabilizationPass: 0,
      exactReport: candidate => withExactDisplayHardReport(candidate, layoutNodes),
    });

    expect(finalized.hardReport).toMatchObject({
      hardClean: true,
      obstacleHits: 0,
      terminalsAttached: true,
      terminalsAnchored: true,
      minimumClearanceViolations: 0,
      commercialClearanceViolations: 0,
      quality: expect.objectContaining({ strictCrossings: 0, unrelatedOverlap: 0 }),
    });
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

  it.each([true, false])('preserves authored exact terminals (%s) while repairing freely routed edges', fixed => {
    const edges: Edge[] = [{
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { manualHandles: { source: fixed, target: fixed }, computedPath: [{ x: 80, y: 30 }, { x: 300, y: 30 }] },
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

    if (fixed) expect(finalized).toBe(exactBaseline);
    else expect(finalized).not.toBe(exactBaseline);
    expect(finalized.hardReport).toMatchObject({
      hardClean: !fixed,
      terminalsAnchored: true,
      commercialClearanceViolations: fixed ? 1 : 0,
    });
  });
});
