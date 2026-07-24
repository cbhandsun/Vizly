import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { countDisplayObstacleHits } from '../baseReactFlowDisplayEvaluation';
import { buildObstacleSkirtCandidates } from '../baseReactFlowDisplayObstacleCandidates';
import { repairDisplayObstacleHits } from '../baseReactFlowDisplayObstacleRepair';
import { DISPLAY_FINAL_OVERLAP_OBSTACLE_REPAIR_OPTIONS } from '../baseReactFlowDisplayRenderPipeline';

describe('display obstacle candidates', () => {
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
});
