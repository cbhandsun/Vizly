import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import {
  countDisplayObstacleHits,
  keepPerEdgeObstacleNonRegressingCandidates,
} from '../baseReactFlowDisplayEvaluation';
import { buildObstacleSkirtCandidates } from '../baseReactFlowDisplayObstacleCandidates';
import {
  getDisplayComputedPath,
  withDisplayComputedPath,
} from '../baseReactFlowDisplayGeometry';
import { repairDisplayObstacleHits } from '../baseReactFlowDisplayObstacleRepair';
import { DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS } from '../baseReactFlowDisplayRenderPipeline';
import { createDisplayTerminalValidationSnapshot } from '../baseReactFlowTerminalValidation';

describe('display obstacle candidates', () => {
  it('offers a full-span commercial-clearance lane before falling back to an outer ring', () => {
    const edge: Edge = {
      id: 'terminal-preserving-skirt',
      source: 'source',
      target: 'target',
      data: {
        computedPath: [
          { x: 217, y: 3213 },
          { x: 217, y: 3269 },
          { x: 204, y: 3269 },
          { x: 204, y: 3661 },
          { x: 204, y: 3789 },
        ],
      },
    };
    const nodes: Node[] = [{
      id: 'blocker',
      position: { x: 114, y: 3373 },
      width: 204,
      height: 96,
      measured: { width: 204, height: 96 },
      data: {},
    }];

    const candidates = buildObstacleSkirtCandidates(
      getDisplayComputedPath(edge),
      nodes,
      edge,
      [edge],
    );

    expect(candidates).toContainEqual([
      { x: 217, y: 3213 },
      { x: 217, y: 3269 },
      { x: 58, y: 3269 },
      { x: 58, y: 3661 },
      { x: 204, y: 3661 },
      { x: 204, y: 3789 },
    ]);
  });

  it('routes a two-point orthogonal path around an unrelated node', () => {
    const edge: Edge = {
      id: 'straight-through-obstacle',
      source: 'source',
      target: 'target',
      data: {
        computedPath: [{ x: 0, y: 0 }, { x: 400, y: 0 }],
      },
    };
    const nodes: Node[] = [{
      id: 'blocker',
      position: { x: 150, y: -40 },
      width: 100,
      height: 80,
      data: {},
    }];

    const candidates = buildObstacleSkirtCandidates(
      (edge.data as any).computedPath,
      nodes,
      edge,
      [edge],
    );
    const repaired = repairDisplayObstacleHits(
      [edge],
      nodes,
      'LR',
      DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS,
    );
    const quality = calculateEdgePathQualityScore(repaired);

    expect(candidates.length).toBeGreaterThan(0);
    expect((repaired[0].data as any).computedPath).not.toEqual((edge.data as any).computedPath);
    expect(countDisplayObstacleHits(repaired, nodes)).toBe(0);
    expect(quality.nonOrthogonalSegments).toBe(0);
    expect(quality.strictCrossings).toBe(0);
  });

  it('filters terminal-regressing shortcuts before candidate truncation', () => {
    const nodes: Node[] = [
      {
        id: 'source',
        position: { x: 0, y: 0 },
        width: 100,
        height: 100,
        measured: { width: 100, height: 100 },
        data: {},
      },
      {
        id: 'blocker',
        position: { x: 180, y: 250 },
        width: 100,
        height: 100,
        measured: { width: 100, height: 100 },
        data: {},
      },
      {
        id: 'target',
        position: { x: 400, y: 0 },
        width: 100,
        height: 100,
        measured: { width: 100, height: 100 },
        data: {},
      },
    ];
    const edge: Edge = {
      id: 'bottom-to-bottom',
      source: 'source',
      target: 'target',
      data: {
        computedPath: [
          { x: 50, y: 100 },
          { x: 50, y: 300 },
          { x: 450, y: 300 },
          { x: 450, y: 100 },
        ],
      },
    };
    const snapshot = createDisplayTerminalValidationSnapshot(nodes);
    const repaired = repairDisplayObstacleHits(
      [edge],
      nodes,
      'TB',
      DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS,
    );

    expect(countDisplayObstacleHits([edge], nodes)).toBe(1);
    expect(countDisplayObstacleHits(repaired, nodes)).toBe(0);
    expect(getDisplayComputedPath(repaired[0])).not.toEqual(getDisplayComputedPath(edge));
    expect(snapshot.validateEdge(repaired[0])).toEqual({
      attached: true,
      anchored: true,
      sourceAttached: true,
      sourceAnchored: true,
      targetAttached: true,
      targetAnchored: true,
    });
  });

  it('rolls back only the edges whose quality candidate adds an obstacle hit', () => {
    const nodes: Node[] = [{
      id: 'blocker',
      position: { x: 150, y: -40 },
      width: 100,
      height: 80,
      measured: { width: 100, height: 80 },
      data: {},
    }];
    const baseline: Edge[] = [
      {
        id: 'regressing',
        source: 'source-a',
        target: 'target-a',
        data: { computedPath: [{ x: 0, y: 100 }, { x: 400, y: 100 }] },
      },
      {
        id: 'safe',
        source: 'source-b',
        target: 'target-b',
        data: { computedPath: [{ x: 0, y: 200 }, { x: 400, y: 200 }] },
      },
    ];
    const candidate = [
      withDisplayComputedPath(baseline[0], [{ x: 0, y: 0 }, { x: 400, y: 0 }]),
      withDisplayComputedPath(baseline[1], [{ x: 0, y: 240 }, { x: 400, y: 240 }]),
    ];

    const repaired = keepPerEdgeObstacleNonRegressingCandidates(
      baseline,
      candidate,
      nodes,
    );

    expect(repaired[0]).toBe(baseline[0]);
    expect(repaired[1]).toBe(candidate[1]);
    expect(countDisplayObstacleHits(repaired, nodes)).toBe(0);
  });

  it('skirts a stacked pair of blockers while keeping bottom terminals anchored', () => {
    const nodes: Node[] = [
      {
        id: 'source',
        position: { x: 3446, y: 750 },
        width: 100,
        height: 100,
        measured: { width: 100, height: 100 },
        data: {},
      },
      {
        id: 'target',
        position: { x: 3990, y: 990 },
        width: 130,
        height: 73,
        measured: { width: 130, height: 73 },
        data: {},
      },
      {
        id: 'upper-blocker',
        position: { x: 4042.6, y: 1223 },
        width: 130,
        height: 60,
        measured: { width: 130, height: 60 },
        data: {},
      },
      {
        id: 'lower-blocker',
        position: { x: 4031.6, y: 1443 },
        width: 152,
        height: 73,
        measured: { width: 152, height: 73 },
        data: {},
      },
    ];
    const edge: Edge = {
      id: 'stacked-blocker-route',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'bottom',
      data: {
        computedPath: [
          { x: 3496, y: 850 },
          { x: 3496, y: 1556 },
          { x: 4055, y: 1556 },
          { x: 4055, y: 1063 },
        ],
      },
    };

    const repaired = repairDisplayObstacleHits(
      [edge],
      nodes,
      'TB',
      DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS,
    );

    expect(countDisplayObstacleHits([edge], nodes)).toBe(2);
    expect(countDisplayObstacleHits(repaired, nodes)).toBe(0);
    expect(createDisplayTerminalValidationSnapshot(nodes).validateEdge(repaired[0]).anchored).toBe(true);
  });
});
