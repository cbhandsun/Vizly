import type { EdgeRoutingSegment } from './edgeRoutingPathGeometry';

const MAX_SEGMENT_MEMO_ENTRIES = 8_192;

const exactSegmentKey = (segment: EdgeRoutingSegment): string | null => {
  const { a, b } = segment;
  if (
    !Number.isFinite(a.x)
    || !Number.isFinite(a.y)
    || !Number.isFinite(b.x)
    || !Number.isFinite(b.y)
  ) return null;
  return `${a.x},${a.y},${b.x},${b.y}`;
};

/**
 * Reuses exact segment-local work inside one immutable waypoint scoring
 * context. Invalid geometry is evaluated without caching so malformed input
 * cannot alias a valid entry or contaminate later candidates.
 */
export const createRoutingWaypointSegmentMemo = <T extends object>(): Readonly<{
  getOrCreate: (
    segment: EdgeRoutingSegment,
    create: () => T,
  ) => Readonly<{ value: T; cacheHit: boolean }>;
}> => {
  type CachedOutcome = Readonly<{ value: T; cacheHit: true }>;
  const outcomes = new Map<string, CachedOutcome>();
  return {
    getOrCreate(segment, create) {
      const key = exactSegmentKey(segment);
      const cached = key === null ? undefined : outcomes.get(key);
      if (cached !== undefined) return cached;
      const value = create();
      if (key !== null && outcomes.size < MAX_SEGMENT_MEMO_ENTRIES) {
        outcomes.set(key, { value, cacheHit: true });
      }
      return { value, cacheHit: false };
    },
  };
};
