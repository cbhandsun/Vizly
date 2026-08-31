import type { DisplayPoint, DisplaySegment } from './baseReactFlowDisplayGeometry';

type Span = Readonly<{ fixed: number; min: number; max: number }>;
export type DisplayStrictCrossingCounterMetrics = { candidateVisitCount: number };
const EPS = 0.5;

const firstAbove = (spans: readonly Span[], value: number): number => {
  let low = 0;
  let high = spans.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (spans[middle].fixed <= value) low = middle + 1;
    else high = middle;
  }
  return low;
};

/**
 * Snapshot a caller-filtered set of blockers for a candidate search. Like the
 * standalone display scorer, this counts every supplied segment, including
 * related/self segments; filtering remains the caller's responsibility.
 * No route or user metadata is retained and no mutable input reference is cached.
 */
export const createDisplayStrictCrossingCounter = (
  blockers: readonly DisplaySegment[],
  metrics?: DisplayStrictCrossingCounterMetrics,
): ((path: readonly DisplayPoint[]) => number) => {
  const horizontal: Span[] = [];
  const vertical: Span[] = [];
  for (const segment of blockers) {
    const span = segment.axis === 'h'
      ? { fixed: segment.a.y, min: Math.min(segment.a.x, segment.b.x), max: Math.max(segment.a.x, segment.b.x) }
      : { fixed: segment.a.x, min: Math.min(segment.a.y, segment.b.y), max: Math.max(segment.a.y, segment.b.y) };
    // NaN can never satisfy the original strict comparisons, and must not
    // poison the sorted coordinate index. Infinite bounds retain old semantics.
    if ([span.fixed, span.min, span.max].some(Number.isNaN)) continue;
    (segment.axis === 'h' ? horizontal : vertical).push(span);
  }
  horizontal.sort((a, b) => a.fixed - b.fixed);
  vertical.sort((a, b) => a.fixed - b.fixed);

  return path => {
    let crossings = 0;
    for (let index = 0; index < path.length - 1; index += 1) {
      const a = path[index];
      const b = path[index + 1];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const isHorizontal = dy <= EPS && dx > EPS;
      if (!isHorizontal && !(dx <= EPS && dy > EPS)) continue;
      const spans = isHorizontal ? vertical : horizontal;
      const fixed = isHorizontal ? a.y : a.x;
      const min = (isHorizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y)) + EPS;
      const max = (isHorizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y)) - EPS;
      for (let cursor = firstAbove(spans, min); cursor < spans.length && spans[cursor].fixed < max; cursor += 1) {
        if (metrics) metrics.candidateVisitCount += 1;
        const other = spans[cursor];
        if (fixed > other.min + EPS && fixed < other.max - EPS) crossings += 1;
      }
    }
    return crossings;
  };
};
