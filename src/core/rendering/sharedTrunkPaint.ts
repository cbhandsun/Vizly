/** Render-only ownership and fragmentation for eligible source/target trunks. */
import type { Edge } from '@xyflow/react';
import {
  readSharedTrunkCanonicalOwnerPriority,
  resolveSharedTrunkCanonicalPaint,
} from './sharedTrunkBackbonePaint';
import {
  commonDirectedSharedTrunkLength,
  normalizeSharedTrunkPaintPoints,
  pointAtSharedTrunkDistance,
  SHARED_TRUNK_COORDINATE_TOLERANCE,
  SHARED_TRUNK_LENGTH_TOLERANCE,
  sharedTrunkPathLength,
} from './sharedTrunkPaintGeometry';
import { SHARED_TRUNK_DATA_KEY } from './sharedTrunkPaintPlanParser';
import type {
  SharedTrunkBackboneRange,
  SharedTrunkJunctionPlanEntry,
  SharedTrunkPaintMembership,
  SharedTrunkPaintPlan,
  SharedTrunkPaintPoint,
  SharedTrunkPaintRange,
  SharedTrunkRole,
} from './sharedTrunkPaintTypes';

export { MIXED_SEMANTIC_SHARED_TRUNK_PAINT } from './sharedTrunkBackbonePaint';
export { normalizeSharedTrunkPaintPoints } from './sharedTrunkPaintGeometry';
export {
  createSharedTrunkBackboneFragments,
  createSharedTrunkHiddenFragments,
  createSharedTrunkJunctionFragments,
  createSharedTrunkPaintFragments,
  sharedTrunkPointsToPath,
} from './sharedTrunkPaintFragments';
export { readSharedTrunkPaintPlan } from './sharedTrunkPaintPlanParser';
export type {
  SharedTrunkBackbonePaint,
  SharedTrunkBackbonePaintToken,
} from './sharedTrunkBackbonePaint';
export type {
  SharedTrunkBackboneFragment,
  SharedTrunkBackboneRange,
  SharedTrunkHiddenFragment,
  SharedTrunkJunctionFragment,
  SharedTrunkJunctionPlanEntry,
  SharedTrunkPaintFragment,
  SharedTrunkPaintMembership,
  SharedTrunkPaintPlan,
  SharedTrunkPaintPoint,
  SharedTrunkPaintRange,
  SharedTrunkRole,
} from './sharedTrunkPaintTypes';

type PlannedEdge = {
  edge: Edge;
  points: SharedTrunkPaintPoint[];
  length: number;
};

type MutablePlan = {
  version: 1;
  edgeId: string;
  hiddenRanges: SharedTrunkPaintRange[];
  memberships: SharedTrunkPaintMembership[];
  backboneRanges: SharedTrunkBackboneRange[];
  junctions: SharedTrunkJunctionPlanEntry[];
};

const MAX_TRUNK_GROUP_EDGES = 128;
const MAX_ROUTE_IDENTIFIER_LENGTH = 256;
const COORDINATE_TOLERANCE = SHARED_TRUNK_COORDINATE_TOLERANCE;
const LENGTH_TOLERANCE = SHARED_TRUNK_LENGTH_TOLERANCE;
export const MIN_SHARED_TRUNK_PAINT_LENGTH = 48;

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const validRouteIdentifier = (value: unknown): value is string => (
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ROUTE_IDENTIFIER_LENGTH
);

const commonTrunkLength = (
  first: PlannedEdge,
  second: PlannedEdge,
  role: SharedTrunkRole,
): number => commonDirectedSharedTrunkLength(
  role === 'source' ? first.points : [...first.points].reverse(),
  role === 'source' ? second.points : [...second.points].reverse(),
);

const planFor = (plans: Map<string, MutablePlan>, edgeId: string): MutablePlan => {
  const existing = plans.get(edgeId);
  if (existing) return existing;
  const created: MutablePlan = {
    version: 1,
    edgeId,
    hiddenRanges: [],
    memberships: [],
    backboneRanges: [],
    junctions: [],
  };
  plans.set(edgeId, created);
  return created;
};

const addHiddenRange = (plan: MutablePlan, range: SharedTrunkPaintRange): void => {
  const overlapping = plan.hiddenRanges.filter(existing => (
    existing.role === range.role
    && existing.ownerEdgeId === range.ownerEdgeId
    && existing.from <= range.to + LENGTH_TOLERANCE
    && range.from <= existing.to + LENGTH_TOLERANCE
  ));
  if (overlapping.length === 0) {
    plan.hiddenRanges.push(range);
    return;
  }
  const merged: SharedTrunkPaintRange = {
    from: Math.min(range.from, ...overlapping.map(existing => existing.from)),
    to: Math.max(range.to, ...overlapping.map(existing => existing.to)),
    role: range.role,
    ownerEdgeId: range.ownerEdgeId,
  };
  plan.hiddenRanges = plan.hiddenRanges.filter(existing => !overlapping.includes(existing));
  plan.hiddenRanges.push(merged);
};

const ownerScore = (
  candidate: PlannedEdge,
  group: readonly PlannedEdge[],
  role: SharedTrunkRole,
): { memberCount: number; sharedLength: number } => {
  let memberCount = 0;
  let sharedLength = 0;
  for (const peer of group) {
    if (peer.edge.id === candidate.edge.id) continue;
    const hasDistinctBranch = role === 'source'
      ? peer.edge.target !== candidate.edge.target
      : peer.edge.source !== candidate.edge.source;
    if (!hasDistinctBranch) continue;
    const length = commonTrunkLength(candidate, peer, role);
    if (length + LENGTH_TOLERANCE < MIN_SHARED_TRUNK_PAINT_LENGTH) continue;
    memberCount += 1;
    sharedLength += length;
  }
  return { memberCount, sharedLength };
};

const chooseOwner = (group: readonly PlannedEdge[], role: SharedTrunkRole): PlannedEdge | null => {
  const ranked = group.map(edge => ({
    edge,
    score: ownerScore(edge, group, role),
    paintPriority: readSharedTrunkCanonicalOwnerPriority(edge.edge),
  }));
  ranked.sort((first, second) => (
    second.score.memberCount - first.score.memberCount
    || second.paintPriority.strokeWidth - first.paintPriority.strokeWidth
    || second.paintPriority.solidStroke - first.paintPriority.solidStroke
    || second.paintPriority.opacity - first.paintPriority.opacity
    || second.score.sharedLength - first.score.sharedLength
    || first.edge.edge.id.localeCompare(second.edge.edge.id)
  ));
  return ranked[0]?.score.memberCount ? ranked[0].edge : null;
};

/**
 * One endpoint can legitimately have multiple, oppositely-directed stems.
 * Partition them by actual common geometry so each true stem gets its own
 * canonical backbone without paint semantics affecting cluster membership.
 */
const createCommonStemGroups = (
  group: readonly PlannedEdge[],
  role: SharedTrunkRole,
  hasEligibleCommonStem: (first: PlannedEdge, second: PlannedEdge) => boolean = (first, second) => (
    commonTrunkLength(first, second, role) + LENGTH_TOLERANCE >= MIN_SHARED_TRUNK_PAINT_LENGTH
  ),
): PlannedEdge[][] => {
  const remaining = new Set(group.map((_, index) => index));
  const result: PlannedEdge[][] = [];

  while (remaining.size > 0) {
    const startIndex = remaining.values().next().value as number | undefined;
    if (startIndex === undefined) break;
    remaining.delete(startIndex);
    const componentIndices = [startIndex];

    for (let cursor = 0; cursor < componentIndices.length; cursor += 1) {
      const currentIndex = componentIndices[cursor];
      for (const candidateIndex of [...remaining]) {
        if (!hasEligibleCommonStem(group[currentIndex], group[candidateIndex])) {
          continue;
        }
        remaining.delete(candidateIndex);
        componentIndices.push(candidateIndex);
      }
    }

    if (componentIndices.length >= 2) {
      result.push(componentIndices.map(index => group[index]));
    }
  }

  return result;
};

const applyGroupPlan = (
  group: readonly PlannedEdge[],
  role: SharedTrunkRole,
  endpointId: string,
  plans: Map<string, MutablePlan>,
): PlannedEdge[] => {
  const owner = chooseOwner(group, role);
  if (!owner) return [];

  const members = group.flatMap(edge => {
    if (edge.edge.id === owner.edge.id) return [];
    const hasDistinctBranch = role === 'source'
      ? edge.edge.target !== owner.edge.target
      : edge.edge.source !== owner.edge.source;
    if (!hasDistinctBranch) return [];
    const commonLength = commonTrunkLength(owner, edge, role);
    return commonLength + LENGTH_TOLERANCE >= MIN_SHARED_TRUNK_PAINT_LENGTH
      ? [{ edge, commonLength }]
      : [];
  });
  if (members.length === 0) return [];

  const edgeIds = [owner.edge.id, ...members.map(member => member.edge.edge.id)].sort();
  const commonLength = Math.min(...members.map(member => member.commonLength));
  const membership: SharedTrunkPaintMembership = {
    id: `${role}:${endpointId}:${owner.edge.id}`,
    role,
    endpointId,
    ownerEdgeId: owner.edge.id,
    edgeIds,
    commonLength,
  };
  const ownerPlan = planFor(plans, owner.edge.id);
  const alreadyHiddenOwnerPrefix = hiddenEndpointPrefixLength(owner, role, plans);
  ownerPlan.memberships.push(membership);

  for (const member of members) {
    const from = role === 'source' ? 0 : member.edge.length - member.commonLength;
    const to = role === 'source' ? member.commonLength : member.edge.length;
    const memberPlan = planFor(plans, member.edge.edge.id);
    addHiddenRange(memberPlan, { from, to, role, ownerEdgeId: owner.edge.id });
    memberPlan.memberships.push(membership);
  }

  const commonLengthThresholds = [...new Set(members.map(member => member.commonLength))]
    .filter(length => length > alreadyHiddenOwnerPrefix + LENGTH_TOLERANCE)
    .sort((first, second) => first - second);
  let intervalStart = alreadyHiddenOwnerPrefix;
  for (const intervalEnd of commonLengthThresholds) {
    const activeMembers = members
      .filter(member => member.commonLength + LENGTH_TOLERANCE >= intervalEnd)
      .map(member => member.edge);
    if (activeMembers.length === 0) continue;
    const from = role === 'source' ? intervalStart : owner.length - intervalEnd;
    const to = role === 'source' ? intervalEnd : owner.length - intervalStart;
    const paint = resolveSharedTrunkCanonicalPaint([owner, ...activeMembers].map(edge => edge.edge));
    ownerPlan.backboneRanges.push({
      from,
      to,
      role,
      ownerEdgeId: owner.edge.id,
      membershipId: membership.id,
      paint,
    });
    const branchMember = members
      .filter(member => Math.abs(member.commonLength - intervalEnd) <= LENGTH_TOLERANCE)
      .sort((first, second) => first.edge.edge.id.localeCompare(second.edge.edge.id))[0];
    if (branchMember) {
      const ownerDistance = role === 'source' ? intervalEnd : owner.length - intervalEnd;
      const memberDistance = role === 'source'
        ? branchMember.commonLength
        : branchMember.edge.length - branchMember.commonLength;
      const ownerPoint = pointAtSharedTrunkDistance(owner.points, ownerDistance);
      const memberPoint = pointAtSharedTrunkDistance(branchMember.edge.points, memberDistance);
      const point = Math.abs(memberPoint.y - ownerPoint.y) <= COORDINATE_TOLERANCE
        ? { x: memberPoint.x, y: ownerPoint.y }
        : Math.abs(memberPoint.x - ownerPoint.x) <= COORDINATE_TOLERANCE
          ? { x: ownerPoint.x, y: memberPoint.y }
          : ownerPoint;
      ownerPlan.junctions.push({
        point,
        distance: ownerDistance,
        role,
        ownerEdgeId: owner.edge.id,
        membershipId: membership.id,
        paint,
      });
    }
    intervalStart = intervalEnd;
  }
  if (intervalStart > alreadyHiddenOwnerPrefix + LENGTH_TOLERANCE) {
    const from = role === 'source' ? alreadyHiddenOwnerPrefix : owner.length - intervalStart;
    const to = role === 'source' ? intervalStart : owner.length - alreadyHiddenOwnerPrefix;
    addHiddenRange(ownerPlan, { from, to, role, ownerEdgeId: owner.edge.id });
  }
  return members.map(member => member.edge);
};

const hiddenEndpointPrefixLength = (
  edge: PlannedEdge,
  role: SharedTrunkRole,
  plans: ReadonlyMap<string, MutablePlan>,
): number => {
  const ranges = plans.get(edge.edge.id)?.hiddenRanges ?? [];
  let hiddenLength = 0;
  for (const range of ranges) {
    if (range.role !== role) continue;
    const candidate = role === 'source'
      ? (range.from <= LENGTH_TOLERANCE ? range.to : 0)
      : (range.to >= edge.length - LENGTH_TOLERANCE ? edge.length - range.from : 0);
    hiddenLength = Math.max(hiddenLength, candidate);
  }
  return hiddenLength;
};

/**
 * A branching tree can contain another shared stem after one member exits the
 * canonical root backbone. Re-plan the remaining members against only their
 * still-visible common interval; otherwise that nested stem would become dark
 * again from two coincident strokes.
 */
const applyNestedGroupPlans = (
  group: readonly PlannedEdge[],
  role: SharedTrunkRole,
  endpointId: string,
  plans: Map<string, MutablePlan>,
): void => {
  const remainingMembers = applyGroupPlan(group, role, endpointId, plans);
  if (remainingMembers.length < 2) return;

  const residualGroups = createCommonStemGroups(
    remainingMembers,
    role,
    (first, second) => {
      const alreadyPaintedThrough = Math.max(
        hiddenEndpointPrefixLength(first, role, plans),
        hiddenEndpointPrefixLength(second, role, plans),
      );
      return commonTrunkLength(first, second, role)
        > alreadyPaintedThrough + LENGTH_TOLERANCE;
    },
  );
  for (const residualGroup of residualGroups) {
    applyNestedGroupPlans(residualGroup, role, endpointId, plans);
  }
};

const createPlannedEdges = (edges: readonly Edge[]): PlannedEdge[] => (
  edges.flatMap(edge => {
    const points = normalizeSharedTrunkPaintPoints(asRecord(edge.data).computedPath);
    if (!points) return [];
    const length = sharedTrunkPathLength(points);
    if (!Number.isFinite(length) || length < MIN_SHARED_TRUNK_PAINT_LENGTH) return [];
    return [{ edge, points, length }];
  })
);

const stripSharedTrunkPaintPlan = (edge: Edge): Edge => {
  const data = asRecord(edge.data);
  if (!Object.prototype.hasOwnProperty.call(data, SHARED_TRUNK_DATA_KEY)) return edge;
  const cleanData = { ...data };
  delete cleanData[SHARED_TRUNK_DATA_KEY];
  return { ...edge, data: cleanData };
};

export const applySharedTrunkPaintPlan = (edges: readonly Edge[]): Edge[] => {
  const cleanEdges = edges.map(stripSharedTrunkPaintPlan);
  const hadStalePlan = cleanEdges.some((edge, index) => edge !== edges[index]);
  if (edges.length < 2) return hadStalePlan ? cleanEdges : edges as Edge[];
  const plans = new Map<string, MutablePlan>();
  const idCounts = new Map<string, number>();
  for (const edge of cleanEdges) {
    if (validRouteIdentifier(edge.id)) {
      idCounts.set(edge.id, (idCounts.get(edge.id) ?? 0) + 1);
    }
  }
  const eligibleEdges = cleanEdges.filter(edge => (
    validRouteIdentifier(edge.id)
    && idCounts.get(edge.id) === 1
    && validRouteIdentifier(edge.source)
    && validRouteIdentifier(edge.target)
  ));
  const plannedEdges = createPlannedEdges(eligibleEdges);

  for (const role of ['source', 'target'] as const) {
    const groups = new Map<string, PlannedEdge[]>();
    for (const planned of plannedEdges) {
      const endpointId = role === 'source' ? planned.edge.source : planned.edge.target;
      const group = groups.get(endpointId);
      if (group) group.push(planned);
      else groups.set(endpointId, [planned]);
    }
    for (const group of groups.values()) {
      if (group.length < 2 || group.length > MAX_TRUNK_GROUP_EDGES) continue;
      const endpointId = role === 'source' ? group[0].edge.source : group[0].edge.target;
      for (const commonStemGroup of createCommonStemGroups(group, role)) {
        applyNestedGroupPlans(commonStemGroup, role, endpointId, plans);
      }
    }
  }

  if (plans.size === 0) return hadStalePlan ? cleanEdges : edges as Edge[];
  return cleanEdges.map(edge => {
    const plan = plans.get(edge.id);
    if (!plan) return edge;
    return {
      ...edge,
      data: {
        ...asRecord(edge.data),
        [SHARED_TRUNK_DATA_KEY]: plan satisfies SharedTrunkPaintPlan,
      },
    };
  });
};
