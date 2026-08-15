import type { SharedTrunkPaintPoint } from './sharedTrunkPaintTypes';

const MAX_PATH_POINTS = 512;
export const SHARED_TRUNK_COORDINATE_TOLERANCE = 0.5;
export const SHARED_TRUNK_LENGTH_TOLERANCE = 0.01;

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

export const readFiniteSharedTrunkNumber = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

const finitePoint = (value: unknown): SharedTrunkPaintPoint | undefined => {
  const point = asRecord(value);
  const x = readFiniteSharedTrunkNumber(point.x);
  const y = readFiniteSharedTrunkNumber(point.y);
  return x === undefined || y === undefined ? undefined : { x, y };
};

export const sharedTrunkPointDistance = (
  first: SharedTrunkPaintPoint,
  second: SharedTrunkPaintPoint,
): number => Math.hypot(second.x - first.x, second.y - first.y);

export const sameSharedTrunkPoint = (
  first: SharedTrunkPaintPoint,
  second: SharedTrunkPaintPoint,
): boolean => sharedTrunkPointDistance(first, second) <= SHARED_TRUNK_COORDINATE_TOLERANCE;

const isCollinear = (
  first: SharedTrunkPaintPoint,
  middle: SharedTrunkPaintPoint,
  last: SharedTrunkPaintPoint,
): boolean => {
  const firstHorizontal = Math.abs(first.y - middle.y) <= SHARED_TRUNK_COORDINATE_TOLERANCE;
  const secondHorizontal = Math.abs(middle.y - last.y) <= SHARED_TRUNK_COORDINATE_TOLERANCE;
  const firstVertical = Math.abs(first.x - middle.x) <= SHARED_TRUNK_COORDINATE_TOLERANCE;
  const secondVertical = Math.abs(middle.x - last.x) <= SHARED_TRUNK_COORDINATE_TOLERANCE;
  return (firstHorizontal && secondHorizontal) || (firstVertical && secondVertical);
};

const snapNearOrthogonalPoints = (
  points: readonly SharedTrunkPaintPoint[],
): SharedTrunkPaintPoint[] => {
  const snapped = points.map(point => ({ ...point }));
  const microAxisSnap = 8;
  const minMajorAxisLength = 16;
  const maxMinorAxisRatio = 0.08;
  for (let index = 0; index < snapped.length - 1; index += 1) {
    const first = snapped[index];
    const second = snapped[index + 1];
    const dx = Math.abs(first.x - second.x);
    const dy = Math.abs(first.y - second.y);
    if (dy >= minMajorAxisLength && dx <= microAxisSnap && dx <= dy * maxMinorAxisRatio) {
      second.x = first.x;
    } else if (dx >= minMajorAxisLength && dy <= microAxisSnap && dy <= dx * maxMinorAxisRatio) {
      second.y = first.y;
    }
  }
  return snapped;
};

export const normalizeSharedTrunkPaintPoints = (value: unknown): SharedTrunkPaintPoint[] | null => {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_PATH_POINTS) return null;
  const parsed = value.map(finitePoint);
  if (parsed.some(point => point === undefined)) return null;

  const deduplicated: SharedTrunkPaintPoint[] = [];
  for (const point of snapNearOrthogonalPoints(parsed as SharedTrunkPaintPoint[])) {
    if (!deduplicated.at(-1) || !sameSharedTrunkPoint(deduplicated.at(-1)!, point)) {
      deduplicated.push(point);
    }
  }

  const simplified: SharedTrunkPaintPoint[] = [];
  for (const point of deduplicated) {
    while (
      simplified.length >= 2
      && isCollinear(simplified[simplified.length - 2], simplified[simplified.length - 1], point)
    ) {
      simplified.pop();
    }
    simplified.push(point);
  }
  return simplified.length >= 2 ? simplified : null;
};

export const sharedTrunkPathLength = (points: readonly SharedTrunkPaintPoint[]): number => {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += sharedTrunkPointDistance(points[index - 1], points[index]);
  }
  return total;
};

export const pointAtSharedTrunkDistance = (
  points: readonly SharedTrunkPaintPoint[],
  targetDistance: number,
): SharedTrunkPaintPoint => {
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const first = points[index - 1];
    const second = points[index];
    const segmentLength = sharedTrunkPointDistance(first, second);
    if (travelled + segmentLength + SHARED_TRUNK_LENGTH_TOLERANCE >= targetDistance) {
      const ratio = segmentLength <= SHARED_TRUNK_LENGTH_TOLERANCE
        ? 0
        : Math.max(0, Math.min(1, (targetDistance - travelled) / segmentLength));
      return {
        x: first.x + (second.x - first.x) * ratio,
        y: first.y + (second.y - first.y) * ratio,
      };
    }
    travelled += segmentLength;
  }
  return { ...points[points.length - 1] };
};

const directedSegment = (
  first: SharedTrunkPaintPoint,
  second: SharedTrunkPaintPoint,
): { axis: 'x' | 'y'; sign: -1 | 1; length: number } | null => {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  if (
    Math.abs(dx) <= SHARED_TRUNK_COORDINATE_TOLERANCE
    && Math.abs(dy) > SHARED_TRUNK_COORDINATE_TOLERANCE
  ) {
    return { axis: 'y', sign: dy < 0 ? -1 : 1, length: Math.abs(dy) };
  }
  if (
    Math.abs(dy) <= SHARED_TRUNK_COORDINATE_TOLERANCE
    && Math.abs(dx) > SHARED_TRUNK_COORDINATE_TOLERANCE
  ) {
    return { axis: 'x', sign: dx < 0 ? -1 : 1, length: Math.abs(dx) };
  }
  return null;
};

const moveAlong = (
  point: SharedTrunkPaintPoint,
  segment: { axis: 'x' | 'y'; sign: -1 | 1 },
  amount: number,
): SharedTrunkPaintPoint => (
  segment.axis === 'x'
    ? { x: point.x + segment.sign * amount, y: point.y }
    : { x: point.x, y: point.y + segment.sign * amount }
);

export const commonDirectedSharedTrunkLength = (
  firstPath: readonly SharedTrunkPaintPoint[],
  secondPath: readonly SharedTrunkPaintPoint[],
): number => {
  if (!sameSharedTrunkPoint(firstPath[0], secondPath[0])) return 0;
  let firstIndex = 0;
  let secondIndex = 0;
  let firstPoint = firstPath[0];
  let secondPoint = secondPath[0];
  let shared = 0;

  while (firstIndex < firstPath.length - 1 && secondIndex < secondPath.length - 1) {
    if (!sameSharedTrunkPoint(firstPoint, secondPoint)) break;
    const firstSegment = directedSegment(firstPoint, firstPath[firstIndex + 1]);
    const secondSegment = directedSegment(secondPoint, secondPath[secondIndex + 1]);
    if (!firstSegment || !secondSegment) break;
    if (firstSegment.axis !== secondSegment.axis || firstSegment.sign !== secondSegment.sign) break;

    const amount = Math.min(firstSegment.length, secondSegment.length);
    shared += amount;
    firstPoint = moveAlong(firstPoint, firstSegment, amount);
    secondPoint = moveAlong(secondPoint, secondSegment, amount);

    if (Math.abs(amount - firstSegment.length) <= SHARED_TRUNK_LENGTH_TOLERANCE) firstIndex += 1;
    if (Math.abs(amount - secondSegment.length) <= SHARED_TRUNK_LENGTH_TOLERANCE) secondIndex += 1;
  }
  return shared;
};
