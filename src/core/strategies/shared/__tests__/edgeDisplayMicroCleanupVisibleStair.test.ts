import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { repairDisplayMicroArtifacts } from '../edgeDisplayMicroCleanup';
import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';

describe('repairDisplayMicroArtifacts visible stairs', () => {
  it('collapses a visible monotonic stair even when every segment is already render-sized', () => {
    const edges: Edge[] = [{
      id: 'edge-visible-stair',
      source: 'left-system',
      target: 'right-system',
      data: {
        computedPath: [
          { x: 112, y: 576 },
          { x: 112, y: 688 },
          { x: 216, y: 688 },
          { x: 216, y: 720 },
          { x: 576, y: 720 },
        ],
      },
    }];
    const baseline = calculateEdgePathQualityScore(edges);

    const repaired = repairDisplayMicroArtifacts(edges);
    const quality = calculateEdgePathQualityScore(repaired);

    expect(quality.nonOrthogonalSegments).toBe(0);
    expect(quality.strictCrossings).toBe(0);
    expect(quality.bends).toBeLessThan(baseline.bends);
    expect(quality.totalLength).toBe(baseline.totalLength);
    expect((repaired[0].data as any).computedPath).toEqual([
      { x: 112, y: 576 },
      { x: 112, y: 720 },
      { x: 576, y: 720 },
    ]);
  });
});
