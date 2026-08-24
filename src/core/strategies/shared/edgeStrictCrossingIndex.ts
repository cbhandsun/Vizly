import { strictlyCrosses, type Segment } from './edgePathQualityGeometry';

type IndexedVerticalSegment = Readonly<{
  line: number;
  segment: Segment;
}>;

export type StrictCrossingIndexDiagnostics = {
  scannedSegmentCount: number;
};

export const createStrictCrossingIndexDiagnostics = (): StrictCrossingIndexDiagnostics => ({
  scannedSegmentCount: 0,
});

const finiteSegment = (segment: Segment): boolean => [
  segment.a.x,
  segment.a.y,
  segment.b.x,
  segment.b.y,
].every(Number.isFinite);

const lowerBoundLine = (
  entries: readonly IndexedVerticalSegment[],
  line: number,
): number => {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (entries[middle].line < line) low = middle + 1;
    else high = middle;
  }
  return low;
};

const upperBoundLine = (
  entries: readonly IndexedVerticalSegment[],
  line: number,
): number => {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (entries[middle].line <= line) low = middle + 1;
    else high = middle;
  }
  return low;
};

const countFullScanStrictCrossings = (segments: readonly Segment[]): number => {
  let total = 0;
  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      if (segments[firstIndex].edgeIndex === segments[secondIndex].edgeIndex) continue;
      if (strictlyCrosses(segments[firstIndex], segments[secondIndex])) total += 1;
    }
  }
  return total;
};

/**
 * Counts the same strict perpendicular intersections as the authoritative full
 * scan. The numeric vertical-line index only narrows candidates; the original
 * `strictlyCrosses` predicate remains the final decision. Non-finite external
 * input fails safely to the full scan.
 */
export const countIndexedStrictSegmentCrossings = (
  segments: readonly Segment[],
  diagnostics?: StrictCrossingIndexDiagnostics,
): number => {
  if (segments.some(segment => !finiteSegment(segment))) {
    if (diagnostics) diagnostics.scannedSegmentCount += segments.length ** 2;
    return countFullScanStrictCrossings(segments);
  }

  const vertical = segments
    .filter(segment => segment.axis === 'v')
    .map(segment => ({ line: segment.a.x, segment }))
    .sort((first, second) => first.line - second.line);
  let total = 0;
  for (const horizontal of segments) {
    if (horizontal.axis !== 'h') continue;
    const minX = Math.min(horizontal.a.x, horizontal.b.x);
    const maxX = Math.max(horizontal.a.x, horizontal.b.x);
    const start = lowerBoundLine(vertical, minX);
    const end = upperBoundLine(vertical, maxX);
    for (let index = start; index < end; index += 1) {
      if (diagnostics) diagnostics.scannedSegmentCount += 1;
      const candidate = vertical[index].segment;
      if (candidate.edgeIndex === horizontal.edgeIndex) continue;
      if (strictlyCrosses(horizontal, candidate)) total += 1;
    }
  }
  return total;
};
