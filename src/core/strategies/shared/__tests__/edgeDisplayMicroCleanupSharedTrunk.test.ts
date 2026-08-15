import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { repairDisplayMicroArtifacts } from '../edgeDisplayMicroCleanup';
import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';
import { createBaseReactFlowDisplayMicroSafetyContext } from '../../../components/shared/baseReactFlowDisplayMicroSafety';
import { countDisplayObstacleHits } from '../../../components/shared/baseReactFlowDisplayEvaluation';
import { repairBaseReactFlowFinalEndpointOrder } from '../../../components/shared/baseReactFlowDisplayFinalEndpointOrder';
import { repairBaseReactFlowConnectedSourceMicroArtifacts } from '../../../components/shared/baseReactFlowDisplayConnectedSourceMicroRepair';
import { createBaseReactFlowFinalEndpointEvaluation } from '../../../components/shared/baseReactFlowDisplayFinalEndpointEvaluation';
import { passesBaseReactFlowFinalDisplayGate } from '../../../components/shared/baseReactFlowDisplayFinalEndpointGate';

describe('repairDisplayMicroArtifacts shared trunks', () => {
  it('expands a consecutive micro stair when flattening would cross a horizontal lane', () => {
    const edges: Edge[] = [
      {
        id: 'edge-loms-visibility',
        source: 'l-oms',
        target: 'visibility',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 1065, y: 652 }, { x: 1065, y: 754 }, { x: 1438, y: 754 },
          { x: 1438, y: 1066 }, { x: 1448, y: 1066 }, { x: 1448, y: 1078 },
          { x: 1477, y: 1078 }, { x: 1477, y: 1232 }, { x: 1434, y: 1232 },
          { x: 1434, y: 1540 },
        ] },
      },
      {
        id: 'edge-tms-downstream',
        source: 'tms',
        target: 'downstream',
        sourceHandle: 'bottom',
        targetHandle: 'bottom',
        data: { computedPath: [
          { x: 1065, y: 930 }, { x: 1065, y: 1019 }, { x: 1338, y: 1019 },
          { x: 1338, y: 1066 }, { x: 1961, y: 1066 }, { x: 1961, y: 179.5 },
        ] },
      },
      {
        id: 'edge-tms-visibility',
        source: 'tms',
        target: 'visibility',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 1054, y: 930 }, { x: 1054, y: 1078 }, { x: 1165, y: 1078 },
          { x: 1165, y: 1256 }, { x: 1434, y: 1256 }, { x: 1434, y: 1540 },
        ] },
      },
      {
        id: 'edge-tms-bms', source: 'tms', target: 'bms', sourceHandle: 'bottom', targetHandle: 'top',
        data: { computedPath: [
          { x: 1031, y: 930 }, { x: 1031, y: 1000 },
          { x: 812, y: 1000 }, { x: 812, y: 1090 },
        ] },
      },
      {
        id: 'edge-wms-bms', source: 'wms', target: 'bms', sourceHandle: 'bottom', targetHandle: 'top',
        data: { computedPath: [
          { x: 191, y: 930 }, { x: 191, y: 1015 },
          { x: 731, y: 1015 }, { x: 731, y: 1090 },
        ] },
      },
      {
        id: 'edge-wms-visibility',
        source: 'wms',
        target: 'visibility',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 186, y: 930 }, { x: 186, y: 1020 }, { x: 382, y: 1020 },
          { x: 382, y: 1450 }, { x: 1434, y: 1450 }, { x: 1434, y: 1540 },
        ] },
      },
      {
        id: 'edge-visibility-downstream',
        source: 'visibility',
        target: 'downstream',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        data: { computedPath: [
          { x: 1523, y: 1540 }, { x: 1523, y: 1483 }, { x: 1961, y: 1483 },
          { x: 1961, y: 179.5 },
        ] },
      },
      {
        id: 'edge-loms-customs', source: 'l-oms', target: 'customs', sourceHandle: 'bottom', targetHandle: 'top',
        data: { computedPath: [{ x: 1065, y: 652 }, { x: 1065, y: 750 }, { x: 1649, y: 750 }, { x: 1649, y: 823 }] },
      },
      {
        id: 'edge-loms-tms', source: 'l-oms', target: 'tms', sourceHandle: 'bottom', targetHandle: 'top',
        data: { computedPath: [{ x: 1039, y: 652 }, { x: 1039, y: 812 }] },
      },
      {
        id: 'edge-loms-wms', source: 'l-oms', target: 'wms', sourceHandle: 'bottom', targetHandle: 'top',
        data: { computedPath: [{ x: 1034, y: 652 }, { x: 1034, y: 722 }, { x: 191, y: 722 }, { x: 191, y: 812 }] },
      },
      {
        id: 'edge-tms-carrier', source: 'tms', target: 'carrier-portal', sourceHandle: 'top', targetHandle: 'bottom',
        data: { computedPath: [{ x: 1065, y: 812 }, { x: 1065, y: 742 }, { x: 1426, y: 742 }, { x: 1426, y: 202 }] },
      },
      {
        id: 'edge-tms-yms', source: 'tms', target: 'yms', sourceHandle: 'bottom', targetHandle: 'top',
        data: { computedPath: [{ x: 1054, y: 930 }, { x: 1054, y: 1041 }, { x: 1242, y: 1041 }, { x: 1242, y: 1090 }] },
      },
      {
        id: 'edge-upstream-loms', source: 'upstream', target: 'l-oms', sourceHandle: 'bottom', targetHandle: 'top',
        data: { computedPath: [{ x: 895, y: 179.5 }, { x: 895, y: 236 }, { x: 1065, y: 236 }, { x: 1065, y: 534 }] },
      },
      {
        id: 'edge-wms-wcs', source: 'wms', target: 'wcs', sourceHandle: 'bottom', targetHandle: 'top',
        data: { computedPath: [{ x: 181, y: 930 }, { x: 181, y: 1090 }] },
      },
    ];

    const nodes: Node[] = [
      { id: 'l-oms', position: { x: 935.25, y: 534 }, width: 259, height: 118, measured: { width: 259, height: 118 }, data: {} },
      { id: 'tms', position: { x: 923.75, y: 812 }, width: 282, height: 118, measured: { width: 282, height: 118 }, data: {} },
      { id: 'wms', position: { x: 50, y: 812 }, width: 282, height: 118, measured: { width: 282, height: 118 }, data: {} },
      { id: 'visibility', position: { x: 1286.3375, y: 1540 }, width: 296, height: 118, measured: { width: 296, height: 118 }, data: {} },
      { id: 'downstream', position: { x: 1851.1125, y: 106.5 }, width: 219, height: 73, measured: { width: 219, height: 73 }, data: {} },
      { id: 'yms', position: { x: 1213, y: 1090 }, width: 250, height: 118, measured: { width: 250, height: 118 }, data: {} },
      { id: 'bms', position: { x: 650, y: 1090 }, width: 243, height: 118, measured: { width: 243, height: 118 }, data: {} },
      { id: 'customs', position: { x: 1525.75, y: 823 }, width: 282, height: 96, measured: { width: 282, height: 96 }, data: {} },
      { id: 'carrier-portal', position: { x: 1320.1125, y: 84 }, width: 211, height: 118, measured: { width: 211, height: 118 }, data: {} },
      { id: 'upstream', position: { x: 790.1125, y: 106.5 }, width: 210, height: 73, measured: { width: 210, height: 73 }, data: {} },
      { id: 'wcs', position: { x: 32, y: 1090 }, width: 298, height: 118, measured: { width: 298, height: 118 }, data: {} },
    ];

    const baseline = calculateEdgePathQualityScore(edges);
    const safetyContext = createBaseReactFlowDisplayMicroSafetyContext(edges, nodes);
    const repaired = repairDisplayMicroArtifacts(edges, safetyContext);
    const finalized = repairBaseReactFlowFinalEndpointOrder(edges, nodes);
    const connected = repairBaseReactFlowConnectedSourceMicroArtifacts(edges, nodes);
    const quality = calculateEdgePathQualityScore(repaired);
    const finalizedQuality = calculateEdgePathQualityScore(finalized);
    const connectedQuality = calculateEdgePathQualityScore(connected);
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
    const changedIndexes = connected.flatMap((edge, index) => edge !== edges[index] ? [index] : []);

    expect(baseline.strictCrossings).toBe(0);
    expect(baseline.tinyInteriorDoglegs).toBe(2);
    expect(quality.strictCrossings).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(2);
    expect(connectedQuality.tinyInteriorDoglegs).toBe(0);
    expect(passesBaseReactFlowFinalDisplayGate(
      edges,
      connected,
      changedIndexes,
      {},
      evaluation,
      true,
    ), JSON.stringify({
      baselineReport: evaluation.hardReport(edges),
      connectedReport: evaluation.hardReport(connected),
      baselineStubs: evaluation.unsafeEndpointStubs(edges),
      connectedStubs: evaluation.unsafeEndpointStubs(connected),
      baselineTrunks: evaluation.endpointOrder(edges).legalSharedTrunks,
      connectedTrunks: evaluation.endpointOrder(connected).legalSharedTrunks,
    }, null, 2)).toBe(true);
    expect(finalizedQuality.strictCrossings).toBe(0);
    expect(finalizedQuality.tinyInteriorDoglegs).toBe(0);
    expect(finalizedQuality.unrelatedOverlap).toBe(0);
    expect(finalizedQuality.unexplainedRelatedOverlap).toBe(0);
    expect(countDisplayObstacleHits(finalized, nodes)).toBe(0);
    expect(finalized.find(edge => edge.id === 'edge-loms-customs')?.data)
      .toMatchObject({ sourceBranchCorridorSeparated: true });
  });

  it('flattens a 24-40px visual stair between true source and target trunks', () => {
    const edges: Edge[] = [{
      id: 'edge-loms-visibility', source: 'l-oms', target: 'visibility',
      data: { sharedTrunkAware: true, sharedTrunkSynthesized: true, computedPath: [
        { x: 1013, y: 653 }, { x: 1013, y: 716 }, { x: -46, y: 716 },
        { x: -46, y: 742 }, { x: -160, y: 742 }, { x: -160, y: 1599 },
        { x: 1286, y: 1599 },
      ] },
    }];

    const repaired = repairDisplayMicroArtifacts(edges);

    expect((repaired[0].data as { computedPath?: unknown }).computedPath).toEqual([
      { x: 1013, y: 653 }, { x: 1013, y: 742 }, { x: -160, y: 742 },
      { x: -160, y: 1599 }, { x: 1286, y: 1599 },
    ]);
  });

  it('borrows a same-source readable trunk instead of keeping a tiny crossing dodge', () => {
    const edges: Edge[] = [
      {
        id: 'e_md_asn',
        source: 'master-data',
        target: 'asn',
        data: {
          sharedTrunkAware: true,
          computedPath: [
            { x: 4351, y: 496 },
            { x: 4243, y: 496 },
            { x: 4243, y: 614 },
            { x: 2386, y: 614 },
            { x: 2386, y: 686 },
            { x: 918, y: 686 },
            { x: 918, y: 486 },
            { x: 776, y: 486 },
          ],
        },
      },
      {
        id: 'e_md_erp',
        source: 'master-data',
        target: 'erp',
        data: {
          sharedTrunkAware: true,
          computedPath: [
            { x: 4351, y: 496 },
            { x: 4255, y: 496 },
            { x: 4255, y: 686 },
            { x: 4243, y: 686 },
            { x: 4243, y: 698 },
            { x: 347, y: 698 },
            { x: 347, y: 638 },
            { x: 291, y: 638 },
          ],
        },
      },
      {
        id: 'e_so_inv',
        source: 'so',
        target: 'inventory-view',
        data: {
          computedPath: [
            { x: 5401, y: 506 },
            { x: 5312, y: 506 },
            { x: 5312, y: 686 },
            { x: 2374, y: 686 },
            { x: 2374, y: 526 },
            { x: 2290, y: 526 },
            { x: 2290, y: 217 },
            { x: 2386, y: 217 },
          ],
        },
      },
    ];

    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);
    const repairedPath = (repaired.find(edge => edge.id === 'e_md_erp')?.data as any)?.computedPath;

    expect(baseline.tinyInteriorDoglegs).toBe(2);
    expect(quality.strictCrossings).toBe(0);
    expect(quality.unrelatedOverlap).toBe(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(
      quality.tinyInteriorDoglegs,
      JSON.stringify({
        quality,
        paths: repaired.map(edge => ({
          id: edge.id,
          path: (edge.data as { computedPath?: unknown }).computedPath,
        })),
      }, null, 2),
    ).toBe(0);
    expect(quality.hairpins).toBe(0);
    expect(repairedPath).toEqual([
      { x: 4351, y: 496 },
      { x: 4243, y: 496 },
      { x: 4243, y: 614 },
      { x: 2386, y: 614 },
      { x: 2386, y: 686 },
      { x: 2242, y: 686 },
      { x: 2242, y: 638 },
      { x: 291, y: 638 },
    ]);
  });
});
