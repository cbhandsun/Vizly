/**
 * Explicit overview can place a viewport below a caller's interaction minimum.
 * Keep the first gesture continuous: outward gestures stay at that boundary,
 * inward gestures approach the configured range without snapping to it.
 */
export const resolveDiagramInteractiveZoom = (
  current: number,
  requested: number,
  minimum: number,
  maximum: number,
): number | null => {
  if (![current, requested, minimum, maximum].every(Number.isFinite)
    || current <= 0 || requested <= 0 || minimum <= 0 || maximum < minimum) return null;
  return Math.max(Math.min(minimum, current), Math.min(Math.max(maximum, current), requested));
};
