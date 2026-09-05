import { describe, expect, it } from 'vitest';

import { resolveDisplayCrossingClusterSearch, selectDisplayCrossingClusterScope } from '../baseReactFlowDisplayCrossingClusterScope';
import type { DisplayPoint, DisplaySegment } from '../baseReactFlowDisplayGeometry';

const segment = (
  edgeIndex: number,
  axis: 'h' | 'v',
  a: DisplayPoint,
  b: DisplayPoint,
): DisplaySegment => ({ edgeIndex, segmentIndex: 0, axis, direction: 1, a, b });

const h = (edgeIndex: number, y: number, start = 0, end = 10): DisplaySegment => (
  segment(edgeIndex, 'h', { x: start, y }, { x: end, y })
);
const v = (edgeIndex: number, x: number, start = -5, end = 5): DisplaySegment => (
  segment(edgeIndex, 'v', { x, y: start }, { x, y: end })
);

describe('display crossing cluster scope', () => {
  it('uses local participants for larger graphs and refreshes migrated crossings', () => {
    const before = resolveDisplayCrossingClusterSearch([h(0, 0), v(1, 2)], 25);
    const after = resolveDisplayCrossingClusterSearch([h(0, 0), v(1, 20), v(24, 2)], 25);
    expect(before?.hits.map(hit => [hit.a.edgeIndex, hit.b.edgeIndex])).toEqual([[0, 1]]);
    expect(after?.hits.map(hit => [hit.a.edgeIndex, hit.b.edgeIndex])).toEqual([[0, 24]]);
    expect(after?.budget).toEqual(before?.budget);
    expect(resolveDisplayCrossingClusterSearch([], 25)).toBeNull();
    expect(resolveDisplayCrossingClusterSearch([], Number.NaN)).toBeNull();
  });
  it('returns empty for empty, single, and non-crossing segments', () => {
    expect(selectDisplayCrossingClusterScope([], 3)).toEqual([]);
    expect(selectDisplayCrossingClusterScope([h(0, 0)], 3)).toEqual([]);
    expect(selectDisplayCrossingClusterScope([h(0, 0), h(1, 1)], 3)).toEqual([]);
  });

  it('includes every edge in a transitive crossing component', () => {
    const segments = [h(0, 0), v(1, 2), h(2, 3), v(1, 5, -1, 4)];
    expect(selectDisplayCrossingClusterScope(segments, 3)).toEqual([0, 1, 2]);
  });

  it('uses the component of the first crossing and excludes disjoint components', () => {
    expect(selectDisplayCrossingClusterScope([
      h(0, 0), v(1, 2), h(2, 20, 20, 30), v(3, 22, 15, 25),
    ], 4)).toEqual([0, 1]);
  });

  it('ignores same-edge intersections and parallel segments', () => {
    expect(selectDisplayCrossingClusterScope([
      h(0, 0), v(0, 2),
    ], 4)).toEqual([]);
    expect(selectDisplayCrossingClusterScope([
      h(0, 0), h(1, 3), h(2, 4),
    ], 4)).toEqual([]);
  });

  it('returns empty when the component exceeds its limit or the limit is invalid', () => {
    const connected = [h(0, 0), v(1, 2), h(2, 3), v(1, 5, -1, 4)];
    expect(selectDisplayCrossingClusterScope(connected, 2)).toEqual([]);
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(selectDisplayCrossingClusterScope(connected, limit)).toEqual([]);
    }
  });

  it('does not let non-finite geometry create crossings', () => {
    expect(selectDisplayCrossingClusterScope([
      h(0, 0), segment(1, 'v', { x: 2, y: -5 }, { x: 2, y: Number.POSITIVE_INFINITY }),
    ], 3)).toEqual([]);
  });

  it('returns sorted edge indexes after segment-order permutation', () => {
    expect(selectDisplayCrossingClusterScope([
      v(8, 2), h(3, 0), h(9, 3), v(8, 5, -1, 4),
    ], 3)).toEqual([3, 8, 9]);
  });
});
