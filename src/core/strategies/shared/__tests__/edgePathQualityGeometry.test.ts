import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildEdgeSegments,
  calculateEdgePairQuality,
  calculateSingleEdgeQuality,
  getEdgePath,
} from '../edgePathQualityGeometry';

const edge = (id: string, source: string, target: string): Edge => ({ id, source, target });

describe('edgePathQualityGeometry', () => {
  it('coerces finite coordinates and rejects malformed path containers', () => {
    const input = {
      ...edge('edge', 'a', 'b'),
      data: {
        computedPath: [
          { x: '10', y: 20 },
          { x: Number.NaN, y: 30 },
          { x: 40, y: Number.POSITIVE_INFINITY },
        ],
      },
    } as unknown as Edge;

    expect(getEdgePath(input)).toEqual([{ x: 10, y: 20 }]);
    expect(getEdgePath({ ...input, data: { computedPath: null } })).toEqual([]);
  });

  it('scores orthogonal path length and bends without non-orthogonal penalties', () => {
    const score = calculateSingleEdgeQuality([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 60 },
    ]);

    expect(score.nonOrthogonalSegments).toBe(0);
    expect(score.bends).toBe(1);
    expect(score.totalLength).toBe(140);
  });

  it('detects one strict crossing between unrelated orthogonal edges', () => {
    const horizontalPath = [{ x: 0, y: 50 }, { x: 100, y: 50 }];
    const verticalPath = [{ x: 50, y: 0 }, { x: 50, y: 100 }];
    const contribution = calculateEdgePairQuality(
      edge('horizontal', 'a', 'b'),
      edge('vertical', 'c', 'd'),
      buildEdgeSegments(horizontalPath, 0),
      buildEdgeSegments(verticalPath, 1),
    );

    expect(contribution.strictCrossings).toBe(1);
    expect(contribution.unrelatedOverlap).toBe(0);
  });
});
