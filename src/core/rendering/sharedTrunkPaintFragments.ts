import {
  MIXED_SEMANTIC_SHARED_TRUNK_PAINT,
  readSharedTrunkBackbonePaint,
  sharedTrunkBackbonePaintSignature,
  type SharedTrunkBackbonePaint,
} from './sharedTrunkBackbonePaint';
import {
  normalizeSharedTrunkPaintPoints,
  pointAtSharedTrunkDistance,
  readFiniteSharedTrunkNumber,
  sameSharedTrunkPoint,
  SHARED_TRUNK_LENGTH_TOLERANCE,
  sharedTrunkPathLength,
  sharedTrunkPointDistance,
} from './sharedTrunkPaintGeometry';
import { createSharedTrunkJunctionFragmentsFromPlan } from './sharedTrunkJunctionPaint';
import type {
  SharedTrunkBackboneFragment,
  SharedTrunkHiddenFragment,
  SharedTrunkJunctionFragment,
  SharedTrunkPaintFragment,
  SharedTrunkPaintPlan,
  SharedTrunkPaintPoint,
  SharedTrunkRole,
} from './sharedTrunkPaintTypes';

const extractInterval = (
  points: readonly SharedTrunkPaintPoint[],
  from: number,
  to: number,
): SharedTrunkPaintPoint[] => {
  const extracted = [pointAtSharedTrunkDistance(points, from)];
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    travelled += sharedTrunkPointDistance(points[index - 1], points[index]);
    if (
      travelled > from + SHARED_TRUNK_LENGTH_TOLERANCE
      && travelled < to - SHARED_TRUNK_LENGTH_TOLERANCE
    ) {
      extracted.push({ ...points[index] });
    }
  }
  const end = pointAtSharedTrunkDistance(points, to);
  if (!sameSharedTrunkPoint(extracted[extracted.length - 1], end)) extracted.push(end);
  return extracted;
};

const equalStrings = (first: readonly string[], second: readonly string[]): boolean => (
  first.length === second.length && first.every((value, index) => value === second[index])
);

export const createSharedTrunkBackboneFragments = (
  pointsValue: unknown,
  plan: SharedTrunkPaintPlan | null,
): SharedTrunkBackboneFragment[] => {
  const points = normalizeSharedTrunkPaintPoints(pointsValue);
  if (!points || !plan?.backboneRanges.length) return [];
  const total = sharedTrunkPathLength(points);
  const ranges = plan.backboneRanges.flatMap(range => {
    const paint = readSharedTrunkBackbonePaint(range.paint);
    const from = readFiniteSharedTrunkNumber(range.from);
    const to = readFiniteSharedTrunkNumber(range.to);
    if (!paint || from === undefined || to === undefined) return [];
    const boundedFrom = Math.max(0, Math.min(total, from));
    const boundedTo = Math.max(0, Math.min(total, to));
    return boundedTo > boundedFrom + SHARED_TRUNK_LENGTH_TOLERANCE
      ? [{ ...range, from: boundedFrom, to: boundedTo, paint }]
      : [];
  });
  if (ranges.length === 0) return [];

  const boundaries = [...new Set(ranges.flatMap(range => [range.from, range.to]))]
    .sort((first, second) => first - second);
  const intervals: Array<{
    from: number;
    to: number;
    roles: SharedTrunkRole[];
    membershipIds: string[];
    paint: SharedTrunkBackbonePaint;
  }> = [];

  for (let index = 1; index < boundaries.length; index += 1) {
    const from = boundaries[index - 1];
    const to = boundaries[index];
    if (to <= from + SHARED_TRUNK_LENGTH_TOLERANCE) continue;
    const active = ranges.filter(range => (
      range.from < to - SHARED_TRUNK_LENGTH_TOLERANCE
      && range.to > from + SHARED_TRUNK_LENGTH_TOLERANCE
    ));
    if (active.length === 0) continue;
    const firstPaint = active[0].paint;
    const paint = active.every(range => (
      sharedTrunkBackbonePaintSignature(range.paint) === sharedTrunkBackbonePaintSignature(firstPaint)
    ))
      ? { ...firstPaint }
      : { ...MIXED_SEMANTIC_SHARED_TRUNK_PAINT };
    const roles = [...new Set(active.map(range => range.role))]
      .sort((first, second) => first.localeCompare(second));
    const membershipIds = [...new Set(active.map(range => range.membershipId))].sort();
    const previous = intervals.at(-1);
    if (
      previous
      && Math.abs(previous.to - from) <= SHARED_TRUNK_LENGTH_TOLERANCE
      && sharedTrunkBackbonePaintSignature(previous.paint) === sharedTrunkBackbonePaintSignature(paint)
      && equalStrings(previous.roles, roles)
    ) {
      previous.to = to;
      previous.membershipIds = [...new Set([...previous.membershipIds, ...membershipIds])].sort();
    } else {
      intervals.push({ from, to, roles, membershipIds, paint });
    }
  }

  return intervals.map(interval => ({
    ...interval,
    points: extractInterval(points, interval.from, interval.to),
  }));
};

export const createSharedTrunkJunctionFragments = (
  pointsValue: unknown,
  plan: SharedTrunkPaintPlan | null,
): SharedTrunkJunctionFragment[] => {
  const points = normalizeSharedTrunkPaintPoints(pointsValue);
  if (!points || !plan) return [];
  const total = sharedTrunkPathLength(points);
  return createSharedTrunkJunctionFragmentsFromPlan(
    total,
    plan,
    distance => pointAtSharedTrunkDistance(points, distance),
  );
};

export const createSharedTrunkHiddenFragments = (
  pointsValue: unknown,
  plan: SharedTrunkPaintPlan | null,
): SharedTrunkHiddenFragment[] => {
  const points = normalizeSharedTrunkPaintPoints(pointsValue);
  if (!points || !plan?.hiddenRanges.length) return [];
  const total = sharedTrunkPathLength(points);
  const ranges = plan.hiddenRanges.flatMap(range => {
    const from = readFiniteSharedTrunkNumber(range.from);
    const to = readFiniteSharedTrunkNumber(range.to);
    if (from === undefined || to === undefined) return [];
    const boundedFrom = Math.max(0, Math.min(total, from));
    const boundedTo = Math.max(0, Math.min(total, to));
    return boundedTo > boundedFrom + SHARED_TRUNK_LENGTH_TOLERANCE
      ? [{ ...range, from: boundedFrom, to: boundedTo }]
      : [];
  });
  if (ranges.length === 0) return [];

  const boundaries = [...new Set(ranges.flatMap(range => [range.from, range.to]))]
    .sort((first, second) => first - second);
  const intervals: Array<Omit<SharedTrunkHiddenFragment, 'points'>> = [];
  for (let index = 1; index < boundaries.length; index += 1) {
    const from = boundaries[index - 1];
    const to = boundaries[index];
    if (to <= from + SHARED_TRUNK_LENGTH_TOLERANCE) continue;
    const active = ranges.filter(range => (
      range.from < to - SHARED_TRUNK_LENGTH_TOLERANCE
      && range.to > from + SHARED_TRUNK_LENGTH_TOLERANCE
    ));
    if (active.length === 0) continue;
    const roles = [...new Set(active.map(range => range.role))]
      .sort((first, second) => first.localeCompare(second));
    const ownerEdgeIds = [...new Set(active.map(range => range.ownerEdgeId))].sort();
    const membershipIds = [...new Set(active.flatMap(range => (
      plan.memberships
        .filter(membership => (
          membership.role === range.role && membership.ownerEdgeId === range.ownerEdgeId
        ))
        .map(membership => membership.id)
    )))].sort();
    const previous = intervals.at(-1);
    if (
      previous
      && Math.abs(previous.to - from) <= SHARED_TRUNK_LENGTH_TOLERANCE
      && equalStrings(previous.roles, roles)
      && equalStrings(previous.ownerEdgeIds, ownerEdgeIds)
      && equalStrings(previous.membershipIds, membershipIds)
    ) {
      previous.to = to;
    } else {
      intervals.push({ from, to, roles, ownerEdgeIds, membershipIds });
    }
  }
  return intervals.map(interval => ({
    ...interval,
    points: extractInterval(points, interval.from, interval.to),
  }));
};

export const createSharedTrunkPaintFragments = (
  pointsValue: unknown,
  plan: SharedTrunkPaintPlan | null,
): SharedTrunkPaintFragment[] => {
  const points = normalizeSharedTrunkPaintPoints(pointsValue);
  if (!points) return [];
  const total = sharedTrunkPathLength(points);
  const ranges = (plan?.hiddenRanges ?? [])
    .map(range => ({ from: Math.max(0, range.from), to: Math.min(total, range.to) }))
    .filter(range => range.to - range.from > SHARED_TRUNK_LENGTH_TOLERANCE)
    .sort((first, second) => first.from - second.from || first.to - second.to);

  const merged: Array<{ from: number; to: number }> = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.from <= previous.to + SHARED_TRUNK_LENGTH_TOLERANCE) {
      previous.to = Math.max(previous.to, range.to);
    } else {
      merged.push({ ...range });
    }
  }

  const visible: Array<{ from: number; to: number }> = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.from > cursor + SHARED_TRUNK_LENGTH_TOLERANCE) {
      visible.push({ from: cursor, to: range.from });
    }
    cursor = Math.max(cursor, range.to);
  }
  if (cursor < total - SHARED_TRUNK_LENGTH_TOLERANCE) visible.push({ from: cursor, to: total });

  return visible.map(range => ({
    points: extractInterval(points, range.from, range.to),
    startsAtSource: range.from <= SHARED_TRUNK_LENGTH_TOLERANCE,
    endsAtTarget: range.to >= total - SHARED_TRUNK_LENGTH_TOLERANCE,
  }));
};

export const sharedTrunkPointsToPath = (points: readonly SharedTrunkPaintPoint[]): string => (
  points.length < 2
    ? ''
    : `M ${points[0].x} ${points[0].y} ${points.slice(1).map(point => `L ${point.x} ${point.y}`).join(' ')}`
);
