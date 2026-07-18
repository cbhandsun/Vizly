// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import wmsStandardData from '../../../../data/standardized/WmsStandardData.json';
import { standardDataToCanvas } from '../../diagrams/designerUtils';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { countDisplayObstacleHits } from '../baseReactFlowDisplayEvaluation';
import { repairDisplayLoopShortcuts } from '../baseReactFlowDisplayLoopShortcutRepair';
import {
  getDisplayTerminalValidationReport,
  createDisplayTerminalValidationSnapshot,
} from '../baseReactFlowTerminalAxisRepair';
import { withAbsoluteNodePositions } from './baseReactFlowDisplayEdges.testUtils';

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
});
