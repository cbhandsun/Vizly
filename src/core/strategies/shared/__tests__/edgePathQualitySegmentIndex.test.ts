import { describe, expect, it } from 'vitest';

import { buildEdgeSegments, type Point, type Segment } from '../edgePathQualityGeometry';
import {
  buildQualitySegmentBounds,
  createEdgePathQualitySegmentIndex,
  qualitySegmentBoundsMayContribute,
} from '../edgePathQualitySegmentIndex';

const segments = (edgeIndex: number, path: Point[]): Segment[] => (
  buildEdgeSegments(path, edgeIndex)
);

describe('edgePathQualitySegmentIndex', () => {
  it('returns only edges with a possible strict crossing or penalized parallel overlap', () => {
    const index = createEdgePathQualitySegmentIndex([
      segments(0, [{ x: 50, y: -100 }, { x: 50, y: 100 }]),
      segments(1, [{ x: 0, y: 3 }, { x: 80, y: 3 }]),
      segments(2, [{ x: 500, y: 500 }, { x: 700, y: 500 }]),
    ]);

    const result = index.queryPotentialEdgeIndexes(
      segments(9, [{ x: 0, y: 0 }, { x: 100, y: 0 }]),
    );

    expect([...result.edgeIndexes].sort((first, second) => first - second)).toEqual([0, 1]);
    expect(result.scannedSegmentCount).toBeGreaterThanOrEqual(2);
  });

  it('includes exact 4px lanes and exact 24px overlaps without admitting shorter overlaps', () => {
    const index = createEdgePathQualitySegmentIndex([
      segments(0, [{ x: 76, y: 4 }, { x: 140, y: 4 }]),
      segments(1, [{ x: 77, y: -4 }, { x: 140, y: -4 }]),
    ]);

    const result = index.queryPotentialEdgeIndexes(
      segments(9, [{ x: 0, y: 0 }, { x: 100, y: 0 }]),
    );

    expect([...result.edgeIndexes]).toEqual([0]);
  });

  it('honors exclusions and fails open to all indexed edges for invalid query geometry', () => {
    const index = createEdgePathQualitySegmentIndex([
      segments(0, [{ x: 10, y: -20 }, { x: 10, y: 20 }]),
      segments(1, [{ x: 20, y: -20 }, { x: 20, y: 20 }]),
    ]);
    const invalid: Segment = {
      a: { x: Number.NaN, y: 0 },
      b: { x: 100, y: 0 },
      axis: 'h',
      direction: 1,
      edgeIndex: 9,
      length: 100,
      segmentCount: 1,
      segmentIndex: 0,
    };

    const result = index.queryPotentialEdgeIndexes([invalid], new Set([1]));

    expect([...result.edgeIndexes]).toEqual([0]);
  });

  it('keeps the coarse bounds proof conservative at the visual lane tolerance', () => {
    const first = buildQualitySegmentBounds(
      segments(0, [{ x: 0, y: 0 }, { x: 100, y: 0 }]),
    );
    const adjacent = buildQualitySegmentBounds(
      segments(1, [{ x: 20, y: 4 }, { x: 80, y: 4 }]),
    );
    const distant = buildQualitySegmentBounds(
      segments(2, [{ x: 20, y: 5 }, { x: 80, y: 5 }]),
    );

    expect(qualitySegmentBoundsMayContribute(first, adjacent)).toBe(true);
    expect(qualitySegmentBoundsMayContribute(first, distant)).toBe(false);
    expect(qualitySegmentBoundsMayContribute(first, null)).toBe(false);
  });

  it('returns an empty result for empty geometry', () => {
    const result = createEdgePathQualitySegmentIndex([]).queryPotentialEdgeIndexes([]);
    expect([...result.edgeIndexes]).toEqual([]);
    expect(result.scannedSegmentCount).toBe(0);
  });

});
