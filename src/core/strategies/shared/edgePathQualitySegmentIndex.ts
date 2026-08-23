import {
  MIN_EDGE_PATH_PENALIZED_OVERLAP,
  type Segment,
} from './edgePathQualityGeometry';
import { BoundedEvaluationLruCache } from './boundedEvaluationLruCache';

export type QualitySegmentBounds = Readonly<{
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}>;

type IndexedSegment = Readonly<{
  edgeIndex: number;
  line: number;
  rangeMax: number;
  rangeMin: number;
}>;

export type EdgePathQualitySegmentQuery = Readonly<{
  cacheHit: boolean;
  edgeIndexes: ReadonlySet<number>;
  scannedSegmentCount: number;
}>;

export type EdgePathQualitySegmentIndex = Readonly<{
  queryPotentialEdgeIndexes: (
    segments: readonly Segment[],
    excludedEdgeIndexes?: ReadonlySet<number>,
  ) => EdgePathQualitySegmentQuery;
}>;

export type ChangedEdgePairQuery = Readonly<{
  cacheHitCount: number;
  pairKeys: ReadonlySet<number>;
  scannedSegmentCount: number;
}>;

const QUALITY_PAIR_BOUNDS_TOLERANCE = 4;
const SEGMENT_QUERY_CACHE_ENTRY_LIMIT = 2_048;
const SEGMENT_QUERY_CACHE_EDGE_SLOT_LIMIT = 65_536;
const REUSABLE_SEGMENT_INDEX_MAX_EDGES = 300;
const REUSABLE_SEGMENT_INDEX_MAX_SEGMENTS = 32_768;

type CachedSegmentQuery = Readonly<{
  edgeIndexes: readonly number[];
}>;

const reusableSegmentIndexCache = new BoundedEvaluationLruCache<EdgePathQualitySegmentIndex>({
  entries: 16,
  edgeSlots: 4_096,
  segmentSlots: REUSABLE_SEGMENT_INDEX_MAX_SEGMENTS,
  pairSlots: 0,
});

const finiteSegment = (segment: Segment): boolean => [
  segment.a.x,
  segment.a.y,
  segment.b.x,
  segment.b.y,
].every(Number.isFinite);

const segmentRange = (segment: Segment): Readonly<{
  line: number;
  rangeMax: number;
  rangeMin: number;
}> => segment.axis === 'h'
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

const lowerBoundLine = (entries: readonly IndexedSegment[], line: number): number => {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (entries[middle].line < line) low = middle + 1;
    else high = middle;
  }
  return low;
};

const upperBoundLine = (entries: readonly IndexedSegment[], line: number): number => {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (entries[middle].line <= line) low = middle + 1;
    else high = middle;
  }
  return low;
};

const rangeOverlap = (
  firstMin: number,
  firstMax: number,
  secondMin: number,
  secondMax: number,
): number => Math.max(0, Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin));

const segmentQuerySignature = (
  segments: readonly Segment[],
  excludedEdgeIndexes: ReadonlySet<number>,
): string | null => {
  if (segments.length > REUSABLE_SEGMENT_INDEX_MAX_SEGMENTS) return null;
  const parts: string[] = [];
  for (const segment of segments) {
    if (!finiteSegment(segment)) return null;
    const range = segmentRange(segment);
    parts.push(`${segment.axis}:${range.line}:${range.rangeMin}:${range.rangeMax}`);
  }
  const excluded = [...excludedEdgeIndexes];
  if (excluded.some(index => !Number.isSafeInteger(index) || index < 0)) return null;
  excluded.sort((first, second) => first - second);
  return `${parts.join(';')}|${excluded.join(',')}`;
};

const reusableSegmentIndexSignature = (
  edgeSegments: readonly (readonly Segment[])[],
): Readonly<{ edgeCount: number; segmentCount: number; signature: string }> | null => {
  if (edgeSegments.length > REUSABLE_SEGMENT_INDEX_MAX_EDGES) return null;
  const parts: string[] = [];
  let segmentCount = 0;
  for (let edgeSlot = 0; edgeSlot < edgeSegments.length; edgeSlot += 1) {
    for (const segment of edgeSegments[edgeSlot]) {
      segmentCount += 1;
      if (segmentCount > REUSABLE_SEGMENT_INDEX_MAX_SEGMENTS || !finiteSegment(segment)) {
        return null;
      }
      const range = segmentRange(segment);
      parts.push(`${edgeSlot}:${segment.edgeIndex}:${segment.axis}:${range.line}:${range.rangeMin}:${range.rangeMax}`);
    }
    parts.push('|');
  }
  return {
    edgeCount: edgeSegments.length,
    segmentCount,
    signature: parts.join(';'),
  };
};

export const buildQualitySegmentBounds = (
  segments: readonly Segment[],
): QualitySegmentBounds | null => {
  if (segments.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const segment of segments) {
    minX = Math.min(minX, segment.a.x, segment.b.x);
    maxX = Math.max(maxX, segment.a.x, segment.b.x);
    minY = Math.min(minY, segment.a.y, segment.b.y);
    maxY = Math.max(maxY, segment.a.y, segment.b.y);
  }
  return [minX, maxX, minY, maxY].every(Number.isFinite)
    ? { minX, maxX, minY, maxY }
    : null;
};

export const qualitySegmentBoundsMayContribute = (
  first: QualitySegmentBounds | null,
  second: QualitySegmentBounds | null,
): boolean => Boolean(
  first
  && second
  && first.maxX + QUALITY_PAIR_BOUNDS_TOLERANCE >= second.minX
  && second.maxX + QUALITY_PAIR_BOUNDS_TOLERANCE >= first.minX
  && first.maxY + QUALITY_PAIR_BOUNDS_TOLERANCE >= second.minY
  && second.maxY + QUALITY_PAIR_BOUNDS_TOLERANCE >= first.minY,
);

/**
 * Builds a Worker-private, geometry-only index. A query can over-select, but
 * never excludes a segment pair that the authoritative pair scorer could count:
 * perpendicular ranges are inclusive and parallel ranges use the scorer's
 * exact 4px lane tolerance and 24px minimum overlap.
 */
export const createEdgePathQualitySegmentIndex = (
  edgeSegments: readonly (readonly Segment[])[],
): EdgePathQualitySegmentIndex => {
  const horizontal: IndexedSegment[] = [];
  const vertical: IndexedSegment[] = [];
  const allEdgeIndexes = new Set<number>();
  for (const segments of edgeSegments) {
    for (const segment of segments) {
      if (!finiteSegment(segment)) continue;
      const range = segmentRange(segment);
      const entry = { edgeIndex: segment.edgeIndex, ...range };
      (segment.axis === 'h' ? horizontal : vertical).push(entry);
      allEdgeIndexes.add(segment.edgeIndex);
    }
  }
  horizontal.sort((first, second) => first.line - second.line);
  vertical.sort((first, second) => first.line - second.line);
  const queryCache = new Map<string, CachedSegmentQuery>();
  let cachedEdgeSlots = 0;

  const rememberQuery = (key: string, edgeIndexes: ReadonlySet<number>): void => {
    const values = [...edgeIndexes];
    const previous = queryCache.get(key);
    if (previous) {
      cachedEdgeSlots -= previous.edgeIndexes.length;
      queryCache.delete(key);
    }
    queryCache.set(key, { edgeIndexes: values });
    cachedEdgeSlots += values.length;
    while (
      queryCache.size > SEGMENT_QUERY_CACHE_ENTRY_LIMIT
      || cachedEdgeSlots > SEGMENT_QUERY_CACHE_EDGE_SLOT_LIMIT
    ) {
      const oldestKey = queryCache.keys().next().value;
      if (typeof oldestKey !== 'string') break;
      const oldest = queryCache.get(oldestKey);
      cachedEdgeSlots -= oldest?.edgeIndexes.length ?? 0;
      queryCache.delete(oldestKey);
    }
  };

  return {
    queryPotentialEdgeIndexes(segments, excludedEdgeIndexes = new Set()) {
      const querySignature = segmentQuerySignature(segments, excludedEdgeIndexes);
      if (querySignature) {
        const cached = queryCache.get(querySignature);
        if (cached) {
          queryCache.delete(querySignature);
          queryCache.set(querySignature, cached);
          return {
            cacheHit: true,
            edgeIndexes: new Set(cached.edgeIndexes),
            scannedSegmentCount: 0,
          };
        }
      }
      const edgeIndexes = new Set<number>();
      let scannedSegmentCount = 0;
      const add = (entry: IndexedSegment): void => {
        if (!excludedEdgeIndexes.has(entry.edgeIndex)) edgeIndexes.add(entry.edgeIndex);
      };

      for (const segment of segments) {
        if (!finiteSegment(segment)) {
          for (const edgeIndex of allEdgeIndexes) {
            if (!excludedEdgeIndexes.has(edgeIndex)) edgeIndexes.add(edgeIndex);
          }
          continue;
        }
        const { line, rangeMin, rangeMax } = segmentRange(segment);
        const parallelEntries = segment.axis === 'h' ? horizontal : vertical;
        const parallelStart = lowerBoundLine(
          parallelEntries,
          line - QUALITY_PAIR_BOUNDS_TOLERANCE,
        );
        const parallelEnd = upperBoundLine(
          parallelEntries,
          line + QUALITY_PAIR_BOUNDS_TOLERANCE,
        );
        for (let index = parallelStart; index < parallelEnd; index += 1) {
          const entry = parallelEntries[index];
          scannedSegmentCount += 1;
          if (
            rangeOverlap(rangeMin, rangeMax, entry.rangeMin, entry.rangeMax)
            >= MIN_EDGE_PATH_PENALIZED_OVERLAP
          ) add(entry);
        }

        const crossingEntries = segment.axis === 'h' ? vertical : horizontal;
        const crossingStart = lowerBoundLine(crossingEntries, rangeMin);
        const crossingEnd = upperBoundLine(crossingEntries, rangeMax);
        for (let index = crossingStart; index < crossingEnd; index += 1) {
          const entry = crossingEntries[index];
          scannedSegmentCount += 1;
          if (line >= entry.rangeMin && line <= entry.rangeMax) add(entry);
        }
      }
      if (querySignature) rememberQuery(querySignature, edgeIndexes);
      return { cacheHit: false, edgeIndexes, scannedSegmentCount };
    },
  };
};

/**
 * Reuses only the numeric, geometry-derived index and its bounded query cache.
 * Edge objects and arbitrary application metadata never enter this cache.
 */
export const createReusableEdgePathQualitySegmentIndex = (
  edgeSegments: readonly (readonly Segment[])[],
): EdgePathQualitySegmentIndex => {
  const snapshot = reusableSegmentIndexSignature(edgeSegments);
  if (!snapshot) return createEdgePathQualitySegmentIndex(edgeSegments);
  const cached = reusableSegmentIndexCache.get(snapshot.signature);
  if (cached) return cached;
  const created = createEdgePathQualitySegmentIndex(edgeSegments);
  reusableSegmentIndexCache.set(snapshot.signature, created, {
    edges: snapshot.edgeCount,
    segments: snapshot.segmentCount,
    pairs: 0,
  });
  return created;
};

export const collectPotentialChangedEdgePairKeys = ({
  additionalPeerIndexes = [],
  changedIndexes,
  edgeCount,
  edgeSegments,
  segmentIndex = createEdgePathQualitySegmentIndex(edgeSegments),
}: Readonly<{
  additionalPeerIndexes?: readonly number[];
  changedIndexes: readonly number[];
  edgeCount: number;
  edgeSegments: readonly (readonly Segment[])[];
  segmentIndex?: EdgePathQualitySegmentIndex;
}>): ChangedEdgePairQuery => {
  const changedSet = new Set([...changedIndexes, ...additionalPeerIndexes]);
  const pairKeys = new Set<number>();
  let cacheHitCount = 0;
  let scannedSegmentCount = 0;
  for (const changedIndex of changedIndexes) {
    const query = segmentIndex.queryPotentialEdgeIndexes(
      edgeSegments[changedIndex] ?? [],
      changedSet,
    );
    if (query.cacheHit) cacheHitCount += 1;
    scannedSegmentCount += query.scannedSegmentCount;
    for (const otherIndex of query.edgeIndexes) {
      const firstIndex = Math.min(changedIndex, otherIndex);
      const secondIndex = Math.max(changedIndex, otherIndex);
      pairKeys.add(firstIndex * edgeCount + secondIndex);
    }
  }
  for (const changedIndex of changedIndexes) {
    for (const peerIndex of additionalPeerIndexes) {
      if (changedIndex === peerIndex) continue;
      const firstIndex = Math.min(changedIndex, peerIndex);
      const secondIndex = Math.max(changedIndex, peerIndex);
      pairKeys.add(firstIndex * edgeCount + secondIndex);
    }
  }
  for (let firstOffset = 0; firstOffset < changedIndexes.length; firstOffset += 1) {
    for (let secondOffset = firstOffset + 1; secondOffset < changedIndexes.length; secondOffset += 1) {
      const firstIndex = Math.min(changedIndexes[firstOffset], changedIndexes[secondOffset]);
      const secondIndex = Math.max(changedIndexes[firstOffset], changedIndexes[secondOffset]);
      pairKeys.add(firstIndex * edgeCount + secondIndex);
    }
  }
  return { cacheHitCount, pairKeys, scannedSegmentCount };
};
