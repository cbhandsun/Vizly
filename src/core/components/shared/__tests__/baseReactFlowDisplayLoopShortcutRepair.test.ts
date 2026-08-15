// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import wmsStandardData from '../../../../data/standardized/WmsStandardData.json';
import { standardDataToCanvas } from '../../diagrams/designerUtils';
import {
  calculateEdgePathQualityScore,
  createEdgePathQualityEvaluationContext,
} from '../../../strategies/shared/edgeStrictCrossingGuard';
import {
  countDisplayObstacleHits,
  createDisplayObstacleEvaluationContext,
} from '../baseReactFlowDisplayEvaluation';
import {
  countRenderUnsafeEndpointStubs,
  repairRenderSafeEndpointStubs,
} from '../baseReactFlowDisplayEndpointStubRepair';
import { withDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import {
  buildStrictBlockingTerminalLaneShiftVariants,
  repairDisplayLoopShortcuts,
} from '../baseReactFlowDisplayLoopShortcutRepair';
import { withDisplayPortBridge } from '../baseReactFlowDisplayTerminalPortCandidates';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import { repairFinalResidualStrictCrossings } from '../baseReactFlowDisplayStrictResidualRepair';
import { repairAxisMismatchedTerminalsWithBoundedPortRoles } from '../baseReactFlowDisplayTerminalPortRepair';
import {
  getDisplayTerminalValidationReport,
  createDisplayTerminalValidationSnapshot,
} from '../baseReactFlowTerminalAxisRepair';
import { withAbsoluteNodePositions } from './baseReactFlowDisplayEdges.testUtils';
import { auditFinalSameSideEndpointOrder } from '../../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';

const residualPaths: Record<string, Array<{ x: number; y: number }>> = {
  e_shipping_bi: [
    { x: 7072, y: 471 }, { x: 6983, y: 471 }, { x: 6983, y: 435 },
    { x: 5154, y: 435 }, { x: 5154, y: 496 }, { x: 5064, y: 496 },
  ],
  e_so_inv: [
    { x: 5402, y: 474 }, { x: 5155, y: 474 }, { x: 5155, y: 411 },
    { x: 7040, y: 411 }, { x: 7040, y: 77 }, { x: 2385, y: 77 },
    { x: 2385, y: 205 },
  ],
};

describe('display loop shortcut repair', () => {
  it('removes a WMS interior loop before the residual-overlap search', async () => {
    const canvas = await standardDataToCanvas(wmsStandardData as any);
    const nodes = withAbsoluteNodePositions(canvas.nodes as any);
    const edges = canvas.edges
      .filter(edge => residualPaths[edge.id])
      .map(edge => ({
        ...edge,
        data: {
          ...(edge.data as any),
          computedPath: residualPaths[edge.id].map(point => ({ ...point })),
        },
      }));
    const terminalSnapshot = createDisplayTerminalValidationSnapshot(nodes);
    const baselineQuality = calculateEdgePathQualityScore(edges);
    const baselineTerminals = getDisplayTerminalValidationReport(edges, terminalSnapshot);

    expect(baselineQuality.reverseOverlap).toBe(39);
    expect(baselineQuality.unrelatedOverlap).toBe(39);
    expect(baselineQuality.hairpins).toBe(1);

    const shortened = repairDisplayLoopShortcuts(edges, nodes, 32);
    const shortenedQuality = calculateEdgePathQualityScore(shortened);
    expect(shortened).not.toBe(edges);
    expect(shortenedQuality.hairpins).toBe(0);
    const repaired = shortened;
    const repairedQuality = calculateEdgePathQualityScore(repaired);
    expect(repairedQuality.reverseOverlap).toBeLessThanOrEqual(baselineQuality.reverseOverlap);
    expect(repairedQuality.unrelatedOverlap).toBeLessThanOrEqual(baselineQuality.unrelatedOverlap);
    expect(repairedQuality.unexplainedRelatedOverlap).toBeLessThanOrEqual(
      baselineQuality.unexplainedRelatedOverlap,
    );
    expect({
      nonOrthogonalSegments: repairedQuality.nonOrthogonalSegments,
      strictCrossings: repairedQuality.strictCrossings,
      shortEndpointStubs: repairedQuality.shortEndpointStubs,
      tinyInteriorDoglegs: repairedQuality.tinyInteriorDoglegs,
      hairpins: repairedQuality.hairpins,
      obstacleHits: countDisplayObstacleHits(repaired, nodes),
    }).toEqual({
      nonOrthogonalSegments: 0,
      strictCrossings: 0,
      shortEndpointStubs: 0,
      tinyInteriorDoglegs: 0,
      hairpins: 0,
      obstacleHits: 0,
    });
    expect(getDisplayTerminalValidationReport(repaired, terminalSnapshot)).toEqual(
      baselineTerminals,
    );
  }, 30_000);

  it('shortens a clean detour by moving a free blocking terminal lane atomically', () => {
    const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
      id,
      position: { x, y },
      width,
      height,
      measured: { width, height },
      data: {},
    });
    const edge = (
      id: string,
      source: string,
      target: string,
      sourceHandle: string,
      targetHandle: string,
      computedPath: Array<{ x: number; y: number }>,
    ): Edge => ({ id, source, target, sourceHandle, targetHandle, data: { computedPath } });
    const nodes = [
      node('customs-source', 900, 540, 106, 106),
      node('customs-target', 1400, 823, 56, 100),
      node('carrier-source', 1050, 800, 100, 100),
      node('carrier-target', 1150, 100, 350, 100),
    ];
    const edges = [
      edge('customs', 'customs-source', 'customs-target', 'right', 'top', [
        { x: 1006, y: 593 }, { x: 1062, y: 593 }, { x: 1062, y: 72 },
        { x: 1531, y: 72 }, { x: 1531, y: 742 }, { x: 1428, y: 742 },
        { x: 1428, y: 823 },
      ]),
      edge('carrier', 'carrier-source', 'carrier-target', 'top', 'bottom', [
        { x: 1100, y: 800 }, { x: 1100, y: 700 },
        { x: 1227, y: 700 }, { x: 1227, y: 200 },
      ]),
    ];
    const baselineLength = 1_900;
    const directCustomsPath = [
      { x: 1006, y: 593 }, { x: 1428, y: 593 }, { x: 1428, y: 823 },
    ];
    const blockingVariants = buildStrictBlockingTerminalLaneShiftVariants(
      directCustomsPath,
      0,
      edges,
      nodes,
    );
    const feasibleAtomicCandidate = [
      withDisplayComputedPath(edges[0], directCustomsPath),
      withDisplayPortBridge(edges[1], [
        { x: 1100, y: 900 }, { x: 1100, y: 956 },
        { x: 1556, y: 956 }, { x: 1556, y: 150 }, { x: 1500, y: 150 },
      ], 'bottom', 'right'),
    ];
    const feasibleQuality = calculateEdgePathQualityScore(feasibleAtomicCandidate);
    const feasibleTerminals = getDisplayTerminalValidationReport(
      feasibleAtomicCandidate,
      createDisplayTerminalValidationSnapshot(nodes),
    );

    expect({
      strictCrossings: feasibleQuality.strictCrossings,
      shortEndpointStubs: feasibleQuality.shortEndpointStubs,
      tinyInteriorDoglegs: feasibleQuality.tinyInteriorDoglegs,
      hairpins: feasibleQuality.hairpins,
      obstacleHits: countDisplayObstacleHits(feasibleAtomicCandidate, nodes),
      allAnchored: feasibleTerminals.allAnchored,
    }).toEqual({
      strictCrossings: 0,
      shortEndpointStubs: 0,
      tinyInteriorDoglegs: 0,
      hairpins: 0,
      obstacleHits: 0,
      allAnchored: true,
    });
    expect(
      blockingVariants,
      JSON.stringify(blockingVariants, null, 2),
    ).toContainEqual({
      edgeIndex: 1,
      path: [
        { x: 1100, y: 900 }, { x: 1100, y: 956 },
        { x: 1556, y: 956 }, { x: 1556, y: 150 }, { x: 1500, y: 150 },
      ],
      sourceSide: 'bottom',
      targetSide: 'right',
    });
    const incrementalQuality = createEdgePathQualityEvaluationContext(edges)
      .evaluateChanged(feasibleAtomicCandidate, [0, 1]);
    const incrementalObstacles = createDisplayObstacleEvaluationContext(edges, nodes)
      .evaluateKnownChanges(feasibleAtomicCandidate, [0, 1]);
    const baselineTerminals = getDisplayTerminalValidationReport(
      edges,
      createDisplayTerminalValidationSnapshot(nodes),
    );
    const baselineTrunks = auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks;
    const feasibleTrunks = auditFinalSameSideEndpointOrder(
      feasibleAtomicCandidate,
      nodes,
    ).legalSharedTrunks;
    expect({
      incrementalQuality,
      incrementalObstacles,
      feasibleQuality,
      baselineTerminals,
      feasibleTerminals,
      baselineTrunks,
      feasibleTrunks,
    }).toEqual({
      incrementalQuality: feasibleQuality,
      incrementalObstacles: 0,
      feasibleQuality,
      baselineTerminals: feasibleTerminals,
      feasibleTerminals,
      baselineTrunks: feasibleTrunks,
      feasibleTrunks,
    });
    const repaired = repairDisplayLoopShortcuts(
      edges,
      nodes,
      32,
      strictCandidate => repairRenderSafeEndpointStubs(
        repairAxisMismatchedTerminalsWithBoundedPortRoles(
          repairFinalResidualStrictCrossings(strictCandidate, nodes),
          nodes,
          16,
        ),
        nodes,
        16,
      ),
    );
    const customsPath = (repaired[0].data as {
      computedPath: Array<{ x: number; y: number }>;
    }).computedPath;
    const repairedLength = customsPath.slice(1).reduce((total, point, index) => (
      total + Math.abs(point.x - customsPath[index].x) + Math.abs(point.y - customsPath[index].y)
    ), 0);
    const direct = Math.abs(customsPath.at(-1)!.x - customsPath[0].x)
      + Math.abs(customsPath.at(-1)!.y - customsPath[0].y);
    const terminalReport = getDisplayTerminalValidationReport(
      repaired,
      createDisplayTerminalValidationSnapshot(nodes),
    );

    expect(repairedLength).toBeLessThan(baselineLength);
    expect(repairedLength / direct, JSON.stringify(repaired, null, 2)).toBeLessThanOrEqual(1.25);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
    expect(countDisplayObstacleHits(repaired, nodes), JSON.stringify(repaired, null, 2)).toBe(0);
    expect(countRenderUnsafeEndpointStubs(repaired)).toBeLessThanOrEqual(
      countRenderUnsafeEndpointStubs(edges),
    );
    expect(terminalReport.allAnchored).toBe(true);
    expect(getDisplayHardQualityGateReport(repaired, nodes, 'polished').hardClean).toBe(true);
  });
});
