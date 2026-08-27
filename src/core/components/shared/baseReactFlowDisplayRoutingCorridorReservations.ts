import type {
  RoutingCorridorPlan,
  RoutingFlowRole,
  RoutingSector,
  RoutingTerminalSide,
  RoutingTopologyGroup,
} from './baseReactFlowDisplayRoutingTopologyPlan';

export type RoutingCorridorMemberAssignment = Readonly<{
  edgeIndex: number;
  laneIndex: number;
  laneCenter: number;
}>;

export type RoutingCorridorReservation = Readonly<{
  groupIndex: number;
  corridorIndex: number | null;
  status: 'reserved' | 'exhausted';
  laneIndexes: readonly number[];
  memberAssignments: readonly RoutingCorridorMemberAssignment[];
}>;

export type RoutingCorridorReservationPlan = Readonly<{
  reservations: readonly RoutingCorridorReservation[];
  exhaustedGroupIndexes: readonly number[];
}>;

type CorridorEntry = Readonly<{
  corridor: RoutingCorridorPlan;
  corridorIndex: number;
}>;

type CorridorOccupancy = {
  laneIndexes: Set<number>;
  longestFreeRun: number;
};

const MAX_GROUP_COUNT = 20_000;
const MAX_LANE_CAPACITY = 256;
const MAX_CORRIDOR_CANDIDATES_PER_GROUP = 64;

const emptyReservation = (groupIndex: number): RoutingCorridorReservation => ({
  groupIndex,
  corridorIndex: null,
  status: 'exhausted',
  laneIndexes: [],
  memberAssignments: [],
});

const validIndex = (value: number): boolean => (
  Number.isSafeInteger(value) && value >= 0 && value < 10_000
);

const orderedMemberIndexes = (group: RoutingTopologyGroup): number[] | null => {
  if (!Number.isSafeInteger(group.laneDemand)
    || group.laneDemand < 1
    || group.laneDemand > MAX_LANE_CAPACITY
    || group.memberEdgeIndexes.length !== group.laneDemand
    || group.memberEdgeIndexes.some(index => !validIndex(index))) return null;
  const members = [...new Set(group.memberEdgeIndexes)].sort((left, right) => left - right);
  if (members.length !== group.laneDemand) return null;
  if (group.dualRoleMemberIndexes.some(index => !validIndex(index) || !members.includes(index))) {
    return null;
  }
  return members;
};

const validCorridor = (corridor: RoutingCorridorPlan): boolean => (
  Number.isFinite(corridor.start)
  && Number.isFinite(corridor.end)
  && Number.isFinite(corridor.center)
  && corridor.end > corridor.start
  && Number.isSafeInteger(corridor.capacity)
  && corridor.capacity >= 1
  && corridor.capacity <= MAX_LANE_CAPACITY
  && corridor.laneCenters.length === corridor.capacity
  && corridor.laneCenters.every(lane => (
    Number.isFinite(lane) && lane > corridor.start && lane < corridor.end
  ))
);

const flowRolePriority: Readonly<Record<RoutingFlowRole, number>> = {
  main: 0,
  data: 1,
  dependency: 2,
  status: 3,
  neutral: 4,
};

const preferredAxes = (
  side: RoutingTerminalSide,
  sector: RoutingSector,
): readonly RoutingCorridorPlan['axis'][] => {
  if (side === 'left' || side === 'right') return ['vertical'];
  if (side === 'top' || side === 'bottom') return ['horizontal'];
  if (sector === 'e' || sector === 'w') return ['vertical'];
  if (sector === 'n' || sector === 's') return ['horizontal'];
  if (sector === 'ne' || sector === 'sw') return ['horizontal', 'vertical'];
  if (sector === 'nw' || sector === 'se') return ['vertical', 'horizontal'];
  return ['vertical', 'horizontal'];
};

const directionForAxis = (
  group: RoutingTopologyGroup,
  axis: RoutingCorridorPlan['axis'],
): -1 | 0 | 1 => {
  if (axis === 'vertical') {
    if (group.side === 'left') return -1;
    if (group.side === 'right') return 1;
    if (group.sector.endsWith('w')) return -1;
    if (group.sector.endsWith('e')) return 1;
    return 0;
  }
  if (group.side === 'top') return -1;
  if (group.side === 'bottom') return 1;
  if (group.sector.startsWith('n')) return -1;
  if (group.sector.startsWith('s')) return 1;
  return 0;
};

const endpointCoordinate = (
  group: RoutingTopologyGroup,
  axis: RoutingCorridorPlan['axis'],
): number | null => {
  const value = axis === 'vertical'
    ? group.endpointCenter?.x
    : group.endpointCenter?.y;
  return Number.isFinite(value) ? value ?? null : null;
};

const insertionIndex = (entries: readonly CorridorEntry[], coordinate: number): number => {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (entries[middle].corridor.center < coordinate) low = middle + 1;
    else high = middle;
  }
  return low;
};

const nearestEntries = (
  entries: readonly CorridorEntry[],
  coordinate: number | null,
  direction: -1 | 0 | 1,
  limit: number,
): CorridorEntry[] => {
  if (entries.length <= limit && coordinate === null) return [...entries];
  if (coordinate === null) return entries.slice(0, limit);
  const pivot = insertionIndex(entries, coordinate);
  const result: CorridorEntry[] = [];
  const push = (entry: CorridorEntry | undefined): void => {
    if (entry && result.length < limit) result.push(entry);
  };
  if (direction > 0) {
    for (let index = pivot; index < entries.length && result.length < limit; index += 1) {
      push(entries[index]);
    }
    for (let index = pivot - 1; index >= 0 && result.length < limit; index -= 1) {
      push(entries[index]);
    }
    return result;
  }
  if (direction < 0) {
    for (let index = pivot - 1; index >= 0 && result.length < limit; index -= 1) {
      push(entries[index]);
    }
    for (let index = pivot; index < entries.length && result.length < limit; index += 1) {
      push(entries[index]);
    }
    return result;
  }
  let left = pivot - 1;
  let right = pivot;
  while (result.length < limit && (left >= 0 || right < entries.length)) {
    const leftDistance = left >= 0
      ? Math.abs(entries[left].corridor.center - coordinate)
      : Number.POSITIVE_INFINITY;
    const rightDistance = right < entries.length
      ? Math.abs(entries[right].corridor.center - coordinate)
      : Number.POSITIVE_INFINITY;
    if (leftDistance <= rightDistance) {
      push(entries[left]);
      left -= 1;
    } else {
      push(entries[right]);
      right += 1;
    }
  }
  return result;
};

const candidateCorridors = (
  group: RoutingTopologyGroup,
  byAxis: Readonly<Record<RoutingCorridorPlan['axis'], readonly CorridorEntry[]>>,
): CorridorEntry[] => {
  const result: CorridorEntry[] = [];
  for (const axis of preferredAxes(group.side, group.sector)) {
    const remaining = MAX_CORRIDOR_CANDIDATES_PER_GROUP - result.length;
    if (remaining <= 0) break;
    result.push(...nearestEntries(
      byAxis[axis],
      endpointCoordinate(group, axis),
      directionForAxis(group, axis),
      remaining,
    ));
  }
  return result;
};

const findContiguousLaneBlock = (
  corridor: RoutingCorridorPlan,
  occupied: ReadonlySet<number>,
  demand: number,
): number[] | null => {
  if (demand > corridor.capacity) return null;
  const occupiedPrefix = [0];
  const centerPrefix = [0];
  for (let index = 0; index < corridor.capacity; index += 1) {
    occupiedPrefix.push(occupiedPrefix[index] + (occupied.has(index) ? 1 : 0));
    centerPrefix.push(centerPrefix[index] + corridor.laneCenters[index]);
  }
  let best: { start: number; distance: number } | null = null;
  for (let start = 0; start <= corridor.capacity - demand; start += 1) {
    const end = start + demand;
    if (occupiedPrefix[end] - occupiedPrefix[start] > 0) continue;
    const center = (centerPrefix[end] - centerPrefix[start]) / demand;
    const distance = Math.abs(center - corridor.center);
    if (!best || distance < best.distance - 1e-6) best = { start, distance };
  }
  return best
    ? Array.from({ length: demand }, (_, offset) => best.start + offset)
    : null;
};

const longestFreeRun = (
  capacity: number,
  occupied: ReadonlySet<number>,
): number => {
  let current = 0;
  let longest = 0;
  for (let laneIndex = 0; laneIndex < capacity; laneIndex += 1) {
    current = occupied.has(laneIndex) ? 0 : current + 1;
    longest = Math.max(longest, current);
  }
  return longest;
};

const buildAtomicUnits = (groups: readonly RoutingTopologyGroup[]): number[][] => {
  const parent = groups.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };
  const groupIndexesByDualEdge = new Map<number, number[]>();
  groups.forEach((group, groupIndex) => {
    for (const edgeIndex of new Set(group.dualRoleMemberIndexes.filter(validIndex))) {
      const groupIndexes = groupIndexesByDualEdge.get(edgeIndex) ?? [];
      groupIndexes.push(groupIndex);
      groupIndexesByDualEdge.set(edgeIndex, groupIndexes);
    }
  });
  for (const groupIndexes of groupIndexesByDualEdge.values()) {
    const first = groupIndexes[0];
    if (first === undefined) continue;
    groupIndexes.slice(1).forEach(groupIndex => union(first, groupIndex));
  }
  const units = new Map<number, number[]>();
  groups.forEach((_, groupIndex) => {
    const root = find(groupIndex);
    const members = units.get(root) ?? [];
    members.push(groupIndex);
    units.set(root, members);
  });
  return [...units.values()].sort((left, right) => {
    const leftDual = left.length > 1 || left.some(index => groups[index].trunkMode === 'dual');
    const rightDual = right.length > 1 || right.some(index => groups[index].trunkMode === 'dual');
    if (leftDual !== rightDual) return leftDual ? -1 : 1;
    const leftRole = Math.min(...left.map(index => flowRolePriority[groups[index].flowRole]));
    const rightRole = Math.min(...right.map(index => flowRolePriority[groups[index].flowRole]));
    if (leftRole !== rightRole) return leftRole - rightRole;
    const leftDemand = left.reduce((sum, index) => sum + groups[index].laneDemand, 0);
    const rightDemand = right.reduce((sum, index) => sum + groups[index].laneDemand, 0);
    return rightDemand - leftDemand || left[0] - right[0];
  });
};

/**
 * Reserves worker-private candidate lanes without changing edge geometry.
 * Groups connected by a dual-role edge form one transaction: every group
 * receives a contiguous block or all provisional lanes are released.
 */
export const createDisplayRoutingCorridorReservationPlan = (
  groups: readonly RoutingTopologyGroup[],
  corridors: readonly RoutingCorridorPlan[],
): RoutingCorridorReservationPlan => {
  const boundedGroups = groups.slice(0, MAX_GROUP_COUNT);
  const reservations = groups.map((_, groupIndex) => emptyReservation(groupIndex));
  if (boundedGroups.length === 0 || corridors.length === 0) {
    return {
      reservations,
      exhaustedGroupIndexes: reservations.map(reservation => reservation.groupIndex),
    };
  }
  const corridorEntries = corridors.flatMap<CorridorEntry>((corridor, corridorIndex) => (
    validCorridor(corridor) ? [{ corridor, corridorIndex }] : []
  ));
  const byAxis: Record<RoutingCorridorPlan['axis'], CorridorEntry[]> = {
    horizontal: corridorEntries
      .filter(entry => entry.corridor.axis === 'horizontal')
      .sort((left, right) => (
        left.corridor.center - right.corridor.center || left.corridorIndex - right.corridorIndex
      )),
    vertical: corridorEntries
      .filter(entry => entry.corridor.axis === 'vertical')
      .sort((left, right) => (
        left.corridor.center - right.corridor.center || left.corridorIndex - right.corridorIndex
      )),
  };
  const occupied: CorridorOccupancy[] = corridors.map(corridor => ({
    laneIndexes: new Set<number>(),
    longestFreeRun: validCorridor(corridor) ? corridor.capacity : 0,
  }));
  for (const unit of buildAtomicUnits(boundedGroups)) {
    const pending: RoutingCorridorReservation[] = [];
    const allocated = new Map<number, number[]>();
    let failed = false;
    for (const groupIndex of unit) {
      const group = boundedGroups[groupIndex];
      const members = orderedMemberIndexes(group);
      if (!members) {
        failed = true;
        break;
      }
      let reservation: RoutingCorridorReservation | null = null;
      for (const entry of candidateCorridors(group, byAxis)) {
        const corridorOccupancy = occupied[entry.corridorIndex];
        if (corridorOccupancy.longestFreeRun < members.length) continue;
        const laneIndexes = findContiguousLaneBlock(
          entry.corridor,
          corridorOccupancy.laneIndexes,
          members.length,
        );
        if (!laneIndexes) continue;
        laneIndexes.forEach(index => corridorOccupancy.laneIndexes.add(index));
        corridorOccupancy.longestFreeRun = longestFreeRun(
          entry.corridor.capacity,
          corridorOccupancy.laneIndexes,
        );
        allocated.set(entry.corridorIndex, [
          ...(allocated.get(entry.corridorIndex) ?? []),
          ...laneIndexes,
        ]);
        reservation = {
          groupIndex,
          corridorIndex: entry.corridorIndex,
          status: 'reserved',
          laneIndexes,
          memberAssignments: members.map((edgeIndex, memberIndex) => ({
            edgeIndex,
            laneIndex: laneIndexes[memberIndex],
            laneCenter: entry.corridor.laneCenters[laneIndexes[memberIndex]],
          })),
        };
        break;
      }
      if (!reservation) {
        failed = true;
        break;
      }
      pending.push(reservation);
    }
    if (failed) {
      for (const [corridorIndex, laneIndexes] of allocated) {
        const corridorOccupancy = occupied[corridorIndex];
        laneIndexes.forEach(index => corridorOccupancy.laneIndexes.delete(index));
        corridorOccupancy.longestFreeRun = longestFreeRun(
          corridors[corridorIndex].capacity,
          corridorOccupancy.laneIndexes,
        );
      }
      continue;
    }
    pending.forEach(reservation => {
      reservations[reservation.groupIndex] = reservation;
    });
  }
  return {
    reservations,
    exhaustedGroupIndexes: reservations
      .filter(reservation => reservation.status === 'exhausted')
      .map(reservation => reservation.groupIndex),
  };
};
