import type {
  EdgeRoutingRect,
  EdgeRoutingSegment,
} from './edgeRoutingPathGeometry';

export type RoutingWaypointVisualRectEntry = Readonly<{
  id: string;
  rect: EdgeRoutingRect;
}>;

export type RoutingWaypointVisualRectQuery = Readonly<{
  entries: readonly RoutingWaypointVisualRectEntry[];
  scannedNodeCount: number;
}>;

export type RoutingWaypointVisualRectIndex = Readonly<{
  queryPotentialEntries: (
    segment: EdgeRoutingSegment,
    padding: number,
  ) => RoutingWaypointVisualRectQuery;
}>;

type IndexedVisualRect = Readonly<{
  entryIndex: number;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}>;

const finiteRect = (rect: EdgeRoutingRect): boolean => [
  rect.x,
  rect.y,
  rect.width,
  rect.height,
].every(Number.isFinite) && rect.width >= 0 && rect.height >= 0;

const finiteSegment = (segment: EdgeRoutingSegment): boolean => [
  segment.a.x,
  segment.a.y,
  segment.b.x,
  segment.b.y,
].every(Number.isFinite);

const lowerBound = (
  entries: readonly IndexedVisualRect[],
  value: number,
  select: (entry: IndexedVisualRect) => number,
): number => {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (select(entries[middle]) < value) low = middle + 1;
    else high = middle;
  }
  return low;
};

const upperBound = (
  entries: readonly IndexedVisualRect[],
  value: number,
  select: (entry: IndexedVisualRect) => number,
): number => {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (select(entries[middle]) <= value) low = middle + 1;
    else high = middle;
  }
  return low;
};

const rectIntersectsBounds = (
  rect: EdgeRoutingRect,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): boolean => (
  rect.x <= maxX
  && rect.x + rect.width >= minX
  && rect.y <= maxY
  && rect.y + rect.height >= minY
);

/**
 * Conservatively indexes immutable node rectangles for waypoint visual scoring.
 * The query only removes rectangles whose bounding boxes cannot contribute;
 * the existing distance and container scorers remain authoritative.
 */
export const createRoutingWaypointVisualRectIndex = (
  entries: readonly RoutingWaypointVisualRectEntry[],
): RoutingWaypointVisualRectIndex => {
  const indexedEntries: IndexedVisualRect[] = [];
  let requiresFullScan = false;

  entries.forEach((entry, entryIndex) => {
    if (!finiteRect(entry.rect)) {
      requiresFullScan = true;
      return;
    }
    indexedEntries.push({
      entryIndex,
      maxX: entry.rect.x + entry.rect.width,
      maxY: entry.rect.y + entry.rect.height,
      minX: entry.rect.x,
      minY: entry.rect.y,
    });
  });
  const byMinX = indexedEntries.slice().sort((first, second) => first.minX - second.minX);
  const byMaxX = indexedEntries.slice().sort((first, second) => first.maxX - second.maxX);
  const byMinY = indexedEntries.slice().sort((first, second) => first.minY - second.minY);
  const byMaxY = indexedEntries.slice().sort((first, second) => first.maxY - second.maxY);

  const fullScan = (): RoutingWaypointVisualRectQuery => ({
    entries,
    scannedNodeCount: entries.length,
  });

  return {
    queryPotentialEntries(segment, padding) {
      if (
        requiresFullScan
        || !finiteSegment(segment)
        || !Number.isFinite(padding)
        || padding < 0
      ) return fullScan();

      const minX = Math.min(segment.a.x, segment.b.x) - padding;
      const maxX = Math.max(segment.a.x, segment.b.x) + padding;
      const minY = Math.min(segment.a.y, segment.b.y) - padding;
      const maxY = Math.max(segment.a.y, segment.b.y) + padding;
      const minXEnd = upperBound(byMinX, maxX, entry => entry.minX);
      const maxXStart = lowerBound(byMaxX, minX, entry => entry.maxX);
      const minYEnd = upperBound(byMinY, maxY, entry => entry.minY);
      const maxYStart = lowerBound(byMaxY, minY, entry => entry.maxY);
      let selected: readonly IndexedVisualRect[] = byMinX;
      let selectedStart = 0;
      let selectedEnd = minXEnd;
      const selectShorter = (
        candidate: readonly IndexedVisualRect[],
        start: number,
        end: number,
      ) => {
        if (end - start >= selectedEnd - selectedStart) return;
        selected = candidate;
        selectedStart = start;
        selectedEnd = end;
      };
      selectShorter(byMaxX, maxXStart, byMaxX.length);
      selectShorter(byMinY, 0, minYEnd);
      selectShorter(byMaxY, maxYStart, byMaxY.length);

      const candidateIndexes: IndexedVisualRect[] = [];
      for (let index = selectedStart; index < selectedEnd; index += 1) {
        const indexed = selected[index];
        if (rectIntersectsBounds(
          entries[indexed.entryIndex].rect,
          minX,
          maxX,
          minY,
          maxY,
        )) candidateIndexes.push(indexed);
      }
      const candidates = candidateIndexes
        .sort((first, second) => first.entryIndex - second.entryIndex)
        .map(indexed => entries[indexed.entryIndex]);
      return {
        entries: candidates,
        scannedNodeCount: candidates.length,
      };
    },
  };
};
