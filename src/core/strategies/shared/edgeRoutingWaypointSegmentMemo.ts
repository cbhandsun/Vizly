import type { EdgeRoutingSegment } from './edgeRoutingPathGeometry';

const MAX_SEGMENT_MEMO_ENTRIES = 8_192;

const exactSegmentKey = (segment: EdgeRoutingSegment): string | null => {
  const coordinates = [
    segment.a.x,
    segment.a.y,
    segment.b.x,
    segment.b.y,
  ];
  return coordinates.every(Number.isFinite) ? coordinates.join(',') : null;
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
  const values = new Map<string, T>();
  return {
    getOrCreate(segment, create) {
      const key = exactSegmentKey(segment);
      const cached = key === null ? undefined : values.get(key);
      if (cached !== undefined) return { value: cached, cacheHit: true };
      const value = create();
      if (key !== null && values.size < MAX_SEGMENT_MEMO_ENTRIES) values.set(key, value);
      return { value, cacheHit: false };
    },
  };
};
