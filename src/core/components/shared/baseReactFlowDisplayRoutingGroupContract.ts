import type { Edge } from '@xyflow/react';

import {
  edgeTerminalHandleChangeIsAllowed,
  readEdgeTerminalPolicy,
} from '../../routing/utils/edgeTerminalPolicy';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  getDisplayComputedPath,
  fullDisplayPortSide,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import { normalizeHandle } from '../../routing/utils/handleUtils';
import type { RoutingTopologyPlan } from './baseReactFlowDisplayRoutingTopologyPlan';

const EPSILON = 0.5;
const MAX_MEMBERS = 6;
const MAX_GROUPS = 4;
const MAX_POINTS = 128;

export type RoutingGroupLaneConstraint = Readonly<{
  groupIndex: number;
  edgeIndex: number;
  role: 'source' | 'target';
  handle: Edge['sourceHandle'];
  axis: 'horizontal' | 'vertical';
  coordinate: number;
}>;

export type RoutingGroupContract = Readonly<{
  memberIndexes: readonly number[];
  groupIndexes: readonly number[];
  lanes: readonly RoutingGroupLaneConstraint[];
}>;

const validPath = (path: readonly DisplayPoint[]): boolean => path.length >= 2
  && path.length <= MAX_POINTS
  && path.every(point => Number.isFinite(point.x) && Number.isFinite(point.y));

/** Authored side, exact position and forbidden policies survive every group proposal. */
export const routingGroupPreservesAuthoredTerminals = (
  baseline: readonly Edge[],
  candidate: readonly Edge[],
): boolean => baseline.length === candidate.length && baseline.every((edge, index) => {
  const next = candidate[index];
  if (!next || next.id !== edge.id || next.source !== edge.source || next.target !== edge.target) return false;
  const beforePath = getDisplayComputedPath(edge);
  const afterPath = getDisplayComputedPath(next);
  return (['source', 'target'] as const).every(role => {
    const handle = role === 'source' ? next.sourceHandle : next.targetHandle;
    if (!edgeTerminalHandleChangeIsAllowed(edge, role, handle, { allowRuntimeHandleChange: true })) return false;
    const policy = readEdgeTerminalPolicy(edge, role);
    if (!policy.positionFixed) return true;
    const before = role === 'source' ? beforePath[0] : beforePath.at(-1);
    const after = role === 'source' ? afterPath[0] : afterPath.at(-1);
    return Boolean(before && after
      && Math.abs(before.x - after.x) <= EPSILON
      && Math.abs(before.y - after.y) <= EPSILON);
  });
});

/** Resolve the complete dual-role connected unit; never truncate its members. */
export const createRoutingGroupContract = (
  plan: RoutingTopologyPlan,
  edges: readonly Edge[],
  primaryIndexes: readonly number[],
): RoutingGroupContract | null => {
  if (plan.edgeCount !== edges.length || edges.length > 256 || primaryIndexes.length === 0
    || plan.groups.length > 20_000
    || primaryIndexes.some(index => !Number.isSafeInteger(index) || !edges[index])) return null;
  const members = new Set(primaryIndexes);
  const selectedGroups = new Set<number>();
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (let index = 0; index < plan.groups.length; index += 1) {
      const group = plan.groups[index];
      if (selectedGroups.has(index) || !group.memberEdgeIndexes.some(member => members.has(member))) continue;
      selectedGroups.add(index);
      group.memberEdgeIndexes.forEach(member => members.add(member));
      if (members.size > MAX_MEMBERS || selectedGroups.size > MAX_GROUPS) return null;
      expanded = true;
    }
  }
  if (selectedGroups.size === 0) return null;
  const lanes: RoutingGroupLaneConstraint[] = [];
  for (const groupIndex of selectedGroups) {
    const group = plan.groups[groupIndex];
    if (group.memberEdgeIndexes.some(index => {
      const member = edges[index];
      if (!member || (group.kind === 'source' ? member.source : member.target) !== group.endpointId) return true;
      const side = fullDisplayPortSide(normalizeHandle(group.kind === 'source' ? member.sourceHandle : member.targetHandle));
      return group.side !== 'unknown' && side !== group.side;
    })) return null;
    const reservation = plan.corridorReservations.reservations.find(item => item.groupIndex === groupIndex);
    if (!reservation || reservation.status !== 'reserved' || reservation.corridorIndex === null) return null;
    const corridor = plan.corridors[reservation.corridorIndex];
    if (!corridor || reservation.memberAssignments.length !== group.memberEdgeIndexes.length) return null;
    const assigned = new Set<number>();
    const assignedLanes = new Set<number>();
    for (const assignment of reservation.memberAssignments) {
      const edge = edges[assignment.edgeIndex];
      if (!edge || assigned.has(assignment.edgeIndex) || assignedLanes.has(assignment.laneIndex)
        || !group.memberEdgeIndexes.includes(assignment.edgeIndex)
        || !Number.isFinite(assignment.laneCenter)
        || assignment.laneCenter <= corridor.start || assignment.laneCenter >= corridor.end
        || corridor.laneCenters[assignment.laneIndex] !== assignment.laneCenter) return null;
      assigned.add(assignment.edgeIndex);
      assignedLanes.add(assignment.laneIndex);
      lanes.push({
        groupIndex, edgeIndex: assignment.edgeIndex, role: group.kind,
        handle: group.kind === 'source' ? edge.sourceHandle : edge.targetHandle,
        axis: corridor.axis, coordinate: assignment.laneCenter,
      });
    }
  }
  return {
    memberIndexes: [...members].sort((left, right) => left - right),
    groupIndexes: [...selectedGroups].sort((left, right) => left - right),
    lanes,
  };
};

const pathOccupiesLane = (path: readonly DisplayPoint[], lane: RoutingGroupLaneConstraint): boolean => (
  path.slice(1).some((point, index) => {
    const previous = path[index];
    return lane.axis === 'horizontal'
      ? Math.abs(point.y - lane.coordinate) <= EPSILON
        && Math.abs(previous.y - lane.coordinate) <= EPSILON && Math.abs(point.x - previous.x) >= 48
      : Math.abs(point.x - lane.coordinate) <= EPSILON
        && Math.abs(previous.x - lane.coordinate) <= EPSILON && Math.abs(point.y - previous.y) >= 48;
  })
);

/** Occupancy is a candidate invariant, not a preferred-axis score. */
export const routingGroupOccupiesReservedLanes = (
  contract: RoutingGroupContract,
  edges: readonly Edge[],
): boolean => contract.lanes.every(lane => {
  const edge = edges[lane.edgeIndex];
  return edge && Object.is(lane.role === 'source' ? edge.sourceHandle : edge.targetHandle, lane.handle)
    && pathOccupiesLane(getDisplayComputedPath(edge), lane);
});

/** Reverse ownership within the same leased blocks as one complete proposal.
 * Edge-index order is not a geometric branch order; both orientations must be
 * judged together, without acquiring additional lanes or splitting dual roles. */
export const routingGroupContractVariants = (contract: RoutingGroupContract): RoutingGroupContract[] => {
  const reversedLanes = contract.lanes.map(lane => {
    const siblings = contract.lanes.filter(item => item.groupIndex === lane.groupIndex);
    const memberIndex = siblings.indexOf(lane);
    const mirrored = siblings[siblings.length - 1 - memberIndex];
    return { ...lane, coordinate: mirrored.coordinate };
  });
  return [contract, { ...contract, lanes: reversedLanes }];
};

const length = (path: readonly DisplayPoint[]): number => path.slice(1).reduce((total, point, index) => (
  total + Math.abs(point.x - path[index].x) + Math.abs(point.y - path[index].y)
), 0);

const moveInteriorLane = (path: DisplayPoint[], lane: RoutingGroupLaneConstraint): DisplayPoint[][] => {
  if (pathOccupiesLane(path, lane)) return [path];
  const result: DisplayPoint[][] = [];
  for (let index = 1; index < path.length - 2; index += 1) {
    const first = path[index];
    const second = path[index + 1];
    if (lane.axis === 'horizontal' ? Math.abs(first.y - second.y) > EPSILON : Math.abs(first.x - second.x) > EPSILON) continue;
    const candidate = path.map(point => ({ ...point }));
    if (lane.axis === 'horizontal') candidate[index].y = candidate[index + 1].y = lane.coordinate;
    else candidate[index].x = candidate[index + 1].x = lane.coordinate;
    result.push(compactOrthogonalPath(candidate));
  }
  return result;
};

/** A bounded, simultaneous lane proposal for every member, including both roles. */
export const buildReservedRoutingGroupCandidates = <T extends Edge[]>(
  edges: T,
  contract: RoutingGroupContract,
): T[] => {
  const alternatives = new Map<number, DisplayPoint[][]>();
  for (const index of contract.memberIndexes) {
    const edge = edges[index];
    const path = edge ? getDisplayComputedPath(edge) : [];
    if (!validPath(path)) return [];
    let candidates = [path];
    const requirements = contract.lanes.filter(lane => lane.edgeIndex === index);
    const resolved: RoutingGroupLaneConstraint[] = [];
    for (const lane of requirements) {
      resolved.push(lane);
      candidates = candidates.flatMap(candidate => moveInteriorLane(candidate, lane))
        .filter(candidate => resolved.every(required => pathOccupiesLane(candidate, required)))
        .sort((first, second) => length(first) - length(second)
          || JSON.stringify(first).localeCompare(JSON.stringify(second))).slice(0, 2);
      if (candidates.length === 0) return [];
    }
    alternatives.set(index, candidates);
  }
  const proposals: T[] = [];
  const seen = new Set<string>();
  for (let variant = 0; variant < 2; variant += 1) {
    const candidate = edges.map((edge, index) => {
      const paths = alternatives.get(index);
      const path = paths?.[variant] ?? paths?.[0];
      return path ? withDisplayComputedPath(edge, path) : edge;
    }) as T;
    const signature = JSON.stringify(contract.memberIndexes.map(index => getDisplayComputedPath(candidate[index])));
    if (!seen.has(signature) && routingGroupOccupiesReservedLanes(contract, candidate)) {
      seen.add(signature);
      proposals.push(candidate);
    }
  }
  return proposals;
};
