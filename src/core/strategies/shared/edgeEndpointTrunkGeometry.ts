type Point = Readonly<{ x: number; y: number }>;
type Stem = Readonly<{ terminal: Point; stub: Point; side: 'top' | 'bottom' | 'left' | 'right' }>;

const normal = (point: Point, side: Stem['side']): number => (
  side === 'top' || side === 'bottom' ? point.y : point.x
);
const tangent = (point: Point, side: Stem['side']): number => (
  side === 'top' || side === 'bottom' ? point.x : point.y
);

/** Directed distance from a common origin, for ordering nested stem ends. */
export const endpointStemExtent = (stem: Stem): number => (
  (stem.side === 'top' || stem.side === 'left' ? -1 : 1) * normal(stem.stub, stem.side)
);

export const commonEndpointStemLength = (stems: readonly Stem[]): number => {
  if (stems.length === 0) return 0;
  const intervals = stems.map(stem => {
    const start = normal(stem.terminal, stem.side);
    const end = normal(stem.stub, stem.side);
    return { min: Math.min(start, end), max: Math.max(start, end) };
  });
  return Math.max(0, Math.min(...intervals.map(i => i.max)) - Math.max(...intervals.map(i => i.min)));
};

/**
 * Independently rounded anchors can differ by one pixel along the same stem.
 * Their overlapping interval is the trunk; tangentially separated lanes are
 * still distinct. Terminal attachment is checked by the separate node gate.
 */
export const endpointStemsShareAnchor = (first: Stem, second: Stem): boolean => (
  first.side === second.side
  && Math.abs(tangent(first.terminal, first.side) - tangent(second.terminal, second.side)) <= 0.5
  && Math.abs(normal(first.terminal, first.side) - normal(second.terminal, second.side)) <= 1
);
