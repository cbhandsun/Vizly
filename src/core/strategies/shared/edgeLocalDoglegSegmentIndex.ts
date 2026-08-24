type IndexedPoint = Readonly<{ x: number; y: number }>;

export type IndexedOrthogonalSegment = Readonly<{
  a: IndexedPoint;
  b: IndexedPoint;
}>;

type CrossingAxisEntry = Readonly<{
  fixed: number;
  minimum: number;
  maximum: number;
}>;

export type OrthogonalSegmentCrossingIndex = Readonly<{
  countCrossings: (
    segments: readonly IndexedOrthogonalSegment[],
    maximumInclusive?: number,
  ) => number | null;
}>;

const STRICT_INTERIOR_INSET = 1;

const firstGreaterThan = (
  entries: readonly CrossingAxisEntry[],
  value: number,
): number => {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (entries[middle].fixed <= value) low = middle + 1;
    else high = middle;
  }
  return low;
};

const firstGreaterThanOrEqual = (
  entries: readonly CrossingAxisEntry[],
  value: number,
): number => {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (entries[middle].fixed < value) low = middle + 1;
    else high = middle;
  }
  return low;
};

const segmentAxis = (
  segment: IndexedOrthogonalSegment,
): 'horizontal' | 'vertical' | null => {
  if (
    !Number.isFinite(segment.a.x)
    || !Number.isFinite(segment.a.y)
    || !Number.isFinite(segment.b.x)
    || !Number.isFinite(segment.b.y)
  ) return null;
  if (
    Math.abs(segment.a.y - segment.b.y) <= 0.5
    && Math.abs(segment.a.x - segment.b.x) > 0.5
  ) return 'horizontal';
  if (
    Math.abs(segment.a.x - segment.b.x) <= 0.5
    && Math.abs(segment.a.y - segment.b.y) > 0.5
  ) return 'vertical';
  return null;
};

const toEntry = (
  segment: IndexedOrthogonalSegment,
  axis: 'horizontal' | 'vertical',
): CrossingAxisEntry => axis === 'horizontal'
  ? {
      fixed: segment.a.y,
      minimum: Math.min(segment.a.x, segment.b.x),
      maximum: Math.max(segment.a.x, segment.b.x),
    }
  : {
      fixed: segment.a.x,
      minimum: Math.min(segment.a.y, segment.b.y),
      maximum: Math.max(segment.a.y, segment.b.y),
    };

/**
 * Builds an immutable strict-crossing index. Returning null is an explicit
 * request for the caller to use its exhaustive parity path.
 */
export const createOrthogonalSegmentCrossingIndex = (
  segments: readonly IndexedOrthogonalSegment[],
): OrthogonalSegmentCrossingIndex | null => {
  const horizontal: CrossingAxisEntry[] = [];
  const vertical: CrossingAxisEntry[] = [];
  for (const segment of segments) {
    const axis = segmentAxis(segment);
    if (!axis) return null;
    (axis === 'horizontal' ? horizontal : vertical).push(toEntry(segment, axis));
  }
  horizontal.sort((left, right) => left.fixed - right.fixed);
  vertical.sort((left, right) => left.fixed - right.fixed);

  return {
    countCrossings: (
      candidateSegments,
      maximumInclusive = Number.POSITIVE_INFINITY,
    ) => {
      let crossings = 0;
      for (const segment of candidateSegments) {
        const axis = segmentAxis(segment);
        if (!axis) return null;
        const candidates = axis === 'horizontal' ? vertical : horizontal;
        const rangeMinimum = axis === 'horizontal'
          ? Math.min(segment.a.x, segment.b.x)
          : Math.min(segment.a.y, segment.b.y);
        const rangeMaximum = axis === 'horizontal'
          ? Math.max(segment.a.x, segment.b.x)
          : Math.max(segment.a.y, segment.b.y);
        const fixed = axis === 'horizontal' ? segment.a.y : segment.a.x;
        const start = firstGreaterThan(
          candidates,
          rangeMinimum + STRICT_INTERIOR_INSET,
        );
        const end = firstGreaterThanOrEqual(
          candidates,
          rangeMaximum - STRICT_INTERIOR_INSET,
        );
        for (let index = start; index < end; index += 1) {
          const candidate = candidates[index];
          if (
            fixed > candidate.minimum + STRICT_INTERIOR_INSET
            && fixed < candidate.maximum - STRICT_INTERIOR_INSET
          ) {
            crossings += 1;
            if (crossings > maximumInclusive) return crossings;
          }
        }
      }
      return crossings;
    },
  };
};
