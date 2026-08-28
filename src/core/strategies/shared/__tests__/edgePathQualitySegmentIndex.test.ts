import { describe, expect, it } from 'vitest';

import { buildEdgeSegments, type Point, type Segment } from '../edgePathQualityGeometry';
import {
  buildQualitySegmentBounds,
  createEdgePathQualitySegmentIndex,
  createReusableEdgePathQualitySegmentIndex,
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

    expect(result.cacheHit).toBe(false);
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
    expect(result.cacheHit).toBe(false);
    expect(result.scannedSegmentCount).toBe(0);
  });

  it('reuses bounded numeric queries across equivalent baseline identities', () => {
    const baseline = [
      segments(0, [{ x: 10_010, y: -20 }, { x: 10_010, y: 120 }]),
      segments(1, [{ x: 9_900, y: 4 }, { x: 10_100, y: 4 }]),
      segments(2, [{ x: 20_000, y: 20_000 }, { x: 20_200, y: 20_000 }]),
    ];
    const candidate = segments(9, [{ x: 9_900, y: 0 }, { x: 10_100, y: 0 }]);

    const first = createReusableEdgePathQualitySegmentIndex(baseline)
      .queryPotentialEdgeIndexes(candidate, new Set([9]));
    const repeated = createReusableEdgePathQualitySegmentIndex(
      baseline.map(edgeSegments => edgeSegments.map(segment => ({
        ...segment,
        a: { ...segment.a },
        b: { ...segment.b },
      }))),
    ).queryPotentialEdgeIndexes(
      candidate.map(segment => ({ ...segment, a: { ...segment.a }, b: { ...segment.b } })),
      new Set([9]),
    );

    expect(first.cacheHit).toBe(false);
    expect(first.scannedSegmentCount).toBeGreaterThan(0);
    expect(repeated.cacheHit).toBe(true);
    expect(repeated.scannedSegmentCount).toBe(0);
    expect([...repeated.edgeIndexes]).toEqual([...first.edgeIndexes]);
  });

  it('returns isolated cache results and applies exclusions after geometry reuse', () => {
    const index = createEdgePathQualitySegmentIndex([
      segments(0, [{ x: 30_010, y: -20 }, { x: 30_010, y: 120 }]),
      segments(1, [{ x: 30_020, y: -20 }, { x: 30_020, y: 120 }]),
    ]);
    const candidate = segments(9, [{ x: 29_900, y: 0 }, { x: 30_100, y: 0 }]);
    const first = index.queryPotentialEdgeIndexes(candidate);
    (first.edgeIndexes as Set<number>).clear();

    const repeated = index.queryPotentialEdgeIndexes(candidate);
    const excluded = index.queryPotentialEdgeIndexes(candidate, new Set([1]));

    expect(repeated.cacheHit).toBe(true);
    expect([...repeated.edgeIndexes]).toEqual([0, 1]);
    expect(excluded.cacheHit).toBe(true);
    expect(excluded.scannedSegmentCount).toBe(0);
    expect([...excluded.edgeIndexes]).toEqual([0]);
    expect([...index.queryPotentialEdgeIndexes(candidate).edgeIndexes]).toEqual([0, 1]);
  });

  it('reuses unchanged segment queries across locally edited paths', () => {
    const index = createEdgePathQualitySegmentIndex([
      segments(0, [{ x: 40_010, y: -20 }, { x: 40_010, y: 120 }]),
      segments(1, [{ x: 40_020, y: 80 }, { x: 40_200, y: 80 }]),
    ]);
    const shared = { x: 40_100, y: 0 };
    const first = segments(9, [
      { x: 39_900, y: 0 },
      shared,
      { x: 40_100, y: 100 },
    ]);
    const locallyEdited = segments(9, [
      { x: 39_900, y: 0 },
      shared,
      { x: 40_100, y: 120 },
    ]);

    const initial = index.queryPotentialEdgeIndexes(first, new Set([9]));
    const partial = index.queryPotentialEdgeIndexes(locallyEdited, new Set([9]));
    const repeated = index.queryPotentialEdgeIndexes(locallyEdited, new Set([9]));
    const reference = createEdgePathQualitySegmentIndex([
      segments(0, [{ x: 40_010, y: -20 }, { x: 40_010, y: 120 }]),
      segments(1, [{ x: 40_020, y: 80 }, { x: 40_200, y: 80 }]),
    ]).queryPotentialEdgeIndexes(locallyEdited, new Set([9]));

    expect(initial.cacheHit).toBe(false);
    expect(partial.cacheHit).toBe(false);
    expect(partial.scannedSegmentCount).toBeLessThan(initial.scannedSegmentCount);
    expect(repeated.cacheHit).toBe(true);
    expect(repeated.scannedSegmentCount).toBe(0);
    expect([...partial.edgeIndexes]).toEqual([...reference.edgeIndexes]);
    expect([...partial.edgeIndexes]).toEqual([...repeated.edgeIndexes]);
  });

  it('reuses canonical geometry across direction and edge identity changes', () => {
    const index = createEdgePathQualitySegmentIndex([
      segments(0, [{ x: 50_000, y: -20 }, { x: 50_000, y: 120 }]),
    ]);
    const forward = segments(8, [{ x: 49_900, y: 0 }, { x: 50_100, y: 0 }]);
    const reversed = segments(9, [{ x: 50_100, y: 0 }, { x: 49_900, y: 0 }]);

    const first = index.queryPotentialEdgeIndexes(forward, new Set([8]));
    const reused = index.queryPotentialEdgeIndexes(reversed, new Set([9]));

    expect(first.cacheHit).toBe(false);
    expect(reused.cacheHit).toBe(true);
    expect(reused.scannedSegmentCount).toBe(0);
    expect([...reused.edgeIndexes]).toEqual([...first.edgeIndexes]);
  });

  it('bypasses caching for extreme query paths without changing results', () => {
    const baseline = [segments(0, [{ x: 60_000, y: -20 }, { x: 60_000, y: 120 }])];
    const segment = segments(9, [{ x: 59_900, y: 0 }, { x: 60_100, y: 0 }])[0];
    const extremePath = Array.from({ length: 32_769 }, () => segment);
    const index = createEdgePathQualitySegmentIndex(baseline);

    const first = index.queryPotentialEdgeIndexes(extremePath, new Set([9]));
    const repeated = index.queryPotentialEdgeIndexes(extremePath, new Set([9]));

    expect(first.cacheHit).toBe(false);
    expect(repeated.cacheHit).toBe(false);
    expect([...repeated.edgeIndexes]).toEqual([...first.edgeIndexes]);
  });

});
