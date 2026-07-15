import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { separateDetachedParallelOverlaps } from '../edgeDetachedOverlapRepair';
import { getEdgePath, getRoutingObstacles } from '../edgeDetachedOverlapCandidates';
import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';
import { countRoutingObstacleHits } from '../edgeWaypointCandidateRepair';

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  type: 'process',
  position: { x, y },
  width,
  height,
  measured: { width, height },
  data: {},
});

describe('detached facing-terminal overlap repair', () => {
  it('moves opposed terminal bends together without crossing or entering either endpoint node', () => {
    const edges: Edge[] = [
      {
        id: 'upper-to-right',
        source: 'upper',
        target: 'right-target',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: { computedPath: [
          { x: 916, y: 653 },
          { x: 916, y: 750 },
          { x: 1428, y: 750 },
          { x: 1428, y: 822 },
        ] },
      },
      {
        id: 'lower-to-top',
        source: 'lower',
        target: 'top-target',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        data: { computedPath: [
          { x: 916, y: 812 },
          { x: 916, y: 710 },
          { x: 1227, y: 710 },
          { x: 1227, y: 203 },
        ] },
      },
    ];
    const nodes = [
      node('upper', 826.5, 534, 179, 119),
      node('lower', 820, 812, 192, 118),
    ];
    const before = calculateEdgePathQualityScore(edges);
    expect(before.reverseOverlap).toBe(40);
    expect(before.unrelatedOverlap).toBe(40);

    const repaired = separateDetachedParallelOverlaps(edges, nodes, 16);
    const quality = calculateEdgePathQualityScore(repaired);
    const obstacles = getRoutingObstacles(nodes);

    expect(quality.nonOrthogonalSegments).toBe(0);
    expect(quality.strictCrossings).toBe(0);
    expect(quality.reverseOverlap).toBe(0);
    expect(quality.unrelatedOverlap).toBe(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(repaired.reduce((total, edge) => (
      total + countRoutingObstacleHits(getEdgePath(edge), edge, obstacles)
    ), 0)).toBe(0);
  });
});
