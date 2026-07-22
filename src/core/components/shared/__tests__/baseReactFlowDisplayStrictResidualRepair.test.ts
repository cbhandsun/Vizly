// @vitest-environment jsdom

import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import tmsStandardData from '../../../../data/standardized/TmsStandardData.json';
import { standardDataToCanvas } from '../../diagrams/designerUtils';
import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { countDisplayObstacleHits } from '../baseReactFlowDisplayEvaluation';
import { repairFinalResidualStrictCrossings } from '../baseReactFlowDisplayStrictResidualRepair';
import { buildNodeBoundaryAdjacentLaneCandidates } from '../baseReactFlowDisplayNodeBoundaryLaneCandidates';
import { buildStrictEndpointDetourCandidates } from '../baseReactFlowDisplayStrictEndpointDetourCandidates';
import {
  withAbsoluteNodePositions,
} from './baseReactFlowDisplayEdges.testUtils';
import { tmsResidualStrictPaths } from './fixtures/tmsResidualStrictPaths';
import { displayEdgesHaveNodeAnchoredTerminals } from '../baseReactFlowTerminalAxisRepair';

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  type: 'process',
  position: { x, y },
  width,
  height,
  measured: { width, height },
  data: {},
});

describe('final residual strict-crossing repair', () => {
  it('keeps changed terminals anchored while moving an internal crossing lane', () => {
    const edges: Edge[] = [
      {
        id: 'delivery-to-mobile',
        source: 'delivery',
        target: 'mobile',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        data: { computedPath: [
          { x: 1438, y: 2313 },
          { x: 1438, y: 2243 },
          { x: 1768, y: 2243 },
          { x: 1768, y: 253 },
          { x: 1706, y: 253 },
          { x: 1706, y: 181 },
        ] },
      },
      {
        id: 'execution-to-portal',
        source: 'execution',
        target: 'portal',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        data: { computedPath: [
          { x: 1486, y: 1985 },
          { x: 1486, y: 1937 },
          { x: 1789, y: 1937 },
          { x: 1789, y: 52 },
          { x: 1414, y: 52 },
          { x: 1414, y: 514 },
          { x: 1631, y: 514 },
          { x: 1631, y: 374 },
          { x: 1250, y: 374 },
          { x: 1250, y: 181 },
        ] },
      },
      {
        id: 'unrelated-horizontal-blocker',
        source: 'frp',
        target: 'blocker-target',
        sourceHandle: 'left',
        data: { computedPath: [
          { x: 1555, y: 571 },
          { x: 1627, y: 571 },
        ] },
      },
    ];
    const nodes = [
      node('delivery', 1357.82, 2313, 160, 96),
      node('mobile', 1646.2, 85, 120, 96),
      node('execution', 1360.62, 1985, 152, 96),
      node('portal', 1174.2, 85, 152, 96),
      node('frp', 1627.8, 523, 128, 96),
    ];

    expect(calculateEdgePathQualityScore(edges).strictCrossings).toBe(1);
    expect(displayEdgesHaveNodeAnchoredTerminals(edges.slice(0, 2), nodes)).toBe(true);

    const repaired = repairFinalResidualStrictCrossings(edges, nodes);

    const repairedQuality = calculateEdgePathQualityScore(repaired);
    expect(repairedQuality.nonOrthogonalSegments).toBe(0);
    expect(repairedQuality.strictCrossings).toBe(0);
    expect(repairedQuality.reverseOverlap).toBe(0);
    expect(repairedQuality.unrelatedOverlap).toBe(0);
    expect(repairedQuality.unexplainedRelatedOverlap).toBe(0);
    expect(repairedQuality.shortEndpointStubs).toBe(0);
    expect(repairedQuality.tinyInteriorDoglegs).toBe(0);
    expect(repairedQuality.hairpins).toBe(0);
    expect(countDisplayObstacleHits(repaired, nodes)).toBe(0);
    expect(displayEdgesHaveNodeAnchoredTerminals(repaired.slice(0, 2), nodes)).toBe(true);
  });

  it('offers a bounded node-boundary corridor for an adjacent crossing lane', () => {
    const carrierPath = [
      { x: 1486, y: 1985 },
      { x: 1486, y: 1937 },
      { x: 1789, y: 1937 },
      { x: 1789, y: 52 },
      { x: 1414, y: 52 },
      { x: 1414, y: 514 },
      { x: 1631, y: 514 },
      { x: 1631, y: 374 },
      { x: 1250, y: 374 },
      { x: 1250, y: 181 },
    ];
    const candidates = buildNodeBoundaryAdjacentLaneCandidates(
      carrierPath,
      1,
      'h',
      [node('mobile', 1646.2, 85, 120, 96)],
      1768,
      [],
    );
    const corridorCandidate = candidates.find(candidate => candidate.some((point, index) => {
      const next = candidate[index + 1];
      return next
        && Math.abs(point.x - next.x) <= 1
        && Math.min(point.y, next.y) < 571
        && Math.max(point.y, next.y) > 571
        && point.x > 1627
        && point.x < 1646.2;
    }));

    expect(candidates.length).toBeLessThanOrEqual(20);
    expect(corridorCandidate).toBeDefined();
  });

  it('builds a bounded local detour past the end of a crossing segment', () => {
    const mobilePath = [
      { x: 1438, y: 2313 },
      { x: 1438, y: 2243 },
      { x: 1768, y: 2243 },
      { x: 1768, y: 253 },
      { x: 1706, y: 253 },
      { x: 1706, y: 181 },
    ];
    const candidates = buildStrictEndpointDetourCandidates(
      mobilePath,
      {
        edgeIndex: 0,
        segmentIndex: 2,
        axis: 'v',
        direction: -1,
        a: mobilePath[2],
        b: mobilePath[3],
      },
      {
        edgeIndex: 1,
        segmentIndex: 1,
        axis: 'h',
        direction: 1,
        a: { x: 1486, y: 1937 },
        b: { x: 1789, y: 1937 },
      },
    );

    expect(candidates.length).toBeLessThanOrEqual(4);
    expect(candidates).toContainEqual([
      { x: 1438, y: 2313 },
      { x: 1438, y: 2243 },
      { x: 1813, y: 2243 },
      { x: 1813, y: 1961 },
      { x: 1768, y: 1961 },
      { x: 1768, y: 253 },
      { x: 1706, y: 253 },
      { x: 1706, y: 181 },
    ]);
  });

  it('repairs the complete TMS residual snapshot transactionally', async () => {
    const canvas = await standardDataToCanvas(tmsStandardData as any);
    const nodes = withAbsoluteNodePositions(canvas.nodes as any);
    const edges = canvas.edges
      .filter(edge => tmsResidualStrictPaths[edge.id])
      .map(edge => ({
        ...edge,
        data: {
          ...(edge.data as any),
          computedPath: tmsResidualStrictPaths[edge.id].map(point => ({ ...point })),
        },
      }));
    const baselineQuality = calculateEdgePathQualityScore(edges);
    const repaired = repairFinalResidualStrictCrossings(edges, nodes);
    const repairedQuality = calculateEdgePathQualityScore(repaired);
    expect(baselineQuality.strictCrossings).toBe(1);
    expect({
      nonOrthogonalSegments: repairedQuality.nonOrthogonalSegments,
      strictCrossings: repairedQuality.strictCrossings,
      reverseOverlap: repairedQuality.reverseOverlap,
      unrelatedOverlap: repairedQuality.unrelatedOverlap,
      unexplainedRelatedOverlap: repairedQuality.unexplainedRelatedOverlap,
      shortEndpointStubs: repairedQuality.shortEndpointStubs,
      tinyInteriorDoglegs: repairedQuality.tinyInteriorDoglegs,
      hairpins: repairedQuality.hairpins,
      obstacleHits: countDisplayObstacleHits(repaired, nodes),
    }).toEqual({
      nonOrthogonalSegments: 0,
      strictCrossings: 0,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
      unexplainedRelatedOverlap: 0,
      shortEndpointStubs: 0,
      tinyInteriorDoglegs: 0,
      hairpins: 0,
      obstacleHits: 0,
    });
  }, 120_000);

});
