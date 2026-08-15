import type { LineSegment } from './LineJumpEngine';

type IndexedVerticalSegment = Readonly<{
  order: number;
  segment: LineSegment;
  x: number;
}>;

export type VerticalSegmentIndex = Readonly<{
  byX: readonly IndexedVerticalSegment[];
}>;

const firstGreaterThan = (
    values: readonly IndexedVerticalSegment[],
    threshold: number,
): number => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle].x <= threshold) low = middle + 1;
    else high = middle;
  }
  return low;
};

const firstGreaterThanOrEqual = (
    values: readonly IndexedVerticalSegment[],
    threshold: number,
): number => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle].x < threshold) low = middle + 1;
    else high = middle;
  }
  return low;
};

export const createVerticalSegmentIndex = (
    verticalSegments: readonly LineSegment[],
): VerticalSegmentIndex => ({
  byX: verticalSegments
    .map((segment, order) => ({ order, segment, x: segment.p1.x }))
    .sort((first, second) => first.x - second.x || first.order - second.order),
});

/**
 * Returns only vertical segments whose X coordinate is strictly inside the
 * requested interval. Results are restored to registration order so adopting
 * the index cannot change bridge ownership or SVG output ordering.
 */
export const queryVerticalSegments = (
    index: VerticalSegmentIndex,
    minExclusiveX: number,
    maxExclusiveX: number,
): LineSegment[] => {
  if (!(maxExclusiveX > minExclusiveX) || index.byX.length === 0) return [];
  const start = firstGreaterThan(index.byX, minExclusiveX);
  const end = firstGreaterThanOrEqual(index.byX, maxExclusiveX);
  return index.byX
    .slice(start, end)
    .sort((first, second) => first.order - second.order)
    .map(item => item.segment);
};
