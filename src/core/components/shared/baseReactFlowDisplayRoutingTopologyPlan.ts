import type { Edge, Node } from '@xyflow/react';

import { getDisplayComputedPath, getDisplayNodeRect } from './baseReactFlowDisplayGeometry';
import {
  createDisplayRoutingCorridorReservationPlan,
  type RoutingCorridorReservationPlan,
} from './baseReactFlowDisplayRoutingCorridorReservations';

export type RoutingTerminalSide = 'top' | 'right' | 'bottom' | 'left' | 'unknown';
export type RoutingSector = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'same';
export type RoutingFlowRole = 'main' | 'data' | 'dependency' | 'status' | 'neutral';
export type RoutingTopologyPattern = 'o2m' | 'm2o';
export type RoutingTrunkMode = 'single' | 'dual';

export type RoutingTopologyGroup = Readonly<{
  kind: 'source' | 'target';
  endpointId: string;
  side: RoutingTerminalSide;
  sector: RoutingSector;
  flowRole: RoutingFlowRole;
  topologyPattern: RoutingTopologyPattern;
  trunkMode: RoutingTrunkMode;
  laneDemand: number;
  memberEdgeIndexes: number[];
  dualRoleMemberIndexes: number[];
  endpointCenter: Readonly<{ x: number; y: number }> | null;
}>;

export type RoutingCorridorPlan = Readonly<{
  axis: 'horizontal' | 'vertical';
  start: number;
  end: number;
  center: number;
  capacity: number;
  laneCenters: number[];
}>;

export type RoutingTopologyPlan = Readonly<{
  nodeCount: number;
  edgeCount: number;
  groups: RoutingTopologyGroup[];
  candidateAxes: Readonly<{ x: number[]; y: number[] }>;
  corridors: RoutingCorridorPlan[];
  corridorReservations: RoutingCorridorReservationPlan;
}>;

export type RoutingTopologyWaypointAxes = Readonly<{
  x: readonly number[];
  y: readonly number[];
}>;

/**
 * Projects topology into the narrow waypoint boundary consumed by the routing
 * strategy. Bounded large graphs stay on their frozen baseline until their
 * dedicated candidate/performance budget is proven by the 30-sample gate.
 */
export const createDisplayRoutingTopologyWaypointAxes = (
  plan: RoutingTopologyPlan,
  useBoundedLargeRepair: boolean,
): RoutingTopologyWaypointAxes | undefined => {
  if (useBoundedLargeRepair) return undefined;
  const x = plan.corridors
    .filter(corridor => corridor.axis === 'vertical')
    .map(corridor => corridor.center);
  const y = plan.corridors
    .filter(corridor => corridor.axis === 'horizontal')
    .map(corridor => corridor.center);
  return x.length > 0 || y.length > 0 ? { x, y } : undefined;
};

const readSide = (handle: unknown): RoutingTerminalSide => {
  if (typeof handle !== 'string') return 'unknown';
  const normalized = handle.toLowerCase();
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    if (normalized === side || normalized.includes(side)) return side;
  }
  return 'unknown';
};

const pathSide = (edge: Edge, role: 'source' | 'target'): RoutingTerminalSide => {
  const path = getDisplayComputedPath(edge);
  if (path.length < 2) return 'unknown';
  const first = role === 'source' ? path[0] : path[path.length - 1];
  const second = role === 'source' ? path[1] : path[path.length - 2];
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 1e-6) {
    return (role === 'source' ? dx : -dx) > 0 ? 'right' : 'left';
  }
  if (Math.abs(dy) > 1e-6) return (role === 'source' ? dy : -dy) > 0 ? 'bottom' : 'top';
  return 'unknown';
};

const flowRole = (edge: Edge): RoutingFlowRole => {
  const value = edge.data?.flowRole ?? edge.data?.role;
  return value === 'main' || value === 'data' || value === 'dependency' || value === 'status'
    ? value
    : 'neutral';
};

const nodeCenter = (node: Node | undefined): { x: number; y: number } | null => {
  if (!node || !Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y)) return null;
  const rect = getDisplayNodeRect(node);
  if (!rect) return null;
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
};

const sector = (source: Node | undefined, target: Node | undefined): RoutingSector => {
  const sourceCenter = nodeCenter(source);
  const targetCenter = nodeCenter(target);
  if (!sourceCenter || !targetCenter) return 'same';
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const horizontal = Math.abs(dx) < 1e-6 ? '' : dx > 0 ? 'e' : 'w';
  const vertical = Math.abs(dy) < 1e-6 ? '' : dy > 0 ? 's' : 'n';
  const value = `${vertical}${horizontal}`;
  return value ? value as RoutingSector : 'same';
};

const reverseSector = (value: RoutingSector): RoutingSector => ({
  n: 's',
  ne: 'sw',
  e: 'w',
  se: 'nw',
  s: 'n',
  sw: 'ne',
  w: 'e',
  nw: 'se',
  same: 'same',
})[value] as RoutingSector;

const boundedAxes = (values: Iterable<number>): number[] => [...new Set([...values]
  .filter(value => Number.isFinite(value) && Math.abs(value) <= 1_000_000_000)
  .map(value => Math.round(value * 100) / 100))]
  .sort((left, right) => left - right)
  .slice(0, 20_000);

const createCorridors = (
  intervals: Array<{ start: number; end: number }>,
  axis: RoutingCorridorPlan['axis'],
): RoutingCorridorPlan[] => {
  const sorted = intervals
    .filter(interval => Number.isFinite(interval.start) && Number.isFinite(interval.end))
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of sorted) {
    const current = merged.at(-1);
    if (current && interval.start <= current.end) current.end = Math.max(current.end, interval.end);
    else merged.push({ ...interval });
  }
  const corridors: RoutingCorridorPlan[] = [];
  for (let index = 1; index < merged.length; index += 1) {
    const start = merged[index - 1].end;
    const end = merged[index].start;
    const gap = end - start;
    if (gap < 48) continue;
    const capacity = Math.min(256, Math.max(1, Math.floor((gap - 32) / 16)));
    const laneStep = gap / (capacity + 1);
    corridors.push({
      axis,
      start,
      end,
      center: (start + end) / 2,
      capacity,
      laneCenters: Array.from(
        { length: capacity },
        (_, laneIndex) => start + laneStep * (laneIndex + 1),
      ),
    });
  }
  return corridors;
};

export const createDisplayRoutingTopologyPlan = (
  nodes: readonly Node[],
  edges: readonly Edge[],
): RoutingTopologyPlan => {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const sourceMembership = new Map<number, string>();
  const targetMembership = new Map<number, string>();
  const groupMembers = new Map<string, number[]>();
  const groupMetadata = new Map<string, Omit<
    RoutingTopologyGroup,
    | 'topologyPattern'
    | 'trunkMode'
    | 'laneDemand'
    | 'memberEdgeIndexes'
    | 'dualRoleMemberIndexes'
  >>();
  const xAxes: number[] = [];
  const yAxes: number[] = [];
  edges.slice(0, 10_000).forEach((edge, edgeIndex) => {
    const edgeSector = sector(nodeById.get(edge.source), nodeById.get(edge.target));
    const role = flowRole(edge);
    for (const kind of ['source', 'target'] as const) {
      const endpointId = kind === 'source' ? edge.source : edge.target;
      const explicitSide = readSide(kind === 'source' ? edge.sourceHandle : edge.targetHandle);
      const side = explicitSide === 'unknown' ? pathSide(edge, kind) : explicitSide;
      const endpointSector = kind === 'source' ? edgeSector : reverseSector(edgeSector);
      const key = `${kind}\u001f${endpointId}\u001f${side}\u001f${endpointSector}\u001f${role}`;
      const members = groupMembers.get(key) ?? [];
      members.push(edgeIndex);
      groupMembers.set(key, members);
      groupMetadata.set(key, {
        kind,
        endpointId,
        side,
        sector: endpointSector,
        flowRole: role,
        endpointCenter: nodeCenter(nodeById.get(endpointId)),
      });
      (kind === 'source' ? sourceMembership : targetMembership).set(edgeIndex, key);
    }
    for (const point of getDisplayComputedPath(edge)) {
      xAxes.push(point.x);
      yAxes.push(point.y);
    }
  });
  const nodeRects = nodes.slice(0, 10_000).flatMap(node => {
    if (!Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y)) return [];
    const rect = getDisplayNodeRect(node);
    return rect ? [rect] : [];
  });
  for (const rect of nodeRects) {
    xAxes.push(rect.x, rect.x + rect.width);
    yAxes.push(rect.y, rect.y + rect.height);
  }
  const dualIndexes = new Set<number>();
  for (const edgeIndex of sourceMembership.keys()) {
    const sourceGroup = groupMembers.get(sourceMembership.get(edgeIndex) ?? '');
    const targetGroup = groupMembers.get(targetMembership.get(edgeIndex) ?? '');
    if ((sourceGroup?.length ?? 0) > 1 && (targetGroup?.length ?? 0) > 1) dualIndexes.add(edgeIndex);
  }
  const groups = [...groupMembers.entries()].flatMap<RoutingTopologyGroup>(([
    key,
    memberEdgeIndexes,
  ]) => {
    const metadata = groupMetadata.get(key);
    if (!metadata || memberEdgeIndexes.length <= 1) return [];
    return [{
      ...metadata,
      topologyPattern: metadata.kind === 'source' ? 'o2m' : 'm2o',
      trunkMode: memberEdgeIndexes.some(index => dualIndexes.has(index))
        ? 'dual'
        : 'single',
      laneDemand: memberEdgeIndexes.length,
      memberEdgeIndexes,
      dualRoleMemberIndexes: memberEdgeIndexes.filter(index => dualIndexes.has(index)),
    }];
  });
  const corridors = [
    ...createCorridors(nodeRects.map(rect => ({ start: rect.y, end: rect.y + rect.height })), 'horizontal'),
    ...createCorridors(nodeRects.map(rect => ({ start: rect.x, end: rect.x + rect.width })), 'vertical'),
  ];
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    groups,
    candidateAxes: { x: boundedAxes(xAxes), y: boundedAxes(yAxes) },
    corridors,
    corridorReservations: createDisplayRoutingCorridorReservationPlan(groups, corridors),
  };
};
