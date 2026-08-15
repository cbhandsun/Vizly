import { readSharedTrunkBackbonePaint } from './sharedTrunkBackbonePaint';
import type {
  SharedTrunkBackboneRange,
  SharedTrunkJunctionPlanEntry,
  SharedTrunkPaintMembership,
  SharedTrunkPaintPlan,
  SharedTrunkPaintRange,
} from './sharedTrunkPaintTypes';

export const SHARED_TRUNK_DATA_KEY = '__vizlySharedTrunkPaint';

const MAX_TRUNK_GROUP_EDGES = 128;
const MAX_PLAN_RANGES = 64;
const MAX_PLAN_MEMBERSHIPS = 256;
const MAX_PLAN_BACKBONE_RANGES = 256;
const MAX_PLAN_JUNCTIONS = 256;
const MAX_EDGE_ID_LENGTH = 256;
const LENGTH_TOLERANCE = 0.01;
const MAX_ABSOLUTE_COORDINATE = 10_000_000;

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const finiteNumber = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

const intervalsCover = (
  from: number,
  to: number,
  ranges: readonly { from: number; to: number }[],
): boolean => {
  let cursor = from;
  const ordered = ranges
    .filter(range => range.to > from + LENGTH_TOLERANCE && range.from < to - LENGTH_TOLERANCE)
    .sort((first, second) => first.from - second.from || first.to - second.to);
  for (const range of ordered) {
    if (range.from > cursor + LENGTH_TOLERANCE) return false;
    cursor = Math.max(cursor, range.to);
    if (cursor >= to - LENGTH_TOLERANCE) return true;
  }
  return cursor >= to - LENGTH_TOLERANCE;
};

export const readSharedTrunkPaintPlan = (data: unknown): SharedTrunkPaintPlan | null => {
  const candidate = asRecord(asRecord(data)[SHARED_TRUNK_DATA_KEY]);
  if (!Array.isArray(candidate.hiddenRanges) || !Array.isArray(candidate.memberships)) return null;
  if (candidate.version !== undefined && candidate.version !== 1) return null;
  const version = candidate.version === 1 ? 1 : 0;
  const edgeId = typeof candidate.edgeId === 'string' ? candidate.edgeId : undefined;
  if (version === 1 && (!edgeId || edgeId.length > MAX_EDGE_ID_LENGTH)) return null;

  const hiddenRanges = candidate.hiddenRanges.slice(0, MAX_PLAN_RANGES).flatMap(value => {
    const range = asRecord(value);
    const from = finiteNumber(range.from);
    const to = finiteNumber(range.to);
    const role = range.role;
    const ownerEdgeId = range.ownerEdgeId;
    return from !== undefined && to !== undefined && to > from
      && from >= 0 && to <= 10_000_000
      && (role === 'source' || role === 'target')
      && typeof ownerEdgeId === 'string'
      && ownerEdgeId.length > 0 && ownerEdgeId.length <= MAX_EDGE_ID_LENGTH
      ? [{ from, to, role, ownerEdgeId } satisfies SharedTrunkPaintRange]
      : [];
  });
  if (
    version === 1
    && (candidate.hiddenRanges.length > MAX_PLAN_RANGES || hiddenRanges.length !== candidate.hiddenRanges.length)
  ) {
    return null;
  }

  const memberships = candidate.memberships.slice(0, MAX_PLAN_MEMBERSHIPS).flatMap(value => {
    const membership = asRecord(value);
    const role = membership.role;
    const id = membership.id;
    const endpointId = membership.endpointId;
    const ownerEdgeId = membership.ownerEdgeId;
    const commonLength = finiteNumber(membership.commonLength);
    const edgeIds = Array.isArray(membership.edgeIds)
      ? membership.edgeIds.filter((candidateId): candidateId is string => (
        typeof candidateId === 'string'
        && candidateId.length > 0
        && candidateId.length <= MAX_EDGE_ID_LENGTH
      )).slice(0, MAX_TRUNK_GROUP_EDGES)
      : [];
    return (role === 'source' || role === 'target')
      && typeof id === 'string' && id.length > 0 && id.length <= MAX_EDGE_ID_LENGTH * 3
      && typeof endpointId === 'string' && endpointId.length > 0 && endpointId.length <= MAX_EDGE_ID_LENGTH
      && typeof ownerEdgeId === 'string' && ownerEdgeId.length > 0 && ownerEdgeId.length <= MAX_EDGE_ID_LENGTH
      && commonLength !== undefined && commonLength >= 0 && commonLength <= 10_000_000
      && edgeIds.length >= 2 && edgeIds.includes(ownerEdgeId)
      ? [{
        id,
        role,
        endpointId,
        ownerEdgeId,
        edgeIds,
        commonLength,
      } satisfies SharedTrunkPaintMembership]
      : [];
  });
  if (
    version === 1
    && (
      candidate.memberships.length > MAX_PLAN_MEMBERSHIPS
      || memberships.length !== candidate.memberships.length
      || new Set(memberships.map(membership => membership.id)).size !== memberships.length
    )
  ) {
    return null;
  }

  const membershipById = new Map(memberships.map(membership => [membership.id, membership]));
  if (candidate.backboneRanges !== undefined && !Array.isArray(candidate.backboneRanges)) return null;
  const rawBackboneRanges = Array.isArray(candidate.backboneRanges) ? candidate.backboneRanges : [];
  if (rawBackboneRanges.length > MAX_PLAN_BACKBONE_RANGES) return null;
  const backboneRanges = rawBackboneRanges.flatMap(value => {
    const range = asRecord(value);
    const from = finiteNumber(range.from);
    const to = finiteNumber(range.to);
    const role = range.role;
    const ownerEdgeId = range.ownerEdgeId;
    const membershipId = range.membershipId;
    const paint = readSharedTrunkBackbonePaint(range.paint);
    const membership = typeof membershipId === 'string' ? membershipById.get(membershipId) : undefined;
    return from !== undefined && to !== undefined && to > from
      && from >= 0 && to <= 10_000_000
      && (role === 'source' || role === 'target')
      && typeof ownerEdgeId === 'string'
      && ownerEdgeId.length > 0 && ownerEdgeId.length <= MAX_EDGE_ID_LENGTH
      && typeof membershipId === 'string'
      && membershipId.length > 0 && membershipId.length <= MAX_EDGE_ID_LENGTH * 3
      && membership?.ownerEdgeId === ownerEdgeId
      && membership?.role === role
      && paint
      ? [{
        from,
        to,
        role,
        ownerEdgeId,
        membershipId,
        paint,
      } satisfies SharedTrunkBackboneRange]
      : [];
  });
  if (backboneRanges.length !== rawBackboneRanges.length) return null;

  if (candidate.junctions !== undefined && !Array.isArray(candidate.junctions)) return null;
  const rawJunctions = Array.isArray(candidate.junctions) ? candidate.junctions : [];
  if (rawJunctions.length > MAX_PLAN_JUNCTIONS) return null;
  const junctions = rawJunctions.flatMap(value => {
    const junction = asRecord(value);
    const point = asRecord(junction.point);
    const x = finiteNumber(point.x);
    const y = finiteNumber(point.y);
    const distance = finiteNumber(junction.distance);
    const role = junction.role;
    const ownerEdgeId = junction.ownerEdgeId;
    const membershipId = junction.membershipId;
    const paint = readSharedTrunkBackbonePaint(junction.paint);
    const membership = typeof membershipId === 'string' ? membershipById.get(membershipId) : undefined;
    return x !== undefined && y !== undefined && distance !== undefined
      && Math.abs(x) <= MAX_ABSOLUTE_COORDINATE && Math.abs(y) <= MAX_ABSOLUTE_COORDINATE
      && distance >= 0 && distance <= MAX_ABSOLUTE_COORDINATE
      && (role === 'source' || role === 'target')
      && typeof ownerEdgeId === 'string'
      && ownerEdgeId.length > 0 && ownerEdgeId.length <= MAX_EDGE_ID_LENGTH
      && typeof membershipId === 'string'
      && membershipId.length > 0 && membershipId.length <= MAX_EDGE_ID_LENGTH * 3
      && membership?.ownerEdgeId === ownerEdgeId
      && membership?.role === role
      && paint
      ? [{
        point: { x, y },
        distance,
        role,
        ownerEdgeId,
        membershipId,
        paint,
      } satisfies SharedTrunkJunctionPlanEntry]
      : [];
  });
  if (junctions.length !== rawJunctions.length) return null;

  if (version === 1 && edgeId) {
    const ownerHiddenRanges = hiddenRanges.filter(range => range.ownerEdgeId === edgeId);
    const isOwnerHiddenCovered = ownerHiddenRanges.every(range => intervalsCover(
      range.from,
      range.to,
      backboneRanges.filter(backbone => (
        backbone.ownerEdgeId === edgeId && backbone.role === range.role
      )),
    ));
    const isBackboneHidden = backboneRanges.every(backbone => intervalsCover(
      backbone.from,
      backbone.to,
      ownerHiddenRanges.filter(range => range.role === backbone.role),
    ));
    const ownsJunctions = junctions.every(junction => junction.ownerEdgeId === edgeId);
    if (!isOwnerHiddenCovered || !isBackboneHidden || !ownsJunctions) return null;
  }

  return {
    version,
    ...(edgeId ? { edgeId } : {}),
    hiddenRanges,
    memberships,
    backboneRanges,
    junctions,
  };
};
