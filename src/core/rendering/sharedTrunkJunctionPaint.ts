import {
  MIXED_SEMANTIC_SHARED_TRUNK_PAINT,
  readSharedTrunkBackbonePaint,
  sharedTrunkBackbonePaintSignature,
  type SharedTrunkBackbonePaint,
} from './sharedTrunkBackbonePaint';
import type {
  SharedTrunkJunctionFragment,
  SharedTrunkPaintPlan,
  SharedTrunkPaintPoint,
  SharedTrunkRole,
} from './sharedTrunkPaintTypes';

const COORDINATE_TOLERANCE = 0.5;
const LENGTH_TOLERANCE = 0.01;

type ValidatedJunction = {
  point: SharedTrunkPaintPoint;
  distance: number;
  role: SharedTrunkRole;
  membershipId: string;
  paint: SharedTrunkBackbonePaint;
};

const samePoint = (first: SharedTrunkPaintPoint, second: SharedTrunkPaintPoint): boolean => (
  Math.hypot(second.x - first.x, second.y - first.y) <= COORDINATE_TOLERANCE
);

const resolvePaint = (junctions: readonly ValidatedJunction[]): SharedTrunkBackbonePaint => {
  const firstPaint = junctions[0].paint;
  return junctions.every(junction => (
    sharedTrunkBackbonePaintSignature(junction.paint)
    === sharedTrunkBackbonePaintSignature(firstPaint)
  ))
    ? { ...firstPaint }
    : { ...MIXED_SEMANTIC_SHARED_TRUNK_PAINT };
};

const mergeJunctions = (junctions: readonly ValidatedJunction[]): SharedTrunkJunctionFragment[] => {
  const groups: ValidatedJunction[][] = [];
  const ordered = [...junctions].sort((first, second) => (
    first.distance - second.distance
    || first.point.x - second.point.x
    || first.point.y - second.point.y
    || first.membershipId.localeCompare(second.membershipId)
  ));
  for (const junction of ordered) {
    const group = groups.find(candidate => samePoint(candidate[0].point, junction.point));
    if (group) group.push(junction);
    else groups.push([junction]);
  }
  return groups.map(group => ({
    point: { ...group[0].point },
    distance: Math.min(...group.map(junction => junction.distance)),
    roles: [...new Set(group.map(junction => junction.role))]
      .sort((first, second) => first.localeCompare(second)),
    membershipIds: [...new Set(group.map(junction => junction.membershipId))].sort(),
    paint: resolvePaint(group),
  }));
};

/**
 * Builds owner-painted junctions. Version-one plans carry the exact member tap;
 * legacy plans fall back to canonical-range boundaries.
 */
export const createSharedTrunkJunctionFragmentsFromPlan = (
  total: number,
  plan: SharedTrunkPaintPlan | null,
  pointAtDistance: (distance: number) => SharedTrunkPaintPoint,
): SharedTrunkJunctionFragment[] => {
  if (!plan) return [];
  const exactJunctions = (Array.isArray(plan.junctions) ? plan.junctions : []).flatMap(junction => {
    const paint = readSharedTrunkBackbonePaint(junction.paint);
    if (
      !paint
      || junction.distance <= LENGTH_TOLERANCE
      || junction.distance >= total - LENGTH_TOLERANCE
    ) return [];
    return [{ ...junction, paint } satisfies ValidatedJunction];
  });
  if (exactJunctions.length > 0) return mergeJunctions(exactJunctions);

  const ranges = plan.backboneRanges.flatMap(range => {
    const paint = readSharedTrunkBackbonePaint(range.paint);
    const from = Math.max(0, Math.min(total, range.from));
    const to = Math.max(0, Math.min(total, range.to));
    return paint && to > from + LENGTH_TOLERANCE ? [{ ...range, from, to, paint }] : [];
  });
  const boundaries = [...new Set(ranges.flatMap(range => [range.from, range.to]))]
    .filter(value => value > LENGTH_TOLERANCE && value < total - LENGTH_TOLERANCE)
    .sort((first, second) => first - second);
  return boundaries.flatMap(distance => {
    const touching = ranges.filter(range => (
      Math.abs(range.from - distance) <= LENGTH_TOLERANCE
      || Math.abs(range.to - distance) <= LENGTH_TOLERANCE
    ));
    if (touching.length === 0) return [];
    return mergeJunctions(touching.map(range => ({
      point: pointAtDistance(distance),
      distance,
      role: range.role,
      membershipId: range.membershipId,
      paint: range.paint,
    })));
  });
};
