import {
  edgeRoutingRangeOverlap,
  type EdgeRoutingSegment,
} from './edgeRoutingPathGeometry';

type SegmentAxis = 'h' | 'v';

type IndexedWaypointSegment = Readonly<{
  groupIndex: number;
  line: number;
  rangeMax: number;
  rangeMin: number;
}>;

export type RoutingWaypointSegmentGroupQuery = Readonly<{
  groupIndexes: ReadonlySet<number>;
  scannedSegmentCount: number;
}>;

export type RoutingWaypointSegmentGroupIndex = Readonly<{
  queryPotentialGroupIndexes: (
    segments: readonly EdgeRoutingSegment[],
  ) => RoutingWaypointSegmentGroupQuery;
}>;

const finiteSegment = (segment: EdgeRoutingSegment): boolean => [
  segment.a.x,
  segment.a.y,
  segment.b.x,
  segment.b.y,
].every(Number.isFinite);

const segmentAxis = (segment: EdgeRoutingSegment): SegmentAxis | null => {
  if (Math.abs(segment.a.y - segment.b.y) < 0.5) return 'h';
  if (Math.abs(segment.a.x - segment.b.x) < 0.5) return 'v';
  return null;
};

const segmentRange = (
  segment: EdgeRoutingSegment,
  axis: SegmentAxis,
): Readonly<{ line: number; rangeMax: number; rangeMin: number }> => axis === 'h'
  ? {
      line: segment.a.y,
      rangeMax: Math.max(segment.a.x, segment.b.x),
      rangeMin: Math.min(segment.a.x, segment.b.x),
    }
  : {
      line: segment.a.x,
      rangeMax: Math.max(segment.a.y, segment.b.y),
      rangeMin: Math.min(segment.a.y, segment.b.y),
    };

const lowerBoundLine = (
  entries: readonly IndexedWaypointSegment[],
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
  entries: readonly IndexedWaypointSegment[],
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

/**
 * Indexes immutable waypoint segment groups for one candidate-scoring context.
 * Queries intentionally over-select endpoint touches; the existing authoritative
 * relation scorer still decides exact crossings and overlap lengths.
 */
export const createRoutingWaypointSegmentGroupIndex = (
  segmentGroups: readonly (readonly EdgeRoutingSegment[])[],
): RoutingWaypointSegmentGroupIndex => {
  const horizontal: IndexedWaypointSegment[] = [];
  const vertical: IndexedWaypointSegment[] = [];
  const allGroupIndexes = new Set<number>();
  let hasUnsupportedGeometry = false;

  segmentGroups.forEach((segments, groupIndex) => {
    if (segments.length > 0) allGroupIndexes.add(groupIndex);
    for (const segment of segments) {
      const axis = segmentAxis(segment);
      if (!axis || !finiteSegment(segment)) {
        hasUnsupportedGeometry = true;
        continue;
      }
      const entry = { groupIndex, ...segmentRange(segment, axis) };
      (axis === 'h' ? horizontal : vertical).push(entry);
    }
  });
  horizontal.sort((first, second) => first.line - second.line);
  vertical.sort((first, second) => first.line - second.line);

  return {
    queryPotentialGroupIndexes(segments) {
      if (
        hasUnsupportedGeometry
        || segments.some(segment => !finiteSegment(segment) || !segmentAxis(segment))
      ) {
        return {
          groupIndexes: new Set(allGroupIndexes),
          scannedSegmentCount: horizontal.length + vertical.length,
        };
      }

      const groupIndexes = new Set<number>();
      let scannedSegmentCount = 0;
      for (const segment of segments) {
        const axis = segmentAxis(segment);
        if (!axis) continue;
        const { line, rangeMin, rangeMax } = segmentRange(segment, axis);
        const parallel = axis === 'h' ? horizontal : vertical;
        const parallelStart = lowerBoundLine(parallel, line - 2);
        const parallelEnd = upperBoundLine(parallel, line + 2);
        for (let index = parallelStart; index < parallelEnd; index += 1) {
          const entry = parallel[index];
          scannedSegmentCount += 1;
          if (
            Math.abs(entry.line - line) < 2
            && edgeRoutingRangeOverlap(
              rangeMin,
              rangeMax,
              entry.rangeMin,
              entry.rangeMax,
            ) > 0
          ) groupIndexes.add(entry.groupIndex);
        }

        const crossing = axis === 'h' ? vertical : horizontal;
        const crossingStart = lowerBoundLine(crossing, rangeMin + 1);
        const crossingEnd = upperBoundLine(crossing, rangeMax - 1);
        for (let index = crossingStart; index < crossingEnd; index += 1) {
          const entry = crossing[index];
          scannedSegmentCount += 1;
          if (
            entry.line > rangeMin + 1
            && entry.line < rangeMax - 1
            && line > entry.rangeMin + 1
            && line < entry.rangeMax - 1
          ) groupIndexes.add(entry.groupIndex);
        }
      }
      return { groupIndexes, scannedSegmentCount };
    },
  };
};
