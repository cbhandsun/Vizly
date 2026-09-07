export type CrossingPoint = Readonly<{ x: number; y: number }>;
export type CrossingSegment = Readonly<{ a: CrossingPoint; b: CrossingPoint }>;

export const LINE_JUMP_RADIUS = 6;
// Vizly's rendering clearance, not an industry-wide pixel standard. This leaves
// room for a 6px bridge and a 16px rounded corner without changing the route.
export const READABLE_CROSSING_CLEARANCE = 24;

/** An ordinary crossing is a readability cost when both paths can show a bridge. */
export const isReadableOrthogonalCrossing = (
  first: CrossingSegment,
  second: CrossingSegment,
): boolean => {
  const points = [first.a, first.b, second.a, second.b];
  if (!points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return false;
  const axis = (segment: CrossingSegment): 'h' | 'v' | null => {
    const dx = Math.abs(segment.a.x - segment.b.x);
    const dy = Math.abs(segment.a.y - segment.b.y);
    if (dy < 0.5 && dx > 0.5) return 'h';
    if (dx < 0.5 && dy > 0.5) return 'v';
    return null;
  };
  const firstAxis = axis(first);
  const secondAxis = axis(second);
  if (!firstAxis || !secondAxis || firstAxis === secondAxis) return false;
  const horizontal = firstAxis === 'h' ? first : second;
  const vertical = firstAxis === 'v' ? first : second;
  const x = vertical.a.x;
  const y = horizontal.a.y;
  return x - Math.min(horizontal.a.x, horizontal.b.x) >= READABLE_CROSSING_CLEARANCE
    && Math.max(horizontal.a.x, horizontal.b.x) - x >= READABLE_CROSSING_CLEARANCE
    && y - Math.min(vertical.a.y, vertical.b.y) >= READABLE_CROSSING_CLEARANCE
    && Math.max(vertical.a.y, vertical.b.y) - y >= READABLE_CROSSING_CLEARANCE;
};
