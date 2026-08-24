import { describe, expect, it } from 'vitest';

import {
  countIndexedStrictSegmentCrossings,
  createStrictCrossingIndexDiagnostics,
} from '../edgeStrictCrossingIndex';
import { getSegments, strictlyCrosses } from '../edgePathQualityGeometry';

const countFullScan = (segments: ReturnType<typeof getSegments>): number => {
  let total = 0;
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      if (segments[firstIndex].edgeIndex === segments[secondIndex].edgeIndex) continue;
      if (strictlyCrosses(segments[firstIndex], segments[secondIndex])) total += 1;
    }
  }
  return total;
};

describe('edgeStrictCrossingIndex', () => {
  it('preserves full-scan parity for dense paths and endpoint contacts', () => {
    const paths = [
      ...Array.from({ length: 18 }, (_, index) => [
        { x: -40, y: index * 20 },
        { x: 400, y: index * 20 },
      ]),
      ...Array.from({ length: 18 }, (_, index) => [
        { x: index * 20, y: -40 },
        { x: index * 20, y: 400 },
      ]),
      [{ x: 400, y: 0 }, { x: 400, y: 400 }],
      [{ x: 0, y: 400 }, { x: 400, y: 400 }],
    ];
    const segments = getSegments(paths);
    const diagnostics = createStrictCrossingIndexDiagnostics();

    expect(countIndexedStrictSegmentCrossings(segments, diagnostics))
      .toBe(countFullScan(segments));
    expect(diagnostics.scannedSegmentCount).toBeLessThan(segments.length ** 2);
  });

  it('does not count a self-crossing within one logical edge', () => {
    const segments = getSegments([[
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ]]);

    expect(countIndexedStrictSegmentCrossings(segments)).toBe(0);
  });
});
