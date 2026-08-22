import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import { readEdgeTerminalPolicy } from '../../routing/utils/edgeTerminalPolicy';
import {
  EPS,
  axisOf,
  nodeRect,
  terminalSide,
  type Axis,
  type Point,
  type Rect,
  type Role,
  type Side,
} from './edgeSharedEndpointPortOrderGeometry';

const MAX_PATH_POINTS = 4_096;
const MAX_ABS_COORDINATE = 1_000_000_000;
const MIN_TRUE_TRUNK_STEM = 48;
const NEAR_TRUNK_TOLERANCE = 1;
const MIN_PARALLEL_CHILD_OVERLAP = 24;
const MIN_OPPOSITE_CHILD_OVERLAP = 8;

export type Leg = {
  edgeIndex: number;
  edgeId: string;
  nodeId: string;
  role: Role;
  side: Side;
  path: Point[];
  terminal: Point;
  stub: Point;
  branchEnd: Point | null;
  terminalCoordinate: number;
  terminalNormal: number;
  branchLane: number | null;
  branchDirection: -1 | 0 | 1;
  outwardDirection: -1 | 1;
  remoteCoordinate: number;
  movable: boolean;
};

export type LegBlock = {
  legs: Leg[];
  terminalCoordinate: number;
  remoteMinimum: number;
  remoteMaximum: number;
  movable: boolean;
};

export type LegGroup = {
  key: string;
  nodeId: string;
  role: Role;
  side: Side;
  rect: Rect;
  blocks: LegBlock[];
};

export type SameSidePassageGroupAudit = Readonly<{
  key: string;
  nodeId: string;
  role: Role;
  side: Side;
  blockCount: number;
  portOrderInversions: number;
  reversePassageDefects: number;
  parallelChildOverlaps: number;
  oppositeChildOverlaps: number;
  nearTrunkOpportunities: number;
}>;

export type SameSidePassageAudit = Readonly<{
  groups: readonly SameSidePassageGroupAudit[];
  portOrderInversions: number;
  reversePassageDefects: number;
  parallelChildOverlaps: number;
  oppositeChildOverlaps: number;
  passageDefects: number;
  nearTrunkOpportunities: number;
  invalidLegCount: number;
}>;

export const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const boundedNumber = (value: unknown): value is number => (
  typeof value === 'number'
  && Number.isFinite(value)
  && Math.abs(value) <= MAX_ABS_COORDINATE
);

function readPath(edge: Edge): Point[] | null {
  const raw = asRecord(edge.data).computedPath;
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_PATH_POINTS) return null;
  const result: Point[] = [];
  for (const item of raw) {
    const point = asRecord(item);
    if (!boundedNumber(point.x) || !boundedNumber(point.y)) return null;
    result.push({ x: point.x, y: point.y });
  }
  return result;
}

export function orientedPath(path: readonly Point[], role: Role): Point[] {
  const points = path.map(point => ({ ...point }));
  return role === 'source' ? points : points.reverse();
}

function tangential(point: Point, side: Side): number {
  return side === 'top' || side === 'bottom' ? point.x : point.y;
}

function normal(point: Point, side: Side): number {
  return side === 'top' || side === 'bottom' ? point.y : point.x;
}

function expectedNormalAxis(side: Side): Axis {
  return side === 'top' || side === 'bottom' ? 'v' : 'h';
}

function centerAlongSide(rect: Rect, side: Side): number {
  return side === 'top' || side === 'bottom'
    ? rect.x + rect.width / 2
    : rect.y + rect.height / 2;
}

function terminalMovable(edge: Edge, role: Role, path: readonly Point[]): boolean {
  const policy = readEdgeTerminalPolicy(edge, role);
  return path.length >= 3 && !policy.forbidden && !policy.positionFixed;
}

function buildLeg(
  edge: Edge,
  edgeIndex: number,
  role: Role,
  nodeId: string,
  rect: Rect,
  remoteRect: Rect,
  path: Point[],
): Leg | null {
  const ordered = orientedPath(path, role);
  const terminal = ordered[0];
  const stub = ordered[1];
  if (!terminal || !stub) return null;
  const handle = role === 'source' ? edge.sourceHandle : edge.targetHandle;
  const side = terminalSide(terminal, rect, handle);
  if (!side || axisOf(terminal, stub) !== expectedNormalAxis(side)) return null;
  const normalDelta = normal(stub, side) - normal(terminal, side);
  if (Math.abs(normalDelta) <= EPS) return null;
  const outwardDirection = normalDelta < 0 ? -1 : 1;
  let branchEnd: Point | null = null;
  for (let index = 2; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (axisOf(previous, current) === (expectedNormalAxis(side) === 'v' ? 'h' : 'v')) {
      branchEnd = current;
      break;
    }
    if (axisOf(previous, current) !== expectedNormalAxis(side)) return null;
  }
  const branchDirection = branchEnd
    ? Math.sign(tangential(branchEnd, side) - tangential(stub, side)) as -1 | 0 | 1
    : 0;
  return {
    edgeIndex,
    edgeId: edge.id,
    nodeId,
    role,
    side,
    path,
    terminal,
    stub,
    branchEnd,
    terminalCoordinate: tangential(terminal, side),
    terminalNormal: normal(terminal, side),
    branchLane: branchEnd ? normal(stub, side) : null,
    branchDirection,
    outwardDirection,
    remoteCoordinate: centerAlongSide(remoteRect, side),
    movable: terminalMovable(edge, role, path),
  };
}

function collectLegs(
  edges: readonly Edge[],
  nodes: readonly ReactFlowNode[],
): { groups: Map<string, { rect: Rect; legs: Leg[] }>; invalidLegCount: number } {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const groups = new Map<string, { rect: Rect; legs: Leg[] }>();
  let invalidLegCount = 0;
  edges.forEach((edge, edgeIndex) => {
    const path = readPath(edge);
    for (const role of ['source', 'target'] as const) {
      const nodeId = role === 'source' ? edge.source : edge.target;
      const remoteId = role === 'source' ? edge.target : edge.source;
      const rect = nodeRect(nodeById.get(nodeId));
      const remoteRect = nodeRect(nodeById.get(remoteId));
      if (!path || !rect || !remoteRect) {
        invalidLegCount += 1;
        continue;
      }
      const leg = buildLeg(edge, edgeIndex, role, nodeId, rect, remoteRect, path);
      if (!leg) {
        invalidLegCount += 1;
        continue;
      }
      const key = `${nodeId}\u001f${role}\u001f${leg.side}`;
      const group = groups.get(key) ?? { rect, legs: [] };
      group.legs.push(leg);
      groups.set(key, group);
    }
  });
  return { groups, invalidLegCount };
}

export function stemLength(leg: Leg): number {
  return Math.abs(normal(leg.stub, leg.side) - leg.terminalNormal);
}

function buildBlocks(legs: readonly Leg[]): LegBlock[] {
  const legGroups: Leg[][] = [];
  const orderedLegs = [...legs].sort((first, second) => (
    first.terminal.x - second.terminal.x
    || first.terminal.y - second.terminal.y
    || first.edgeId.localeCompare(second.edgeId)
  ));
  for (const leg of orderedLegs) {
    if (stemLength(leg) < MIN_TRUE_TRUNK_STEM - EPS) {
      legGroups.push([leg]);
      continue;
    }
    const compatibleGroup = legGroups.find(group => group.every(existing => (
      stemLength(existing) >= MIN_TRUE_TRUNK_STEM - EPS
      && existing.outwardDirection === leg.outwardDirection
      && Math.abs(existing.terminal.x - leg.terminal.x) <= EPS
      && Math.abs(existing.terminal.y - leg.terminal.y) <= EPS
    )));
    if (compatibleGroup) compatibleGroup.push(leg);
    else legGroups.push([leg]);
  }
  return legGroups.map((blockLegs) => ({
    legs: blockLegs,
    terminalCoordinate: blockLegs[0]?.terminalCoordinate ?? 0,
    remoteMinimum: Math.min(...blockLegs.map(leg => leg.remoteCoordinate)),
    remoteMaximum: Math.max(...blockLegs.map(leg => leg.remoteCoordinate)),
    movable: blockLegs.every(leg => leg.movable),
  }));
}

export function buildPassageGroups(edges: readonly Edge[], nodes: readonly ReactFlowNode[]): {
  groups: LegGroup[];
  invalidLegCount: number;
} {
  const collected = collectLegs(edges, nodes);
  return {
    invalidLegCount: collected.invalidLegCount,
    groups: [...collected.groups.entries()].flatMap(([key, value]) => {
      const blocks = buildBlocks(value.legs);
      if (blocks.length < 2) return [];
      const first = value.legs[0];
      return [{ key, nodeId: first.nodeId, role: first.role, side: first.side, rect: value.rect, blocks }];
    }).sort((first, second) => first.key.localeCompare(second.key)),
  };
}

export function compareRemote(first: LegBlock, second: LegBlock): -1 | 0 | 1 {
  if (first.remoteMaximum < second.remoteMinimum - EPS) return -1;
  if (second.remoteMaximum < first.remoteMinimum - EPS) return 1;
  return 0;
}

export function lateralInterval(leg: Leg): { minimum: number; maximum: number } | null {
  if (!leg.branchEnd) return null;
  return {
    minimum: Math.min(tangential(leg.stub, leg.side), tangential(leg.branchEnd, leg.side)),
    maximum: Math.max(tangential(leg.stub, leg.side), tangential(leg.branchEnd, leg.side)),
  };
}

function groupAudit(group: LegGroup): SameSidePassageGroupAudit {
  let portOrderInversions = 0;
  let reversePassageDefects = 0;
  let parallelChildOverlaps = 0;
  let oppositeChildOverlaps = 0;
  let nearTrunkOpportunities = 0;
  for (let firstIndex = 0; firstIndex < group.blocks.length; firstIndex += 1) {
    const first = group.blocks[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < group.blocks.length; secondIndex += 1) {
      const second = group.blocks[secondIndex];
      const remoteOrder = compareRemote(first, second);
      const terminalDelta = first.terminalCoordinate - second.terminalCoordinate;
      const firstIsDirect = first.legs.every(leg => leg.branchDirection === 0);
      const secondIsDirect = second.legs.every(leg => leg.branchDirection === 0);
      if (
        !firstIsDirect
        && !secondIsDirect
        && remoteOrder !== 0
        && Math.abs(terminalDelta) > EPS
        && remoteOrder * terminalDelta < 0
      ) {
        portOrderInversions += 1;
      }
      const firstRepresentative = first.legs[0];
      const secondRepresentative = second.legs[0];
      if (
        firstRepresentative
        && secondRepresentative
        && Math.abs(terminalDelta) <= NEAR_TRUNK_TOLERANCE + EPS
        && firstRepresentative.outwardDirection === secondRepresentative.outwardDirection
        && first.legs.every(leg => stemLength(leg) >= MIN_TRUE_TRUNK_STEM - EPS)
        && second.legs.every(leg => stemLength(leg) >= MIN_TRUE_TRUNK_STEM - EPS)
      ) nearTrunkOpportunities += 1;
      for (const firstLeg of first.legs) {
        for (const secondLeg of second.legs) {
          if (
            firstLeg.branchDirection === 0
            || secondLeg.branchDirection === 0
            || firstLeg.outwardDirection !== secondLeg.outwardDirection
            || firstLeg.branchLane === null
            || secondLeg.branchLane === null
          ) continue;
          const legTerminalDelta = firstLeg.terminalCoordinate - secondLeg.terminalCoordinate;
          if (
            firstLeg.branchDirection === secondLeg.branchDirection
            && Math.abs(legTerminalDelta) > EPS
          ) {
            const firstOutward = firstLeg.outwardDirection
              * (firstLeg.branchLane - firstLeg.terminalNormal);
            const secondOutward = secondLeg.outwardDirection
              * (secondLeg.branchLane - secondLeg.terminalNormal);
            if (legTerminalDelta * (firstOutward - secondOutward) >= -EPS) {
              reversePassageDefects += 1;
            }
          }
          if (Math.abs(firstLeg.branchLane - secondLeg.branchLane) > EPS) continue;
          const firstInterval = lateralInterval(firstLeg);
          const secondInterval = lateralInterval(secondLeg);
          if (!firstInterval || !secondInterval) continue;
          const overlap = Math.min(firstInterval.maximum, secondInterval.maximum)
            - Math.max(firstInterval.minimum, secondInterval.minimum);
          if (
            firstLeg.branchDirection === secondLeg.branchDirection
            && overlap >= MIN_PARALLEL_CHILD_OVERLAP - EPS
          ) parallelChildOverlaps += 1;
          if (
            firstLeg.branchDirection === -secondLeg.branchDirection
            && overlap >= MIN_OPPOSITE_CHILD_OVERLAP - EPS
          ) oppositeChildOverlaps += 1;
        }
      }
    }
  }
  return {
    key: group.key,
    nodeId: group.nodeId,
    role: group.role,
    side: group.side,
    blockCount: group.blocks.length,
    portOrderInversions,
    reversePassageDefects,
    parallelChildOverlaps,
    oppositeChildOverlaps,
    nearTrunkOpportunities,
  };
}

export function auditFinalSameSidePassageOrder(
  edges: readonly Edge[],
  nodes: readonly ReactFlowNode[],
): SameSidePassageAudit {
  const built = buildPassageGroups(edges, nodes);
  const groups = built.groups.map(groupAudit);
  return groups.reduce<SameSidePassageAudit>((total, group) => ({
    groups: [...total.groups, group],
    portOrderInversions: total.portOrderInversions + group.portOrderInversions,
    reversePassageDefects: total.reversePassageDefects + group.reversePassageDefects,
    parallelChildOverlaps: total.parallelChildOverlaps + group.parallelChildOverlaps,
    oppositeChildOverlaps: total.oppositeChildOverlaps + group.oppositeChildOverlaps,
    passageDefects: total.passageDefects + group.portOrderInversions
      + group.reversePassageDefects + group.parallelChildOverlaps + group.oppositeChildOverlaps,
    nearTrunkOpportunities: total.nearTrunkOpportunities + group.nearTrunkOpportunities,
    invalidLegCount: total.invalidLegCount,
  }), {
    groups: [],
    portOrderInversions: 0,
    reversePassageDefects: 0,
    parallelChildOverlaps: 0,
    oppositeChildOverlaps: 0,
    passageDefects: 0,
    nearTrunkOpportunities: 0,
    invalidLegCount: built.invalidLegCount,
  });
}
